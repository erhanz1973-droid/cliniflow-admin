console.log("🔥 RUNNING INDEX.CJS FROM ROOT /cliniflow-admin");
console.log("🔥 ADMIN ALIAS ROUTES LOADED FROM INDEX.CJS");

// Load environment variables from .env file
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const nodemailer = require("nodemailer");
const procedures = require("./shared/procedures");

// Supabase client
const {
  supabase,
  // isSupabaseEnabled,  // Remove from import to avoid duplicate declaration
  testSupabaseConnection,
  getClinicByCode,
  getClinicById,
  getClinicByEmail,
  createClinic,
  updateClinic,
  getAllClinics,
  getPatientById,
  getPatientByPhone,
  getPatientByEmail,
  getPatientsByClinic,
  createPatient,
  updatePatient,
  countPatientsByClinic,
  getChatMessagesByPatient,
  createChatMessage,
  // OTP fonksiyonları AKTİF - Supabase kullanılıyor
  createOTP: createOTP,
  getOTPByEmail: getOTPByEmail,
  incrementOTPAttempts: incrementOTPAttempts,
  markOTPUsed: markOTPUsed,
  deleteOTP: deleteOTP,
  cleanupExpiredOTPs: cleanupExpiredOTPs,
  createAdminToken: createAdminTokenInDB,
  getAdminToken: getAdminTokenFromDB,
  deleteAdminToken: deleteAdminTokenFromDB,
  createReferral: createReferralInDB,
  getReferralsByClinic: getReferralsByClinicFromDB,
  savePushSubscription,
  getPushSubscriptionsByPatient
} = require("./lib/supabase");

const app = express();
console.log("[MESSAGES] fallback insert enabled: v2");
const server = http.createServer(app);
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "clinifly-secret-key-change-in-production";
const JWT_EXPIRES_IN = "30d"; // 30 days
const IS_PROD = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const ALLOW_FILE_FALLBACK = String(process.env.ALLOW_FILE_FALLBACK || "").toLowerCase() === "true";

function canUseFileFallback() {
  // Only allow file fallback when explicitly enabled.
  // This prevents data loss on deploy/restart in ephemeral environments.
  return ALLOW_FILE_FALLBACK === true;
}

function supabaseDisabledPayload(scope) {
  const s = scope ? ` (${scope})` : "";
  return {
    ok: false,
    error: "supabase_disabled",
    message: `Supabase is disabled${s}. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in deploy environment.`,
  };
}

function isMissingTableError(error, tableName) {
  const msg = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  const combined = `${msg} ${details} ${hint}`.toLowerCase();
  const t = String(tableName || "").toLowerCase();
  return combined.includes("does not exist") && combined.includes(t);
}

function isMissingColumnError(error, columnName) {
  const msg = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  const combined = `${msg} ${details} ${hint}`.toLowerCase();
  const code = String(error?.code || "");
  const isMissingCode = code === "PGRST204" || code === "42703";
  if (!columnName) return isMissingCode;
  return isMissingCode && combined.includes(String(columnName || "").toLowerCase());
}

function getMissingColumnName(error) {
  const msg = String(error?.message || "");
  const match = msg.match(/'([^']+)'/);
  return match?.[1] || null;
}

async function insertWithColumnPruning(payload) {
  let current = { ...(payload || {}) };
  let lastError = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase
      .from("messages")
      .insert(current)
      .select("*")
      .single();

    if (!error) return { data, error };
    lastError = error;
    if (!isMissingColumnError(error)) return { data: null, error };

    const missingColumn = getMissingColumnName(error);
    if (!missingColumn || !(missingColumn in current)) {
      return { data: null, error };
    }
    delete current[missingColumn];
  }

  return { data: null, error: lastError };
}

function deriveMessageType(explicitType, attachment) {
  if (explicitType) return String(explicitType);
  if (!attachment) return "text";
  const fileType = String(attachment?.fileType || "").toLowerCase();
  const mime = String(attachment?.mimeType || attachment?.mime || "").toLowerCase();
  if (fileType === "image" || mime.startsWith("image/")) return "image";
  if (fileType === "pdf" || mime.includes("pdf")) return "pdf";
  return "text";
}

async function resolveClinicCodeForPatient(patientId) {
  if (!patientId) return null;
  try {
    const patient = await getPatientById(patientId);
    const fromDb =
      patient?.clinic_code ||
      patient?.clinicCode ||
      patient?.clinic_code ||
      patient?.clinics?.clinic_code ||
      null;
    if (fromDb) return fromDb;

    // Fallback: file-based patients store
    try {
      const patients = readJson(PAT_FILE, {});
      const filePatient = patients?.[patientId] || null;
      return (
        filePatient?.clinic_code ||
        filePatient?.clinicCode ||
        null
      );
    } catch (fileError) {
      console.warn("[MESSAGES] clinic_code fallback (file) failed:", fileError?.message || fileError);
    }
    return null;
  } catch (error) {
    console.error("[MESSAGES] Failed to resolve clinic_code:", error?.message || error);
    return null;
  }
}

function mapDbMessageToLegacyMessage(row) {
  if (!row) return null;
  const senderRaw =
    row.sender ??
    row.sender_type ??
    row.from ??
    (row.from_patient !== undefined ? (row.from_patient ? "patient" : "clinic") : "");
  const sender = String(senderRaw || "").toLowerCase();
  const from = sender === "patient" ? "PATIENT" : "CLINIC";
  const text = row.message ?? row.text ?? row.content ?? "";
  const fileAttachment = row.file_url
    ? {
        url: row.file_url,
        name: row.file_name || "file",
        mimeType: row.file_type || undefined,
        fileType: row.file_type && String(row.file_type).startsWith("image/") ? "image" : row.file_type,
      }
    : null;
  const rawAttachment = row.attachments ?? row.attachment ?? fileAttachment ?? null;
  const attachment =
    rawAttachment && typeof rawAttachment === "object"
      ? {
          ...rawAttachment,
          mimeType: rawAttachment.mimeType || rawAttachment.mime,
        }
      : rawAttachment;
  const type = deriveMessageType(row.type, attachment);
  const createdRaw = row.created_at ?? row.createdAt;
  let createdAt = now();
  if (typeof createdRaw === "number") createdAt = createdRaw;
  else if (typeof createdRaw === "string") {
    const parsed = Date.parse(createdRaw);
    if (!Number.isNaN(parsed)) createdAt = parsed;
  } else if (createdRaw instanceof Date) {
    createdAt = createdRaw.getTime();
  }
  return {
    id: String(row.id || row.message_id || row.messageId || ""),
    text: String(text || ""),
    from,
    type,
    attachment: attachment || undefined,
    createdAt,
    patientId: row.patient_id || undefined,
  };
}

async function fetchMessagesFromSupabase(patientId) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true });
  return { data, error };
}

async function insertMessageToSupabase({ patientId, sender, message, attachments, type }) {
  const primaryPayload = {
    patient_id: patientId,
    sender,
    message,
    attachments: attachments ?? null,
  };
  const primaryResult = await supabase
    .from("messages")
    .insert(primaryPayload)
    .select("*")
    .single();

  if (!primaryResult?.error) return primaryResult;

  // Fallback for schemas that use text/from_patient/clinic_code instead of sender/message.
  if (!isMissingColumnError(primaryResult.error)) {
    return primaryResult;
  }

  const clinicCode = await resolveClinicCodeForPatient(patientId);

  const fallbackPayload = {
    patient_id: patientId,
    ...(clinicCode ? { clinic_code: clinicCode } : {}),
    message_id: rid("msg"),
    type: deriveMessageType(type, attachments),
    message: String(message || ""),
    text: String(message || ""),
    attachment: attachments ?? null,
    attachments: attachments ?? null,
    from_patient: String(sender || "").toLowerCase() === "patient",
    created_at: now(),
  };

  return insertWithColumnPruning(fallbackPayload);
}

// Super Admin ENV variables
const SUPER_ADMIN_EMAIL =
  process.env.SUPER_ADMIN_EMAIL ||
  process.env.SUPERADMIN_EMAIL ||
  "";
const SUPER_ADMIN_PASSWORD =
  process.env.SUPER_ADMIN_PASSWORD ||
  process.env.SUPERADMIN_PASSWORD ||
  "";
const SUPER_ADMIN_JWT_SECRET =
  process.env.SUPER_ADMIN_JWT_SECRET ||
  process.env.SUPERADMIN_JWT_SECRET ||
  "super-admin-secret-key-change-in-production";

// ================== MIDDLEWARE ==================
const corsOptions = {
  origin: ["https://clinic.clinifly.net", "https://cliniflow-admin.onrender.com", "http://localhost:3000", "http://localhost:5050", "http://localhost:8081", "http://localhost:8082"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "x-actor"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "2mb" }));

// Force file-based storage temporarily until Supabase schema is fixed
const FORCE_FILE_STORAGE = false;  // Changed to false to use Supabase

// Override isSupabaseEnabled to force file-based storage
function isSupabaseEnabled() {
  return !FORCE_FILE_STORAGE && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// ================== CLINIC ORAL HEALTH AVERAGE ==================
async function calculateClinicOralHealthAverage(clinicId) {
  try {
    if (!isSupabaseEnabled()) {
      console.log("[ORAL_HEALTH_AVG] Supabase not enabled, returning null");
      return null;
    }

    console.log("[ORAL_HEALTH_AVG] Calculating weighted average for clinic:", clinicId);
    
    // Get patients with oral health scores from the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const { data: patients, error } = await supabase
      .from('patients')
      .select('id, created_at, health')
      .eq('clinic_id', clinicId)
      .gte('created_at', sixMonthsAgo.toISOString());

    if (error) {
      console.error("[ORAL_HEALTH_AVG] Error fetching patients:", error);
      return null;
    }

    if (!patients || patients.length === 0) {
      console.log("[ORAL_HEALTH_AVG] No patients found for clinic:", clinicId);
      return null;
    }

    console.log("[ORAL_HEALTH_AVG] Found", patients.length, "patients in last 6 months");

    let weightedSum = 0;
    let totalWeight = 0;
    let validCount = 0;

    const now = new Date();
    
    patients.forEach(patient => {
      // Extract oral health score from health JSON
      const health = patient.health || {};
      const oralHealthScore = health.oralHealthScore || health.oral_health_score;
      
      if (oralHealthScore !== null && oralHealthScore !== undefined) {
        const patientCreatedAt = new Date(patient.created_at);
        const daysDiff = Math.floor((now - patientCreatedAt) / (1000 * 60 * 60 * 24));
        
        let weight = 0;
        
        // Apply weights based on age
        if (daysDiff <= 30) {
          weight = 1.5; // Last 30 days
        } else if (daysDiff <= 90) {
          weight = 1.2; // 31-90 days
        } else if (daysDiff <= 180) {
          weight = 1.0; // 91-180 days
        } else {
          return; // Skip if older than 180 days
        }
        
        weightedSum += oralHealthScore * weight;
        totalWeight += weight;
        validCount++;
      }
    });

    console.log("[ORAL_HEALTH_AVG] Valid assessments:", validCount, "Total weight:", totalWeight);

    // Minimum 5 assessments required
    if (validCount < 5) {
      console.log("[ORAL_HEALTH_AVG] Insufficient assessments (< 5), returning null");
      return null;
    }

    const weightedAverage = weightedSum / totalWeight;
    console.log("[ORAL_HEALTH_AVG] Weighted average calculated:", weightedAverage.toFixed(1));
    
    return parseFloat(weightedAverage.toFixed(1));
    
  } catch (error) {
    console.error("[ORAL_HEALTH_AVG] Error calculating oral health average:", error);
    return null;
  }
}

// ================== SUPER ADMIN GUARD ==================
const publicDir = path.join(__dirname, "public");
console.log("📂 Serving static files from:", publicDir);

app.use(express.static(publicDir));

// ================== STORAGE ==================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const REG_FILE = path.join(DATA_DIR, "registrations.json");
const TOK_FILE = path.join(DATA_DIR, "tokens.json");
const PAT_FILE = path.join(DATA_DIR, "patients.json");
const REF_FILE = path.join(DATA_DIR, "referrals.json");
const REF_EVENT_FILE = path.join(DATA_DIR, "referralEvents.json");
const CLINIC_FILE = path.join(DATA_DIR, "clinic.json");
const CLINICS_FILE = path.join(DATA_DIR, "clinics.json"); // Admin clinics (email/password)
const ADMIN_TOKENS_FILE = path.join(DATA_DIR, "adminTokens.json"); // JWT tokens
const OTP_FILE = path.join(DATA_DIR, "otps.json"); // OTP storage with hashed codes
const PUSH_SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "pushSubscriptions.json"); // Push notification subscriptions
const TREATMENT_PRICES_FILE = path.join(DATA_DIR, "treatmentPrices.json"); // Clinic treatment price list
const PAYMENTS_FILE = path.join(DATA_DIR, "payments.json"); // Patient payment summaries

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf-8");
}

// Ensure referrals file exists for persistence
if (!fs.existsSync(REF_FILE)) {
  fs.mkdirSync(path.dirname(REF_FILE), { recursive: true });
  fs.writeFileSync(REF_FILE, "[]", "utf-8");
}

const now = () => Date.now();
const rid = (p) => p + "_" + crypto.randomBytes(6).toString("hex");
const makeToken = () => "t_" + crypto.randomBytes(10).toString("base64url");

// ================== PATIENT LANGUAGE ==================
const ALLOWED_PATIENT_LANGUAGES = new Set(["tr", "en"]);
function normalizePatientLanguage(input) {
  const raw = String(input || "").trim().toLowerCase();
  return ALLOWED_PATIENT_LANGUAGES.has(raw) ? raw : "en";
}

function safeJsonPreview(value, limit = 2000) {
  try {
    const s = JSON.stringify(value);
    if (typeof s !== "string") return String(s);
    return s.length > limit ? s.slice(0, limit) + "…(truncated)" : s;
  } catch (e) {
    return `[unserializable: ${e?.name || "Error"}: ${e?.message || "unknown"}]`;
  }
}

function supabaseErrorPublic(err) {
  return {
    code: err?.code || null,
    message: err?.message || null,
    details: err?.details || null,
    hint: err?.hint || null,
  };
}

function isInvalidUuidError(error) {
  return String(error?.code || "") === "22P02";
}

function normalizeReferralLevels(input, fallback) {
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const level1Raw = input?.level1 ?? input?.referralLevel1Percent ?? base.level1 ?? null;
  const level2Raw = input?.level2 ?? input?.referralLevel2Percent ?? base.level2 ?? null;
  const level3Raw = input?.level3 ?? input?.referralLevel3Percent ?? base.level3 ?? null;
  const level1 = level1Raw != null && level1Raw !== "" ? Number(level1Raw) : null;
  const level2 = level2Raw != null && level2Raw !== "" ? Number(level2Raw) : null;
  const level3 = level3Raw != null && level3Raw !== "" ? Number(level3Raw) : null;
  return { level1, level2, level3 };
}

function validateReferralLevels(levels) {
  const values = [levels.level1, levels.level2, levels.level3].filter((v) => v != null);
  for (const v of values) {
    if (Number.isNaN(v) || v < 0 || v > 99) return "referral_levels must be 0-99";
  }
  return null;
}

function levelPercentForCount(count, levels) {
  const level1 = levels?.level1 ?? 0;
  const level2 = levels?.level2 ?? level1 ?? 0;
  const level3 = levels?.level3 ?? level2 ?? level1 ?? 0;
  if (count <= 0) return 0;
  if (count === 1) return level1 || 0;
  if (count === 2) return level2 || level1 || 0;
  return level3 || level2 || level1 || 0;
}

function normalizeReferralState(state) {
  const base = Number(state?.baseDiscountPercent || 0);
  const earned = Number(state?.earnedDiscountPercent || 0);
  const total = Number(state?.totalDiscountPercent || 0);
  return {
    baseDiscountPercent: Number.isFinite(base) ? base : 0,
    earnedDiscountPercent: Number.isFinite(earned) ? earned : 0,
    totalDiscountPercent: Number.isFinite(total) ? total : 0,
  };
}

function computeReferralTotals(state, capPercent) {
  const base = Number(state?.baseDiscountPercent || 0);
  const earned = Number(state?.earnedDiscountPercent || 0);
  const total = Math.min(base + earned, capPercent || 0);
  return {
    baseDiscountPercent: base,
    earnedDiscountPercent: earned,
    totalDiscountPercent: total,
  };
}

function countSuccessfulReferralsFile(list, inviterId) {
  const normalized = String(inviterId || "").trim();
  return (list || []).filter((r) => {
    if (!r) return false;
    const status = String(r.status || "").toUpperCase();
    if (status !== "APPROVED" && status !== "COMPLETED") return false;
    const inviter = String(r.inviterPatientId || r.inviter_patient_id || "").trim();
    return inviter === normalized;
  }).length;
}

async function countSuccessfulReferrals(inviterId, clinicId) {
  if (!isSupabaseEnabled()) return 0;
  const statusList = ["APPROVED", "COMPLETED"];
  const columns = [
    "inviter_patient_id",
    "referrer_patient_id",
  ];
  let lastError = null;
  for (const col of columns) {
    let q = supabase
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq(col, inviterId)
      .in("status", statusList);
    if (clinicId) q = q.eq("clinic_id", clinicId);
    const { count, error } = await q;
    if (!error) return count || 0;
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }
  console.error("[REFERRALS] Failed to count successful referrals", {
    message: lastError?.message,
    code: lastError?.code,
  });
  return 0;
}

async function updatePatientReferralState(patientId, nextState) {
  if (!isSupabaseEnabled()) return;
  try {
    const { error } = await supabase
      .from("patients")
      .update({ referral_state: nextState, updated_at: new Date().toISOString() })
      .eq("patient_id", patientId);
    if (error) {
      if (isMissingColumnError(error, "referral_state")) {
        console.warn("[REFERRALS] referral_state column missing; skipping update");
        return;
      }
      console.error("[REFERRALS] Failed to update referral_state", {
        message: error.message,
        code: error.code,
        details: error.details,
      });
    }
  } catch (e) {
    console.error("[REFERRALS] referral_state update exception:", e?.message || e);
  }
}

async function fetchTreatmentPricesMap(clinicId) {
  if (!isSupabaseEnabled() || !clinicId) return {};
  const { data, error } = await supabase
    .from("treatment_prices")
    .select("*")
    .eq("clinic_id", clinicId);
  if (error) {
    console.error("[TREATMENT_PRICES] Supabase fetch failed", {
      message: error.message,
      code: error.code,
      details: error.details,
    });
    return {};
  }

  const map = {};
  (data || []).forEach((row) => {
    const keyRaw = row?.treatment_code || row?.type || row?.name || "";
    const key = String(keyRaw).trim().toUpperCase();
    if (!key) return;
    const isActive = row?.is_active !== undefined ? row.is_active !== false : true;
    if (!isActive) return;
    const priceVal =
      row?.price !== undefined && row?.price !== null
        ? Number(row.price)
        : row?.default_price !== undefined && row?.default_price !== null
          ? Number(row.default_price)
          : null;
    if (!Number.isFinite(priceVal)) return;
    map[key] = {
      price: priceVal,
      currency: row?.currency || "EUR",
    };
  });
  return map;
}

function applyEventPrices(events, priceMap) {
  const list = Array.isArray(events) ? events : [];
  if (!priceMap || Object.keys(priceMap).length === 0) return list;
  return list.map((event) => {
    if (event?.price != null) return event;
    const key = String(event?.type || "").trim().toUpperCase();
    const match = priceMap[key];
    if (!match) return event;
    return {
      ...event,
      price: match.price,
      currency: match.currency,
    };
  });
}

// Normalize phone number: remove +90, leading 0, spaces, and keep only digits
function normalizePhone(phone) {
  if (!phone) return "";
  let cleaned = String(phone).trim().replace(/\s+/g, ""); // Remove spaces
  cleaned = cleaned.replace(/\D/g, ""); // Keep only digits
  
  // Remove country code +90 or 90 prefix
  if (cleaned.startsWith("90") && cleaned.length > 10) {
    cleaned = cleaned.substring(2);
  }
  
  // Remove leading 0
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }
  
  return cleaned;
}

const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: 50 * 1024 * 1024 }, // 50MB max per file
});

// ================== EMAIL OTP CONFIGURATION ==================
// DEBUG: Log raw ENV values at startup
console.log("[SMTP DEBUG] RAW ENV VALUES:", {
  SMTP_HOST: process.env.SMTP_HOST || "MISSING",
  SMTP_PORT: process.env.SMTP_PORT || "MISSING",
  SMTP_USER: process.env.SMTP_USER ? "SET (" + process.env.SMTP_USER.substring(0, 5) + "...)" : "MISSING",
  SMTP_PASS: process.env.SMTP_PASS ? "SET (length: " + process.env.SMTP_PASS.length + ")" : "MISSING",
  SMTP_FROM: process.env.SMTP_FROM || "MISSING",
});

// NO fallbacks - use ENV directly
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "noreply@clinifly.net";

// Nodemailer transporter for Brevo SMTP (no async - fast startup)
let emailTransporter = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  console.log("[EMAIL] Creating SMTP transporter...");
  emailTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: { 
      user: SMTP_USER, 
      pass: SMTP_PASS 
    },
  });
  console.log(`[EMAIL] ✅ SMTP transporter created for ${SMTP_HOST}:${SMTP_PORT}`);
} else {
  console.error("[EMAIL] ❌ SMTP NOT configured - missing credentials:");
  console.error("[EMAIL]   SMTP_HOST:", SMTP_HOST ? "OK" : "MISSING");
  console.error("[EMAIL]   SMTP_USER:", SMTP_USER ? "OK" : "MISSING");
  console.error("[EMAIL]   SMTP_PASS:", SMTP_PASS ? "OK" : "MISSING");
}

// ================== PUSH NOTIFICATIONS ==================
let webpush = null;
let VAPID_PUBLIC_KEY = "";
let VAPID_PRIVATE_KEY = "";
let VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@clinifly.com";

// Try to load web-push module (optional, fails gracefully if not installed)
try {
  webpush = require("web-push");
  
  // Try to read VAPID keys from environment or generate them
  VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
  VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
  
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    // Generate VAPID keys if not provided
    const vapidKeys = webpush.generateVAPIDKeys();
    VAPID_PUBLIC_KEY = vapidKeys.publicKey;
    VAPID_PRIVATE_KEY = vapidKeys.privateKey;
    console.log("[PUSH] VAPID keys generated. Add these to your .env file:");
    console.log(`VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}`);
    console.log(`VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}`);
  }
  
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("[PUSH] Push notifications configured");
} catch (e) {
  console.warn("[PUSH] web-push module not installed. Install with: npm install web-push");
  console.warn("[PUSH] Push notifications will not work until web-push is installed");
}

// Helper function to send push notification to a patient
async function sendPushNotification(patientId, title, message, options = {}) {
  if (!webpush) {
    console.warn("[PUSH] Cannot send notification: web-push not available");
    return false;
  }
  
  try {
    const subscriptions = readJson(PUSH_SUBSCRIPTIONS_FILE, {});
    const patientSubscriptions = subscriptions[patientId] || [];
    
    if (patientSubscriptions.length === 0) {
      console.log(`[PUSH] No subscriptions found for patient ${patientId}`);
      return false;
    }
    
    const payload = JSON.stringify({
      title: title || "Yeni Mesaj",
      body: message || "Klinikten yeni bir mesaj aldınız",
      icon: options.icon || "/icon-192x192.png",
      badge: options.badge || "/badge-72x72.png",
      silent: false, // CLINIC mesajları için ses açık
      requireInteraction: false,
      data: {
        url: options.url || "/",
        patientId: patientId,
        from: "CLINIC", // Mesajın CLINIC'ten geldiğini belirt
        ...(options.data || {})
      }
    });
    
    const results = await Promise.allSettled(
      patientSubscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(subscription, payload);
          console.log(`[PUSH] Notification sent successfully to patient ${patientId}`);
          return { success: true, subscription };
        } catch (error) {
          console.error(`[PUSH] Failed to send notification:`, error);
          // If subscription is invalid (410), remove it
          if (error.statusCode === 410) {
            console.log(`[PUSH] Removing invalid subscription for patient ${patientId}`);
            const updatedSubs = (subscriptions[patientId] || []).filter(
              sub => JSON.stringify(sub) !== JSON.stringify(subscription)
            );
            subscriptions[patientId] = updatedSubs;
            writeJson(PUSH_SUBSCRIPTIONS_FILE, subscriptions);
          }
          return { success: false, subscription, error };
        }
      })
    );
    
    const successCount = results.filter(r => r.status === "fulfilled" && r.value.success).length;
    return successCount > 0;
  } catch (error) {
    console.error("[PUSH] Error sending push notification:", error);
    return false;
  }
}

// ================== OTP SERVICE ==================
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_ATTEMPTS = 3;
const OTP_LENGTH = 6;
const TOKEN_EXPIRY_DAYS = 14; // 7-14 days as requested

// OTP Feature Flags
const OTP_ENABLED_FOR_ADMINS = process.env.OTP_ENABLED_FOR_ADMINS === "true";
const OTP_REQUIRED_FOR_NEW_ADMINS = process.env.OTP_REQUIRED_FOR_NEW_ADMINS !== "false"; // Default true

// Review Mode for Google Play
const REVIEW_MODE = process.env.REVIEW_MODE === "true";

console.log("[OTP CONFIG] Enabled for admins:", OTP_ENABLED_FOR_ADMINS);
console.log("[OTP CONFIG] Required for new admins:", OTP_REQUIRED_FOR_NEW_ADMINS);
console.log("[REVIEW MODE] Enabled:", REVIEW_MODE);

/**
 * Generate a 6-digit numeric OTP
 */
function generateOTP() {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

/**
 * Hash OTP using bcrypt for secure storage
 */
async function hashOTP(otp) {
  return await bcrypt.hash(otp, 10);
}

/**
 * Verify OTP against hashed version
 */
async function verifyOTP(plainOTP, hashedOTP) {
  console.log(`[VERIFY-OTP] Input: plainOTP="${plainOTP}" (${typeof plainOTP}), hashedOTP="${hashedOTP.substring(0, 10)}..." (${typeof hashedOTP})`);
  const result = await bcrypt.compare(plainOTP, hashedOTP);
  console.log(`[VERIFY-OTP] bcrypt.compare result: ${result}`);
  return result;
}

/**
 * Get OTPs for an email (Supabase or File-based)
 */
async function getOTPsForEmail(email) {
  const emailKey = email.toLowerCase().trim();
  
  // Try Supabase first if available
  if (isSupabaseEnabled()) {
    try {
      // Direct Supabase query instead of missing function
      console.log("[OTP] DEBUG: Querying 'otps' table for email:", emailKey);
      const { data, error } = await supabase
        .from('otps')
        .select('*')
        .eq('email', emailKey)
        .order('created_at', { ascending: false })
        .limit(1);
      
      console.log("[OTP] DEBUG: Supabase query result - data length:", data?.length || 0);
      console.log("[OTP] DEBUG: Supabase query error:", error);
      if (data && data.length > 0) {
        console.log("[OTP] DEBUG: First OTP record keys:", Object.keys(data[0]));
        console.log("[OTP] DEBUG: First OTP record email:", data[0].email);
      }
      
      if (error) {
        console.error("[OTP] Supabase query error:", error);
        throw error;
      }
      
      if (data && data.length > 0) {
        console.log("[OTP] Retrieved OTP from Supabase for:", emailKey);
        return data[0];  // Return first element, not the array
      }
    } catch (error) {
      console.error("[OTP] Failed to get OTP from Supabase, falling back to file:", error);
      // Fall back to file-based
    }
  }
  
  // FILE-BASED FALLBACK
  const otps = readJson(OTP_FILE, {});
  return otps[emailKey] || null;
}

/**
 * Save OTP for an email (Supabase or File-based)
 */
async function saveOTP(email, otpCode, attempts = 0) {
  const emailKey = email.toLowerCase().trim();
  const hashedOTP = await hashOTP(otpCode);
  const expiresAt = now() + OTP_EXPIRY_MS;
  
  // Try Supabase first if available
  if (isSupabaseEnabled()) {
    try {
      const result = await createOTP(emailKey, hashedOTP, new Date(expiresAt), attempts);
      console.log("[OTP] Saved OTP to Supabase for:", emailKey);
      return result;
    } catch (error) {
      console.error("[OTP] Failed to save OTP to Supabase, falling back to file:", error);
      // Fall back to file-based
    }
  }
  
  // FILE-BASED FALLBACK
  const otps = readJson(OTP_FILE, {});
  otps[emailKey] = {
    hashedOTP,
    created_at: new Date().toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
    attempts,
    verified: false
  };
  writeJson(OTP_FILE, otps);
  console.log("[OTP] Saved OTP to file for:", emailKey);
  return true;
}

/**
 * Store OTP for email with registration data for clinic registration
 */
async function storeOTPForEmail(email, otpHash, clinicCode, registrationData) {
  const emailKey = email.toLowerCase().trim();
  
  console.log("[OTP] storeOTPForEmail called for:", emailKey);
  console.log("[OTP] Supabase enabled:", isSupabaseEnabled());
  
  // Try Supabase first if available
  if (isSupabaseEnabled()) {
    try {
      console.log("[OTP] Attempting to insert OTP into Supabase...");
      
      // First, delete any existing unverified OTPs for this email (prevent overwrite)
      await supabase
        .from('otps')
        .delete()
        .eq('email', emailKey)
        .eq('verified', false);
      
      // Then insert new OTP
      const { data, error } = await supabase
        .from('otps')
        .insert({
          email: emailKey,
          otp_hash: otpHash,  // Use otp_hash instead of hashedOTP
          expires_at: new Date(Date.now() + OTP_EXPIRY_MS).toISOString(),
          attempts: 0,
          verified: false,
          used: false,
          registration_data: registrationData
        })
        .select()
        .single();
      
      if (error) {
        console.error("[OTP] Direct insert error:", error);
        console.error("[OTP] Error details:", JSON.stringify(error, null, 2));
        throw error;
      }
      
      console.log("[OTP] Stored registration OTP to Supabase for:", emailKey);
      console.log("[OTP] Registration data stored:", JSON.stringify(registrationData));
      return data;
    } catch (error) {
      console.error("[OTP] Failed to store registration OTP to Supabase, falling back to file:", error);
      // Fall back to file-based
    }
  }
  
  // FILE-BASED FALLBACK
  const otps = readJson(OTP_FILE, {});
  otps[emailKey] = {
    hashedOTP: otpHash,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + OTP_EXPIRY_MS).toISOString(),
    attempts: 0,
    verified: false,
    registration_data: registrationData
  };
  writeJson(OTP_FILE, otps);
  console.log("[OTP] Stored registration OTP to file for:", emailKey);
  return true;
}

/**
 * Increment OTP attempt count (Supabase or File-based)
 */
async function incrementOTPAttempt(email) {
  const emailKey = email.toLowerCase().trim();
  
  // Try Supabase first if available
  if (isSupabaseEnabled()) {
    try {
      const result = await incrementOTPAttempts(emailKey);
      console.log("[OTP] Incremented attempt in Supabase for:", emailKey);
      return result;
    } catch (error) {
      console.error("[OTP] Failed to increment OTP in Supabase, falling back to file:", error);
      // Fall back to file-based
    }
  }
  
  // FILE-BASED FALLBACK
  const otps = readJson(OTP_FILE, {});
  if (otps[emailKey]) {
    otps[emailKey].attempts = (otps[emailKey].attempts || 0) + 1;
    writeJson(OTP_FILE, otps);
    console.log("[OTP] Incremented attempt in file for:", emailKey, "attempts:", otps[emailKey].attempts);
  }
}

/**
 * Mark OTP as verified and invalidate it (Supabase or File-based)
 */
async function markOTPVerified(email) {
  const emailKey = email.toLowerCase().trim();
  
  // Try Supabase first if available
  if (isSupabaseEnabled()) {
    try {
      const result = await markOTPUsed(emailKey);
      console.log("[OTP] Marked OTP as verified in Supabase for:", emailKey);
      return result;
    } catch (error) {
      console.error("[OTP] Failed to mark OTP in Supabase, falling back to file:", error);
      // Fall back to file-based
    }
  }
  
  // FILE-BASED FALLBACK
  const otps = readJson(OTP_FILE, {});
  if (otps[emailKey]) {
    otps[emailKey].verified = true;
    otps[emailKey].expiresAt = now(); // Immediately expire
    writeJson(OTP_FILE, otps);
    console.log("[OTP] Marked OTP as verified in file for:", emailKey);
  }
}

/**
 * Send OTP email using Brevo REST API (not SMTP)
 */
async function sendOTPEmail(email, otpCode, lang = "en") {
  console.log(`[sendOTPEmail] ========================================`);
  console.log(`[sendOTPEmail] FUNCTION CALLED (Brevo REST API)`);
  console.log(`[sendOTPEmail] email: ${email}`);
  console.log(`[sendOTPEmail] otpCode: ${otpCode}`);
  console.log(`[sendOTPEmail] lang: ${lang}`);
  console.log(`[sendOTPEmail] ========================================`);
  
  // Review Mode Bypass: Skip email sending for test@clinifly.net
  if (REVIEW_MODE && email.toLowerCase() === "test@clinifly.net") {
    console.log(`[sendOTPEmail] 🚫 REVIEW MODE: Skipping email for test@clinifly.net`);
    console.log(`[sendOTPEmail] 📝 Static OTP 123456 will work for this account`);
    return { messageId: "review-mode-bypass", accepted: [email] };
  }
  
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.SMTP_FROM || SMTP_FROM; // prefer explicit env, fallback to default
  const fromName = process.env.BREVO_FROM_NAME || "Clinifly";

  console.log(`[sendOTPEmail] BREVO_API_KEY: ${apiKey ? 'SET' : 'NOT SET'}`);
  console.log(`[sendOTPEmail] SMTP_FROM: ${fromEmail || 'NOT SET'}`);
  console.log(`[sendOTPEmail] BREVO_FROM_NAME: ${fromName}`);

  const safeLang = normalizePatientLanguage(lang);
  const subject =
    safeLang === "tr" ? "Clinifly – Doğrulama Kodunuz" : "Clinifly – Your verification code";
  const htmlContent =
    safeLang === "tr"
      ? `
      <div style="font-family:Arial,sans-serif">
        <h2>Clinifly Doğrulama Kodu</h2>
        <p>Giriş yapmak için aşağıdaki kodu kullanın:</p>
        <h1 style="letter-spacing:4px">${otpCode}</h1>
        <p>Bu kod 5 dakika geçerlidir.</p>
      </div>
    `
      : `
      <div style="font-family:Arial,sans-serif">
        <h2>Clinifly Verification Code</h2>
        <p>Use the code below to continue:</p>
        <h1 style="letter-spacing:4px">${otpCode}</h1>
        <p>This code is valid for 5 minutes.</p>
      </div>
    `;

  // Prefer Brevo REST API when configured; otherwise fall back to SMTP transporter if present.
  if (!apiKey) {
    if (!emailTransporter) {
      console.error(`[sendOTPEmail] ❌ No BREVO_API_KEY and SMTP transporter is not configured`);
      throw new Error("email_not_configured");
    }
    console.log(`[sendOTPEmail] BREVO_API_KEY missing; using SMTP transporter fallback`);
    try {
      const info = await emailTransporter.sendMail({
        from: fromEmail || "noreply@clinifly.net",
        to: email,
        subject,
        html: htmlContent,
        text: safeLang === "tr"
          ? `Clinifly doğrulama kodunuz: ${otpCode} (5 dk geçerli)`
          : `Your Clinifly verification code: ${otpCode} (valid for 5 minutes)`,
      });
      console.log(`[sendOTPEmail] ✅ Email sent via SMTP transporter`, {
        messageId: info?.messageId || null,
        accepted: info?.accepted || null,
      });
      return info;
    } catch (e) {
      console.error(`[sendOTPEmail] ❌ SMTP transporter send failed:`, e?.message || e);
      throw e;
    }
  }

  if (!fromEmail) {
    console.error(`[sendOTPEmail] ❌ SMTP_FROM not set!`);
    throw new Error("SMTP_FROM not set");
  }

  const payload = {
    sender: {
      email: fromEmail,
      name: fromName,
    },
    to: [
      {
        email,
      },
    ],
    subject,
    htmlContent,
  };

  console.log(`[sendOTPEmail] Calling Brevo API: https://api.brevo.com/v3/smtp/email`);
  console.log(`[sendOTPEmail] Payload:`, JSON.stringify(payload).substring(0, 200));

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    console.log(`[sendOTPEmail] Brevo API response status: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`[sendOTPEmail] ❌ Brevo API error ${response.status}: ${text}`);
      throw new Error(`Brevo API error ${response.status}: ${text}`);
    }

    const result = await response.json();
    console.log(`[sendOTPEmail] ✅ Email sent successfully via Brevo API`);
    console.log(`[sendOTPEmail] Brevo response:`, JSON.stringify(result).substring(0, 200));
    return result;
  } catch (error) {
    console.error(`[sendOTPEmail] ❌ Error sending email via Brevo API:`, error.message);
    throw error;
  }
}

// Rate limiting: track OTP requests per email
const otpRequestRateLimit = new Map(); // email -> { count, resetAt }
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 3; // max 3 requests per minute per email

function checkRateLimit(email) {
  const emailKey = email.toLowerCase().trim();
  const nowTime = now();
  const limit = otpRequestRateLimit.get(emailKey);

  if (!limit || limit.resetAt < nowTime) {
    // Reset or create new limit
    otpRequestRateLimit.set(emailKey, {
      count: 1,
      resetAt: nowTime + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // Rate limit exceeded
  }

  limit.count++;
  return true;
}

// ================== ADMIN AUTH (token-based, allows PENDING) ==================
async function requireAdminToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[requireAdminToken] Missing or invalid auth header");
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Geçersiz token. Lütfen tekrar giriş yapın." });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // clinicCode is the PRIMARY key - NOT clinicId
    const clinicCode = decoded.clinicCode;
    console.log("[requireAdminToken] Token decoded, clinicCode:", clinicCode);

    if (!clinicCode) {
      console.error("[requireAdminToken] No clinicCode in token!");
      return res.status(401).json({ ok: false, error: "invalid_token", message: "Token geçersiz." });
    }

    // SUPABASE: Primary lookup by clinicCode
    console.log("[requireAdminToken] isSupabaseEnabled:", isSupabaseEnabled());
    console.log("[requireAdminToken] SUPABASE_URL set:", !!process.env.SUPABASE_URL);
    console.log("[requireAdminToken] SUPABASE_SERVICE_ROLE_KEY set:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    if (isSupabaseEnabled()) {
      console.log("[requireAdminToken] Calling getClinicByCode with:", clinicCode);
      const clinic = await getClinicByCode(clinicCode);
      console.log("[requireAdminToken] getClinicByCode returned:", clinic ? "FOUND" : "NULL");
      
      if (clinic) {
        if (typeof clinic.settings === "string") {
          try {
            clinic.settings = JSON.parse(clinic.settings);
          } catch (e) {
            console.warn("[requireAdminToken] Failed to parse clinic.settings JSON");
            clinic.settings = {};
          }
        }
        req.clinicId = clinic.id;              // Supabase UUID
        req.clinicCode = clinic.clinic_code;   // e.g. "ORDU"
        req.clinicStatus = clinic.settings?.status || "ACTIVE";
        req.clinic = clinic;
        console.log("[requireAdminToken] ✅ Supabase auth successful for clinic:", req.clinicCode, "(uuid:", req.clinicId, ")");
        return next();
      }
      
      console.log("[requireAdminToken] ❌ Clinic not found in Supabase for code:", clinicCode);
      console.log("[requireAdminToken] Trying file fallback...");
    } else {
      console.log("[requireAdminToken] ⚠️ Supabase not enabled, using file fallback");
    }
    
    // FILE FALLBACK (legacy)
    const code = String(clinicCode).toUpperCase();
    let clinic = null;
    
    // Check CLINICS_FILE
    const clinics = readJson(CLINICS_FILE, {});
    for (const cid in clinics) {
      const c = clinics[cid];
      if (c) {
        const cCode = c.clinicCode || c.code;
        if (cCode && String(cCode).toUpperCase() === code) {
          clinic = c;
          clinic._fileId = cid;
          break;
        }
      }
    }
    
    // Check CLINIC_FILE (single clinic)
    if (!clinic) {
      const singleClinic = readJson(CLINIC_FILE, {});
      if (singleClinic?.clinicCode && String(singleClinic.clinicCode).toUpperCase() === code) {
        clinic = singleClinic;
      }
    }
    
    if (!clinic) {
      console.error("[requireAdminToken] ❌ Clinic not found by code:", clinicCode);
      return res.status(401).json({ ok: false, error: "clinic_not_found", message: "Klinik bulunamadı." });
    }

    req.clinicId = clinic._fileId || clinic.clinicId || null;
    req.clinicCode = clinic.clinicCode || clinic.code;
    req.clinicStatus = clinic.status || "PENDING";
    req.clinic = clinic;
    console.log("[requireAdminToken] ✅ File auth successful for clinic:", req.clinicCode);
    next();
  } catch (error) {
    console.error("[requireAdminToken] Auth error:", error.name, error.message);
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      return res.status(401).json({ ok: false, error: "invalid_token", message: "Geçersiz token. Lütfen tekrar giriş yapın." });
    }
    return res.status(500).json({ ok: false, error: "auth_error", message: "Kimlik doğrulama hatası." });
  }
}

// ================== HEALTH ==================
// Ultra simple - no DB, no async - for Render health check
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Detailed health (optional - for debugging)
app.get("/health/detail", (req, res) => {
  res.json({ 
    ok: true, 
    server: "index.cjs", 
    time: now(),
    supabase: isSupabaseEnabled(),
    smtp: !!emailTransporter
  });
});

// ================== DEBUG: SMTP TEST ENDPOINT ==================
// TEMPORARY - Remove after testing
app.get("/debug/smtp-status", (req, res) => {
  res.json({
    configured: !!emailTransporter,
    env: {
      SMTP_HOST: process.env.SMTP_HOST ? "SET" : "MISSING",
      SMTP_PORT: process.env.SMTP_PORT || "MISSING",
      SMTP_USER: process.env.SMTP_USER ? "SET" : "MISSING",
      SMTP_PASS: process.env.SMTP_PASS ? "SET" : "MISSING",
      SMTP_FROM: process.env.SMTP_FROM || "MISSING",
    }
  });
});

app.get("/debug/test-email", async (req, res) => {
  const testEmail = req.query.to || "test@example.com";
  
  if (!emailTransporter) {
    return res.status(500).json({ 
      ok: false, 
      error: "smtp_not_configured",
      env: {
        SMTP_HOST: process.env.SMTP_HOST ? "SET" : "MISSING",
        SMTP_USER: process.env.SMTP_USER ? "SET" : "MISSING",
        SMTP_PASS: process.env.SMTP_PASS ? "SET" : "MISSING",
      }
    });
  }

  try {
    console.log("[DEBUG] Sending test email to:", testEmail);
    const info = await emailTransporter.sendMail({
      from: SMTP_FROM,
      to: testEmail,
      subject: "CLINIFLY SMTP TEST - " + new Date().toISOString(),
      text: "If you receive this email, SMTP is working correctly!",
      html: "<h1>SMTP Test</h1><p>If you receive this email, SMTP is working correctly!</p><p>Time: " + new Date().toISOString() + "</p>",
    });
    console.log("[DEBUG] Test email sent:", info.messageId);
    res.json({ 
      ok: true, 
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
    });
  } catch (e) {
    console.error("[DEBUG] SMTP TEST ERROR:", e);
    res.status(500).json({ 
      ok: false, 
      error: e.message,
      code: e.code,
      response: e.response,
    });
  }
});

// ================== PRIVACY POLICY ==================
app.get("/privacy", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Clinifly</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.7; color: #333; background: #f8fafc;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; }
    .logo { font-size: 32px; font-weight: 700; color: #0ea5e9; margin-bottom: 8px; }
    h1 { font-size: 28px; color: #1e293b; margin-bottom: 8px; }
    .effective-date { color: #64748b; font-size: 14px; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h2 { font-size: 20px; color: #0ea5e9; margin: 32px 0 16px 0; }
    h2:first-child { margin-top: 0; }
    p { margin-bottom: 16px; color: #475569; }
    ul { margin: 16px 0; padding-left: 24px; }
    li { margin-bottom: 8px; color: #475569; }
    .highlight { background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .contact-info { background: #f8fafc; padding: 20px; border-radius: 8px; margin-top: 24px; }
    .contact-info p { margin-bottom: 8px; }
    .contact-info a { color: #0ea5e9; text-decoration: none; }
    .contact-info a:hover { text-decoration: underline; }
    footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px; }
    footer a { color: #0ea5e9; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">Clinifly</div>
      <h1>Privacy Policy</h1>
      <p class="effective-date">Effective Date: January 21, 2026</p>
    </header>

    <div class="card">
      <h2>1. Introduction</h2>
      <p>Welcome to Clinifly. We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and services.</p>
      
      <div class="highlight">
        <p><strong>Summary:</strong> We only collect information necessary to provide our dental health coordination services. Your health data is encrypted and never sold to third parties.</p>
      </div>

      <h2>2. Information We Collect</h2>
      <p>We collect information that you provide directly to us:</p>
      <ul>
        <li><strong>Account Information:</strong> Name, email address, phone number, and password when you create an account</li>
        <li><strong>Health Information:</strong> Dental records, X-rays, treatment history, and medical questionnaire responses that you choose to share with your clinic</li>
        <li><strong>Communication Data:</strong> Messages, photos, and files exchanged through our in-app chat feature</li>
        <li><strong>Travel Information:</strong> Flight details, hotel bookings, and transfer arrangements coordinated through the app</li>
        <li><strong>Device Information:</strong> Device type, operating system, and app version for troubleshooting purposes</li>
      </ul>

      <h2>3. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Facilitate communication between you and your dental clinic</li>
        <li>Coordinate your treatment plan and appointments</li>
        <li>Manage your travel arrangements</li>
        <li>Send you important notifications about your treatment</li>
        <li>Improve our services and user experience</li>
        <li>Comply with legal obligations</li>
      </ul>

      <h2>4. Information Sharing</h2>
      <p>We share your information only in the following circumstances:</p>
      <ul>
        <li><strong>With Your Clinic:</strong> Your health and treatment information is shared with the dental clinic you are registered with</li>
        <li><strong>Service Providers:</strong> We may share data with trusted third-party service providers who assist in operating our app (e.g., cloud hosting, push notifications)</li>
        <li><strong>Legal Requirements:</strong> We may disclose information if required by law or to protect our rights</li>
      </ul>
      
      <div class="highlight">
        <p><strong>We do NOT:</strong> Sell your personal information to advertisers or data brokers. Your health data remains between you and your clinic.</p>
      </div>

      <h2>5. Data Security</h2>
      <p>We implement appropriate technical and organizational measures to protect your personal information:</p>
      <ul>
        <li>All data is transmitted using SSL/TLS encryption</li>
        <li>Health records are stored in encrypted databases</li>
        <li>Access to personal data is restricted to authorized personnel only</li>
        <li>Regular security audits and updates</li>
      </ul>

      <h2>6. Data Retention</h2>
      <p>We retain your personal information for as long as your account is active or as needed to provide you services. You may request deletion of your account and associated data at any time by contacting us.</p>

      <h2>7. Your Rights</h2>
      <p>Depending on your location, you may have the following rights:</p>
      <ul>
        <li><strong>Access:</strong> Request a copy of your personal data</li>
        <li><strong>Correction:</strong> Request correction of inaccurate data</li>
        <li><strong>Deletion:</strong> Request deletion of your personal data</li>
        <li><strong>Portability:</strong> Request transfer of your data to another service</li>
        <li><strong>Withdraw Consent:</strong> Withdraw consent for data processing at any time</li>
      </ul>

      <h2>8. Children's Privacy</h2>
      <p>Our services are not intended for children under 16 years of age. We do not knowingly collect personal information from children under 16. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.</p>

      <h2>9. International Data Transfers</h2>
      <p>Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place to protect your information in accordance with this Privacy Policy.</p>

      <h2>10. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Effective Date" above. You are advised to review this Privacy Policy periodically.</p>

      <h2>11. Contact Us</h2>
      <p>If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
      
      <div class="contact-info">
        <p><strong>Clinifly</strong></p>
        <p>Website: <a href="https://clinifly.net">https://clinifly.net</a></p>
        <p>Email: <a href="mailto:privacy@clinifly.net">privacy@clinifly.net</a></p>
      </div>
    </div>

    <footer>
      <p>&copy; 2026 Clinifly. All rights reserved.</p>
      <p><a href="https://clinifly.net">Back to Clinifly</a></p>
    </footer>
  </div>
</body>
</html>`);
});

// ================== DASHBOARD REDIRECTS ==================
// Keep both UIs:
// - Dashboard (current): /admin.html  -> public/admin.html (for normal clinic admins)
// - Legacy page:         /admin-v2.html -> admin_v2.html
// - Super Admin:         redirects to SUPER_ADMIN_URL

const SUPER_ADMIN_URL = process.env.SUPER_ADMIN_URL || "https://superadmin.clinifly.net/login";

// /admin.html: Serve normal clinic admin dashboard (NOT Super Admin)
// Super Admin has its own domain: https://superadmin.clinifly.net
app.get("/admin.html", (req, res) => {
  // Always serve the normal clinic admin dashboard
  // The dashboard page itself will check for token and redirect to login if needed
  const filePath = path.join(__dirname, "public", "admin.html");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // Try alternative paths (Render compatibility)
    const altPath1 = path.join(process.cwd(), "public", "admin.html");
    const altPath2 = path.resolve("public", "admin.html");
    if (fs.existsSync(altPath1)) {
      res.sendFile(altPath1);
    } else if (fs.existsSync(altPath2)) {
      res.sendFile(altPath2);
    } else {
      // If admin.html doesn't exist, redirect to login (NOT super admin)
      res.redirect("/admin-login.html");
    }
  }
});

app.get("/", (req, res) => res.redirect("/admin-login.html"));
app.get("/admin", (req, res) => res.redirect("/admin-login.html"));
// /dashboard should serve normal admin dashboard, NOT redirect to Super Admin
app.get("/dashboard", (req, res) => {
  const filePath = path.join(__dirname, "public", "admin.html");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.redirect("/admin-login.html");
  }
});

// Explicit UI entrypoints
app.get("/admin-v2.html", (req, res) => {
  const filePath = path.resolve(__dirname, "admin_v2.html");
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("[GET /admin-v2.html] Error:", err);
      res.status(500).send("File not found: " + err.message);
    }
  });
});

app.get("/admin-v3.html", (req, res) => {
  // Backward compatibility: /admin-v3.html now points to the same dashboard
  res.redirect("/admin.html");
});

// Admin Login & Register routes (explicit handlers for Render compatibility)
app.get("/admin-login.html", (req, res) => {
  const filePath = path.join(__dirname, "public", "admin-login.html");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
    } else {
    console.error(`[GET /admin-login.html] File not found: ${filePath}`);
    console.error(`[GET /admin-login.html] __dirname: ${__dirname}`);
    console.error(`[GET /admin-login.html] process.cwd(): ${process.cwd()}`);
    // Try alternative paths
    const altPath1 = path.join(process.cwd(), "public", "admin-login.html");
    const altPath2 = path.resolve("public", "admin-login.html");
    if (fs.existsSync(altPath1)) {
      console.log(`[GET /admin-login.html] Using alternative path 1: ${altPath1}`);
      res.sendFile(altPath1);
    } else if (fs.existsSync(altPath2)) {
      console.log(`[GET /admin-login.html] Using alternative path 2: ${altPath2}`);
      res.sendFile(altPath2);
    } else {
      res.status(404).send("Admin Login page not found");
    }
  }
});

app.get("/admin-register.html", (req, res) => {
  const filePath = path.join(__dirname, "public", "admin-register.html");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    console.error(`[GET /admin-register.html] File not found: ${filePath}`);
    console.error(`[GET /admin-register.html] __dirname: ${__dirname}`);
    console.error(`[GET /admin-register.html] process.cwd(): ${process.cwd()}`);
    // Try alternative paths
    const altPath1 = path.join(process.cwd(), "public", "admin-register.html");
    const altPath2 = path.resolve("public", "admin-register.html");
    if (fs.existsSync(altPath1)) {
      console.log(`[GET /admin-register.html] Using alternative path 1: ${altPath1}`);
      res.sendFile(altPath1);
    } else if (fs.existsSync(altPath2)) {
      console.log(`[GET /admin-register.html] Using alternative path 2: ${altPath2}`);
      res.sendFile(altPath2);
    } else {
      res.status(404).send("Admin Register page not found");
    }
  }
});

// Super Admin routes
app.get("/super-admin-login.html", (req, res) => {
  const filePath = path.join(__dirname, "public", "super-admin-login.html");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
    } else {
    res.status(404).send("Super Admin Login page not found");
  }
});

app.get("/super-admin.html", (req, res) => {
  const filePath = path.join(__dirname, "public", "super-admin.html");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("Super Admin Dashboard page not found");
  }
});

// ================== REGISTER ==================
app.post("/api/register", async (req, res) => {
  const { name = "", phone = "", email = "", referralCode = "", clinicCode = "", language = "" } = req.body || {};
  
  console.log(`[REGISTER] Request received:`, { 
    name: name ? "***" : "", 
    phone: phone ? "***" : "", 
    email: email ? "***" : "",
    clinicCode: clinicCode || "(empty)",
    hasClinicCode: !!clinicCode 
  });
  
  // Email is required for registration
  if (!email || !String(email).trim()) {
    return res.status(400).json({ ok: false, error: "email_required", message: "Email gereklidir." });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailNormalized = String(email).trim().toLowerCase();
  if (!emailRegex.test(emailNormalized)) {
    return res.status(400).json({ ok: false, error: "invalid_email", message: "Geçersiz email formatı." });
  }

  const patientLanguage = normalizePatientLanguage(language);

  // Phone is OPTIONAL (email-only OTP). If present, validate and normalize.
  const phoneTrimmed = String(phone || "").trim();
  const phoneNormalized = phoneTrimmed ? normalizePhone(phoneTrimmed) : "";
  if (phoneTrimmed && (!phoneNormalized || phoneNormalized.length < 10)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_phone",
      message: "Geçersiz telefon numarası formatı.",
    });
  }

  // Validate clinic code if provided
  let validatedClinicCode = null;
  let foundClinicId = null;
  if (clinicCode && String(clinicCode).trim()) {
    const code = String(clinicCode).trim().toUpperCase();
    let foundClinic = null;
    
    console.log(`[REGISTER] Validating clinic code: ${code}`);
    
    // SUPABASE: Primary lookup
    if (isSupabaseEnabled()) {
      foundClinic = await getClinicByCode(code);
      if (foundClinic) {
        foundClinicId = foundClinic.id;
        console.log(`[REGISTER] Found clinic in Supabase: ${foundClinic.id}`);
      }
    }
    
    // FILE FALLBACK: First check CLINIC_FILE (single clinic object)
    if (!foundClinic) {
      const singleClinic = readJson(CLINIC_FILE, {});
      if (singleClinic && singleClinic.clinicCode) {
        const singleClinicCode = String(singleClinic.clinicCode).toUpperCase();
        console.log(`[REGISTER] Checking CLINIC_FILE: clinicCode=${singleClinic.clinicCode}, upper=${singleClinicCode}`);
        if (singleClinicCode === code) {
          foundClinic = singleClinic;
          console.log(`[REGISTER] Found matching clinic in CLINIC_FILE`);
        }
      }
    }
    
    // FILE FALLBACK: Then check CLINICS_FILE (multiple clinics object)
    if (!foundClinic) {
      const clinics = readJson(CLINICS_FILE, {});
      console.log(`[REGISTER] Available clinics count in CLINICS_FILE: ${Object.keys(clinics).length}`);
      
      // Search for clinic by clinicCode or code field
      for (const clinicId in clinics) {
        const clinic = clinics[clinicId];
        if (clinic) {
          // Check both clinicCode and code fields
          const clinicCodeToCheck = clinic.clinicCode || clinic.code;
          if (clinicCodeToCheck) {
            const clinicCodeUpper = String(clinicCodeToCheck).toUpperCase();
            console.log(`[REGISTER] Checking clinic ${clinicId}: clinicCode=${clinic.clinicCode}, code=${clinic.code}, upper=${clinicCodeUpper}`);
            if (clinicCodeUpper === code) {
              foundClinic = clinic;
              foundClinicId = clinicId;
              console.log(`[REGISTER] Found matching clinic in CLINICS_FILE: ${clinicId}`);
              break;
            }
          }
        }
      }
    }
    
    if (foundClinic) {
      validatedClinicCode = code;
      console.log(`[REGISTER] Using existing clinic: ${code}`);
    } else {
      // Clinic not found - return error
      console.log(`[REGISTER] Clinic code "${code}" not found in Supabase, CLINIC_FILE or CLINICS_FILE`);
      return res.status(404).json({ 
        ok: false, 
        error: "clinic_not_found",
        message: `Klinik kodu "${code}" bulunamadı. Lütfen geçerli bir klinik kodu girin.`
      });
    }
  } else {
    console.log(`[REGISTER] No clinic code provided or empty, validatedClinicCode will be null`);
  }
  
  console.log(`[REGISTER] Final validatedClinicCode: ${validatedClinicCode || "null"}`);

  // EMAIL is the identity: if a patient already exists for this email, reuse its patientId.
  let patientId = null;
  if (isSupabaseEnabled()) {
    try {
      const { data: existing, error: e } = await supabase
        .from("patients")
        .select("id, patient_id, email")
        .eq("email", emailNormalized)
        .single();
      if (!e && existing) {
        patientId = existing.patient_id || existing.id;
      } else if (e && String(e.code || "") !== "PGRST116") {
        console.error("[REGISTER] Supabase patient lookup by email failed", {
          message: e.message,
          code: e.code,
          details: e.details,
        });
      }
    } catch (err) {
      console.error("[REGISTER] Supabase patient lookup exception:", err?.message || err);
    }
  }
  if (!patientId) {
    const patientsByFile = readJson(PAT_FILE, {});
    for (const pid in patientsByFile) {
      const em = String(patientsByFile[pid]?.email || "").trim().toLowerCase();
      if (em && em === emailNormalized) {
        patientId = pid;
        break;
      }
    }
  }
  if (!patientId) patientId = rid("p");
  const requestId = rid("req");
  const token = makeToken();

  // SUPABASE: Insert patient (PRIMARY - production source of truth)
  let supabaseClinicId = null;
  let supabasePatientRow = null;
  if (isSupabaseEnabled() && validatedClinicCode) {
    try {
      const clinic = await getClinicByCode(validatedClinicCode);
      if (clinic) {
        supabaseClinicId = clinic.id;
        console.log(`[REGISTER] Found clinic UUID: ${supabaseClinicId} for code: ${validatedClinicCode}`);
      } else {
        console.warn(`[REGISTER] Clinic not found in Supabase for code: ${validatedClinicCode}`);
      }
    } catch (err) {
      console.error(`[REGISTER] Error finding clinic in Supabase:`, err.message);
    }
  }

  if (isSupabaseEnabled() && !supabaseClinicId) {
    console.error("[REGISTER] Missing clinic_id for Supabase insert. clinicCode:", validatedClinicCode);
    return res.status(400).json({ ok: false, error: "clinic_not_found", message: "Klinik kodu bulunamadı. Lütfen geçerli bir klinik kodu girin." });
  }

  // === SUPABASE PATIENT UPSERT (ZORUNLU) ===
  if (isSupabaseEnabled()) {
    const payload = {
      patient_id: patientId, // legacy app id (p_xxx)
      email: emailNormalized,
      name: String(name || ""),
      clinic_id: supabaseClinicId,
      status: "PENDING",
      language: patientLanguage,
      role: (req.body?.role || "PATIENT").toUpperCase(), // 🔥 NORMALIZE ROLE TO UPPERCASE
      ...(phoneNormalized ? { phone: phoneNormalized } : {}),
    };
    const { data, error } = await supabase
      .from("patients")
      .upsert(
        payload,
        {
          onConflict: "email",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("[SUPABASE] PATIENT UPSERT FAILED", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      // If email is already taken, treat registration as idempotent and reuse existing patient.
      const isUniqueEmail =
        String(error.code || "") === "23505" ||
        String(error.message || "").toLowerCase().includes("patients_email_unique") ||
        String(error.message || "").toLowerCase().includes("duplicate key");
      if (isUniqueEmail) {
        try {
          const { data: existing, error: e2 } = await supabase
            .from("patients")
            .select("id, patient_id, email, language")
            .eq("email", emailNormalized)
            .limit(1)
            .maybeSingle();
          if (!e2 && existing) {
            patientId = existing.patient_id || existing.id;
            console.log("[REGISTER] Reusing existing patient for email:", emailNormalized, "patientId:", patientId);
            // Best-effort: keep language in sync
            if (patientLanguage && existing.language !== patientLanguage) {
              await supabase.from("patients").update({ language: patientLanguage }).eq("email", emailNormalized);
            }
            // Best-effort: keep supabase patient row for downstream (referrals)
            try {
              const { data: fullRow } = await supabase
                .from("patients")
                .select("id, patient_id, clinic_id, name, referral_code, email")
                .eq("email", emailNormalized)
                .limit(1)
                .maybeSingle();
              supabasePatientRow = fullRow || existing;
            } catch {
              supabasePatientRow = existing;
            }
          } else {
            console.error("[REGISTER] Unique email but failed to fetch existing patient", {
              message: e2?.message,
              code: e2?.code,
              details: e2?.details,
            });
            return res.status(500).json({ ok: false, error: "register_failed" });
          }
        } catch (e3) {
          console.error("[REGISTER] Unique email fetch exception:", e3?.message || e3);
          return res.status(500).json({ ok: false, error: "register_failed" });
        }
      } else {
        return res.status(500).json({ ok: false, error: error.message });
      }
    }

    if (data?.id) console.log("[SUPABASE] ✅ patient upserted:", data.id);
    if (data) supabasePatientRow = data;
  }

  // FILE-BASED: Fallback storage (for backward compatibility)
  const patients = readJson(PAT_FILE, {});
  const existingFile = patients[patientId] || null;
  patients[patientId] = {
    patientId,
    name: String(name || ""),
    ...(phoneNormalized ? { phone: phoneNormalized } : {}),
    email: emailNormalized,
    language: patientLanguage,
    status: "PENDING",
    clinicCode: validatedClinicCode,
    createdAt: existingFile?.createdAt || now(),
    updatedAt: now(),
  };
  writeJson(PAT_FILE, patients);

  // registrations (array/object safe)
  const regs = readJson(REG_FILE, {});
  const row = {
    requestId,
    patientId,
    name: String(name || ""),
    phone: phoneNormalized, // Use normalized phone
    email: emailNormalized,
    status: "PENDING",
    clinicCode: validatedClinicCode, // Add clinicCode to registration
    createdAt: now(),
    updatedAt: now(),
  };
  if (Array.isArray(regs)) {
    regs.push(row);
    writeJson(REG_FILE, regs);
  } else {
    regs[requestId] = row;
    writeJson(REG_FILE, regs);
  }

  // Handle referral code if provided
  if (referralCode && String(referralCode).trim()) {
    try {
      const refCodeRaw = String(referralCode).trim();
      const refCode = refCodeRaw;

      // ================== SUPABASE PATH (source of truth) ==================
      if (isSupabaseEnabled() && supabaseClinicId) {
        const variants = Array.from(
          new Set([refCode, refCode.toUpperCase(), refCode.toLowerCase()].filter(Boolean))
        );

        let inviter = null;
        let lastInviterErr = null;
        for (const v of variants) {
          // 1) referral_code match (if column exists)
          try {
            const q1 = await supabase
              .from("patients")
              .select("id, patient_id, clinic_id, name, referral_code")
              .eq("referral_code", v)
              .limit(1)
              .maybeSingle();
            if (!q1.error && q1.data) {
              inviter = q1.data;
              break;
            }
            if (q1.error && !isMissingColumnError(q1.error, "referral_code") && String(q1.error.code || "") !== "PGRST116") {
              lastInviterErr = q1.error;
            }
          } catch (e) {
            // ignore
          }

          // 2) patient_id match (if column exists)
          try {
            const q2 = await supabase
              .from("patients")
              .select("id, patient_id, clinic_id, name, referral_code")
              .eq("patient_id", v)
              .limit(1)
              .maybeSingle();
            if (!q2.error && q2.data) {
              inviter = q2.data;
              break;
            }
            if (q2.error && !isMissingColumnError(q2.error, "patient_id") && String(q2.error.code || "") !== "PGRST116") {
              lastInviterErr = q2.error;
            }
          } catch (e) {
            // ignore
          }

          // 3) id match (covers schemas where patient id is stored in `id`)
          try {
            const q3 = await supabase
              .from("patients")
              .select("id, patient_id, clinic_id, name, referral_code")
              .eq("id", v)
              .limit(1)
              .maybeSingle();
            if (!q3.error && q3.data) {
              inviter = q3.data;
              break;
            }
            if (q3.error && String(q3.error.code || "") !== "PGRST116") {
              lastInviterErr = q3.error;
            }
          } catch (e) {
            // ignore
          }
        }

        if (!inviter) {
          console.log("[REGISTER] Referral code not found in Supabase:", refCodeRaw);
          return res.status(400).json({
            ok: false,
            error: "invalid_referral_code",
            message: `Referral code "${refCodeRaw}" is invalid or not found. Please check the code and try again.`,
            supabase: lastInviterErr ? supabaseErrorPublic(lastInviterErr) : null,
          });
        }

        // Prevent cross-clinic referrals (must match clinic being registered)
        const inviterClinicId = inviter.clinic_id || null;
        if (inviterClinicId && String(inviterClinicId) !== String(supabaseClinicId)) {
          console.log("[REGISTER] Referral clinic mismatch:", {
            refCode: refCodeRaw,
            inviterClinicId,
            targetClinicId: supabaseClinicId,
          });
          return res.status(400).json({
            ok: false,
            error: "invalid_referral_code",
            message: `Referral code "${refCodeRaw}" is invalid or not found. Please check the code and try again.`,
          });
        }

        const uuidLike = (s) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));

        let inviterCandidates = Array.from(
          new Set([inviter.id, inviter.patient_id].filter(Boolean))
        );

        let invitedCandidates = Array.from(
          new Set([supabasePatientRow?.id, supabasePatientRow?.patient_id, patientId].filter(Boolean))
        );

        // Some production schemas store referrals.*_patient_id as UUID.
        // Ensure we try UUID ids first by resolving from patient_id (p_xxx) when needed.
        const resolvedInviterUuids = (await Promise.all(inviterCandidates.map(resolvePatientUuidForReferral))).filter(Boolean);
        inviterCandidates = Array.from(new Set([...inviterCandidates, ...resolvedInviterUuids]));
        inviterCandidates = [
          ...inviterCandidates.filter((x) => uuidLike(x)),
          ...inviterCandidates.filter((x) => !uuidLike(x)),
        ];

        const resolvedInvitedUuids = (await Promise.all(invitedCandidates.map(resolvePatientUuidForReferral))).filter(Boolean);
        invitedCandidates = Array.from(new Set([...invitedCandidates, ...resolvedInvitedUuids]));
        invitedCandidates = [
          ...invitedCandidates.filter((x) => uuidLike(x)),
          ...invitedCandidates.filter((x) => !uuidLike(x)),
        ];

        // Self-referral guard (compare any representation)
        const inviterSet = new Set(inviterCandidates.map((x) => String(x)));
        const invitedSet = new Set(invitedCandidates.map((x) => String(x)));
        for (const x of inviterSet) {
          if (invitedSet.has(x)) {
            return res.status(400).json({
              ok: false,
              error: "invalid_referral_code",
              message: "Self-referral is not allowed.",
            });
          }
        }

        let created = null;
        let lastCreateErr = null;
        for (const invId of inviterCandidates) {
          for (const invitedId of invitedCandidates) {
            try {
              const referralData = {
                clinic_id: supabaseClinicId,
                inviter_patient_id: invId,
                invited_patient_id: invitedId,
                referral_code: generateReferralCodeV2(),
                status: "PENDING",
                inviter_discount_percent: null,
                invited_discount_percent: null,
                discount_percent: null,
              };
              created = await createReferralInDB(referralData);
              break;
            } catch (e) {
              lastCreateErr = e;
              // Unique violation (inviter+invited) -> treat as success
              if (String(e?.code || "") === "23505") {
                created = { id: null, duplicate: true };
                break;
              }
              // UUID mismatch -> try next candidate combo
              if (isInvalidUuidError(e)) {
                continue;
              }
            }
          }
          if (created) break;
        }

        if (!created) {
          console.error("[REGISTER] ❌ Failed to create referral in Supabase", supabaseErrorPublic(lastCreateErr));
          return res.status(500).json({
            ok: false,
            error: "referral_create_failed",
            message: "Could not create referral. Please try again.",
            supabase: supabaseErrorPublic(lastCreateErr),
          });
        }

        console.log("[REGISTER] ✅ Referral linked on register", {
          inviter: inviterCandidates[0],
          invited: invitedCandidates[0],
        });
      } else {
        // ================== FILE FALLBACK ==================
        const allPatients = readJson(PAT_FILE, {});
        let inviterPatientId = null;
        let inviterPatientName = null;

        for (const pid in allPatients) {
          const p = allPatients[pid];
          const code = String(p?.referralCode || p?.referral_code || "").trim();
          if (code && code === refCode) {
            inviterPatientId = pid;
            inviterPatientName = p?.name || "Unknown";
            break;
          }
          if (pid === refCode) {
            inviterPatientId = pid;
            inviterPatientName = p?.name || "Unknown";
            break;
          }
        }

        if (!inviterPatientId) {
          console.log(`[REGISTER] Referral code not found (file fallback): ${refCode}`);
        } else if (inviterPatientId === patientId) {
          console.log(`[REGISTER] ❌ Self-referral blocked (file): inviter=${inviterPatientId}, invited=${patientId}`);
        } else if (canUseFileFallback()) {
          const referrals = readJson(REF_FILE, []);
          const referralList = Array.isArray(referrals) ? referrals : Object.values(referrals);
          referralList.push({
            id: rid("ref"),
            inviterPatientId,
            inviterPatientName,
            invitedPatientId: patientId,
            invitedPatientName: String(name || ""),
            status: "PENDING",
            createdAt: now(),
            inviterDiscountPercent: null,
            invitedDiscountPercent: null,
            discountPercent: null,
            checkInAt: null,
            approvedAt: null,
            clinicCode: validatedClinicCode,
          });
          writeJson(REF_FILE, referralList);
        }
      }
    } catch (err) {
      console.error("[REGISTER] Referral creation error:", err);
      // Don't fail registration if referral creation fails
    }
  }

  // Send OTP for email verification instead of returning token immediately
  try {
    // Review Mode Bypass: Skip OTP generation and saving for test@clinifly.net
    if (REVIEW_MODE && emailNormalized === "test@clinifly.net") {
      console.log(`[REGISTER] 🚫 REVIEW MODE: Skipping OTP generation for test@clinifly.net`);
      console.log(`[REGISTER] 📝 Static OTP 123456 will work for this account`);
      
      // Still return success response but without actually sending OTP
      return res.status(201).json({
        ok: true,
        clinicId: clinicData.id,
        clinicCode: clinicData.clinic_code,
        message: "Clinic registered successfully (Review Mode). Use OTP 123456 to verify.",
        reviewMode: true,
        requiresOTP: true
      });
    }
    
    // Clean up expired OTPs
    cleanupExpiredOTPs();
    
    // Generate OTP
    const otpCode = generateOTP();
    console.log(`[REGISTER] Generated OTP for ${emailNormalized}`);
    
    // Save OTP (hashed) - this is fast, keep it sync
    await saveOTP(emailNormalized, otpCode, 0);
    console.log(`[REGISTER] OTP saved to file`);
    
    // FIRE-AND-FORGET: Send email WITHOUT waiting (Brevo REST API)
    // This prevents API timeout from blocking the response
    console.log(`[REGISTER] ========================================`);
    console.log(`[REGISTER] EMAIL SEND DECISION POINT (Brevo REST API)`);
    console.log(`[REGISTER] BREVO_API_KEY: ${process.env.BREVO_API_KEY ? 'SET' : 'NOT SET'}`);
    console.log(`[REGISTER] SMTP_FROM: ${process.env.SMTP_FROM || 'NOT SET'}`);
    console.log(`[REGISTER] ========================================`);
    
    console.log(`[REGISTER] Calling sendOTPEmail (fire-and-forget)`);
    sendOTPEmail(emailNormalized, otpCode, patientLanguage)
      .then(() => {
        console.log(`[REGISTER] ✅ OTP email sent successfully to ${emailNormalized}`);
      })
      .catch((emailError) => {
        console.error(`[REGISTER] ❌ Failed to send OTP email to ${emailNormalized}:`, emailError.message);
        // Email failed but registration succeeded - user can request OTP again
      });
    
    // Return success IMMEDIATELY - don't wait for email
    console.log(`[REGISTER] Returning success response for patient ${patientId}`);
    res.json({ 
      ok: true, 
      message: "Kayıt başarılı. Email adresinize gönderilen OTP kodunu girin.",
      patientId, 
      email: emailNormalized,
      language: patientLanguage,
      requestId, 
      status: "PENDING",
      requiresOTP: true,
    });
  } catch (otpError) {
    console.error("[REGISTER] OTP generation error:", otpError);
    // Still return success, but user will need to request OTP manually
    res.json({ 
      ok: true, 
      message: "Kayıt başarılı. Lütfen OTP kodu talep edin.",
      patientId, 
      email: emailNormalized,
      requestId, 
      status: "PENDING",
      requiresOTP: true,
    });
  }
});

// ================== PATIENT LOGIN ==================
// Removed duplicate endpoint - using the one at line 509

// ================== PATIENT REGISTER (alias) ==================
app.post("/api/patient/register", async (req, res) => {
  const { name = "", phone = "", email = "", referralCode = "", clinicCode = "", language = "" } = req.body || {};
  
  console.log(`[REGISTER /api/patient/register] Request received:`, { 
    name: name ? "***" : "", 
    phone: phone ? "***" : "", 
    email: email ? "***" : "",
    clinicCode: clinicCode || "(empty)",
    hasClinicCode: !!clinicCode 
  });
  
  // Email is required for registration
  if (!email || !String(email).trim()) {
    return res.status(400).json({ ok: false, error: "email_required", message: "Email gereklidir." });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailNormalized = String(email).trim().toLowerCase();
  if (!emailRegex.test(emailNormalized)) {
    return res.status(400).json({ ok: false, error: "invalid_email", message: "Geçersiz email formatı." });
  }

  const patientLanguage = normalizePatientLanguage(language);

  // Phone is OPTIONAL (email-only OTP). If present, validate and normalize.
  const phoneTrimmed = String(phone || "").trim();
  const phoneNormalized = phoneTrimmed ? normalizePhone(phoneTrimmed) : "";
  if (phoneTrimmed && (!phoneNormalized || phoneNormalized.length < 10)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_phone",
      message: "Geçersiz telefon numarası formatı.",
    });
  }

  // Validate clinic code if provided
  let validatedClinicCode = null;
  let foundClinicId = null;
  if (clinicCode && String(clinicCode).trim()) {
    const code = String(clinicCode).trim().toUpperCase();
    let foundClinic = null;
    
    console.log(`[REGISTER /api/patient/register] Validating clinic code: ${code}`);

    // SUPABASE: Primary lookup (source of truth)
    if (isSupabaseEnabled()) {
      try {
        foundClinic = await getClinicByCode(code);
        if (foundClinic) {
          foundClinicId = foundClinic.id;
          console.log(`[REGISTER /api/patient/register] Found clinic in Supabase: ${foundClinic.id}`);
        }
      } catch (e) {
        console.error(`[REGISTER /api/patient/register] Error checking clinic in Supabase:`, e?.message || e);
      }
    }
    
    // First check CLINIC_FILE (single clinic object)
    if (!foundClinic) {
      const singleClinic = readJson(CLINIC_FILE, {});
      if (singleClinic && singleClinic.clinicCode) {
        const singleClinicCode = String(singleClinic.clinicCode).toUpperCase();
        console.log(`[REGISTER /api/patient/register] Checking CLINIC_FILE: clinicCode=${singleClinic.clinicCode}, upper=${singleClinicCode}`);
        if (singleClinicCode === code) {
          foundClinic = singleClinic;
          console.log(`[REGISTER /api/patient/register] Found matching clinic in CLINIC_FILE`);
        }
      }
    }
    
    // Then check CLINICS_FILE (multiple clinics object)
    if (!foundClinic) {
      const clinics = readJson(CLINICS_FILE, {});
      console.log(`[REGISTER /api/patient/register] Available clinics count in CLINICS_FILE: ${Object.keys(clinics).length}`);
      
      // Search for clinic by clinicCode or code field
      for (const clinicId in clinics) {
        const clinic = clinics[clinicId];
        if (clinic) {
          // Check both clinicCode and code fields
          const clinicCodeToCheck = clinic.clinicCode || clinic.code;
          if (clinicCodeToCheck) {
            const clinicCodeUpper = String(clinicCodeToCheck).toUpperCase();
            console.log(`[REGISTER /api/patient/register] Checking clinic ${clinicId}: clinicCode=${clinic.clinicCode}, code=${clinic.code}, upper=${clinicCodeUpper}`);
            if (clinicCodeUpper === code) {
              foundClinic = clinic;
              foundClinicId = foundClinicId || clinicId;
              console.log(`[REGISTER /api/patient/register] Found matching clinic in CLINICS_FILE: ${clinicId}`);
              break;
            }
          }
        }
      }
    }
    
    if (foundClinic) {
      validatedClinicCode = code;
      console.log(`[REGISTER /api/patient/register] Using existing clinic: ${code}`);
    } else {
      // Clinic not found - return error
      console.log(`[REGISTER /api/patient/register] Clinic code "${code}" not found in CLINIC_FILE or CLINICS_FILE`);
      return res.status(404).json({ 
        ok: false, 
        error: "clinic_not_found",
        message: `Klinik kodu "${code}" bulunamadı. Lütfen geçerli bir klinik kodu girin.`
      });
    }
  } else {
    console.log(`[REGISTER /api/patient/register] No clinic code provided or empty, validatedClinicCode will be null`);
  }
  
  console.log(`[REGISTER /api/patient/register] Final validatedClinicCode: ${validatedClinicCode || "null"}`);

  // EMAIL is the identity: if a patient already exists for this email, reuse its patientId.
  let patientId = null;
  if (isSupabaseEnabled()) {
    try {
      const { data: existing, error: e } = await supabase
        .from("patients")
        .select("id, patient_id, email")
        .eq("email", emailNormalized)
        .single();
      if (!e && existing) {
        patientId = existing.patient_id || existing.id;
      } else if (e && String(e.code || "") !== "PGRST116") {
        console.error("[REGISTER /api/patient/register] Supabase patient lookup by email failed", {
          message: e.message,
          code: e.code,
          details: e.details,
        });
      }
    } catch (err) {
      console.error("[REGISTER /api/patient/register] Supabase patient lookup exception:", err?.message || err);
    }
  }
  if (!patientId) {
    const patientsByFile = readJson(PAT_FILE, {});
    for (const pid in patientsByFile) {
      const em = String(patientsByFile[pid]?.email || "").trim().toLowerCase();
      if (em && em === emailNormalized) {
        patientId = pid;
        break;
      }
    }
  }
  if (!patientId) patientId = rid("p");
  const requestId = rid("req");
  const token = makeToken();

  // SUPABASE: Insert patient (PRIMARY - production source of truth)
  let supabaseClinicId = null;
  let supabasePatientRow = null;
  if (isSupabaseEnabled() && validatedClinicCode) {
    try {
      const clinic = await getClinicByCode(validatedClinicCode);
      if (clinic) {
        supabaseClinicId = clinic.id;
        console.log(`[REGISTER /api/patient/register] Found clinic UUID: ${supabaseClinicId} for code: ${validatedClinicCode}`);
      } else {
        console.warn(`[REGISTER /api/patient/register] Clinic not found in Supabase for code: ${validatedClinicCode}`);
      }
    } catch (err) {
      console.error(`[REGISTER /api/patient/register] Error finding clinic in Supabase:`, err.message);
    }
  }

  if (isSupabaseEnabled() && !supabaseClinicId) {
    console.error("[REGISTER /api/patient/register] Missing clinic_id for Supabase insert. clinicCode:", validatedClinicCode);
    return res.status(400).json({ ok: false, error: "clinic_not_found", message: "Klinik kodu bulunamadı. Lütfen geçerli bir klinik kodu girin." });
  }

  // === SUPABASE PATIENT UPSERT (ZORUNLU) ===
  if (isSupabaseEnabled()) {
    const payload = {
      patient_id: patientId, // legacy app id (p_xxx)
      email: emailNormalized,
      name: String(name || ""),
      clinic_id: supabaseClinicId,
      status: "PENDING",
      language: patientLanguage,
      role: (req.body?.role || "PATIENT").toUpperCase(), // 🔥 NORMALIZE ROLE TO UPPERCASE
      ...(phoneNormalized ? { phone: phoneNormalized } : {}),
    };
    const { data, error } = await supabase
      .from("patients")
      .upsert(
        payload,
        {
          onConflict: "email",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("[SUPABASE] PATIENT UPSERT FAILED", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      // If email is already taken, treat registration as idempotent and reuse existing patient.
      const isUniqueEmail =
        String(error.code || "") === "23505" ||
        String(error.message || "").toLowerCase().includes("patients_email_unique") ||
        String(error.message || "").toLowerCase().includes("duplicate key");
      if (isUniqueEmail) {
        try {
          const { data: existing, error: e2 } = await supabase
            .from("patients")
            .select("id, patient_id, email, language")
            .eq("email", emailNormalized)
            .limit(1)
            .maybeSingle();
          if (!e2 && existing) {
            patientId = existing.patient_id || existing.id;
            console.log("[REGISTER /api/patient/register] Reusing existing patient for email:", emailNormalized, "patientId:", patientId);
            // Best-effort: keep language in sync
            if (patientLanguage && existing.language !== patientLanguage) {
              await supabase.from("patients").update({ language: patientLanguage }).eq("email", emailNormalized);
            }
            // Best-effort: keep supabase patient row for downstream (referrals)
            try {
              const { data: fullRow } = await supabase
                .from("patients")
                .select("id, patient_id, clinic_id, name, referral_code, email")
                .eq("email", emailNormalized)
                .limit(1)
                .maybeSingle();
              supabasePatientRow = fullRow || existing;
            } catch {
              supabasePatientRow = existing;
            }
          } else {
            console.error("[REGISTER /api/patient/register] Unique email but failed to fetch existing patient", {
              message: e2?.message,
              code: e2?.code,
              details: e2?.details,
            });
            return res.status(500).json({ ok: false, error: "register_failed" });
          }
        } catch (e3) {
          console.error("[REGISTER /api/patient/register] Unique email fetch exception:", e3?.message || e3);
          return res.status(500).json({ ok: false, error: "register_failed" });
        }
      } else {
        return res.status(500).json({ ok: false, error: error.message });
      }
    }

    if (data?.id) console.log("[SUPABASE] ✅ patient upserted:", data.id);
    if (data) supabasePatientRow = data;
  }

  // FILE-BASED: Fallback storage (for backward compatibility)
  const patients = readJson(PAT_FILE, {});
  const existingFile = patients[patientId] || null;
  patients[patientId] = {
    patientId,
    name: String(name || ""),
    ...(phoneNormalized ? { phone: phoneNormalized } : {}),
    email: emailNormalized,
    language: patientLanguage,
    status: "PENDING",
    clinicCode: validatedClinicCode,
    createdAt: existingFile?.createdAt || now(),
    updatedAt: now(),
  };
  writeJson(PAT_FILE, patients);

  // tokens
  const tokens = readJson(TOK_FILE, {});
  tokens[token] = { patientId, role: "PENDING", createdAt: now() };
  writeJson(TOK_FILE, tokens);

  // registrations (array/object safe)
  const regs = readJson(REG_FILE, {});
  const row = {
    requestId,
    patientId,
    name: String(name || ""),
    phone: phoneNormalized, // Use normalized phone
    email: emailNormalized,
    status: "PENDING",
    clinicCode: validatedClinicCode, // Keep parity with /api/register
    createdAt: now(),
    updatedAt: now(),
  };
  if (Array.isArray(regs)) {
    regs.push(row);
    writeJson(REG_FILE, regs);
  } else {
    regs[requestId] = row;
    writeJson(REG_FILE, regs);
  }

  // Handle referral code if provided (Supabase-first; file fallback only when enabled)
  if (referralCode && String(referralCode).trim()) {
    try {
      const refCodeRaw = String(referralCode).trim();
      const refCode = refCodeRaw;

      // ================== SUPABASE PATH (source of truth) ==================
      if (isSupabaseEnabled() && supabaseClinicId) {
        const variants = Array.from(
          new Set([refCode, refCode.toUpperCase(), refCode.toLowerCase()].filter(Boolean))
        );

        let inviter = null;
        let lastInviterErr = null;
        for (const v of variants) {
          // 1) referral_code match (if column exists)
          try {
            const q1 = await supabase
              .from("patients")
              .select("id, patient_id, clinic_id, name, referral_code")
              .eq("referral_code", v)
              .limit(1)
              .maybeSingle();
            if (!q1.error && q1.data) {
              inviter = q1.data;
              break;
            }
            if (q1.error && !isMissingColumnError(q1.error, "referral_code") && String(q1.error.code || "") !== "PGRST116") {
              lastInviterErr = q1.error;
            }
          } catch {}

          // 2) patient_id match (if column exists)
          try {
            const q2 = await supabase
              .from("patients")
              .select("id, patient_id, clinic_id, name, referral_code")
              .eq("patient_id", v)
              .limit(1)
              .maybeSingle();
            if (!q2.error && q2.data) {
              inviter = q2.data;
              break;
            }
            if (q2.error && !isMissingColumnError(q2.error, "patient_id") && String(q2.error.code || "") !== "PGRST116") {
              lastInviterErr = q2.error;
            }
          } catch {}

          // 3) id match (covers schemas where patient id is stored in `id`)
          try {
            const q3 = await supabase
              .from("patients")
              .select("id, patient_id, clinic_id, name, referral_code")
              .eq("id", v)
              .limit(1)
              .maybeSingle();
            if (!q3.error && q3.data) {
              inviter = q3.data;
              break;
            }
            if (q3.error && String(q3.error.code || "") !== "PGRST116") {
              lastInviterErr = q3.error;
            }
          } catch {}
        }

        if (!inviter) {
          console.log("[PATIENT/REGISTER] Referral code not found in Supabase:", refCodeRaw);
          return res.status(400).json({
            ok: false,
            error: "invalid_referral_code",
            message: `Referral code "${refCodeRaw}" is invalid or not found. Please check the code and try again.`,
            supabase: lastInviterErr ? supabaseErrorPublic(lastInviterErr) : null,
          });
        }

        // Prevent cross-clinic referrals (must match clinic being registered)
        const inviterClinicId = inviter.clinic_id || null;
        if (inviterClinicId && String(inviterClinicId) !== String(supabaseClinicId)) {
          return res.status(400).json({
            ok: false,
            error: "invalid_referral_code",
            message: `Referral code "${refCodeRaw}" is invalid or not found. Please check the code and try again.`,
          });
        }

        const uuidLike = (s) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));

        let inviterCandidates = Array.from(
          new Set([inviter.id, inviter.patient_id].filter(Boolean))
        );

        let invitedCandidates = Array.from(
          new Set([supabasePatientRow?.id, supabasePatientRow?.patient_id, patientId].filter(Boolean))
        );

        // Some production schemas store referrals.*_patient_id as UUID.
        // Ensure we try UUID ids first by resolving from patient_id (p_xxx) when needed.
        const resolvedInviterUuids = (await Promise.all(inviterCandidates.map(resolvePatientUuidForReferral))).filter(Boolean);
        inviterCandidates = Array.from(new Set([...inviterCandidates, ...resolvedInviterUuids]));
        inviterCandidates = [
          ...inviterCandidates.filter((x) => uuidLike(x)),
          ...inviterCandidates.filter((x) => !uuidLike(x)),
        ];

        const resolvedInvitedUuids = (await Promise.all(invitedCandidates.map(resolvePatientUuidForReferral))).filter(Boolean);
        invitedCandidates = Array.from(new Set([...invitedCandidates, ...resolvedInvitedUuids]));
        invitedCandidates = [
          ...invitedCandidates.filter((x) => uuidLike(x)),
          ...invitedCandidates.filter((x) => !uuidLike(x)),
        ];

        // Self-referral guard (compare any representation)
        const inviterSet = new Set(inviterCandidates.map((x) => String(x)));
        const invitedSet = new Set(invitedCandidates.map((x) => String(x)));
        for (const x of inviterSet) {
          if (invitedSet.has(x)) {
            return res.status(400).json({
              ok: false,
              error: "invalid_referral_code",
              message: "Self-referral is not allowed.",
            });
          }
        }

        let created = null;
        let lastCreateErr = null;
        for (const invId of inviterCandidates) {
          for (const invitedId of invitedCandidates) {
            try {
              const referralData = {
                clinic_id: supabaseClinicId,
                inviter_patient_id: invId,
                invited_patient_id: invitedId,
                referral_code: generateReferralCodeV2(),
                status: "PENDING",
                inviter_discount_percent: null,
                invited_discount_percent: null,
                discount_percent: null,
              };
              created = await createReferralInDB(referralData);
              break;
            } catch (e) {
              lastCreateErr = e;
              if (String(e?.code || "") === "23505") {
                created = { id: null, duplicate: true };
                break;
              }
              if (isInvalidUuidError(e)) {
                continue;
              }
            }
          }
          if (created) break;
        }

        if (!created) {
          console.error("[PATIENT/REGISTER] ❌ Failed to create referral in Supabase", supabaseErrorPublic(lastCreateErr));
          return res.status(500).json({
            ok: false,
            error: "referral_create_failed",
            message: "Could not create referral. Please try again.",
            supabase: supabaseErrorPublic(lastCreateErr),
          });
        }
      } else {
        // ================== FILE FALLBACK ==================
        const allPatients = readJson(PAT_FILE, {});
        let inviterPatientId = null;
        let inviterPatientName = null;

        for (const pid in allPatients) {
          const p = allPatients[pid];
          const code = String(p?.referralCode || p?.referral_code || "").trim();
          if (code && code === refCode) {
            inviterPatientId = pid;
            inviterPatientName = p?.name || "Unknown";
            break;
          }
          if (pid === refCode) {
            inviterPatientId = pid;
            inviterPatientName = p?.name || "Unknown";
            break;
          }
        }

        if (inviterPatientId && inviterPatientId !== patientId && canUseFileFallback()) {
          const referrals = readJson(REF_FILE, []);
          const referralList = Array.isArray(referrals) ? referrals : Object.values(referrals);
          referralList.push({
            id: rid("ref"),
            inviterPatientId,
            inviterPatientName,
            invitedPatientId: patientId,
            invitedPatientName: String(name || ""),
            status: "PENDING",
            createdAt: now(),
            inviterDiscountPercent: null,
            invitedDiscountPercent: null,
            discountPercent: null,
            checkInAt: null,
            approvedAt: null,
            clinicCode: validatedClinicCode,
          });
          writeJson(REF_FILE, referralList);
        }
      }
    } catch (err) {
      console.error("[PATIENT/REGISTER] Referral creation error:", err);
    }
  }

  // Send OTP for email verification instead of returning token immediately
  try {
    // Clean up expired OTPs
    cleanupExpiredOTPs();
    
    // Generate OTP with standardization
    const otpCode = String(generateOTP()).trim();
    const otpHash = await bcrypt.hash(otpCode, 10);
    console.log(`[REGISTER /api/patient/register] Generated OTP for ${emailNormalized}: ${otpCode}`);
    console.log(`[REGISTER /api/patient/register] OTP hash generated: ${otpHash.substring(0, 10)}...`);
    
    // Store OTP in Supabase (not file-based)
    await storeOTPForEmail(emailNormalized, otpHash, null, {
      type: 'patient_registration',
      phone: phone || '',
      name: name || '',
      language: language || 'en'
    });
    console.log(`[REGISTER /api/patient/register] OTP stored in Supabase for: ${emailNormalized}`);
    
    // FIRE-AND-FORGET: Send email WITHOUT waiting (Brevo REST API)
    // This prevents API timeout from blocking the response
    console.log(`[REGISTER /api/patient/register] ========================================`);
    console.log(`[REGISTER /api/patient/register] EMAIL SEND DECISION POINT (Brevo REST API)`);
    console.log(`[REGISTER /api/patient/register] BREVO_API_KEY: ${process.env.BREVO_API_KEY ? 'SET' : 'NOT SET'}`);
    console.log(`[REGISTER /api/patient/register] SMTP_FROM: ${process.env.SMTP_FROM || 'NOT SET'}`);
    console.log(`[REGISTER /api/patient/register] ========================================`);
    
    console.log(`[REGISTER /api/patient/register] Calling sendOTPEmail (fire-and-forget)`);
    sendOTPEmail(emailNormalized, otpCode, patientLanguage)
      .then(() => {
        console.log(`[REGISTER /api/patient/register] ✅ OTP email sent successfully to ${emailNormalized}`);
      })
      .catch((emailError) => {
        console.error(`[REGISTER /api/patient/register] ❌ Failed to send OTP email to ${emailNormalized}:`, emailError.message);
        // Email failed but registration succeeded - user can request OTP again
      });
    
    // Return success IMMEDIATELY - don't wait for email
    console.log(`[REGISTER /api/patient/register] Returning success response for patient ${patientId}`);
    res.json({ 
      ok: true, 
      message: "Kayıt başarılı. Email adresinize gönderilen OTP kodunu girin.",
      patientId, 
      email: emailNormalized,
      language: patientLanguage,
      requestId, 
      status: "PENDING",
      requiresOTP: true,
    });
  } catch (otpError) {
    console.error("[REGISTER /api/patient/register] OTP generation error:", otpError);
    // Still return success, but user will need to request OTP manually
    res.json({ 
      ok: true, 
      message: "Kayıt başarılı. Lütfen OTP kodu talep edin.",
      patientId, 
      email: emailNormalized,
      requestId, 
      status: "PENDING",
      requiresOTP: true,
    });
  }
});

// ================== AUTH ==================
function requireToken(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // Also check x-patient-token header (for compatibility)
  const altToken = req.headers["x-patient-token"] || "";
  const finalToken = token || altToken;
  
  if (!finalToken) {
    console.log("[AUTH] Missing token");
    return res.status(401).json({ ok: false, error: "missing_token", message: "Token bulunamadı" });
  }

  const tokens = readJson(TOK_FILE, {});
  const t = tokens[finalToken];
  if (!t?.patientId) {
    // New mobile flow uses JWT patient tokens (from /auth/verify-otp)
    if (finalToken.startsWith("eyJ")) {
      try {
        const decoded = jwt.verify(finalToken, JWT_SECRET);
        const pid = decoded?.patientId;
        if (pid) {
          req.patientId = pid;
          req.role = (decoded?.role || decoded?.status || "PENDING").toUpperCase(); // 🔥 NORMALIZE ROLE TO UPPERCASE
          req.tokenType = "jwt_patient";
          return next();
        }
      } catch (e) {
        console.log("[AUTH] JWT verify failed:", e?.name, e?.message);
      }
    }

    console.log(`[AUTH] Bad token: ${finalToken.substring(0, 20)}... (not found in tokens.json and not valid JWT patient token)`);
    console.log(`[AUTH] Available legacy tokens: ${Object.keys(tokens).length}`);
    return res.status(401).json({
      ok: false,
      error: "bad_token",
      message: "Geçersiz token. Lütfen tekrar giriş yapın."
    });
  }

  req.patientId = t.patientId;
  req.role = (t.role || "PENDING").toUpperCase(); // 🔥 NORMALIZE ROLE TO UPPERCASE
  req.tokenType = "legacy_patient";
  next();
}

// ================== ME ==================
app.get("/api/me", requireToken, (req, res) => {
  const patients = readJson(PAT_FILE, {});
  const p = patients[req.patientId] || null;

  res.json({
    ok: true,
    patientId: req.patientId,
    role: req.role,
    status: p?.status || req.role,
    name: p?.name || "",
    phone: p?.phone || "",
  });
});

// ================== DOCTOR-ONLY OTP AUTHENTICATION ==================
async function resolveDoctorForOtp({ email, phone }) {
  const emailNormalized = email ? String(email).trim().toLowerCase() : "";
  const phoneTrimmed = phone ? String(phone).trim() : "";
  const phoneNormalized = phoneTrimmed ? normalizePhone(phoneTrimmed) : "";

  console.log(`[DOCTOR OTP] resolveDoctorForOtp input: email="${emailNormalized}", phone="${phoneTrimmed}"`);

  let foundDoctor = null;
  let foundDoctorId = null;
  let foundPhone = phoneNormalized || null;
  let foundLanguage = "en";
  let resolvedEmail = emailNormalized || "";

  const selectColumns = "id, doctor_id, email, phone, status, name, language, clinic_id"; // 🔥 DOCTOR TABLE FIELDS

  if (isSupabaseEnabled()) {
    try {
      // 🔥 FIX: Query DOCTORS table only
      if (emailNormalized) {
        const { data: row, error: pErr } = await supabase
          .from("doctors") // 🔥 DOCTORS TABLE
          .select(selectColumns)
          .eq("email", emailNormalized)
          .single();
        if (!pErr && row) {
          foundDoctor = row;
          console.log(`[DOCTOR OTP] Found doctor in DOCTORS table:`, row);
        } else if (pErr && String(pErr.code || "") !== "PGRST116") {
          console.error("[DOCTOR OTP] Supabase doctor lookup (email) failed:", {
            message: pErr.message,
            code: pErr.code,
            details: pErr.details,
          });
        }
      }

      if (!foundDoctor && phoneNormalized) {
        const { data: row, error: pErr } = await supabase
          .from("doctors") // 🔥 DOCTORS TABLE
          .select(selectColumns)
          .eq("phone", phoneNormalized)
          .single();
        if (!pErr && row) {
          foundDoctor = row;
          console.log(`[DOCTOR OTP] Found doctor by phone in DOCTORS table:`, row);
        } else if (pErr && String(pErr.code || "") !== "PGRST116") {
          console.error("[DOCTOR OTP] Supabase doctor lookup (phone) failed:", {
            message: pErr.message,
            code: pErr.code,
            details: pErr.details,
          });
        }
      }
    } catch (e) {
      console.error("[DOCTOR OTP] Supabase doctor lookup exception:", e?.message || e);
    }
  }

  // File-based fallback (if needed)
  if (!foundDoctor) {
    // Add file-based lookup logic here if needed
    console.log("[DOCTOR OTP] No doctor found in Supabase, checking file-based storage");
  }

  if (foundDoctor) {
    foundDoctorId = foundDoctor.doctor_id || foundDoctor.id; // 🔥 DOCTOR: use doctor_id
    foundPhone = foundDoctor.phone || phoneNormalized;
    foundLanguage = foundDoctor.language || "en";
    resolvedEmail = foundDoctor.email || emailNormalized;
  }

  return {
    patient: foundDoctor,
    patientId: foundDoctorId,
    email: resolvedEmail,
    phone: foundPhone,
    language: foundLanguage,
  };
}

async function resolvePatientForOtp({ email, phone }) {
  const emailNormalized = email ? String(email).trim().toLowerCase() : "";
  const phoneTrimmed = phone ? String(phone).trim() : "";
  const phoneNormalized = phoneTrimmed ? normalizePhone(phoneTrimmed) : "";

  console.log(`[OTP] resolvePatientForOtp input: email="${emailNormalized}", phone="${phoneTrimmed}"`);

  let foundPatient = null;
  let foundPatientId = null;
  let foundPhone = phoneNormalized || null;
  let foundLanguage = "en";
  let resolvedEmail = emailNormalized || "";

  const selectColumns = "id, patient_id, email, phone, status, name, language, role"; // 🔥 ADD ROLE COLUMN

  if (isSupabaseEnabled()) {
    try {
      // 🔥 FIX: Check both patients table and doctor applications
      if (emailNormalized) {
        // First check patients table
        const { data: row, error: pErr } = await supabase
          .from("patients")
          .select(selectColumns)
          .eq("email", emailNormalized)
          .single();
        if (!pErr && row) {
          foundPatient = row;
          console.log(`[OTP] Found patient with role: ${row.role}`);
        } else if (pErr && String(pErr.code || "") !== "PGRST116") {
          console.error("[OTP] Supabase patient lookup (email) failed:", {
            message: pErr.message,
            code: pErr.code,
            details: pErr.details,
          });
        }
      }

      if (!foundPatient && phoneNormalized) {
        // First check patients table
        const { data: row, error: pErr } = await supabase
          .from("patients")
          .select(selectColumns)
          .eq("phone", phoneNormalized)
          .single();
        if (!pErr && row) {
          foundPatient = row;
          console.log(`[OTP] Found patient by phone with role: ${row.role}`);
        } else if (pErr && String(pErr.code || "") !== "PGRST116") {
          console.error("[OTP] Supabase patient lookup (phone) failed:", {
            message: pErr.message,
            code: pErr.code,
            details: pErr.details,
          });
        }
      }
    } catch (e) {
      console.error("[OTP] Supabase patient lookup exception:", e?.message || e);
    }
  }

  if (!foundPatient) {
    const patients = readJson(PAT_FILE, {});
    for (const pid in patients) {
      const p = patients[pid];
      const em = String(p?.email || "").trim().toLowerCase();
      const ph = normalizePhone(String(p?.phone || ""));
      if ((emailNormalized && em === emailNormalized) || (phoneNormalized && ph === phoneNormalized)) {
        foundPatient = p;
        foundPatientId = pid;
        foundPhone = p?.phone || foundPhone;
        foundLanguage = normalizePatientLanguage(p?.language);
        resolvedEmail = em || resolvedEmail;
        break;
      }
    }
  }

  if (foundPatient) {
    foundPatientId = foundPatientId || foundPatient.patient_id || foundPatient.id;
    foundPhone = foundPatient.phone || foundPhone;
    foundLanguage = normalizePatientLanguage(foundPatient.language);
    resolvedEmail = String(foundPatient.email || resolvedEmail || "").trim().toLowerCase();
    console.log(`[OTP] Found patient with email: "${foundPatient.email}", resolvedEmail: "${resolvedEmail}"`);
  }

  const result = {
    patient: foundPatient,
    patientId: foundPatientId,
    email: resolvedEmail,
    phone: foundPhone,
    language: foundLanguage,
    phoneNormalized,
  };
  
  console.log(`[OTP] resolvePatientForOtp result:`, result);
  return result;
}

// POST /auth/request-otp
// Request OTP: takes email, finds patient, sends OTP to that email
app.post("/auth/request-otp", async (req, res) => {
  console.log("[OTP] ========================================");
  console.log("[OTP] /auth/request-otp endpoint HIT");
  console.log("[OTP] Request body:", JSON.stringify(req.body));
  console.log("[OTP] ========================================");
  
  try {
    const { email, phone } = req.body || {};
    
    if ((!email || !String(email).trim()) && (!phone || !String(phone).trim())) {
      console.log("[OTP] ERROR: email_or_phone_required");
      return res.status(400).json({ ok: false, error: "email_or_phone_required", message: "Email veya telefon gereklidir." });
    }

    const emailNormalized = email ? String(email).trim().toLowerCase() : "";
    const phoneNormalized = phone ? normalizePhone(String(phone)) : "";
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNormalized)) {
      return res.status(400).json({ ok: false, error: "invalid_email", message: "Geçersiz email formatı." });
    }
    
    // Check rate limit (email-based)
    if (!checkRateLimit(emailNormalized)) {
      return res.status(429).json({ 
        ok: false, 
        error: "rate_limit_exceeded", 
        message: "Çok fazla OTP isteği. Lütfen daha sonra tekrar deneyin." 
      });
    }

    const resolved = await resolvePatientForOtp({ email: emailNormalized, phone: phoneNormalized });
    const foundPatientId = resolved.patientId;
    const foundLanguage = resolved.language;
    const foundPhone = resolved.phone;
    const resolvedEmail = resolved.email;

    if (!foundPatientId) {
      return res.status(404).json({
        ok: false,
        error: "patient_not_found",
        message: "Bu email ile kayıtlı hasta bulunamadı. Lütfen email adresinizi kontrol edin veya kayıt olun.",
      });
    }

    if (!resolvedEmail) {
      return res.status(400).json({
        ok: false,
        error: "email_not_found",
        message: "Bu hastanın email adresi kayıtlı değil. Lütfen admin ile iletişime geçin.",
      });
    }
    
    // Check if email sending is configured (Brevo REST API or SMTP transporter)
    const hasBrevo = !!process.env.BREVO_API_KEY;
    const hasSmtpTransporter = !!emailTransporter;
    if (!hasBrevo && !hasSmtpTransporter) {
      console.error("[OTP] ❌ Email not configured - cannot send OTP!");
      console.error("[OTP]   BREVO_API_KEY:", hasBrevo ? "SET" : "NOT SET");
      console.error("[OTP]   SMTP transporter:", hasSmtpTransporter ? "SET" : "NOT SET");
      // Keep legacy error code for client compatibility
      return res.status(500).json({
        ok: false,
        error: "smtp_not_configured",
        message: "Email servisi yapılandırılmamış. Lütfen destek ile iletişime geçin.",
      });
    }
    console.log("[OTP] ✅ Email sending is configured, proceeding...", {
      brevo: hasBrevo,
      smtp: hasSmtpTransporter,
    });
    
    // Clean up expired OTPs
    cleanupExpiredOTPs();
    
    // Generate OTP
    const otpCode = generateOTP();
    console.log("[OTP] Generated OTP code:", otpCode, "for email:", resolvedEmail);
    
    // Save OTP under email key (file-based store)
    await saveOTP(resolvedEmail, otpCode, 0);
    
    // FIRE-AND-FORGET: Send email WITHOUT waiting (Brevo REST API)
    // This prevents API timeout from blocking the response
    console.log("[OTP] ========================================");
    console.log("[OTP] EMAIL SEND DECISION POINT (Brevo REST API)");
    console.log("[OTP] BREVO_API_KEY: " + (process.env.BREVO_API_KEY ? 'SET' : 'NOT SET'));
    console.log("[OTP] SMTP_FROM: " + (process.env.SMTP_FROM || 'NOT SET'));
    console.log("[OTP] Email:", resolvedEmail);
    console.log("[OTP] OTP Code:", otpCode);
    console.log("[OTP] ========================================");
    
    console.log("[OTP] Calling sendOTPEmail (fire-and-forget)");
    sendOTPEmail(resolvedEmail, otpCode, foundLanguage)
      .then(() => {
        console.log("[OTP] ✅ sendOTPEmail completed successfully!");
        console.log(`[OTP] OTP sent to ${resolvedEmail} (patient ${foundPatientId})`);
      })
      .catch((emailError) => {
        console.error("[OTP] ❌ Failed to send email:", emailError.message);
        // Email failed but OTP is saved - user can request again
      });
    
    // Return success IMMEDIATELY - don't wait for email
    console.log("[OTP] Returning success response immediately");
    res.json({
      ok: true,
      message: "OTP email adresinize gönderildi",
      // For UI convenience (not secret): return email + patientId
      email: resolvedEmail,
      patientId: String(foundPatientId || ""),
      language: foundLanguage,
      ...(foundPhone ? { phone: foundPhone } : {}),
    });
  } catch (error) {
    console.error("[OTP] Request OTP error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/admin/request-otp
// Request OTP for admin login: takes clinic code + email, sends OTP
app.post("/api/admin/request-otp", async (req, res) => {
  try {
    const { clinicCode, email } = req.body || {};
    
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required", message: "Klinik kodu gereklidir." });
    }
    
    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: "email_required", message: "Email adresi gereklidir." });
    }

    const code = String(clinicCode).trim().toUpperCase();
    const emailNormalized = String(email).trim().toLowerCase();
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNormalized)) {
      return res.status(400).json({ ok: false, error: "invalid_email", message: "Geçersiz email formatı." });
    }
    
    // Check rate limit
    if (!checkRateLimit(emailNormalized)) {
      return res.status(429).json({ 
        ok: false, 
        error: "rate_limit_exceeded", 
        message: "Çok fazla istek. Lütfen bir süre sonra tekrar deneyin." 
      });
    }

    // Find clinic
    let clinic = null;
    if (isSupabaseEnabled()) {
      clinic = await getClinicByCode(code);
    } else {
      // Fallback to file-based
      const clinics = readJson(CLINICS_FILE, {});
      clinic = Object.values(clinics).find(c => 
        String(c.clinicCode || "").toUpperCase() === code
      );
    }

    if (!clinic) {
      return res.status(404).json({ ok: false, error: "clinic_not_found", message: "Klinik bulunamadı." });
    }

    // Review Mode Bypass: Skip OTP generation and email for test@clinifly.net
    if (REVIEW_MODE && emailNormalized === "test@clinifly.net") {
      console.log(`[ADMIN OTP] 🚫 REVIEW MODE: Skipping OTP generation for test@clinifly.net`);
      console.log(`[ADMIN OTP] 📝 Static OTP 123456 will work for this account`);
      
      return res.json({
        ok: true,
        message: "OTP kodu hazırlandı (Review Mode). OTP 123456 kullanabilirsiniz.",
        clinicCode: code,
        email: emailNormalized,
        reviewMode: true,
        staticOTP: "123456"
      });
    }

    // Generate and save OTP
    const otpCode = generateOTP();
    await saveOTP(emailNormalized, otpCode);
    
    // Send OTP email
    try {
      await sendOTPEmail(emailNormalized, otpCode, clinic.language || "en");
      console.log(`[ADMIN OTP] OTP sent to ${emailNormalized} for clinic ${code}`);
    } catch (emailError) {
      console.error("[ADMIN OTP] Failed to send email:", emailError);
      return res.status(500).json({ 
        ok: false, 
        error: "email_send_failed", 
        message: "OTP gönderilemedi. Lütfen daha sonra tekrar deneyin." 
      });
    }

    res.json({
      ok: true,
      message: "OTP kodu email adresinize gönderildi.",
      clinicCode: code,
      email: emailNormalized
    });

  } catch (error) {
    console.error("[ADMIN OTP] Request error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: "Sunucu hatası." });
  }
});

// POST /api/admin/verify-otp
// Verify OTP for admin login: takes clinic code + email + OTP, generates JWT token
app.post("/api/admin/verify-otp", async (req, res) => {
  try {
    const { clinicCode, email, otp } = req.body || {};

    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required", message: "Klinik kodu gereklidir." });
    }
    
    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: "email_required", message: "Email adresi gereklidir." });
    }
    
    if (!otp || !String(otp).trim()) {
      return res.status(400).json({ ok: false, error: "otp_required", message: "OTP kodu gereklidir." });
    }

    const code = String(clinicCode).trim().toUpperCase();
    const emailNormalized = String(email).trim().toLowerCase();
    const otpCode = String(otp).trim();

    // Find clinic
    let clinic = null;
    if (isSupabaseEnabled()) {
      clinic = await getClinicByCode(code);
    } else {
      // Fallback to file-based
      const clinics = readJson(CLINICS_FILE, {});
      clinic = Object.values(clinics).find(c => 
        String(c.clinicCode || "").toUpperCase() === code
      );
    }

    if (!clinic) {
      return res.status(404).json({ ok: false, error: "clinic_not_found", message: "Klinik bulunamadı." });
    }

    // Review Mode Bypass: Accept static OTP for test@clinifly.net
    if (REVIEW_MODE && emailNormalized === "test@clinifly.net" && otp === "123456") {
      console.log(`[ADMIN OTP] 🚫 REVIEW MODE: Static OTP bypass for test@clinifly.net`);
      
      // Generate JWT token
      const token = jwt.sign(
        { 
          clinicCode: clinic.clinic_code,
          email: emailNormalized,
          role: "admin",
          otpVerified: true,
          reviewMode: true
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      console.log(`[ADMIN OTP] ✅ REVIEW MODE: Login successful for ${clinic.clinic_code}`);

      return res.json({
        ok: true,
        token,
        clinicCode: clinic.clinic_code,
        email: emailNormalized,
        message: "Giriş başarılı (Review Mode).",
        reviewMode: true
      });
    }

    // Verify OTP
    const otpData = await getOTPsForEmail(emailNormalized);
    if (!otpData) {
      return res.status(400).json({ ok: false, error: "otp_not_found", message: "OTP bulunamadı veya süresi dolmuş." });
    }

    if (otpData.verified || otpData.expiresAt < now()) {
      return res.status(400).json({ ok: false, error: "otp_expired", message: "OTP süresi dolmuş." });
    }

    if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(400).json({ ok: false, error: "otp_max_attempts", message: "Maksimum deneme sayısına ulaşıldı." });
    }

    const isValidOTP = await verifyOTP(otpCode, otpData.otp_hash || otpData.hashedOTP);
    if (!isValidOTP) {
      await incrementOTPAttempt(emailNormalized);
      const remainingAttempts = OTP_MAX_ATTEMPTS - (otpData.attempts + 1);
      return res.status(400).json({ 
        ok: false, 
        error: "invalid_otp", 
        message: `Geçersiz OTP kodu. Kalan deneme: ${remainingAttempts}` 
      });
    }

    // Mark OTP as verified
    await markOTPVerified(emailNormalized);

    // Generate JWT token
    const token = jwt.sign(
      { 
        clinicCode: clinic.clinic_code,
        email: emailNormalized,
        role: "admin",
        otpVerified: true
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    console.log(`[ADMIN OTP] ✅ OTP verification successful for ${clinic.clinic_code}`);

    res.json({
      ok: true,
      token,
      clinicCode: clinic.clinic_code,
      email: emailNormalized,
      message: "Giriş başarılı."
    });

  } catch (error) {
    console.error("[ADMIN OTP] Verify error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: "Sunucu hatası." });
  }
});

// POST /api/doctor/verify-otp
// Doctor-specific OTP verification endpoint
app.post("/api/doctor/verify-otp", async (req, res) => {
  try {
    const { email, phone, otp, sessionId } = req.body || {};

    // Strict parameter validation
    if (!otp || typeof otp !== 'string' || !otp.trim()) {
      return res.status(400).json({ ok: false, error: "otp_required", message: "OTP kodu gereklidir." });
    }

    if ((!email || !String(email).trim()) && (!phone || !String(phone).trim())) {
      return res.status(400).json({ ok: false, error: "email_or_phone_required", message: "Email veya telefon gereklidir." });
    }

    const emailNormalized = email ? String(email).trim().toLowerCase() : "";
    const otpCode = String(otp).trim();

    // Validate OTP format (should be 6 digits)
    if (otpCode.length !== 6 || !/^\d{6}$/.test(otpCode)) {
      return res.status(400).json({ ok: false, error: "invalid_otp_format", message: "OTP kodu 6 haneli olmalıdır." });
    }

    console.log(`[DOCTOR OTP] Verify OTP request: email=${emailNormalized}, phone=${phone}`);
    
    // 🔥 FIX: Resolve doctor from patients table with role="DOCTOR"
    const resolved = await resolveDoctorForOtp({ email: emailNormalized, phone });
    console.log(`[DOCTOR OTP] Resolved doctor data:`, resolved);
    const resolvedEmail = resolved.email || emailNormalized;
    console.log(`[DOCTOR OTP] Using resolved email: "${resolvedEmail}"`);
    
    if (!resolvedEmail) {
      return res.status(400).json({
        ok: false,
        error: "email_not_found",
        message: "Bu doktorun email adresi kayıtlı değil. Lütfen admin ile iletişime geçin.",
      });
    }

    // Get OTP data for this email
    const otpData = await getOTPsForEmail(resolvedEmail);
    console.log(`[DOCTOR OTP] Looking for OTP by email: ${resolvedEmail}, OTP found: ${!!otpData}`);
    
    if (!otpData) {
      return res.status(404).json({ 
        ok: false, 
        error: "otp_not_found", 
        message: "OTP kodu bulunamadı veya süresi dolmuş. Lütfen önce OTP isteyin." 
      });
    }
    
    // Check if already verified
    if (otpData.verified) {
      return res.status(400).json({ 
        ok: false, 
        error: "otp_already_used", 
        message: "Bu OTP zaten kullanılmış. Lütfen yeni bir OTP isteyin." 
      });
    }
    
    // Check if expired
    const expiresAt = otpData.expires_at || otpData.created_at || (now() + OTP_EXPIRY_MS);
    if (expiresAt < now()) {
      return res.status(400).json({ 
        ok: false, 
        error: "otp_expired", 
        message: "OTP süresi dolmuş. Lütfen yeni bir OTP isteyin." 
      });
    }
    
    // Check attempts
    if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(400).json({ 
        ok: false, 
        error: "otp_max_attempts", 
        message: "Maksimum doğrulama denemesi aşıldı. Lütfen yeni bir OTP isteyin." 
      });
    }
    
    // Verify OTP
    let isValid = false;
    try {
      const hashToUse = otpData.otp_hash;
      if (!hashToUse) {
        return res.status(500).json({ 
          ok: false, 
          error: "hash_missing", 
          message: "OTP hash bulunamadı. Lütfen yeni bir OTP isteyin." 
        });
      }
      
      isValid = await verifyOTP(String(otpCode).trim(), hashToUse);
      console.log(`[DOCTOR OTP] Verification result: ${isValid}`);
    } catch (verifyError) {
      console.error("[DOCTOR OTP] Verification error:", verifyError);
      return res.status(500).json({ 
        ok: false, 
        error: "verification_failed", 
        message: "OTP doğrulanamadı. Lütfen tekrar deneyin." 
      });
    }
    
    if (!isValid) {
      incrementOTPAttempt(emailNormalized);
      return res.status(401).json({ 
        ok: false, 
        error: "invalid_otp", 
        message: "Geçersiz OTP kodu. Lütfen tekrar deneyin." 
      });
    }
    
    // OTP is valid - resolve doctor by email
    const foundDoctor = resolved.patient;
    const foundDoctorId = resolved.patientId;
    const foundLanguage = resolved.language;
    
    if (!foundDoctorId) {
      return res.status(404).json({
        ok: false,
        error: "doctor_not_found",
        message: "Bu email ile kayıtlı doktor bulunamadı.",
      });
    }
    
    // Mark OTP as verified
    markOTPVerified(emailNormalized);

    const foundPhone = String(foundDoctor?.phone || "").trim();
    
    // 🔥 FIX: Generate DOCTOR JWT token
    const tokenExpiry = Math.floor(Date.now() / 1000) + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60);
    const token = jwt.sign(
      { 
        patientId: foundDoctorId,
        email: emailNormalized || "",
        language: foundLanguage,
        ...(foundPhone ? { phone: foundPhone } : {}),
        role: "DOCTOR", // 🔥 FIX: Hardcode DOCTOR role
        type: "doctor", // 🔥 FIX: Set type to doctor
      },
      JWT_SECRET,
      { expiresIn: `${TOKEN_EXPIRY_DAYS}d` }
    );
    
    // Save token in legacy tokens.json
    const tokens = readJson(TOK_FILE, {});
    tokens[token] = {
      patientId: foundDoctorId,
      role: "DOCTOR", // 🔥 FIX: Use DOCTOR role
      createdAt: now(),
      email: emailNormalized || "",
      language: foundLanguage,
      ...(foundPhone ? { phone: foundPhone } : {}),
    };
    writeJson(TOK_FILE, tokens);
    
    console.log(`[DOCTOR OTP] OTP verified successfully for email ${emailNormalized} (doctor ${foundDoctorId}), DOCTOR token generated`);
    
    res.json({
      ok: true,
      token,
      patientId: foundDoctorId,
      role: "DOCTOR", // 🔥 FIX: Include DOCTOR role in response
      status: foundDoctor.status || "PENDING",
      name: foundDoctor.name || "",
      ...(foundPhone ? { phone: foundPhone } : {}),
      email: emailNormalized || "",
      language: foundLanguage,
      expiresIn: TOKEN_EXPIRY_DAYS * 24 * 60 * 60, // seconds
    });
  } catch (error) {
    console.error("[DOCTOR OTP] Verify OTP error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/register/doctor
// Real doctor registration endpoint - INSERTS INTO DOCTORS TABLE
app.post("/api/register/doctor", async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      clinicCode, 
      licenseNumber, 
      department, 
      specialties, 
      title, 
      experienceYears,
      languages 
    } = req.body || {};

    console.log(`[DOCTOR REGISTER] Request received:`, { 
      name: name ? "***" : "", 
      email: email ? "***" : "",
      phone: phone ? "***" : "",
      clinicCode,
      licenseNumber: licenseNumber ? "***" : "",
      department,
      specialties,
      title,
      experienceYears,
      languages
    });

    // Validation
    if (!name || !email || !phone || !clinicCode || !licenseNumber) {
      return res.status(400).json({ 
        ok: false, 
        error: "missing_required_fields",
        message: "Name, email, phone, clinic code, and license number are required" 
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        ok: false, 
        error: "invalid_email", 
        message: "Geçerli bir e-posta adresi girin" 
      });
    }

    // Phone validation
    const phoneNormalized = normalizePhone(phone);
    if (phoneNormalized.length < 10) {
      return res.status(400).json({ 
        ok: false, 
        error: "invalid_phone", 
        message: "Telefon numarası en az 10 haneli olmalıdır" 
      });
    }

    const emailNormalized = String(email).trim().toLowerCase();

    // Validate clinic code
    const code = String(clinicCode).trim().toUpperCase();
    let foundClinic = null;
    let supabaseClinicId = null;

    if (isSupabaseEnabled()) {
      try {
        const clinic = await getClinicByCode(code);
        if (clinic) {
          foundClinic = clinic;
          supabaseClinicId = clinic.id;
          console.log(`[DOCTOR REGISTER] Found clinic UUID: ${supabaseClinicId} for code: ${code}`);
        } else {
          console.warn(`[DOCTOR REGISTER] Clinic not found in Supabase for code: ${code}`);
        }
      } catch (err) {
        console.error(`[DOCTOR REGISTER] Error finding clinic in Supabase:`, err.message);
      }
    }

    if (!foundClinic) {
      return res.status(400).json({ 
        ok: false, 
        error: "clinic_not_found", 
        message: "Klinik kodu bulunamadı. Lütfen geçerli bir klinik kodu girin." 
      });
    }

    if (isSupabaseEnabled() && !supabaseClinicId) {
      console.error("[DOCTOR REGISTER] Missing clinic_id for Supabase insert. clinicCode:", code);
      return res.status(400).json({ ok: false, error: "clinic_not_found", message: "Klinik kodu bulunamadı. Lütfen geçerli bir klinik kodu girin." });
    }

    // 🔥 FIX: Check if doctor already exists in DOCTORS table
    let existingDoctorId = null;
    if (isSupabaseEnabled()) {
      try {
        const { data: existing, error: e } = await supabase
          .from("doctors")
          .select("id, doctor_id, email")
          .eq("email", emailNormalized)
          .limit(1)
          .maybeSingle();
        
        if (!e && existing) {
          existingDoctorId = existing.doctor_id || existing.id;
          console.log("[DOCTOR REGISTER] Doctor already exists in doctors table:", existingDoctorId);
        }
      } catch (err) {
        console.error("[DOCTOR REGISTER] Error checking existing doctor:", err?.message || err);
      }
    }

    if (existingDoctorId) {
      return res.status(409).json({ 
        ok: false, 
        error: "doctor_already_exists", 
        message: "Bu e-posta ile kayıtlı bir doktor zaten mevcut." 
      });
    }

    // Generate doctor ID
    const doctorId = 'd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // 🔥 FIX: Insert doctor into DOCTORS table (not patients)
    if (isSupabaseEnabled()) {
      try {
        const doctorPayload = {
          doctor_id: doctorId,
          email: emailNormalized,
          name: String(name || ""),
          clinic_id: supabaseClinicId,
          clinic_code: code,
          status: "PENDING",
          language: "tr",
          phone: phoneNormalized,
          license_number: licenseNumber,
          department: department || null,
          specialties: specialties || [],
          title: title || null,
          experience_years: experienceYears || null,
          languages: languages || [],
        };

        console.log("[DOCTOR REGISTER] Inserting doctor into DOCTORS table:", {
          doctor_id: doctorPayload.doctor_id,
          email: doctorPayload.email,
          clinic_code: doctorPayload.clinic_code,
          status: doctorPayload.status,
        });

        const { data, error } = await supabase
          .from("doctors")
          .insert(doctorPayload)
          .select()
          .single();

        if (error) {
          console.error("[DOCTOR REGISTER] Supabase insert failed:", error);
          return res.status(500).json({ 
            ok: false, 
            error: "registration_failed", 
            message: "Doktor kaydı başarısız oldu." 
          });
        }

        console.log("[DOCTOR REGISTER] Doctor registered successfully in DOCTORS table:", data);
        
        res.json({
          ok: true,
          message: "Doktor kaydı başarıyla oluşturuldu. Admin onayı bekleniyor.",
          doctorId: doctorId,
          email: emailNormalized,
          status: "PENDING",
          clinicCode: code,
        });

      } catch (error) {
        console.error("[DOCTOR REGISTER] Registration error:", error);
        return res.status(500).json({ 
          ok: false, 
          error: "registration_failed", 
          message: "Doktor kaydı başarısız oldu." 
        });
      }
    } else {
      return res.status(500).json({ 
        ok: false, 
        error: "supabase_disabled", 
        message: "Kayıt sistemi şu anda kullanılamıyor." 
      });
    }

  } catch (error) {
    console.error("[DOCTOR REGISTER] Unexpected error:", error);
    res.status(500).json({ 
      ok: false, 
      error: "internal_error", 
      message: "Sunucu hatası." 
    });
  }
});

// POST /auth/verify-otp-doctor
// Doctor-specific OTP verification endpoint - SEPARATE FROM PATIENT FLOW
app.post("/auth/verify-otp-doctor", async (req, res) => {
  try {
    const { email, phone, otp, sessionId } = req.body || {};

    // Strict parameter validation
    if (!otp || typeof otp !== 'string' || !otp.trim()) {
      return res.status(400).json({ ok: false, error: "otp_required", message: "OTP kodu gereklidir." });
    }

    if ((!email || !String(email).trim()) && (!phone || !String(phone).trim())) {
      return res.status(400).json({ ok: false, error: "email_or_phone_required", message: "Email veya telefon gereklidir." });
    }

    const emailNormalized = email ? String(email).trim().toLowerCase() : "";
    const otpCode = String(otp).trim();

    // Validate OTP format (should be 6 digits)
    if (otpCode.length !== 6 || !/^\d{6}$/.test(otpCode)) {
      return res.status(400).json({ ok: false, error: "invalid_otp_format", message: "OTP kodu 6 haneli olmalıdır." });
    }

    console.log(`[DOCTOR OTP] Verify OTP request: email=${emailNormalized}, phone=${phone}`);
    
    // 🔥 FIX: Resolve doctor from DOCTORS table only
    const resolved = await resolveDoctorForOtp({ email: emailNormalized, phone });
    console.log(`[DOCTOR OTP] Resolved doctor data:`, resolved);
    const resolvedEmail = resolved.email || emailNormalized;
    console.log(`[DOCTOR OTP] Using resolved email: "${resolvedEmail}"`);
    
    if (!resolvedEmail || !resolved.patientId) {
      return res.status(404).json({
        ok: false,
        error: "doctor_not_found",
        message: "Bu email veya telefon ile kayıtlı doktor bulunamadı.",
      });
    }

    // Get OTP data for this email
    const otpData = await getOTPsForEmail(resolvedEmail);
    console.log(`[DOCTOR OTP] Looking for OTP by email: ${resolvedEmail}, OTP found: ${!!otpData}`);
    
    if (!otpData) {
      return res.status(404).json({ 
        ok: false, 
        error: "otp_not_found", 
        message: "OTP kodu bulunamadı veya süresi dolmuş. Lütfen önce OTP isteyin." 
      });
    }
    
    // Check if already verified
    if (otpData.verified) {
      return res.status(400).json({ 
        ok: false, 
        error: "otp_already_used", 
        message: "Bu OTP zaten kullanılmış. Lütfen yeni bir OTP isteyin." 
      });
    }
    
    // Check if expired
    const expiresAt = otpData.expires_at || otpData.created_at || (now() + OTP_EXPIRY_MS);
    if (expiresAt < now()) {
      return res.status(400).json({ 
        ok: false, 
        error: "otp_expired", 
        message: "OTP süresi dolmuş. Lütfen yeni bir OTP isteyin." 
      });
    }
    
    // Check attempts
    if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(400).json({ 
        ok: false, 
        error: "otp_max_attempts", 
        message: "Maksimum doğrulama denemesi aşıldı. Lütfen yeni bir OTP isteyin." 
      });
    }
    
    // Verify OTP
    let isValid = false;
    try {
      const hashToUse = otpData.otp_hash;
      if (!hashToUse) {
        return res.status(500).json({ 
          ok: false, 
          error: "hash_missing", 
          message: "OTP hash bulunamadı. Lütfen yeni bir OTP isteyin." 
        });
      }
      
      isValid = await verifyOTP(String(otpCode).trim(), hashToUse);
      console.log(`[DOCTOR OTP] Verification result: ${isValid}`);
    } catch (verifyError) {
      console.error("[DOCTOR OTP] Verification error:", verifyError);
      return res.status(500).json({ 
        ok: false, 
        error: "verification_failed", 
        message: "OTP doğrulanamadı. Lütfen tekrar deneyin." 
      });
    }
    
    if (!isValid) {
      incrementOTPAttempt(emailNormalized);
      return res.status(401).json({ 
        ok: false, 
        error: "invalid_otp", 
        message: "Geçersiz OTP kodu. Lütfen tekrar deneyin." 
      });
    }
    
    // OTP is valid - get doctor data
    const foundDoctor = resolved.patient;
    const foundDoctorId = resolved.patientId;
    const foundLanguage = resolved.language;
    
    if (!foundDoctorId) {
      return res.status(404).json({
        ok: false,
        error: "doctor_not_found",
        message: "Bu email ile kayıtlı doktor bulunamadı.",
      });
    }
    
    // Mark OTP as verified
    markOTPVerified(emailNormalized);

    const foundPhone = String(foundDoctor?.phone || "").trim();
    
    // 🔥 FIX: Generate DOCTOR JWT token with REQUIRED payload
    const tokenExpiry = Math.floor(Date.now() / 1000) + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60);
    const token = jwt.sign(
      { 
        doctorId: foundDoctorId, // 🔥 REQUIRED: doctorId (not patientId)
        clinicId: foundDoctor.clinic_id, // 🔥 REQUIRED: clinicId
        role: "DOCTOR", // 🔥 REQUIRED: role: "DOCTOR"
        status: foundDoctor.status || "PENDING", // 🔥 REQUIRED: status
        type: "doctor", // 🔥 REQUIRED: type: "doctor"
        email: emailNormalized || "",
        language: foundLanguage,
        ...(foundPhone ? { phone: foundPhone } : {}),
      },
      JWT_SECRET,
      { expiresIn: `${TOKEN_EXPIRY_DAYS}d` }
    );
    
    // Save token in legacy tokens.json
    const tokens = readJson(TOK_FILE, {});
    tokens[token] = {
      doctorId: foundDoctorId, // 🔥 Use doctorId
      role: "DOCTOR",
      status: foundDoctor.status || "PENDING",
      createdAt: now(),
      email: emailNormalized || "",
      language: foundLanguage,
      ...(foundPhone ? { phone: foundPhone } : {}),
    };
    writeJson(TOK_FILE, tokens);
    
    console.log(`[DOCTOR OTP] OTP verified successfully for email ${emailNormalized} (doctor ${foundDoctorId}), DOCTOR token generated`);
    
    res.json({
      ok: true,
      token,
      doctorId: foundDoctorId, // 🔥 Return doctorId (not patientId)
      role: "DOCTOR", // 🔥 REQUIRED: role: "DOCTOR"
      status: foundDoctor.status || "PENDING",
      name: foundDoctor.name || "",
      ...(foundPhone ? { phone: foundPhone } : {}),
      email: emailNormalized || "",
      language: foundLanguage,
      expiresIn: TOKEN_EXPIRY_DAYS * 24 * 60 * 60, // seconds
    });
  } catch (error) {
    console.error("[DOCTOR OTP] Verify OTP error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /auth/verify-otp
// OTP verification endpoint - FIXED VERSION v2.0
app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { email, phone, otp, sessionId } = req.body || {};

    // Strict parameter validation
    if (!otp || typeof otp !== 'string' || !otp.trim()) {
      return res.status(400).json({ ok: false, error: "otp_required", message: "OTP kodu gereklidir." });
    }

    if ((!email || !String(email).trim()) && (!phone || !String(phone).trim())) {
      return res.status(400).json({ ok: false, error: "email_or_phone_required", message: "Email veya telefon gereklidir." });
    }

    // Additional validation to prevent undefined parameters
    if (otp === undefined || (email === undefined && phone === undefined)) {
      return res.status(400).json({ 
        ok: false, 
        error: "missing_parameters", 
        message: "Missing required parameters for OTP verification" 
      });
    }

    const emailNormalized = email ? String(email).trim().toLowerCase() : "";
    const otpCode = String(otp).trim();

    // Validate OTP format (should be 6 digits)
    if (otpCode.length !== 6 || !/^\d{6}$/.test(otpCode)) {
      return res.status(400).json({ ok: false, error: "invalid_otp_format", message: "OTP kodu 6 haneli olmalıdır." });
    }

    console.log(`[OTP] Verify OTP request: email=${emailNormalized}, phone=${phone}`);
    
    // 🔥 FIX: /auth/verify-otp is PATIENTS ONLY - no doctor checking
    const resolved = await resolvePatientForOtp({ email: emailNormalized, phone });
    console.log(`[OTP] Resolved patient data:`, resolved);
    const resolvedEmail = resolved.email || emailNormalized;
    console.log(`[OTP] Using resolved email: "${resolvedEmail}"`);
    
    if (!resolvedEmail || !resolved.patientId) {
      return res.status(404).json({
        ok: false,
        error: "patient_not_found",
        message: "Bu email veya telefon ile kayıtlı hasta bulunamadı.",
      });
    }

    console.log(`[OTP] Verify OTP request: email=${resolvedEmail}, otp=${otpCode}`);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    console.log(`[OTP] Email validation check: "${resolvedEmail}"`);
    console.log(`[OTP] Regex test result: ${emailRegex.test(resolvedEmail)}`);
    
    if (!emailRegex.test(resolvedEmail)) {
      console.log(`[OTP] Email validation failed for: "${resolvedEmail}"`);
      return res.status(400).json({ ok: false, error: "invalid_email", message: "Geçersiz email formatı." });
    }

    // Get OTP data for this email
    const otpData = await getOTPsForEmail(resolvedEmail);
    console.log(`[OTP] Looking for OTP by email: ${resolvedEmail}, OTP found: ${!!otpData}`);
    
    if (otpData) {
      console.log(`[OTP] OTP data structure:`, {
        hasHashedOTP: !!otpData.otp_hash,  // Fixed: use otp_hash instead of hashedOTP
        hasOtpHash: !!otpData.otp_hash,
        attempts: otpData.attempts,
        expiresAt: otpData.expires_at,  // Fixed: use expires_at instead of expiresAt
        verified: otpData.verified
      });
    }
    
    if (!otpData) {
      console.log(`[OTP] OTP not found for email: ${resolvedEmail}`);
      return res.status(404).json({ 
        ok: false, 
        error: "otp_not_found", 
        message: "OTP kodu bulunamadı veya süresi dolmuş. Lütfen önce OTP isteyin." 
      });
    }
    
    // Check if already verified
    console.log(`[OTP] Checking if already verified: ${otpData.verified}`);
    if (otpData.verified) {
      console.log(`[OTP] OTP already used, returning error`);
      return res.status(400).json({ 
        ok: false, 
        error: "otp_already_used", 
        message: "Bu OTP zaten kullanılmış. Lütfen yeni bir OTP isteyin." 
      });
    }
    
    // Check if expired
    const expiresAt = otpData.expires_at || otpData.created_at || (now() + OTP_EXPIRY_MS);  // Fixed: use expires_at
    console.log(`[OTP] Checking expiration: expiresAt=${expiresAt}, now=${now()}`);
    if (expiresAt < now()) {
      console.log(`[OTP] OTP expired: expiresAt=${expiresAt}, now=${now()}`);
      return res.status(400).json({ 
        ok: false, 
        error: "otp_expired", 
        message: "OTP süresi dolmuş. Lütfen yeni bir OTP isteyin." 
      });
    }
    
    // Check attempts
    console.log(`[OTP] Checking attempts: ${otpData.attempts} >= ${OTP_MAX_ATTEMPTS}`);
    if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
      console.log(`[OTP] Max attempts reached`);
      return res.status(400).json({ 
        ok: false, 
        error: "otp_max_attempts", 
        message: "Maksimum doğrulama denemesi aşıldı. Lütfen yeni bir OTP isteyin." 
      });
    }
    
    console.log(`[OTP] All checks passed, proceeding to verification`);
    
    // Final validation before OTP verification
    console.log(`[OTP] Final validation check: otpData=${!!otpData}, hashedOTP=${!!otpData.otp_hash}, otp_hash=${!!otpData.otp_hash}`);
    
    if (!otpData || !otpData.otp_hash) {  // Fixed: only check otp_hash
      console.log(`[OTP] Final validation failed - no hash found`);
      return res.status(400).json({ 
        ok: false, 
        error: "otp_data_missing", 
        message: "OTP verisi bulunamadı. Lütfen yeni bir OTP isteyin." 
      });
    }
    
    console.log(`[OTP] Final validation passed`);

    // Verify OTP with additional safety checks
    let isValid = false;
    try {
      const hashToUse = otpData.otp_hash;  // Fixed: only use otp_hash
      console.log(`[OTP] Using hash field:`, hashToUse ? "found" : "missing");
      
      if (!hashToUse) {
        console.error(`[OTP] No hash found in OTP data`);
        return res.status(500).json({ 
          ok: false, 
          error: "hash_missing", 
          message: "OTP hash bulunamadı. Lütfen yeni bir OTP isteyin." 
        });
      }
      
      console.log(`[OTP] About to call verifyOTP with otp="${String(otpCode).trim()}" and hash="${hashToUse.substring(0, 10)}..."`);
      
      // Debug: Test hash generation with current OTP
      const testHash = await bcrypt.hash(String(otpCode).trim(), 10);
      console.log(`[OTP] Test hash generated: ${testHash.substring(0, 10)}...`);
      const testResult = await bcrypt.compare(String(otpCode).trim(), testHash);
      console.log(`[OTP] Test verification result: ${testResult}`);
      
      isValid = await verifyOTP(String(otpCode).trim(), hashToUse);  // Standardize: String + trim
      console.log(`[OTP] Verification result: ${isValid}`);
    } catch (verifyError) {
      console.error("[OTP] Verification error:", verifyError);
      console.error("[OTP] Verification error stack:", verifyError.stack);
      return res.status(500).json({ 
        ok: false, 
        error: "verification_failed", 
        message: "OTP doğrulanamadı. Lütfen tekrar deneyin." 
      });
    }
    
    if (!isValid) {
      // Increment attempt count (email-based)
      incrementOTPAttempt(emailNormalized);
      
      return res.status(401).json({ 
        ok: false, 
        error: "invalid_otp", 
        message: "Geçersiz OTP kodu. Lütfen tekrar deneyin." 
      });
    }
    
    // OTP is valid - use resolved user data
    const foundUser = resolved.patient;
    const foundUserId = resolved.patientId;
    const foundLanguage = resolved.language;
    if (!foundUserId) {
      return res.status(404).json({
        ok: false,
        error: "user_not_found",
        message: "Bu email ile kayıtlı kullanıcı bulunamadı.",
      });
    }
    
    // Mark OTP as verified (by email - OTP is stored by email)
    markOTPVerified(emailNormalized);

    const foundPhone = String(foundUser?.phone || "").trim();
    
    // 🔥 FIX: Generate PATIENT JWT token (PATIENTS ONLY)
    const tokenExpiry = Math.floor(Date.now() / 1000) + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60);
    const token = jwt.sign(
      { 
        patientId: foundUserId, // 🔥 PATIENT: patientId
        email: emailNormalized || "",
        language: foundLanguage,
        ...(foundPhone ? { phone: foundPhone } : {}),
        role: "PATIENT", // 🔥 PATIENT: role: "PATIENT"
        type: "patient", // 🔥 PATIENT: type: "patient"
      },
      JWT_SECRET,
      { expiresIn: `${TOKEN_EXPIRY_DAYS}d` }
    );
    
    // Also save token in legacy tokens.json for backward compatibility
    const tokens = readJson(TOK_FILE, {});
    tokens[token] = {
      patientId: foundUserId, // 🔥 PATIENT: patientId
      role: "PATIENT", // 🔥 PATIENT: role: "PATIENT"
      createdAt: now(),
      email: emailNormalized || "",
      language: foundLanguage,
      ...(foundPhone ? { phone: foundPhone } : {}),
    };
    writeJson(TOK_FILE, tokens);
    
    console.log(`[OTP] OTP verified successfully for email ${emailNormalized} (PATIENT ${foundUserId}), PATIENT token generated`);
    
    res.json({
      ok: true,
      token,
      patientId: foundUserId, // 🔥 PATIENT: patientId
      role: "PATIENT", // 🔥 PATIENT: role: "PATIENT"
      status: foundUser.status || "PENDING",
      name: foundUser.name || "",
      ...(foundPhone ? { phone: foundPhone } : {}),
      email: emailNormalized || "",
      language: foundLanguage,
      expiresIn: TOKEN_EXPIRY_DAYS * 24 * 60 * 60, // seconds
    });
  } catch (error) {
    console.error("[OTP] Verify OTP error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== PATIENT LOGIN ==================
// POST /api/patient/login
// Patient login with phone or patientId, returns token
app.post("/api/patient/login", (req, res) => {
  try {
    const { phone, patientId } = req.body || {};
    
    if (!phone && !patientId) {
      return res.status(400).json({ ok: false, error: "phone_or_patientId_required" });
    }
    
    const patients = readJson(PAT_FILE, {});
    const tokens = readJson(TOK_FILE, {});
    
    // Find patient by phone or patientId
    let foundPatient = null;
    let foundPatientId = null;
    
    if (patientId) {
      foundPatient = patients[patientId];
      if (foundPatient) {
        foundPatientId = patientId;
      }
    }
    
    if (!foundPatient && phone) {
      // Search by phone
      for (const pid in patients) {
        if (patients[pid].phone === String(phone).trim()) {
          foundPatient = patients[pid];
          foundPatientId = pid;
          break;
        }
      }
    }
    
    if (!foundPatient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }
    
    // Find existing token for this patient
    let existingToken = null;
    for (const token in tokens) {
      if (tokens[token]?.patientId === foundPatientId) {
        existingToken = token;
        break;
      }
    }
    
    // If no token exists, create a new one
    if (!existingToken) {
      existingToken = makeToken();
      tokens[existingToken] = {
        patientId: foundPatientId,
        role: foundPatient.status || "PENDING",
        createdAt: now()
      };
      writeJson(TOK_FILE, tokens);
    }
    
    res.json({
      ok: true,
      token: existingToken,
      patientId: foundPatientId,
      status: foundPatient.status || "PENDING",
      name: foundPatient.name || "",
      phone: foundPatient.phone || "",
    });
  } catch (error) {
    console.error("Patient login error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== PATIENT ME (alias) ==================
app.get("/api/patient/me", requireToken, async (req, res) => {
  try {
    // Supabase is the single source of truth in production
    if (isSupabaseEnabled()) {
      const { data: p, error: pErr } = await supabase
        .from("patients")
        .select("id,patient_id,name,phone,email,status,clinic_id,created_at,updated_at")
        .eq("patient_id", req.patientId)
        .single();

      if (pErr) {
        console.error("[ME] Supabase patient fetch failed", {
          message: pErr.message,
          code: pErr.code,
          details: pErr.details,
        });
        return res.status(500).json({ ok: false, error: "patient_fetch_failed" });
      }

      let clinicCode = "";
      let clinicPlan = "FREE";
      let branding = null;
      let clinicData = null;

      if (p?.clinic_id) {
        const { data: c, error: cErr } = await supabase
          .from("clinics")
          .select("id,clinic_code,plan,name,phone,address,settings")
          .eq("id", p.clinic_id)
          .single();

        if (cErr) {
          console.error("[ME] Supabase clinic fetch failed", {
            message: cErr.message,
            code: cErr.code,
            details: cErr.details,
          });
        } else if (c) {
          clinicData = c;
          if (typeof clinicData.settings === "string") {
            try {
              clinicData.settings = JSON.parse(clinicData.settings);
            } catch (e) {
              clinicData.settings = {};
            }
          }
          clinicCode = clinicData.clinic_code || "";
          clinicPlan = clinicData.plan || "FREE";
          const b = clinicData.settings?.branding || null;
          branding = b
            ? b
            : {
                clinicName: clinicData.name || "",
                clinicLogoUrl: "",
                address: clinicData.address || "",
                googleMapLink: "",
                primaryColor: undefined,
                secondaryColor: undefined,
                welcomeMessage: "",
                showPoweredBy: true,
                phone: clinicData.phone || "",
              };
        }
      }

      const finalStatus = p?.status || "PENDING";
      const referralLevels =
        clinicData?.settings?.referralLevels ||
        {
          level1: clinicData?.settings?.defaultInviterDiscountPercent ?? null,
          level2: null,
          level3: null,
        };
      return res.json({
        ok: true,
        patientId: req.patientId,
        role: finalStatus,
        status: finalStatus,
        name: p?.name || "",
        phone: p?.phone || "",
        email: p?.email || "",
        clinicCode,
        clinicPlan,
        branding,
        referralLevels,
        financialSnapshot: {
          totalEstimatedCost: 0,
          totalPaid: 0,
          remainingBalance: 0,
        },
      });
    }

    // Legacy fallback (file-based)
    const patients = readJson(PAT_FILE, {});
    const p = patients[req.patientId] || null;
    const finalStatus = p?.status || req.role || "PENDING";
    return res.json({
      ok: true,
      patientId: req.patientId,
      role: finalStatus,
      status: finalStatus,
      name: p?.name || "",
      phone: p?.phone || "",
      email: p?.email || "",
      clinicCode: p?.clinicCode || p?.clinic_code || "",
      clinicPlan: p?.clinicPlan || "FREE",
      branding: null,
      financialSnapshot: p?.financialSnapshot || {
        totalEstimatedCost: 0,
        totalPaid: 0,
        remainingBalance: 0,
      },
    });
  } catch (e) {
    console.error("[ME] /api/patient/me error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ================== ADMIN LIST ==================
app.get("/api/admin/registrations", (req, res) => {
  const raw = readJson(REG_FILE, {});
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ ok: true, list });
});

// Get monthly active patients metrics
app.get("/api/admin/metrics/monthly-active-patients", requireAdminAuth, async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const monthsCount = Math.min(Math.max(parseInt(months), 1), 24); // 1-24 months range
    
    console.log(`[METRICS] Getting monthly active patients for last ${monthsCount} months`);
    
    if (!isSupabaseEnabled()) {
      return res.status(500).json({ ok: false, error: "Database not available" });
    }
    
    if (!req.clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_not_authenticated" });
    }
    
    // Calculate date range (last N months)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsCount + 1);
    startDate.setDate(1); // Start of first month
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0); // End of last month
    
    console.log(`[METRICS] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Get all patients with their activity in the date range for this clinic
    const { data: patients, error } = await supabase
      .from('patients')
      .select('id, created_at, updated_at')
      .eq('clinic_id', req.clinicId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    if (error) {
      console.error('[METRICS] Error fetching patients:', error);
      return res.status(500).json({ ok: false, error: "Failed to fetch patients" });
    }
    
    // Group patients by month and count unique active patients
    const monthlyData = {};
    
    // Initialize months
    for (let i = 0; i < monthsCount; i++) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - i);
      const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[monthKey] = new Set();
    }
    
    // Count patients by creation month (simplified - treating creation as activity)
    patients.forEach(patient => {
      const createdDate = new Date(patient.created_at);
      const monthKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].add(patient.id);
      }
    });
    
    // Convert to array and sort by month
    const result = Object.entries(monthlyData)
      .map(([month, patientSet]) => ({
        month,
        monthLabel: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        activePatients: patientSet.size
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    // Calculate growth percentage
    const resultWithGrowth = result.map((item, index) => {
      if (index === 0) {
        return { ...item, growthPercent: null };
      }
      const previousValue = result[index - 1].activePatients;
      const growthPercent = previousValue > 0 
        ? Math.round(((item.activePatients - previousValue) / previousValue) * 100)
        : null;
      return { ...item, growthPercent };
    });
    
    console.log(`[METRICS] Monthly active patients result:`, resultWithGrowth);
    
    res.json({ 
      ok: true, 
      data: resultWithGrowth,
      period: `${monthsCount} months`,
      totalPatients: patients.length
    });
    
  } catch (error) {
    console.error('[METRICS] Error in monthly active patients:', error);
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// Get monthly procedures metrics
app.get("/api/admin/metrics/monthly-procedures", requireAdminAuth, async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const monthsCount = Math.min(Math.max(parseInt(months), 1), 24); // 1-24 months range
    
    console.log(`[METRICS] Getting monthly procedures for last ${monthsCount} months`);
    
    if (!isSupabaseEnabled()) {
      return res.status(500).json({ ok: false, error: "Database not available" });
    }
    
    if (!req.clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_not_authenticated" });
    }
    
    // Calculate date range (last N months)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsCount + 1);
    startDate.setDate(1); // Start of first month
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0); // End of last month
    
    console.log(`[METRICS] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Get all patients with treatments in the date range for this clinic
    const { data: patients, error } = await supabase
      .from('patients')
      .select('id, created_at, updated_at, treatments')
      .eq('clinic_id', req.clinicId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    if (error) {
      console.error('[METRICS] Error fetching patients:', error);
      return res.status(500).json({ ok: false, error: "Failed to fetch patients" });
    }
    
    // Group procedures by month and count them
    const monthlyData = {};
    
    // Initialize months
    for (let i = 0; i < monthsCount; i++) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - i);
      const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[monthKey] = 0;
    }
    
    // Count procedures by month from treatments data
    patients.forEach(patient => {
      const createdDate = new Date(patient.created_at);
      const monthKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (monthlyData[monthKey] !== undefined && patient.treatments) {
        try {
          const treatments = typeof patient.treatments === 'string' 
            ? JSON.parse(patient.treatments) 
            : patient.treatments;
          
          // Count procedures from treatments data
          if (treatments && treatments.teeth) {
            Object.values(treatments.teeth).forEach(tooth => {
              if (tooth.procedures && Array.isArray(tooth.procedures)) {
                monthlyData[monthKey] += tooth.procedures.length;
              }
            });
          }
        } catch (e) {
          console.warn('[METRICS] Error parsing treatments data:', e);
        }
      }
    });
    
    // Convert to array and sort by month
    const result = Object.entries(monthlyData)
      .map(([month, procedureCount]) => ({
        month,
        monthLabel: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        procedures: procedureCount
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    // Calculate growth percentage
    const resultWithGrowth = result.map((item, index) => {
      if (index === 0) {
        return { ...item, growthPercent: null };
      }
      const previousValue = result[index - 1].procedures;
      const growthPercent = previousValue > 0 
        ? Math.round(((item.procedures - previousValue) / previousValue) * 100)
        : null;
      return { ...item, growthPercent };
    });
    
    console.log(`[METRICS] Monthly procedures result:`, resultWithGrowth);
    
    res.json({ 
      ok: true, 
      data: resultWithGrowth,
      period: `${monthsCount} months`,
      totalProcedures: resultWithGrowth.reduce((sum, item) => sum + item.procedures, 0)
    });
    
  } catch (error) {
    console.error('[METRICS] Error in monthly procedures:', error);
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.get("/api/admin/patients", requireAdminAuth, async (req, res) => {
  try {
    // PRODUCTION: Supabase only, file-based disabled
    if (!isSupabaseEnabled()) {
      return res.status(500).json({ ok: false, error: "supabase_not_configured" });
    }
    if (!req.clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_not_authenticated" });
    }

    const patients = await getPatientsByClinic(req.clinicId);
    const normalized = (patients || []).map((p) => {
      const createdAt = p.created_at ? new Date(p.created_at).getTime() : (p.createdAt || 0);
      return {
        ...p,
        // Prefer legacy app id (p_xxx) if present
        patientId: p.patient_id || p.patientId || p.id,
        createdAt,
      };
    });

    normalized.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Add oral health scores to each patient (uses patientId)
    const patientsWithScores = normalized.map((patient) => {
      const patientId = patient.patientId || "";
      if (patientId) {
        const scores = calculateOralHealthScore(patientId);
        return {
          ...patient,
          beforeScore: scores.beforeScore,
          afterScore: scores.afterScore,
          oralHealthCompleted: scores.completed,
        };
      }
      return patient;
    });

    res.json({ ok: true, list: patientsWithScores, patients: patientsWithScores });
  } catch (error) {
    console.error("[ADMIN PATIENTS] Supabase error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== ADMIN APPROVE ==================
// Supabase is the single source of truth in production.
// IMPORTANT:
// - No file writes (PAT_FILE / REG_FILE / TOK_FILE) here.
// - Update happens in Supabase ONLY.
app.post("/api/admin/approve", requireAdminAuth, async (req, res) => {
  try {
    const { patientId } = req.body || {};
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    if (!isSupabaseEnabled()) {
      return res.status(500).json({ ok: false, error: "supabase_not_configured" });
    }

    if (!req.clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_not_authenticated" });
    }

    console.log("[SUPABASE] approving patient", { patientId, clinic_id: req.clinicId });

    const { error } = await supabase
      .from("patients")
      .update({
        status: "APPROVED",
        updated_at: new Date().toISOString(),
      })
      .eq("patient_id", patientId)
      .eq("clinic_id", req.clinicId);

    if (error) {
      console.error("[SUPABASE] approve failed:", error);
      return res.status(500).json({ ok: false, error: "approve_failed" });
    }

    console.log("[SUPABASE] patient approved:", patientId);
    return res.json({ ok: true, patientId, status: "APPROVED" });
  } catch (e) {
    console.error("[SUPABASE] approve exception:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ================== PATIENT TRAVEL ==================
async function requireAdminOrPatientToken(req, res, next) {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const altToken = req.headers["x-patient-token"] || "";
  const finalToken = bearer || altToken;

  if (!finalToken) {
    return res.status(401).json({ ok: false, error: "missing_token", message: "Token bulunamadı" });
  }

  // If this is a JWT and contains clinicCode, treat it as an admin token.
  // Otherwise fall back to patient token flow.
  if (finalToken.startsWith("eyJ")) {
    try {
      const decoded = jwt.verify(finalToken, JWT_SECRET);
      if (decoded?.clinicCode) {
        req.isAdmin = true;
        return requireAdminToken(req, res, next);
      }
    } catch (e) {
      // fallthrough
    }
  }

  req.isAdmin = false;
  return requireToken(req, res, next);
}

function isPlainObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function isMissingColumnError(error, columnName) {
  const msg = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  const combined = `${msg} ${details} ${hint}`.toLowerCase();
  const code = String(error?.code || "");
  const isMissingCode = code === "PGRST204" || code === "42703";
  if (!columnName) return isMissingCode;
  return isMissingCode && combined.includes(String(columnName || "").toLowerCase());
}

function deepMerge(base, patch) {
  const a = isPlainObject(base) ? base : {};
  const b = isPlainObject(patch) ? patch : {};
  const out = { ...a };
  for (const k of Object.keys(b)) {
    const bv = b[k];
    const av = out[k];
    if (Array.isArray(bv)) {
      out[k] = bv; // replace arrays
    } else if (isPlainObject(bv) && isPlainObject(av)) {
      out[k] = deepMerge(av, bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}

function defaultTravelData(patientId) {
  return {
    schemaVersion: 1,
    updatedAt: now(),
    patientId,
    hotel: null,
    flight: {},
    flights: [],
    notes: "",
    airportPickup: null,
    editPolicy: {
      hotel: "ADMIN",
      flights: "ADMIN",
      airportPickup: "ADMIN",
      notes: "ADMIN",
    },
    enteredBy: {},
    events: [],
    formCompleted: false,
    formCompletedAt: null,
  };
}

function computeFormCompleted(travel) {
  const hasHotel = travel?.hotel && travel.hotel.checkIn && travel.hotel.checkOut;
  const hasOutboundFlight =
    Array.isArray(travel?.flights) &&
    travel.flights.some((f) => (f.type || "OUTBOUND") === "OUTBOUND" && f.date);
  return hasHotel && hasOutboundFlight;
}

function normalizeAirportPickup(pickup, pickupBy) {
  if (!isPlainObject(pickup)) return pickup;
  const p = { ...pickup };

  // Keep legacy keys working while introducing v2 keys
  if (p.contactName === undefined && p.name) p.contactName = p.name;
  if (p.name === undefined && p.contactName) p.name = p.contactName;

  if (p.contactPhone === undefined && p.phone) p.contactPhone = p.phone;
  if (p.phone === undefined && p.contactPhone) p.phone = p.contactPhone;

  if (p.pickupBy === undefined && pickupBy) p.pickupBy = pickupBy;

  if (p.enabled === undefined) {
    p.enabled = Boolean(
      p.name ||
        p.phone ||
        p.contactName ||
        p.contactPhone ||
        p.vehicle ||
        p.vehicleInfo ||
        p.plate ||
        p.meetingPoint ||
        p.note ||
        p.notes
    );
  }

  return p;
}

function normalizeFlightLeg(leg) {
  if (!isPlainObject(leg)) return null;
  const out = { ...leg };
  if (out.flightNumber === undefined && out.flightNo) out.flightNumber = out.flightNo;
  if (out.flightNo === undefined && out.flightNumber) out.flightNo = out.flightNumber;
  return out;
}

function deriveFlightFromFlights(flights) {
  const list = Array.isArray(flights) ? flights : [];
  const isArrival = (t) => ["ARRIVAL", "OUTBOUND", "INBOUND"].includes(String(t || "").toUpperCase());
  const isDeparture = (t) => ["DEPARTURE", "RETURN"].includes(String(t || "").toUpperCase());

  const arrival = list.find((f) => isArrival(f?.type));
  const departure = list.find((f) => isDeparture(f?.type));

  const toLeg = (f) => {
    if (!isPlainObject(f)) return null;
    return {
      airline: f.airline,
      flightNumber: f.flightNumber || f.flightNo,
      from: f.from,
      to: f.to,
      date: f.date,
      time: f.time,
    };
  };

  const out = {};
  const a = toLeg(arrival);
  const d = toLeg(departure);
  if (a) out.arrival = a;
  if (d) out.departure = d;
  return out;
}

async function fetchPatientTravelRowSupabase(patientId, clinicIdOrNull) {
  // Prefer `patient_id` when available; fall back to `id`.
  let q1 = supabase
    .from("patients")
    .select("id, clinic_id, travel, patient_id")
    .eq("patient_id", patientId);
  if (clinicIdOrNull) q1 = q1.eq("clinic_id", clinicIdOrNull);
  const r1 = await q1.single();

  if (!r1.error) return { data: r1.data, key: "patient_id" };

  const msg = String(r1.error?.message || "");
  const isMissingPatientIdCol = msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
  const isNotFound = String(r1.error?.code || "") === "PGRST116";
  if (!isMissingPatientIdCol && !isNotFound) return { error: r1.error };

  let q2 = supabase.from("patients").select("id, clinic_id, travel").eq("id", patientId);
  if (clinicIdOrNull) q2 = q2.eq("clinic_id", clinicIdOrNull);
  const r2 = await q2.single();
  if (!r2.error) return { data: r2.data, key: "id" };
  return { error: r2.error };
}

async function updatePatientTravelRowSupabase(patientId, clinicIdOrNull, updatedTravel) {
  // Prefer `patient_id` when available; fall back to `id`.
  let q1 = supabase
    .from("patients")
    .update({ travel: updatedTravel })
    .eq("patient_id", patientId);
  if (clinicIdOrNull) q1 = q1.eq("clinic_id", clinicIdOrNull);
  const r1 = await q1.select("*").single();
  if (!r1.error) return { data: r1.data, key: "patient_id" };

  const msg = String(r1.error?.message || "");
  const isMissingPatientIdCol = msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
  const isNotFound = String(r1.error?.code || "") === "PGRST116";
  if (!isMissingPatientIdCol && !isNotFound) return { error: r1.error };

  let q2 = supabase
    .from("patients")
    .update({ travel: updatedTravel })
    .eq("id", patientId);
  if (clinicIdOrNull) q2 = q2.eq("clinic_id", clinicIdOrNull);
  const r2 = await q2.select("*").single();
  if (!r2.error) return { data: r2.data, key: "id" };
  return { error: r2.error };
}

async function getTravelHandler(req, res) {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

    // Patient can only access their own record
    if (!req.isAdmin && req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    // PRODUCTION: Supabase is source of truth
    if (isSupabaseEnabled()) {
      const clinicFilter = req.isAdmin ? req.clinicId : null;
      const { data: p, error } = await fetchPatientTravelRowSupabase(patientId, clinicFilter);
      if (error) {
        const supabasePublic = {
          code: error.code || null,
          message: error.message || null,
          details: error.details || null,
          hint: error.hint || null,
        };
        console.error("[TRAVEL] Supabase fetch failed", {
          message: error.message,
          code: error.code,
          details: error.details,
        });
        // Most common deploy-time issue: migrations not applied yet
        if (isMissingColumnError(error, "travel")) {
          return res.status(500).json({
            ok: false,
            error: "travel_column_missing",
            message: "Supabase schema missing: patients.travel. Run migration 004_add_patient_travel.sql",
            supabase: supabasePublic,
          });
        }
        if (String(error.code || "") === "PGRST116") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(500).json({
          ok: false,
          error: "travel_fetch_failed",
          message: "Failed to fetch travel from Supabase.",
          supabase: supabasePublic,
        });
      }

      const merged = deepMerge(defaultTravelData(patientId), p?.travel || {});
      // Backward compatibility: compute completion flags if missing
      if (merged.formCompleted === undefined || merged.formCompletedAt === undefined) {
        const done = computeFormCompleted(merged);
        merged.formCompleted = done;
        if (done && !merged.formCompletedAt) merged.formCompletedAt = merged.updatedAt || now();
        if (!done) merged.formCompletedAt = null;
      }
      merged.patientId = patientId;
      return res.json(merged);
    }

    // Do not silently fall back unless explicitly enabled
    if (!canUseFileFallback()) {
      console.error("[TRAVEL] Supabase disabled (file fallback disabled)");
      return res.status(500).json(supabaseDisabledPayload("travel"));
    }

    // Legacy fallback (file-based)
    const TRAVEL_DIR = path.join(DATA_DIR, "travel");
    if (!fs.existsSync(TRAVEL_DIR)) fs.mkdirSync(TRAVEL_DIR, { recursive: true });
    const travelFile = path.join(TRAVEL_DIR, `${patientId}.json`);
    const data = deepMerge(defaultTravelData(patientId), readJson(travelFile, {}));
    if (data.formCompleted === undefined || data.formCompletedAt === undefined) {
      const done = computeFormCompleted(data);
      data.formCompleted = done;
      if (done && !data.formCompletedAt) data.formCompletedAt = data.updatedAt || now();
      if (!done) data.formCompletedAt = null;
    }
    data.patientId = patientId;
    return res.json(data);
  } catch (e) {
    console.error("[TRAVEL] GET error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

// GET /api/patient/:patientId/travel
app.get("/api/patient/:patientId/travel", requireAdminOrPatientToken, getTravelHandler);

async function saveTravelHandler(req, res) {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

    // Patient can only modify their own record
    if (!req.isAdmin && req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    const incomingRaw = isPlainObject(req.body) ? req.body : {};
    // Never trust client-controlled enteredBy
    const { enteredBy: _ignoreEnteredBy, ...incoming } = incomingRaw;

    // "clinic" vs "patient" is what we show in UI/labels
    const actor = req.isAdmin ? "clinic" : "patient";
    const nowTs = now();
    const hasIncoming = (k) => Object.prototype.hasOwnProperty.call(incoming, k);

    // PRODUCTION: Supabase is source of truth
    if (isSupabaseEnabled()) {
      const clinicFilter = req.isAdmin ? req.clinicId : null;
      const { data: p, error: fetchErr } = await fetchPatientTravelRowSupabase(patientId, clinicFilter);
      if (fetchErr) {
        console.error("[TRAVEL] Supabase fetch before save failed", {
          message: fetchErr.message,
          code: fetchErr.code,
          details: fetchErr.details,
        });
        if (isMissingColumnError(fetchErr, "travel")) {
          return res.status(500).json({
            ok: false,
            error: "travel_column_missing",
            message: "Supabase schema missing: patients.travel. Run migration 004_add_patient_travel.sql",
          });
        }
        if (String(fetchErr.code || "") === "PGRST116") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(500).json({
          ok: false,
          error: "travel_fetch_failed",
          message: "Failed to fetch travel from Supabase.",
        });
      }

      const existingTravel = isPlainObject(p?.travel) ? p.travel : {};
      const base = deepMerge(defaultTravelData(patientId), existingTravel);

      // CRITICAL: Never let one actor overwrite the other's fields.
      // - Admin may only update: hotel, airportPickup
      // - Patient may only update: flights/flight, notes, editPolicy
      // Missing fields MUST be preserved; forbidden fields are ignored (not deleted).
      const patch = {};
      if (req.isAdmin) {
        if (hasIncoming("hotel")) patch.hotel = incoming.hotel;
        if (hasIncoming("airportPickup")) patch.airportPickup = incoming.airportPickup;
        // Admin cannot change editPolicy or patient-controlled fields
      } else {
        if (hasIncoming("notes")) patch.notes = incoming.notes;
        if (hasIncoming("flights")) patch.flights = incoming.flights;
        if (hasIncoming("flight")) patch.flight = incoming.flight;
        // Patient can set editPolicy (patient-controlled)
        if (hasIncoming("editPolicy")) patch.editPolicy = incoming.editPolicy;
      }

      const touched = (k) => Object.prototype.hasOwnProperty.call(patch, k);
      let payload = deepMerge(base, patch);

      payload.patientId = patientId;
      payload.schemaVersion = payload.schemaVersion || base.schemaVersion || 1;
      payload.updatedAt = nowTs;

      // Normalize airportPickup ONLY when it was explicitly patched (prevents accidental changes/deletes)
      if (touched("airportPickup") && payload.airportPickup && isPlainObject(payload.airportPickup)) {
        payload.airportPickup = normalizeAirportPickup(payload.airportPickup, actor);
      }

      // Persist new flight model while keeping legacy `flights[]`
      // If legacy flights[] was updated and flight wasn't explicitly provided, derive flight.arrival/departure
      if (touched("flights") && !touched("flight")) {
        const derived = deriveFlightFromFlights(payload.flights);
        const baseFlight = isPlainObject(base.flight) ? base.flight : {};
        payload.flight = deepMerge(baseFlight, derived);
      } else if (touched("flight") && isPlainObject(payload.flight)) {
        // normalize common field names (flightNo/flightNumber) on legs
        payload.flight = {
          ...payload.flight,
          arrival: normalizeFlightLeg(payload.flight.arrival) || payload.flight.arrival,
          departure: normalizeFlightLeg(payload.flight.departure) || payload.flight.departure,
        };
      }

      // Update enteredBy for touched areas
      payload.enteredBy = isPlainObject(base.enteredBy) ? { ...base.enteredBy } : {};
      if (touched("hotel")) payload.enteredBy.hotel = actor;
      if (touched("airportPickup")) payload.enteredBy.airportPickup = actor;
      if (touched("flight") || touched("flights")) payload.enteredBy.flight = actor;
      if (touched("notes")) payload.enteredBy.notes = actor;

      // Completion flags
      const isFormCompleted = computeFormCompleted(payload);
      payload.formCompleted = isFormCompleted;
      if (isFormCompleted && !base.formCompletedAt) payload.formCompletedAt = nowTs;
      else if (isFormCompleted && base.formCompletedAt) payload.formCompletedAt = base.formCompletedAt;
      else payload.formCompletedAt = null;

      const { data: updatedPatient, error: saveErr } = await updatePatientTravelRowSupabase(
        patientId,
        clinicFilter,
        payload
      );
      if (saveErr) {
        const supabasePublic = {
          code: saveErr.code || null,
          message: saveErr.message || null,
          details: saveErr.details || null,
          hint: saveErr.hint || null,
        };
        console.error("[TRAVEL] Supabase save failed", {
          message: saveErr.message,
          code: saveErr.code,
          details: saveErr.details,
          hint: saveErr.hint,
        });
        if (isMissingColumnError(saveErr, "travel")) {
          return res.status(500).json({
            ok: false,
            error: "travel_column_missing",
            message: "Supabase schema missing: patients.travel. Run migration 004_add_patient_travel.sql",
            supabase: supabasePublic,
          });
        }
        if (String(saveErr.code || "") === "PGRST116") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(500).json({
          ok: false,
          error: "travel_save_failed",
          message: "Failed to save travel to Supabase.",
          supabase: supabasePublic,
        });
      }

      // Notifications must never break the API
      try {
        const hadAirportPickup =
          base?.airportPickup && (base.airportPickup.name || base.airportPickup.phone);
        const hasAirportPickup =
          payload?.airportPickup && (payload.airportPickup.name || payload.airportPickup.phone);
        if (
          hasAirportPickup &&
          (!hadAirportPickup ||
            JSON.stringify(base?.airportPickup) !== JSON.stringify(payload.airportPickup))
        ) {
          const pickupName = payload.airportPickup.name || "Karşılayıcı";
          const pickupPhone = payload.airportPickup.phone || "";
          const notificationTitle = "🚗 Havalimanı Karşılama Bilgisi";
          const notificationMessage = `Havalimanı karşılama bilgileriniz güncellendi. ${pickupName}${
            pickupPhone ? ` (${pickupPhone})` : ""
          } sizi karşılayacak.`;

          sendPushNotification(patientId, notificationTitle, notificationMessage, {
            icon: "/icon-192x192.png",
            badge: "/badge-72x72.png",
            url: "/travel",
            data: { type: "AIRPORT_PICKUP", patientId, from: "CLINIC" },
          }).catch((err) => {
            console.error(`[TRAVEL/${patientId}] Failed to send airport pickup notification:`, err);
          });
        }
      } catch (e) {
        console.error(`[TRAVEL/${patientId}] Notification logic error (ignored):`, e);
      }

      return res.json({ ok: true, saved: true, travel: updatedPatient?.travel || payload, patient: updatedPatient });
    }

    // Do not silently fall back unless explicitly enabled
    if (!canUseFileFallback()) {
      console.error("[TRAVEL] Supabase disabled (file fallback disabled)");
      return res.status(500).json(supabaseDisabledPayload("travel"));
    }

    // Legacy fallback (file-based) — only when Supabase is disabled
    const TRAVEL_DIR = path.join(DATA_DIR, "travel");
    if (!fs.existsSync(TRAVEL_DIR)) fs.mkdirSync(TRAVEL_DIR, { recursive: true });
    const travelFile = path.join(TRAVEL_DIR, `${patientId}.json`);
    const existing = readJson(travelFile, {});
    const base = deepMerge(defaultTravelData(patientId), existing);
    // Apply the same actor-based patch rules for file fallback.
    const patch = {};
    if (req.isAdmin) {
      if (hasIncoming("hotel")) patch.hotel = incoming.hotel;
      if (hasIncoming("airportPickup")) patch.airportPickup = incoming.airportPickup;
    } else {
      if (hasIncoming("notes")) patch.notes = incoming.notes;
      if (hasIncoming("flights")) patch.flights = incoming.flights;
      if (hasIncoming("flight")) patch.flight = incoming.flight;
      if (hasIncoming("editPolicy")) patch.editPolicy = incoming.editPolicy;
    }
    const touched = (k) => Object.prototype.hasOwnProperty.call(patch, k);

    let payload = deepMerge(base, patch);
    payload.patientId = patientId;
    payload.schemaVersion = payload.schemaVersion || base.schemaVersion || 1;
    payload.updatedAt = nowTs;

    if (touched("airportPickup") && payload.airportPickup && isPlainObject(payload.airportPickup)) {
      payload.airportPickup = normalizeAirportPickup(payload.airportPickup, actor);
    }

    payload.enteredBy = isPlainObject(base.enteredBy) ? { ...base.enteredBy } : {};
    if (touched("hotel")) payload.enteredBy.hotel = actor;
    if (touched("airportPickup")) payload.enteredBy.airportPickup = actor;
    if (touched("flight") || touched("flights")) payload.enteredBy.flight = actor;
    if (touched("notes")) payload.enteredBy.notes = actor;

    if (touched("flights") && !touched("flight")) {
      const derived = deriveFlightFromFlights(payload.flights);
      const baseFlight = isPlainObject(base.flight) ? base.flight : {};
      payload.flight = deepMerge(baseFlight, derived);
    } else if (touched("flight") && isPlainObject(payload.flight)) {
      payload.flight = {
        ...payload.flight,
        arrival: normalizeFlightLeg(payload.flight.arrival) || payload.flight.arrival,
        departure: normalizeFlightLeg(payload.flight.departure) || payload.flight.departure,
      };
    }

    const done = computeFormCompleted(payload);
    payload.formCompleted = done;
    if (done && !base.formCompletedAt) payload.formCompletedAt = nowTs;
    else if (done && base.formCompletedAt) payload.formCompletedAt = base.formCompletedAt;
    else payload.formCompletedAt = null;
    writeJson(travelFile, payload);
    return res.json({ ok: true, saved: true, travel: payload });
  } catch (e) {
    console.error("[TRAVEL] SAVE error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

function requirePatientOnly(req, res, next) {
  if (req.isAdmin) {
    return res.status(403).json({ ok: false, error: "admin_not_allowed" });
  }
  return next();
}

function withPatientIdFromToken(handler) {
  return (req, res) => {
    const tokenPatientId = String(req.patientId || "").trim();
    if (!tokenPatientId) {
      return res.status(401).json({ ok: false, error: "patient_id_required" });
    }
    req.params.patientId = tokenPatientId;
    return handler(req, res);
  };
}

// PATIENT (self) travel
app.get(
  "/api/patient/me/travel",
  requireAdminOrPatientToken,
  requirePatientOnly,
  withPatientIdFromToken(getTravelHandler)
);
app.put(
  "/api/patient/me/travel",
  requireAdminOrPatientToken,
  requirePatientOnly,
  withPatientIdFromToken(saveTravelHandler)
);
app.post(
  "/api/patient/me/travel",
  requireAdminOrPatientToken,
  requirePatientOnly,
  withPatientIdFromToken(saveTravelHandler)
);

// ADMIN travel updates
app.put("/api/admin/patient/:patientId/travel", requireAdminAuth, saveTravelHandler);
app.post("/api/admin/patient/:patientId/travel", requireAdminAuth, saveTravelHandler);

// Legacy routes (backward compatibility)
app.post("/api/patient/:patientId/travel", requireAdminOrPatientToken, saveTravelHandler);
app.put("/api/patient/:patientId/travel", requireAdminOrPatientToken, saveTravelHandler);

// ================== PATIENT TREATMENT (v1 JSONB, Supabase persistence) ==================
function defaultTreatmentV1() {
  return {
    teeth: {},
    summary: {},
    lastUpdatedAt: null,
  };
}

function normalizeTreatmentStatusV1(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return null;
  // keep free-form but normalize some common legacy values
  if (s === "planned" || s === "plan" || s === "pln") return "planned";
  if (s === "completed" || s === "done" || s === "complete") return "completed";
  if (s === "in_progress" || s === "inprogress" || s === "progress") return "in_progress";
  return s;
}

function normalizeProcedureNameV1(type) {
  const t = String(type || "").trim().toLowerCase();
  if (!t) return null;
  return t.replaceAll(" ", "_");
}

function legacyTreatmentsToTreatmentV1(legacyPayload, enteredBy) {
  const legacy = isPlainObject(legacyPayload) ? legacyPayload : {};
  const teethArr = Array.isArray(legacy.teeth) ? legacy.teeth : [];
  const out = defaultTreatmentV1();

  const teeth = {};
  let totalCost = 0;
  let currency = null;
  let hasAnyPrice = false;

  for (const tooth of teethArr) {
    const toothId = String(tooth?.toothId || "").trim();
    if (!toothId) continue;
    const procs = Array.isArray(tooth?.procedures) ? tooth.procedures : [];
    const mapped = [];
    for (const p of procs) {
      const procName = normalizeProcedureNameV1(p?.type);
      const status = normalizeTreatmentStatusV1(p?.status);
      const date = p?.date || p?.scheduledAt || null;
      const clinicNote = p?.notes || p?.note || p?.clinicNote || "";
      if (!procName && !status && !date && !clinicNote) continue;

      // Best-effort pricing aggregation
      const tp = p?.total_price;
      const cp = p?.currency;
      if (tp !== undefined && tp !== null && Number.isFinite(Number(tp))) {
        totalCost += Number(tp);
        hasAnyPrice = true;
      }
      if (cp && typeof cp === "string") {
        const c = cp.trim().toUpperCase();
        currency = currency || c;
        if (currency !== c) currency = null; // mixed currency -> unknown
      }

      mapped.push({
        procedure: procName,
        status: status || undefined,
        date: date || undefined,
        clinicNote: clinicNote || undefined,
      });
    }
    if (mapped.length) teeth[toothId] = mapped;
  }

  out.teeth = teeth;
  out.summary = {
    ...(hasAnyPrice ? { totalCost: Math.round(totalCost * 100) / 100 } : {}),
    ...(currency ? { currency } : {}),
    ...(enteredBy ? { enteredBy } : {}),
  };
  out.lastUpdatedAt = new Date().toISOString();

  return out;
}

async function saveTreatmentsSupabaseWithFallback(patientId, payload, enteredBy) {
  try {
    await updatePatient(patientId, { treatments: payload });
    return { ok: true, usedFallback: false };
  } catch (error) {
    if (!isMissingColumnError(error, "treatments")) {
      return { ok: false, error };
    }
  }

  try {
    const patchV1 = legacyTreatmentsToTreatmentV1(payload, enteredBy);
    const { error: saveErr } = await updatePatientTreatmentRowSupabase(patientId, null, patchV1);
    if (saveErr) return { ok: false, error: saveErr };
    return { ok: true, usedFallback: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function fetchPatientTreatmentsRowSupabase(patientId, clinicIdOrNull) {
  // Prefer `patient_id` when available; fall back to `id`.
  let q1 = supabase
    .from("patients")
    .select("id, clinic_id, treatments, patient_id")
    .eq("patient_id", patientId);
  if (clinicIdOrNull) q1 = q1.eq("clinic_id", clinicIdOrNull);
  const r1 = await q1.single();
  if (!r1.error) return { data: r1.data, key: "patient_id" };

  const msg = String(r1.error?.message || "");
  const isMissingPatientIdCol = msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
  const isNotFound = String(r1.error?.code || "") === "PGRST116";
  if (!isMissingPatientIdCol && !isNotFound) return { error: r1.error };

  let q2 = supabase.from("patients").select("id, clinic_id, treatments").eq("id", patientId);
  if (clinicIdOrNull) q2 = q2.eq("clinic_id", clinicIdOrNull);
  const r2 = await q2.single();
  if (!r2.error) return { data: r2.data, key: "id" };
  return { error: r2.error };
}

async function loadExistingTreatmentsPayload(patientId, clinicIdOrNull, treatmentsFile, fallbackPayload) {
  if (isSupabaseEnabled()) {
    let { data: row, error } = await fetchPatientTreatmentsRowSupabase(patientId, clinicIdOrNull);
    if (error && String(error.code || "") === "PGRST116" && clinicIdOrNull) {
      // Retry without clinic filter to avoid overwriting when clinic_id is missing/mismatched.
      const retry = await fetchPatientTreatmentsRowSupabase(patientId, null);
      row = retry.data;
      error = retry.error;
    }

    if (!error && row && isPlainObject(row.treatments)) {
      return row.treatments;
    }

    if (error && !isMissingColumnError(error, "treatments")) {
      console.error("[TREATMENTS] Failed to load existing treatments from Supabase", {
        message: error.message,
        code: error.code,
        details: error.details,
      });
    }
  }

  if (canUseFileFallback()) {
    return readJson(treatmentsFile, fallbackPayload);
  }

  return fallbackPayload;
}

async function fetchPatientTreatmentRowSupabase(patientId, clinicIdOrNull) {
  // Prefer `patient_id` when available; fall back to `id`.
  let q1 = supabase
    .from("patients")
    .select("id, clinic_id, treatment, patient_id")
    .eq("patient_id", patientId);
  if (clinicIdOrNull) q1 = q1.eq("clinic_id", clinicIdOrNull);
  const r1 = await q1.single();
  if (!r1.error) return { data: r1.data, key: "patient_id" };

  const msg = String(r1.error?.message || "");
  const isMissingPatientIdCol = msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
  const isNotFound = String(r1.error?.code || "") === "PGRST116";
  if (!isMissingPatientIdCol && !isNotFound) return { error: r1.error };

  let q2 = supabase.from("patients").select("id, clinic_id, treatment").eq("id", patientId);
  if (clinicIdOrNull) q2 = q2.eq("clinic_id", clinicIdOrNull);
  const r2 = await q2.single();
  if (!r2.error) return { data: r2.data, key: "id" };
  return { error: r2.error };
}

async function updatePatientTreatmentRowSupabase(patientId, clinicIdOrNull, updatedTreatment) {
  // Prefer `patient_id` when available; fall back to `id`.
  let q1 = supabase
    .from("patients")
    .update({ treatment: updatedTreatment, updated_at: new Date().toISOString() })
    .eq("patient_id", patientId);
  if (clinicIdOrNull) q1 = q1.eq("clinic_id", clinicIdOrNull);
  const r1 = await q1.select("*").single();
  if (!r1.error) return { data: r1.data, key: "patient_id" };

  const msg = String(r1.error?.message || "");
  const isMissingPatientIdCol = msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
  const isNotFound = String(r1.error?.code || "") === "PGRST116";
  if (!isMissingPatientIdCol && !isNotFound) return { error: r1.error };

  let q2 = supabase
    .from("patients")
    .update({ treatment: updatedTreatment, updated_at: new Date().toISOString() })
    .eq("id", patientId);
  if (clinicIdOrNull) q2 = q2.eq("clinic_id", clinicIdOrNull);
  const r2 = await q2.select("*").single();
  if (!r2.error) return { data: r2.data, key: "id" };
  return { error: r2.error };
}

async function fetchPatientTreatmentEventsRowSupabase(patientId, clinicIdOrNull) {
  // Prefer `patient_id` when available; fall back to `id`.
  let q1 = supabase
    .from("patients")
    .select("id, clinic_id, patient_id, treatment_events")
    .eq("patient_id", patientId);
  if (clinicIdOrNull) q1 = q1.eq("clinic_id", clinicIdOrNull);
  const r1 = await q1.single();
  if (!r1.error) return { data: r1.data, key: "patient_id" };

  const msg = String(r1.error?.message || "");
  const isMissingPatientIdCol =
    msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
  const isNotFound = String(r1.error?.code || "") === "PGRST116";
  if (!isMissingPatientIdCol && !isNotFound) return { error: r1.error };

  let q2 = supabase.from("patients").select("id, clinic_id, treatment_events").eq("id", patientId);
  if (clinicIdOrNull) q2 = q2.eq("clinic_id", clinicIdOrNull);
  const r2 = await q2.single();
  if (!r2.error) return { data: r2.data, key: "id" };
  return { error: r2.error };
}

async function updatePatientTreatmentEventsRowSupabase(patientId, clinicIdOrNull, events) {
  // Prefer `patient_id` when available; fall back to `id`.
  let q1 = supabase
    .from("patients")
    .update({ treatment_events: events, updated_at: new Date().toISOString() })
    .eq("patient_id", patientId);
  if (clinicIdOrNull) q1 = q1.eq("clinic_id", clinicIdOrNull);
  const r1 = await q1.select("id, clinic_id, patient_id, treatment_events").single();
  if (!r1.error) return { data: r1.data, key: "patient_id" };

  const msg = String(r1.error?.message || "");
  const isMissingPatientIdCol =
    msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
  const isNotFound = String(r1.error?.code || "") === "PGRST116";
  if (!isMissingPatientIdCol && !isNotFound) return { error: r1.error };

  let q2 = supabase
    .from("patients")
    .update({ treatment_events: events, updated_at: new Date().toISOString() })
    .eq("id", patientId);
  if (clinicIdOrNull) q2 = q2.eq("clinic_id", clinicIdOrNull);
  const r2 = await q2.select("id, clinic_id, treatment_events").single();
  if (!r2.error) return { data: r2.data, key: "id" };
  return { error: r2.error };
}

// ================== PATIENT TREATMENT EVENTS (independent from travel) ==================
function mapTreatmentEventsForCalendar(rawEvents) {
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  return events.map((event, index) => {
    const startAt =
      Number(event?.startAt || event?.startDate || event?.scheduledAt || event?.timestamp) ||
      (event?.date
        ? new Date(`${event.date}T${event.time || "00:00"}`).getTime()
        : null);
    const id = String(event?.id || `evt_${index}_${startAt || now()}`);
    const type = String(event?.type || "TREATMENT");
    const title = String(event?.title || type);
    return {
      ...event,
      id,
      type,
      title,
      startAt: startAt || undefined,
      scheduledAt: event?.scheduledAt || undefined,
    };
  });
}

app.get("/api/patient/:patientId/treatment-events", requireAdminOrPatientToken, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

    if (!req.isAdmin && String(req.patientId || "").trim() !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    if (!isSupabaseEnabled()) {
      if (!canUseFileFallback()) return res.status(500).json(supabaseDisabledPayload("treatment-events"));
      // dev fallback to file in treatments dir (optional)
      const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
      if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
      const eventsFile = path.join(TREATMENTS_DIR, `${patientId}.events.json`);
      const data = readJson(eventsFile, []);
      return res.json({ ok: true, events: Array.isArray(data) ? data : [] });
    }

    const clinicFilter = req.isAdmin ? req.clinicId : null;
    let clinicIdForPrices = clinicFilter;
    if (!clinicIdForPrices) {
      try {
        const patient = await getPatientById(patientId);
        clinicIdForPrices = patient?.clinic_id || null;
      } catch {}
    }

    const priceMap = clinicIdForPrices ? await fetchTreatmentPricesMap(clinicIdForPrices) : {};
    const { data, error } = await fetchPatientTreatmentEventsRowSupabase(patientId, clinicFilter);
    if (error) {
      console.error("[TREATMENT_EVENTS] Supabase fetch failed", {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      if (isMissingColumnError(error, "treatment_events")) {
        if (canUseFileFallback()) {
          const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
          if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
          const eventsFile = path.join(TREATMENTS_DIR, `${patientId}.events.json`);
          const data = readJson(eventsFile, []);
          return res.json({
            ok: true,
            events: Array.isArray(data) ? data : [],
            warning: "treatment_events_column_missing_file_fallback",
          });
        }
        return res.json({
          ok: true,
          events: [],
          warning: "treatment_events_column_missing",
        });
      }
      if (String(error.code || "") === "PGRST116") return res.status(404).json({ ok: false, error: "patient_not_found" });
      return res.status(500).json({ ok: false, error: "treatment_events_fetch_failed" });
    }

    const events = applyEventPrices(mapTreatmentEventsForCalendar(data?.treatment_events), priceMap);
    return res.json({ ok: true, events });
  } catch (e) {
    console.error("[TREATMENT_EVENTS] GET error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.put("/api/patient/:patientId/treatment-events", requireAdminOrPatientToken, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

    if (!req.isAdmin && String(req.patientId || "").trim() !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    const body = isPlainObject(req.body) ? req.body : {};
    const events = Array.isArray(body.events) ? body.events : [];

    if (!isSupabaseEnabled()) {
      if (!canUseFileFallback()) return res.status(500).json(supabaseDisabledPayload("treatment-events"));
      const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
      if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
      const eventsFile = path.join(TREATMENTS_DIR, `${patientId}.events.json`);
      writeJson(eventsFile, events);
      return res.json({ ok: true, saved: true, events });
    }

    const clinicFilter = req.isAdmin ? req.clinicId : null;
    const { data, error } = await updatePatientTreatmentEventsRowSupabase(patientId, clinicFilter, events);
    if (error) {
      console.error("[TREATMENT_EVENTS] Supabase save failed", {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      if (isMissingColumnError(error, "treatment_events")) {
        if (canUseFileFallback()) {
          const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
          if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
          const eventsFile = path.join(TREATMENTS_DIR, `${patientId}.events.json`);
          writeJson(eventsFile, events);
          return res.json({
            ok: true,
            saved: true,
            events,
            warning: "treatment_events_column_missing_file_fallback",
          });
        }
        return res.json({
          ok: true,
          saved: false,
          events,
          warning: "treatment_events_column_missing",
        });
      }
      return res.status(500).json({ ok: false, error: "treatment_events_save_failed" });
    }

    return res.json({ ok: true, saved: true, events: Array.isArray(data?.treatment_events) ? data.treatment_events : [] });
  } catch (e) {
    console.error("[TREATMENT_EVENTS] PUT error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

async function saveTreatmentV1Handler(req, res) {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

    // Patient can only modify their own record
    if (!req.isAdmin && req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    if (!isSupabaseEnabled()) {
      return res.status(500).json(supabaseDisabledPayload("treatment"));
    }

    const incoming = isPlainObject(req.body) ? req.body : {};
    const clinicFilter = req.isAdmin ? req.clinicId : null;

    const { data: p, error: fetchErr } = await fetchPatientTreatmentRowSupabase(patientId, clinicFilter);
    if (fetchErr) {
      console.error("[TREATMENT] Supabase fetch failed", {
        message: fetchErr.message,
        code: fetchErr.code,
        details: fetchErr.details,
      });
      if (isMissingColumnError(fetchErr, "treatment")) {
        return res.status(500).json({
          ok: false,
          error: "treatment_column_missing",
          message: "Supabase schema missing: patients.treatment. Run migration 005_add_patient_treatment.sql",
        });
      }
      if (String(fetchErr.code || "") === "PGRST116") {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }
      return res.status(500).json({ ok: false, error: "treatment_fetch_failed" });
    }

    const existing = isPlainObject(p?.treatment) ? p.treatment : {};
    const updated = deepMerge(existing, incoming);
    updated.lastUpdatedAt = new Date().toISOString();

    // If summary exists but enteredBy isn't set, set it based on actor
    const actor = req.isAdmin ? "clinic" : "patient";
    if (updated.summary === undefined) updated.summary = {};
    if (isPlainObject(updated.summary) && !updated.summary.enteredBy) {
      // Only set if there was a change payload that likely modifies treatment
      if (Object.keys(incoming || {}).length > 0) updated.summary.enteredBy = actor;
    }

    const { data: updatedPatient, error: saveErr } = await updatePatientTreatmentRowSupabase(patientId, clinicFilter, updated);
    if (saveErr) {
      console.error("[TREATMENT] Supabase save failed", {
        message: saveErr.message,
        code: saveErr.code,
        details: saveErr.details,
      });
      if (isMissingColumnError(saveErr, "treatment")) {
        return res.status(500).json({
          ok: false,
          error: "treatment_column_missing",
          message: "Supabase schema missing: patients.treatment. Run migration 005_add_patient_treatment.sql",
        });
      }
      return res.status(500).json({ ok: false, error: "treatment_save_failed" });
    }

    return res.json({ ok: true, saved: true, patient: updatedPatient });
  } catch (e) {
    console.error("[TREATMENT] POST/PUT error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

// GET /api/patient/:patientId/treatment (v1 JSONB, Supabase source of truth)
app.get("/api/patient/:patientId/treatment", requireAdminOrPatientToken, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

    // Patient can only access their own record
    if (!req.isAdmin && req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    if (!isSupabaseEnabled()) {
      // No silent fallback in production; treatment must be persisted in Supabase
      return res.status(500).json(supabaseDisabledPayload("treatment"));
    }

    const clinicFilter = req.isAdmin ? req.clinicId : null;
    const { data: p, error } = await fetchPatientTreatmentRowSupabase(patientId, clinicFilter);
    if (error) {
      console.error("[TREATMENT] Supabase fetch failed", {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      if (isMissingColumnError(error, "treatment")) {
        return res.status(500).json({
          ok: false,
          error: "treatment_column_missing",
          message: "Supabase schema missing: patients.treatment. Run migration 005_add_patient_treatment.sql",
        });
      }
      if (String(error.code || "") === "PGRST116") {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }
      return res.status(500).json({ ok: false, error: "treatment_fetch_failed" });
    }

    const merged = deepMerge(defaultTreatmentV1(), isPlainObject(p?.treatment) ? p.treatment : {});
    return res.json({ ok: true, treatment: merged });
  } catch (e) {
    console.error("[TREATMENT] GET error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// POST / PUT /api/patient/:patientId/treatment (new persistence endpoint)
app.post("/api/patient/:patientId/treatment", requireAdminOrPatientToken, saveTreatmentV1Handler);
app.put("/api/patient/:patientId/treatment", requireAdminOrPatientToken, saveTreatmentV1Handler);

// ================== PATIENT HEALTH FORM ==================
async function fetchPatientHealthRowSupabase(patientId, clinicIdOrNull) {
  // Prefer `patient_id` when available; fall back to `id`.
  let q1 = supabase.from("patients").select("id, clinic_id, patient_id, health").eq("patient_id", patientId);
  if (clinicIdOrNull) q1 = q1.eq("clinic_id", clinicIdOrNull);
  const r1 = await q1.single();

  if (!r1.error) return { data: r1.data, key: "patient_id" };

  const msg = String(r1.error?.message || "");
  const isMissingPatientIdCol =
    msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
  const isNotFound = String(r1.error?.code || "") === "PGRST116";
  if (!isMissingPatientIdCol && !isNotFound) return { error: r1.error };

  let q2 = supabase.from("patients").select("id, clinic_id, health").eq("id", patientId);
  if (clinicIdOrNull) q2 = q2.eq("clinic_id", clinicIdOrNull);
  const r2 = await q2.single();
  if (!r2.error) return { data: r2.data, key: "id" };
  return { error: r2.error };
}

async function updatePatientHealthRowSupabase(patientId, payload) {
  // Prefer `patient_id` when available; fall back to `id`.
  const r1 = await supabase
    .from("patients")
    .update({ health: payload })
    .eq("patient_id", patientId)
    .select("id, patient_id, health")
    .single();

  if (!r1.error) return { data: r1.data, key: "patient_id" };

  const msg = String(r1.error?.message || "");
  const isMissingPatientIdCol =
    msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
  const isNotFound = String(r1.error?.code || "") === "PGRST116";
  if (!isMissingPatientIdCol && !isNotFound) return { error: r1.error };

  const r2 = await supabase
    .from("patients")
    .update({ health: payload })
    .eq("id", patientId)
    .select("id, health")
    .single();
  if (!r2.error) return { data: r2.data, key: "id" };
  return { error: r2.error };
}

function getPatientRecordById(patientId) {
  const patients = readJson(PAT_FILE, {});
  if (patients[patientId]) return patients[patientId];
  return Object.values(patients || {}).find(
    (p) => String(p?.patientId || p?.patient_id || "").trim() === String(patientId || "").trim()
  ) || null;
}

function ensureHealthDir() {
  const HEALTH_DIR = path.join(DATA_DIR, "health_forms");
  if (!fs.existsSync(HEALTH_DIR)) fs.mkdirSync(HEALTH_DIR, { recursive: true });
  return HEALTH_DIR;
}

async function patientHealthGetHandler(req, res) {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });
    if (req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    // PRODUCTION: Supabase is source of truth
    if (isSupabaseEnabled()) {
      const { data: p, error } = await fetchPatientHealthRowSupabase(patientId);

      if (error) {
        console.error("[HEALTH] Supabase fetch failed", {
          message: error.message,
          code: error.code,
          details: error.details,
        });
        if (isMissingColumnError(error, "health")) {
          return res.status(500).json({
            ok: false,
            error: "health_column_missing",
            message: "Supabase schema missing: patients.health. Run migration 004_add_patient_travel.sql",
          });
        }
        if (String(error.code || "") === "PGRST116") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(500).json({ ok: false, error: "health_fetch_failed" });
      }

      const health = p?.health || {};
      return res.json({
        ok: true,
        formData: health.formData || {},
        isComplete: health.isComplete === true,
        completedAt: health.completedAt || null,
        updatedAt: health.updatedAt || null,
        createdAt: health.createdAt || null,
      });
    }

    if (!canUseFileFallback()) {
      console.error("[HEALTH] Supabase disabled (file fallback disabled)");
      return res.status(500).json(supabaseDisabledPayload("health"));
    }

    // Legacy fallback (file-based)
    const HEALTH_DIR = ensureHealthDir();
    const filePath = path.join(HEALTH_DIR, `${patientId}.json`);
    if (!fs.existsSync(filePath)) {
      return res.json({ ok: true, formData: null, isComplete: false });
    }
    const data = readJson(filePath, {});
    return res.json({
      ok: true,
      formData: data.formData || {},
      isComplete: data.isComplete || false,
      completedAt: data.completedAt || null,
      updatedAt: data.updatedAt || null,
      createdAt: data.createdAt || null,
    });
  } catch (e) {
    console.error("[HEALTH] GET error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function patientHealthPostHandler(req, res) {
  try {
    console.log("[HEALTH] POST params:", req.params);
    console.log("[HEALTH] POST token patientId:", req.patientId);
    console.log("[HEALTH] POST body:", safeJsonPreview(req.body));

    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });
    if (req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    const formData = req.body?.formData || {};
    const isComplete = req.body?.isComplete === true;
    const nowTs = now();

    const payload = {
      patientId,
      formData,
      isComplete,
      createdAt: nowTs,
      updatedAt: nowTs,
      completedAt: isComplete ? nowTs : null,
    };

    if (isSupabaseEnabled()) {
      const { data, error } = await updatePatientHealthRowSupabase(patientId, payload);

      if (error) {
        const supabasePublic = {
          code: error.code || null,
          message: error.message || null,
          details: error.details || null,
          hint: error.hint || null,
        };
        console.error("[HEALTH] Supabase save failed", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        if (isMissingColumnError(error, "health")) {
          return res.status(500).json({
            ok: false,
            error: "health_column_missing",
            message: "Supabase schema missing: patients.health. Run migration 004_add_patient_travel.sql",
            supabase: supabasePublic,
          });
        }
        if (String(error.code || "") === "PGRST116") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(500).json({ ok: false, error: "health_save_failed", supabase: supabasePublic });
      }

      const health = data?.health || payload;
      return res.json({
        ok: true,
        formData: health.formData || {},
        isComplete: health.isComplete === true,
        completedAt: health.completedAt || null,
        updatedAt: health.updatedAt || nowTs,
        createdAt: health.createdAt || nowTs,
      });
    }

    if (!canUseFileFallback()) {
      console.error("[HEALTH] Supabase disabled (file fallback disabled)");
      return res.status(500).json(supabaseDisabledPayload("health"));
    }

    // Legacy fallback (file-based)
    const HEALTH_DIR = ensureHealthDir();
    const filePath = path.join(HEALTH_DIR, `${patientId}.json`);
    writeJson(filePath, payload);
    return res.json({
      ok: true,
      formData: payload.formData,
      isComplete: payload.isComplete,
      completedAt: payload.completedAt,
      updatedAt: payload.updatedAt,
      createdAt: payload.createdAt,
    });
  } catch (e) {
    console.error("[HEALTH] POST error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function patientHealthPutHandler(req, res) {
  try {
    console.log("[HEALTH] PUT params:", req.params);
    console.log("[HEALTH] PUT token patientId:", req.patientId);
    console.log("[HEALTH] PUT body:", safeJsonPreview(req.body));

    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });
    if (req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    const formData = req.body?.formData || {};
    const isComplete = req.body?.isComplete === true;
    const nowTs = now();

    if (isSupabaseEnabled()) {
      // Fetch existing health to preserve createdAt/completedAt
      const { data: existingRow, error: fetchErr } = await fetchPatientHealthRowSupabase(patientId);

      if (fetchErr) {
        const supabasePublic = {
          code: fetchErr.code || null,
          message: fetchErr.message || null,
          details: fetchErr.details || null,
          hint: fetchErr.hint || null,
        };
        console.error("[HEALTH] Supabase fetch failed (PUT)", {
          message: fetchErr.message,
          code: fetchErr.code,
          details: fetchErr.details,
        });
        if (isMissingColumnError(fetchErr, "health")) {
          return res.status(500).json({
            ok: false,
            error: "health_column_missing",
            message: "Supabase schema missing: patients.health. Run migration 004_add_patient_travel.sql",
            supabase: supabasePublic,
          });
        }
        if (String(fetchErr.code || "") === "PGRST116") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(500).json({ ok: false, error: "health_fetch_failed", supabase: supabasePublic });
      }

      const existingHealth = existingRow?.health || {};
      const payload = {
        patientId,
        formData,
        isComplete,
        createdAt: existingHealth.createdAt || nowTs,
        updatedAt: nowTs,
        completedAt: isComplete ? (existingHealth.completedAt || nowTs) : null,
      };

      const { data: updatedRow, error: updateErr } = await updatePatientHealthRowSupabase(patientId, payload);

      if (updateErr) {
        const supabasePublic = {
          code: updateErr.code || null,
          message: updateErr.message || null,
          details: updateErr.details || null,
          hint: updateErr.hint || null,
        };
        console.error("[HEALTH] Supabase save failed (PUT)", {
          message: updateErr.message,
          code: updateErr.code,
          details: updateErr.details,
          hint: updateErr.hint,
        });
        if (isMissingColumnError(updateErr, "health")) {
          return res.status(500).json({
            ok: false,
            error: "health_column_missing",
            message: "Supabase schema missing: patients.health. Run migration 004_add_patient_travel.sql",
            supabase: supabasePublic,
          });
        }
        if (String(updateErr.code || "") === "PGRST116") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(500).json({ ok: false, error: "health_save_failed", supabase: supabasePublic });
      }

      const health = updatedRow?.health || payload;
      return res.json({
        ok: true,
        formData: health.formData || {},
        isComplete: health.isComplete === true,
        completedAt: health.completedAt || null,
        updatedAt: health.updatedAt || nowTs,
        createdAt: health.createdAt || nowTs,
      });
    }

    if (!canUseFileFallback()) {
      console.error("[HEALTH] Supabase disabled (file fallback disabled)");
      return res.status(500).json(supabaseDisabledPayload("health"));
    }

    // Legacy fallback (file-based)
    const HEALTH_DIR = ensureHealthDir();
    const filePath = path.join(HEALTH_DIR, `${patientId}.json`);
    const existing = readJson(filePath, {});
    const payload = {
      patientId,
      formData,
      isComplete,
      createdAt: existing.createdAt || nowTs,
      updatedAt: nowTs,
      completedAt: isComplete ? (existing.completedAt || nowTs) : null,
    };
    writeJson(filePath, payload);
    return res.json({
      ok: true,
      formData: payload.formData,
      isComplete: payload.isComplete,
      completedAt: payload.completedAt,
      updatedAt: payload.updatedAt,
      createdAt: payload.createdAt,
    });
  } catch (e) {
    console.error("[HEALTH] PUT error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

// GET /api/patient/:patientId/health (canonical)
app.get("/api/patient/:patientId/health", requireToken, patientHealthGetHandler);
// Legacy: GET /p_xxx/health (app client)
app.get("/:patientId(p_[^/]+)/health", requireToken, patientHealthGetHandler);

// POST /api/patient/:patientId/health
app.post("/api/patient/:patientId/health", requireToken, patientHealthPostHandler);
// Legacy: POST /p_xxx/health (app client)
app.post("/:patientId(p_[^/]+)/health", requireToken, patientHealthPostHandler);

// PUT /api/patient/:patientId/health
app.put("/api/patient/:patientId/health", requireToken, patientHealthPutHandler);
// Legacy: PUT /p_xxx/health (app client)
app.put("/:patientId(p_[^/]+)/health", requireToken, patientHealthPutHandler);

// GET /api/admin/patients/:patientId/health
app.get("/api/admin/patients/:patientId/health", requireAdminAuth, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

    // PRODUCTION: Supabase is source of truth (admin must see persisted health data)
    if (isSupabaseEnabled()) {
      const clinicFilter = req.clinicId || null;
      const { data: p, error } = await fetchPatientHealthRowSupabase(patientId, clinicFilter);
      if (error) {
        console.error("[ADMIN HEALTH] Supabase fetch failed", {
          message: error.message,
          code: error.code,
          details: error.details,
        });
        if (isMissingColumnError(error, "health")) {
          return res.status(500).json({
            ok: false,
            error: "health_column_missing",
            message: "Supabase schema missing: patients.health. Run migration 004_add_patient_travel.sql",
          });
        }
        if (String(error.code || "") === "PGRST116") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(500).json({ ok: false, error: "health_fetch_failed" });
      }

      const health = isPlainObject(p?.health) ? p.health : {};
      return res.json({
        ok: true,
        formData: health.formData || {},
        isComplete: health.isComplete === true,
        completedAt: health.completedAt || null,
        updatedAt: health.updatedAt || null,
        createdAt: health.createdAt || null,
      });
    }

    if (!canUseFileFallback()) {
      console.error("[ADMIN HEALTH] Supabase disabled (file fallback disabled)");
      return res.status(500).json(supabaseDisabledPayload("health"));
    }

    // Legacy fallback (file-based) – dev only
    const patient = getPatientRecordById(patientId);
    if (!patient) return res.status(404).json({ ok: false, error: "patient_not_found" });
    const patientClinic = String(patient.clinicCode || patient.clinic_code || "").trim().toUpperCase();
    const clinicCode = String(req.clinicCode || "").trim().toUpperCase();
    if (clinicCode && patientClinic && clinicCode !== patientClinic) {
      return res.status(403).json({ ok: false, error: "patient_not_in_clinic" });
    }

    const HEALTH_DIR = ensureHealthDir();
    const filePath = path.join(HEALTH_DIR, `${patientId}.json`);
    if (!fs.existsSync(filePath)) {
      return res.json({ ok: true, formData: null, isComplete: false });
    }
    const data = readJson(filePath, {});
    return res.json({
      ok: true,
      formData: data.formData || {},
      isComplete: data.isComplete || false,
      completedAt: data.completedAt || null,
      updatedAt: data.updatedAt || null,
      createdAt: data.createdAt || null,
    });
  } catch (e) {
    console.error("[ADMIN HEALTH] GET error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// GET /api/health-form/schema
// Returns health form field definitions with language support (tr/en)
// Query parameter: ?lang=tr or ?lang=en
// Accept-Language header: Accept-Language: tr or Accept-Language: en
// Default: tr (Turkish)
app.get("/api/health-form/schema", (req, res) => {
  // Get language from query parameter first, then from Accept-Language header
  let lang = req.query.lang || "";
  if (!lang) {
    const acceptLang = req.headers["accept-language"] || "";
    // Extract language from Accept-Language header (e.g., "tr-TR,tr;q=0.9" -> "tr")
    if (acceptLang) {
      const langMatch = acceptLang.toLowerCase().match(/^([a-z]{2})/);
      if (langMatch) {
        lang = langMatch[1];
      }
    }
  }
  // Default to Turkish if no language specified
  if (!lang) lang = "tr";
  
  lang = lang.toLowerCase();
  // Only support tr and en, default to tr
  if (lang !== "en" && lang !== "tr") {
    lang = "tr";
  }
  const isEnglish = lang === "en";
  
  // Debug logging
  console.log(`[HEALTH-FORM-SCHEMA] Requested language: ${req.query.lang || "none"}, Accept-Language: ${req.headers["accept-language"] || "none"}, Final: ${lang}, isEnglish: ${isEnglish}`);
  
  // Helper function to get localized labels
  const t = (trLabel, enLabel) => isEnglish ? enLabel : trLabel;
  
  res.json({
    ok: true,
    schema: {
      personalInfo: {
        title: t("Kişisel Bilgiler", "Personal Information"),
        fields: {
          name: { label: t("Ad Soyad", "Full Name"), type: "text", required: true },
          birthDate: { label: t("Doğum Tarihi", "Date of Birth"), type: "date", required: true },
          gender: { 
            label: t("Cinsiyet", "Gender"), 
            type: "select", 
            options: isEnglish ? ["Male", "Female", "Other"] : ["Erkek", "Kadın", "Diğer"], 
            required: true 
          },
          phone: { label: t("Telefon", "Phone"), type: "tel", required: true },
          email: { label: t("E-posta", "Email"), type: "email", required: false },
          country: { label: t("Ülke", "Country"), type: "text", required: false }
        }
      },
      generalHealth: {
        title: t("Genel Sağlık Durumu", "General Health Status"),
        fields: {
          conditions: {
            label: t("Mevcut Durumlar", "Current Conditions"),
            type: "multiselect",
            options: [
              { value: "diabetes", label: t("Diyabet", "Diabetes") },
              { value: "heart_disease", label: t("Kalp Hastalığı", "Heart Disease") },
              { value: "hypertension", label: t("Hipertansiyon (Yüksek Tansiyon)", "Hypertension (High Blood Pressure)") },
              { value: "bleeding_disorder", label: t("Kanama / Pıhtılaşma Bozukluğu", "Bleeding / Clotting Disorder") },
              { value: "asthma", label: t("Astım / Solunum Hastalığı", "Asthma / Respiratory Disease") },
              { value: "epilepsy", label: t("Epilepsi", "Epilepsy") },
              { value: "kidney_disease", label: t("Böbrek Hastalığı", "Kidney Disease") },
              { value: "liver_disease", label: t("Karaciğer Hastalığı", "Liver Disease") },
              { value: "thyroid", label: t("Tiroid Hastalığı", "Thyroid Disease") },
              { value: "immune_system", label: t("Bağışıklık Sistemi Hastalığı", "Immune System Disease") },
              { value: "cancer", label: t("Kanser (Geçmiş veya Aktif)", "Cancer (Past or Active)") },
              { value: "pregnancy", label: t("Hamilelik", "Pregnancy") },
              { value: "none", label: t("Yok", "None") }
            ],
            required: false
          },
          pregnancyMonth: { label: t("Hamilelik Ayı", "Pregnancy Month"), type: "number", min: 1, max: 9, required: false },
          conditionsNotes: { label: t("Notlar", "Notes"), type: "textarea", required: false }
        }
      },
      medications: {
        title: t("İlaçlar", "Medications"),
        fields: {
          none: { label: t("İlaç kullanmıyor", "No medications"), type: "checkbox", required: false },
          regularMedication: { label: t("Düzenli ilaç kullanımı", "Regular medication"), type: "checkbox", required: false },
          bloodThinner: { label: t("Kan inceltici (Aspirin, Coumadin, Eliquis, vb.)", "Blood thinner (Aspirin, Coumadin, Eliquis, etc.)"), type: "checkbox", required: false },
          cortisone: { label: t("Kortizon", "Cortisone"), type: "checkbox", required: false },
          antibiotics: { label: t("Antibiyotik (son 1 ay içinde)", "Antibiotics (within last month)"), type: "checkbox", required: false },
          medicationDetails: { label: t("İlaç Detayları", "Medication Details"), type: "textarea", required: false }
        }
      },
      allergies: {
        title: t("Alerjiler", "Allergies"),
        fields: {
          none: { label: t("Alerji yok", "No allergies"), type: "checkbox", required: false },
          localAnesthesia: { label: t("Lokal anestezi alerjisi", "Allergy to local anesthesia"), type: "checkbox", required: false },
          penicillin: { label: t("Penisilin / antibiyotik alerjisi", "Penicillin / antibiotic allergy"), type: "checkbox", required: false },
          latex: { label: t("Lateks alerjisi", "Latex allergy"), type: "checkbox", required: false },
          other: { label: t("Diğer alerji", "Other allergy"), type: "checkbox", required: false },
          allergyDetails: { label: t("Alerji Detayları", "Allergy Details"), type: "textarea", required: false }
        }
      },
      dentalHistory: {
        title: t("Diş Geçmişi", "Dental History"),
        fields: {
          previousProblems: { label: t("Önceki diş tedavisinde sorun yaşandı mı", "Problems during previous dental treatment"), type: "boolean", required: false },
          anesthesiaProblems: { label: t("Lokal anestezi ile kötü deneyim", "Bad experience with local anesthesia"), type: "boolean", required: false },
          previousProcedures: { label: t("Önceki implant / kanal tedavisi / cerrahi işlem", "Previous implant / root canal / surgical procedure"), type: "boolean", required: false }
        }
      },
      complaint: {
        title: t("Şikayet", "Complaint"),
        fields: {
          mainComplaint: { label: t("Ana Şikayet", "Main Complaint"), type: "textarea", required: false },
          painLevel: {
            label: t("Ağrı Seviyesi", "Pain Level"),
            type: "select",
            options: [
              { value: "none", label: t("Yok", "None") },
              { value: "mild", label: t("Hafif", "Mild") },
              { value: "moderate", label: t("Orta", "Moderate") },
              { value: "severe", label: t("Şiddetli", "Severe") }
            ],
            required: false
          }
        }
      },
      habits: {
        title: t("Alışkanlıklar", "Habits"),
        fields: {
          smoking: { label: t("Sigara", "Smoking"), type: "boolean", required: false },
          cigarettesPerDay: { label: t("Günde sigara sayısı", "Cigarettes per day"), type: "number", min: 0, required: false },
          alcohol: {
            label: t("Alkol", "Alcohol"),
            type: "select",
            options: [
              { value: "none", label: t("Hayır", "No") },
              { value: "occasional", label: t("Ara Sıra", "Occasional") },
              { value: "regular", label: t("Düzenli", "Regular") }
            ],
            required: false
          }
        }
      },
      consent: {
        title: t("Onay", "Consent"),
        fields: {
          infoAccurate: { label: t("Verdiğim bilgilerin doğru olduğunu beyan ederim", "I declare that the information I provided is accurate"), type: "checkbox", required: true },
          planMayChange: { label: t("Muayene sonrası tedavi planının değişebileceğini kabul ediyorum", "I accept that the treatment plan may change after examination"), type: "checkbox", required: true },
          dataUsage: { label: t("Verilerimin tedavi amaçlı kullanımına onay veriyorum", "I consent to the use of my data for treatment purposes"), type: "checkbox", required: true }
        }
      }
    }
  });
});

// ================== ORAL HEALTH SCORE CALCULATION ==================
/**
 * Calculate oral health scores based on treatment plan
 * @param {string} patientId - Patient ID
 * @returns {{beforeScore: number, afterScore: number|null, completed: boolean}}
 */
function calculateOralHealthScore(patientId) {
  const BASE_SCORE = 100;
  
  // Penalty table based on procedure types
  const PENALTIES = {
    IMPLANT: 4,
    CROWN: 2,
    CROWN_REPLACEMENT: 2,
    TEMP_CROWN: 2,
    ROOT_CANAL_TREATMENT: 2,
    ROOT_CANAL_RETREATMENT: 2,
    FILLING: 1,
    TEMP_FILLING: 1,
    EXTRACTION: 3,
    SURGICAL_EXTRACTION: 3,
    SINUS_LIFT: 2,
    BONE_GRAFT: 2,
    // Additional procedure types (lower penalty for minor procedures)
    BRIDGE_UNIT: 2,
    TEMP_BRIDGE_UNIT: 2,
    INLAY: 1,
    ONLAY: 1,
    OVERLAY: 1,
    POST_AND_CORE: 1,
    CANAL_OPENING: 1,
    CANAL_FILLING: 1,
    APICAL_RESECTION: 2,
    HEALING_ABUTMENT: 1,
    IMPLANT_CROWN: 1,
  };
  
  try {
    const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
    const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
    
    if (!fs.existsSync(treatmentsFile)) {
      // No treatment plan = perfect score
      return { beforeScore: 100, afterScore: null, completed: false };
    }
    
    const treatmentData = readJson(treatmentsFile, { teeth: [], formCompleted: false });
    const teeth = Array.isArray(treatmentData.teeth) ? treatmentData.teeth : [];
    
    // Count procedures by type
    const procedureCounts = {};
    let totalCompleted = 0;
    let totalProcedures = 0;
    
    teeth.forEach(tooth => {
      const procedures = Array.isArray(tooth.procedures) ? tooth.procedures : [];
      procedures.forEach(proc => {
        const type = String(proc.type || "").trim().toUpperCase();
        const status = String(proc.status || "PLANNED").trim().toUpperCase();
        
        if (type && status !== "CANCELLED") {
          procedureCounts[type] = (procedureCounts[type] || 0) + 1;
          totalProcedures++;
          
          if (status === "COMPLETED" || status === "DONE") {
            totalCompleted++;
          }
        }
      });
    });
    
    // Calculate before score (penalize for planned procedures)
    let totalPenalty = 0;
    Object.entries(procedureCounts).forEach(([type, count]) => {
      const penalty = PENALTIES[type] || 1; // Default penalty: 1
      totalPenalty += count * penalty;
    });
    
    const beforeScore = Math.max(0, Math.min(100, BASE_SCORE - totalPenalty));
    
    // Determine if treatment is completed
    // Treatment is considered completed ONLY if all procedures are COMPLETED
    // formCompleted only means the form was filled, not that all procedures are done
    const allCompleted = totalProcedures > 0 && totalCompleted === totalProcedures;
    const isCompleted = allCompleted; // Only true when ALL procedures are COMPLETED
    
    // Calculate after score
    let afterScore = null;
    if (isCompleted) {
      // If completed: afterScore should be higher than beforeScore
      // Give bonus for completed procedures (improvement factor)
      const improvementBonus = Math.min(20, totalProcedures * 5); // Max 20 bonus, 5 per procedure
      afterScore = Math.max(0, Math.min(100, beforeScore + improvementBonus));
      // Ensure afterScore is at least 92 if treatment is completed (minimum quality standard)
      afterScore = Math.max(92, afterScore);
    } else if (totalProcedures > 0) {
      // If in progress: beforeScore + partial improvement (based on completion ratio)
      const completionRatio = totalCompleted / totalProcedures;
      const partialImprovement = Math.min(20, totalProcedures * 5) * completionRatio;
      afterScore = Math.max(0, Math.min(100, beforeScore + partialImprovement));
    }
    
    return {
      beforeScore: Math.round(beforeScore * 10) / 10, // Round to 1 decimal
      afterScore: afterScore !== null ? Math.round(afterScore * 10) / 10 : null,
      completed: isCompleted
    };
  } catch (error) {
    console.error(`[ORAL_HEALTH_SCORE] Error calculating score for ${patientId}:`, error);
    // Return default scores on error
    return { beforeScore: 100, afterScore: null, completed: false };
  }
}

/**
 * Update patient's oral health scores in PAT_FILE
 * @param {string} patientId - Patient ID
 */
function updatePatientOralHealthScores(patientId) {
  try {
    const scores = calculateOralHealthScore(patientId);
    const patients = readJson(PAT_FILE, {});
    
    if (patients[patientId]) {
      patients[patientId].beforeScore = scores.beforeScore;
      patients[patientId].afterScore = scores.afterScore;
      patients[patientId].oralHealthCompleted = scores.completed;
      patients[patientId].updatedAt = now();
      writeJson(PAT_FILE, patients);
      console.log(`[ORAL_HEALTH_SCORE] Updated scores for ${patientId}: before=${scores.beforeScore}, after=${scores.afterScore || "N/A"}`);
    }
  } catch (error) {
    console.error(`[ORAL_HEALTH_SCORE] Error updating scores for ${patientId}:`, error);
  }
}

// ================== PATIENT TREATMENTS ==================
// GET /api/patient/:patientId/treatments
// Optional auth: Admin token OR patient token accepted
app.get("/api/patient/:patientId/treatments", async (req, res, next) => {
  const patientId = req.params.patientId;
  const method = req.method;
  const url = req.url;
  const headers = req.headers;
  
  console.log(`[TREATMENTS GET] ========== START ==========`);
  console.log(`[TREATMENTS GET] Method: ${method}`);
  console.log(`[TREATMENTS GET] URL: ${url}`);
  console.log(`[TREATMENTS GET] Request for patientId: ${patientId}`);
  console.log(`[TREATMENTS GET] Headers:`, {
    authorization: headers.authorization ? "present" : "missing",
    "x-patient-token": headers["x-patient-token"] ? "present" : "missing",
    origin: headers.origin,
    "user-agent": headers["user-agent"]?.substring(0, 50),
  });
  
  // Optional auth: Try admin token first, then patient token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Check if it's an admin token (has clinicCode)
      if (decoded.clinicCode) {
        console.log(`[TREATMENTS GET] Admin token detected, clinicCode: ${decoded.clinicCode}`);
        // Use requireAdminToken logic
        const clinicCode = decoded.clinicCode;
        if (isSupabaseEnabled()) {
          const clinic = await getClinicByCode(clinicCode);
          if (clinic) {
            req.clinicId = clinic.id;
            req.clinicCode = clinic.clinic_code;
            req.clinicStatus = clinic.settings?.status || "ACTIVE";
            req.clinic = clinic;
            req.isAdmin = true;
            console.log(`[TREATMENTS GET] ✅ Admin auth successful`);
            return next();
          }
        }
        // File fallback for admin
        const clinics = readJson(CLINICS_FILE, {});
        const code = String(clinicCode).toUpperCase();
        for (const cid in clinics) {
          const c = clinics[cid];
          if (c && (c.clinicCode || c.code) && String(c.clinicCode || c.code).toUpperCase() === code) {
            req.clinicId = cid;
            req.clinicCode = c.clinicCode || c.code;
            req.clinicStatus = c.status || "ACTIVE";
            req.clinic = c;
            req.isAdmin = true;
            console.log(`[TREATMENTS GET] ✅ Admin auth successful (file)`);
            return next();
          }
        }
      }
      
      // Check if it's a patient token (has patientId)
      if (decoded.patientId) {
        console.log(`[TREATMENTS GET] Patient token detected, patientId: ${decoded.patientId}`);
        // Verify patient can only access their own treatments
        if (decoded.patientId !== patientId) {
          return res.status(403).json({ ok: false, error: "patient_id_mismatch", message: "Bu hasta bilgilerine erişim yetkiniz yok." });
        }
        req.patientId = decoded.patientId;
        req.isAdmin = false;
        console.log(`[TREATMENTS GET] ✅ Patient auth successful`);
        return next();
      }
    } catch (jwtError) {
      // JWT verification failed, try patient token fallback
      console.log(`[TREATMENTS GET] JWT verification failed, trying patient token fallback`);
    }
  }
  
  // Try patient token (legacy tokens.json)
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const altToken = req.headers["x-patient-token"] || "";
  const finalToken = token || altToken;
  
  if (finalToken) {
    const tokens = readJson(TOK_FILE, {});
    const t = tokens[finalToken];
    if (t?.patientId) {
      if (t.patientId !== patientId) {
        return res.status(403).json({ ok: false, error: "patient_id_mismatch", message: "Bu hasta bilgilerine erişim yetkiniz yok." });
      }
      req.patientId = t.patientId;
      req.isAdmin = false;
      console.log(`[TREATMENTS GET] ✅ Patient auth successful (legacy token)`);
      return next();
    }
  }
  
  // No valid token found
  console.log(`[TREATMENTS GET] ❌ No valid token found`);
  return res.status(401).json({ ok: false, error: "unauthorized", message: "Token bulunamadı veya geçersiz." });
}, async (req, res) => {
  // Continue with endpoint logic
  const patientId = req.params.patientId;

  // Do not read from disk unless explicitly enabled
  if (!isSupabaseEnabled() && !canUseFileFallback()) {
    console.error("[TREATMENTS] Supabase disabled (file fallback disabled)");
    return res.status(500).json(supabaseDisabledPayload("treatments"));
  }

  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) {
    console.log(`[TREATMENTS GET] Creating treatments directory: ${TREATMENTS_DIR}`);
    fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  }

  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  console.log(`[TREATMENTS GET] Treatments file path: ${treatmentsFile}`);
  console.log(`[TREATMENTS GET] File exists: ${fs.existsSync(treatmentsFile)}`);

  const defaultData = {
    schemaVersion: 1,
    updatedAt: now(),
    patientId,
    teeth: [],
    formCompleted: false,
    formCompletedAt: null,
  };

  const warnings = [];
  let source = defaultData;

  if (isSupabaseEnabled()) {
    try {
      const clinicFilter = req.isAdmin ? req.clinicId : null;
      const { data: row, error } = await fetchPatientTreatmentsRowSupabase(patientId, clinicFilter);
      if (error) {
        if (isMissingColumnError(error, "treatments")) {
          return res.status(500).json({
            ok: false,
            error: "treatments_column_missing",
            message: "Supabase schema missing: patients.treatments. Apply migration to add treatments JSONB column.",
            supabase: supabaseErrorPublic(error),
          });
        }
        if (String(error.code || "") === "PGRST116") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        console.error("[TREATMENTS GET] Supabase fetch failed", {
          message: error.message,
          code: error.code,
          details: error.details,
        });
        return res.status(500).json({ ok: false, error: "treatments_fetch_failed" });
      }

      const supaPayload = isPlainObject(row?.treatments) ? row.treatments : null;
      const hasSupabaseTeeth = Array.isArray(supaPayload?.teeth) && supaPayload.teeth.length > 0;

      if (!hasSupabaseTeeth && canUseFileFallback() && fs.existsSync(treatmentsFile)) {
        const filePayload = readJson(treatmentsFile, defaultData);
        if (isPlainObject(filePayload)) {
          try {
            await updatePatient(patientId, { treatments: filePayload });
            source = filePayload;
            warnings.push("treatments_migrated_from_file");
          } catch (e) {
            console.error("[TREATMENTS GET] Supabase migration from file failed", {
              message: e?.message || e,
            });
            source = supaPayload || defaultData;
          }
        } else {
          source = supaPayload || defaultData;
        }
      } else {
        source = supaPayload || defaultData;
      }
    } catch (e) {
      console.error("[TREATMENTS GET] Supabase fetch exception:", e?.message || e);
      return res.status(500).json({ ok: false, error: "treatments_fetch_failed" });
    }
  } else if (canUseFileFallback()) {
    source = readJson(treatmentsFile, defaultData);
  }

  const data = deepMerge(defaultData, source);
  if (warnings.length > 0) {
    data.warning = warnings.join(",");
  }
  
  // Ensure data structure is correct
  if (!data.patientId) {
    data.patientId = patientId;
  }
  if (!Array.isArray(data.teeth)) {
    data.teeth = [];
  }
  
  // Ensure each tooth has correct structure
  data.teeth = data.teeth.map(tooth => {
    if (!tooth.procedures || !Array.isArray(tooth.procedures)) {
      tooth.procedures = [];
    }
    // Ensure procedures have required fields
    tooth.procedures = tooth.procedures.map(proc => {
      const procId = proc.procedureId || proc.id || `${patientId}-${tooth.toothId}-${proc.createdAt || now()}`;
      const type = procedures.normalizeType(proc.type || "");
      const status = procedures.normalizeStatus(proc.status || "PLANNED");
      const category = procedures.categoryForType(type);
      return {
        id: procId, // backward compatibility
        procedureId: procId,
        type,
        category,
        status,
        scheduledAt: proc.scheduledAt ?? null,
        date: proc.date ?? (proc.scheduledAt ?? null),
        notes: proc.notes || "",
        meta: proc.meta || {},
        replacesProcedureId: proc.replacesProcedureId,
        createdAt: proc.createdAt || now(),
        ...proc // Keep any additional fields
      };
    });
    tooth.locked = procedures.isToothLocked(tooth.procedures);
    return tooth;
  });
  
  // Check if form is completed (backward compatibility)
  // Form is considered complete if at least one procedure exists
  if (data.formCompleted === undefined) {
    const totalProcedures = data.teeth?.reduce((sum, t) => sum + (t.procedures?.length || 0), 0) || 0;
    data.formCompleted = totalProcedures > 0;
    if (data.formCompleted && !data.formCompletedAt) {
      data.formCompletedAt = data.updatedAt || now();
    }
  }
  
  // Ensure formCompleted and formCompletedAt fields exist
  if (data.formCompleted === undefined) {
    data.formCompleted = false;
  }
  if (data.formCompleted && !data.formCompletedAt) {
    data.formCompletedAt = data.updatedAt || now();
  }
  
  const teethCount = data.teeth?.length || 0;
  const totalProcedures = data.teeth?.reduce((sum, t) => sum + (t.procedures?.length || 0), 0) || 0;
  
  console.log(`[TREATMENTS GET] Response data:`, {
    patientId: data.patientId,
    teethCount,
    totalProcedures,
    formCompleted: data.formCompleted,
    formCompletedAt: data.formCompletedAt,
    sampleTooth: data.teeth[0] || null,
  });
  
  // Log full teeth array for debugging
  console.log(`[TREATMENTS GET] Full teeth array:`, JSON.stringify(data.teeth, null, 2));
  
  // Load treatment events from dedicated store (independent from travel)
  let treatmentEvents = [];
  let clinicIdForPrices = req.isAdmin ? req.clinicId : null;
  if (isSupabaseEnabled()) {
    try {
      const clinicFilter = req.isAdmin ? req.clinicId : null;
      if (!clinicIdForPrices) {
        try {
          const patient = await getPatientById(patientId);
          clinicIdForPrices = patient?.clinic_id || null;
        } catch {}
      }
      const { data: row, error } = await fetchPatientTreatmentEventsRowSupabase(patientId, clinicFilter);
      if (!error) {
        treatmentEvents = Array.isArray(row?.treatment_events) ? row.treatment_events : [];
      } else {
        console.error("[TREATMENTS GET] treatment_events fetch failed (ignored)", {
          message: error.message,
          code: error.code,
          details: error.details,
        });
      }
    } catch (e) {
      console.error("[TREATMENTS GET] treatment_events fetch exception (ignored):", e?.message || e);
    }
  } else if (canUseFileFallback()) {
    try {
      const eventsFile = path.join(TREATMENTS_DIR, `${patientId}.events.json`);
      const ev = readJson(eventsFile, []);
      treatmentEvents = Array.isArray(ev) ? ev : [];
    } catch {}
  }

  if (isSupabaseEnabled() && clinicIdForPrices) {
    const priceMap = await fetchTreatmentPricesMap(clinicIdForPrices);
    data.events = applyEventPrices(treatmentEvents, priceMap);
  } else {
    data.events = treatmentEvents;
  }
  
  console.log(`[TREATMENTS GET] ========== END ==========`);
  
  // Return data directly (matching the format saved by POST)
  res.json(data);
});

// POST /api/patient/:patientId/treatments
app.post("/api/patient/:patientId/treatments", async (req, res) => {
  const patientId = req.params.patientId;
  console.log(`[TREATMENTS POST] ========== START ==========`);
  console.log(`[TREATMENTS POST] Request for patientId: ${patientId}`);
  console.log(`[TREATMENTS POST] Request body:`, JSON.stringify(req.body, null, 2));
  
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  console.log(`[TREATMENTS POST] Treatments file path: ${treatmentsFile}`);
  const existing = await loadExistingTreatmentsPayload(
    patientId,
    req.isAdmin ? req.clinicId : null,
    treatmentsFile,
    { teeth: [] }
  );
  console.log(`[TREATMENTS POST] Existing data:`, {
    teethCount: existing.teeth?.length || 0,
    totalProcedures: existing.teeth?.reduce((sum, t) => sum + (t.procedures?.length || 0), 0) || 0,
  });
  
  // Client format: { toothId, procedure: { procedureId/id, type, category?, status, date/scheduledAt, notes, meta, replacesProcedureId } }
  const { toothId, procedure } = req.body || {};
  
  console.log(`[TREATMENTS POST] Request body procedure:`, {
    type: procedure?.type,
    status: procedure?.status,
    scheduledAt: procedure?.scheduledAt,
    createdAt: procedure?.createdAt
  });
  
  if (!toothId || !procedure) {
    console.log(`[TREATMENTS POST] Missing required fields: toothId=${!!toothId}, procedure=${!!procedure}`);
    return res.status(400).json({ ok: false, error: "toothId and procedure required" });
  }
  
  // Mevcut teeth array'ini al
  let teeth = Array.isArray(existing.teeth) ? existing.teeth : [];
  
  // Bu toothId için mevcut tooth'u bul veya yeni oluştur
  let tooth = teeth.find((t) => String(t.toothId) === String(toothId));
  
  if (!tooth) {
    tooth = { toothId: String(toothId), procedures: [] };
    teeth.push(tooth);
    console.log(`[TREATMENTS POST] Created new tooth entry: ${toothId}`);
  } else {
    console.log(`[TREATMENTS POST] Found existing tooth: ${toothId}, current procedures: ${tooth.procedures?.length || 0}`);
  }
  
  if (!Array.isArray(tooth.procedures)) tooth.procedures = [];

  const incomingId = String(procedure.procedureId || procedure.id || "").trim();
  const procedureIdFinal = incomingId || rid(`proc_${patientId}_${toothId}`);
  const createdAtFinal = procedure.createdAt ? Number(procedure.createdAt) : now();
  const typeFinal = procedures.normalizeType(procedure.type || "");
  const statusFinal = procedures.normalizeStatus(procedure.status || "PLANNED");
  const categoryFinal = procedures.categoryForType(typeFinal);
  const dateFinal = procedures.normalizeDate(procedure.date ?? procedure.scheduledAt);

  const validation = procedures.validateToothUpsert(tooth.procedures, {
    procedureId: procedureIdFinal,
    type: typeFinal,
    status: statusFinal,
    category: categoryFinal,
    date: dateFinal,
    notes: procedure.notes || "",
    meta: procedure.meta || {},
    replacesProcedureId: procedure.replacesProcedureId,
    createdAt: createdAtFinal,
  });
  if (!validation.ok) {
    return res.status(409).json({ ok: false, error: validation.error, ...validation });
  }

  // Extract pricing fields (optional)
  const unitPrice = procedure.unit_price !== undefined ? Number(procedure.unit_price) : null;
  const quantity = procedure.quantity !== undefined ? Number(procedure.quantity) : 1;
  const totalPrice = procedure.total_price !== undefined ? Number(procedure.total_price) : (unitPrice !== null ? unitPrice * quantity : null);
  const currency = procedure.currency ? String(procedure.currency).trim().toUpperCase() : null;

  // Upsert by procedureId (history preserved; no hard limit)
  const existingProc = tooth.procedures.find((p) => String(p.procedureId || p.id || "") === procedureIdFinal);
  if (existingProc) {
    existingProc.id = procedureIdFinal;
    existingProc.procedureId = procedureIdFinal;
    existingProc.type = typeFinal;
    existingProc.category = categoryFinal;
    existingProc.status = statusFinal;
    existingProc.scheduledAt = dateFinal;
    existingProc.date = dateFinal;
    existingProc.notes = String(procedure.notes || existingProc.notes || "");
    existingProc.meta = procedure.meta || existingProc.meta || {};
    existingProc.replacesProcedureId = procedure.replacesProcedureId || existingProc.replacesProcedureId;
    // Update pricing fields if provided
    if (unitPrice !== null) existingProc.unit_price = unitPrice;
    if (procedure.quantity !== undefined) existingProc.quantity = quantity;
    if (totalPrice !== null) existingProc.total_price = totalPrice;
    if (currency) existingProc.currency = currency;
    // keep createdAt unless explicitly provided
    if (!existingProc.createdAt) existingProc.createdAt = createdAtFinal;
  } else {
    const newProc = {
      id: procedureIdFinal,
      procedureId: procedureIdFinal,
      type: typeFinal,
      category: categoryFinal,
      status: statusFinal,
      scheduledAt: dateFinal,
      date: dateFinal,
      notes: String(procedure.notes || ""),
      meta: procedure.meta || {},
      replacesProcedureId: procedure.replacesProcedureId,
      createdAt: createdAtFinal,
    };
    // Add pricing fields if provided
    if (unitPrice !== null) newProc.unit_price = unitPrice;
    if (procedure.quantity !== undefined) newProc.quantity = quantity;
    if (totalPrice !== null) newProc.total_price = totalPrice;
    if (currency) newProc.currency = currency;
    tooth.procedures.push(newProc);
  }
  
  // Check if form is completed
  // Form is considered complete if at least one procedure exists
  const totalProcedures = teeth.reduce((sum, t) => sum + (t.procedures?.length || 0), 0);
  const isFormCompleted = totalProcedures > 0;
  
  // Güncellenmiş data
  const payload = {
    schemaVersion: existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    teeth,
    formCompleted: isFormCompleted,
  };
  
  // Set formCompletedAt if form is completed for the first time
  if (isFormCompleted && !existing.formCompletedAt) {
    // First time completion
    payload.formCompletedAt = now();
  } else if (isFormCompleted && existing.formCompletedAt) {
    // Already completed, keep original completion time
    payload.formCompletedAt = existing.formCompletedAt;
  } else if (!isFormCompleted) {
    // Not completed, remove completion time
    payload.formCompletedAt = null;
  }

  // SUPABASE: Update patient treatments data (PRIMARY - production source of truth)
  if (isSupabaseEnabled()) {
    try {
      console.log(`[TREATMENTS POST] Updating treatments data in Supabase...`);
      const result = await saveTreatmentsSupabaseWithFallback(patientId, payload, "clinic");
      if (!result.ok) throw result.error;
      console.log(
        `[TREATMENTS POST] ✅ Treatments data updated in Supabase${result.usedFallback ? " (fallback:v1)" : ""}`
      );
    } catch (supabaseError) {
      console.error("[TREATMENTS] Supabase save failed", {
        message: supabaseError?.message,
        code: supabaseError?.code,
        details: supabaseError?.details,
      });
      return res.status(500).json({ ok: false, error: "treatments_save_failed", supabase: supabaseErrorPublic(supabaseError) });
    }

    // Best-effort sync: also persist v1 model into patients.treatment (new column) without breaking legacy UI
    try {
      const patchV1 = legacyTreatmentsToTreatmentV1(payload, "clinic");
      const { data: p, error: fetchErr } = await fetchPatientTreatmentRowSupabase(patientId, null);
      if (fetchErr) {
        console.error("[TREATMENTS POST] treatment(v1) fetch failed (ignored)", {
          message: fetchErr.message,
          code: fetchErr.code,
          details: fetchErr.details,
        });
      } else {
        const existingV1 = isPlainObject(p?.treatment) ? p.treatment : {};
        const mergedV1 = deepMerge(existingV1, patchV1);
        mergedV1.lastUpdatedAt = new Date().toISOString();
        const { error: saveErr } = await updatePatientTreatmentRowSupabase(patientId, null, mergedV1);
        if (saveErr) {
          console.error("[TREATMENTS POST] treatment(v1) save failed (ignored)", {
            message: saveErr.message,
            code: saveErr.code,
            details: saveErr.details,
          });
        }
      }
    } catch (e) {
      console.error("[TREATMENTS POST] treatment(v1) sync exception (ignored):", e?.message || e);
    }
    console.log(`[TREATMENTS POST] ========== END ==========`);
  } else {
    if (!canUseFileFallback()) {
      console.error("[TREATMENTS] Supabase disabled (file fallback disabled)");
      return res.status(500).json(supabaseDisabledPayload("treatments"));
    }

    // FILE-BASED: Fallback storage (only when Supabase disabled)
    writeJson(treatmentsFile, payload);
    console.log(`[TREATMENTS POST] ========== END ==========`);
  }
  
  // Update patient oral health scores after treatment plan change
  updatePatientOralHealthScores(patientId);
  
  // Return the updated data in the same format as GET endpoint
  res.json({ ok: true, saved: true, treatments: payload, teeth: payload.teeth });
});

// PUT /api/patient/:patientId/treatments/:procedureId
app.put("/api/patient/:patientId/treatments/:procedureId", async (req, res) => {
  const patientId = req.params.patientId;
  const procedureId = req.params.procedureId;
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  const existing = await loadExistingTreatmentsPayload(
    patientId,
    req.isAdmin ? req.clinicId : null,
    treatmentsFile,
    { teeth: [] }
  );
  
  let teeth = Array.isArray(existing.teeth) ? existing.teeth : [];
  let found = false;
  
  // Procedure'ü bul ve güncelle
  for (const tooth of teeth) {
    if (Array.isArray(tooth.procedures)) {
      for (const proc of tooth.procedures) {
        if (String(proc.id) === String(procedureId)) {
          const nextType = procedures.normalizeType(req.body?.type || proc.type);
          const nextStatus = procedures.normalizeStatus(req.body?.status || proc.status);
          const nextCategory = procedures.categoryForType(nextType);
          const nextDate = procedures.normalizeDate(req.body?.date ?? req.body?.scheduledAt ?? proc.scheduledAt);

          const validation = procedures.validateToothUpsert(tooth.procedures, {
            procedureId: String(proc.procedureId || proc.id || procedureId),
            type: nextType,
            status: nextStatus,
            category: nextCategory,
            date: nextDate,
            notes: req.body?.notes || proc.notes || "",
            meta: req.body?.meta || proc.meta || {},
            replacesProcedureId: req.body?.replacesProcedureId || proc.replacesProcedureId,
            createdAt: proc.createdAt || now(),
          });
          if (!validation.ok) {
            return res.status(409).json({ ok: false, error: validation.error, ...validation });
          }

          proc.id = String(proc.procedureId || proc.id || procedureId);
          proc.procedureId = proc.id;
          proc.type = nextType;
          proc.category = nextCategory;
          proc.status = nextStatus;
          proc.scheduledAt = nextDate;
          proc.date = nextDate;
          proc.notes = String(req.body?.notes || proc.notes || "");
          proc.meta = req.body?.meta || proc.meta || {};
          proc.replacesProcedureId = req.body?.replacesProcedureId || proc.replacesProcedureId;
          found = true;
          break;
        }
      }
    }
    if (found) break;
  }
  
  if (!found) {
    return res.status(404).json({ ok: false, error: "Procedure not found" });
  }
  
  // Check if form is completed
  // Form is considered complete if at least one procedure exists
  const totalProcedures = teeth.reduce((sum, t) => sum + (t.procedures?.length || 0), 0);
  const isFormCompleted = totalProcedures > 0;
  
  const payload = {
    schemaVersion: existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    teeth,
    formCompleted: isFormCompleted,
  };
  
  // Set formCompletedAt if form is completed for the first time
  if (isFormCompleted && !existing.formCompletedAt) {
    // First time completion
    payload.formCompletedAt = now();
  } else if (isFormCompleted && existing.formCompletedAt) {
    // Already completed, keep original completion time
    payload.formCompletedAt = existing.formCompletedAt;
  } else if (!isFormCompleted) {
    // Not completed, remove completion time
    payload.formCompletedAt = null;
  }

  // SUPABASE: Update patient treatments data (PRIMARY - production source of truth)
  if (isSupabaseEnabled()) {
    try {
      console.log(`[TREATMENTS PUT] Updating treatments data in Supabase...`);
      const result = await saveTreatmentsSupabaseWithFallback(patientId, payload, "clinic");
      if (!result.ok) throw result.error;
      console.log(
        `[TREATMENTS PUT] ✅ Treatments data updated in Supabase${result.usedFallback ? " (fallback:v1)" : ""}`
      );
    } catch (supabaseError) {
      console.error("[TREATMENTS] Supabase save failed", {
        message: supabaseError?.message,
        code: supabaseError?.code,
        details: supabaseError?.details,
      });
      return res.status(500).json({ ok: false, error: "treatments_save_failed", supabase: supabaseErrorPublic(supabaseError) });
    }

    // Best-effort sync: also persist v1 model into patients.treatment (new column) without breaking legacy UI
    try {
      const patchV1 = legacyTreatmentsToTreatmentV1(payload, "clinic");
      const { data: p, error: fetchErr } = await fetchPatientTreatmentRowSupabase(patientId, null);
      if (fetchErr) {
        console.error("[TREATMENTS PUT] treatment(v1) fetch failed (ignored)", {
          message: fetchErr.message,
          code: fetchErr.code,
          details: fetchErr.details,
        });
      } else {
        const existingV1 = isPlainObject(p?.treatment) ? p.treatment : {};
        const mergedV1 = deepMerge(existingV1, patchV1);
        mergedV1.lastUpdatedAt = new Date().toISOString();
        const { error: saveErr } = await updatePatientTreatmentRowSupabase(patientId, null, mergedV1);
        if (saveErr) {
          console.error("[TREATMENTS PUT] treatment(v1) save failed (ignored)", {
            message: saveErr.message,
            code: saveErr.code,
            details: saveErr.details,
          });
        }
      }
    } catch (e) {
      console.error("[TREATMENTS PUT] treatment(v1) sync exception (ignored):", e?.message || e);
    }
  } else {
    if (!canUseFileFallback()) {
      console.error("[TREATMENTS] Supabase disabled (file fallback disabled)");
      return res.status(500).json(supabaseDisabledPayload("treatments"));
    }

    // FILE-BASED: Fallback storage (only when Supabase disabled)
    writeJson(treatmentsFile, payload);
  }
  
  // Update patient oral health scores after treatment plan update
  updatePatientOralHealthScores(patientId);
  
  res.json({ ok: true, updated: true, treatments: payload });
});

// DELETE /api/patient/:patientId/treatments/:procedureId
app.delete("/api/patient/:patientId/treatments/:procedureId", async (req, res) => {
  const patientId = req.params.patientId;
  const procedureId = req.params.procedureId;
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  const existing = await loadExistingTreatmentsPayload(
    patientId,
    req.isAdmin ? req.clinicId : null,
    treatmentsFile,
    { teeth: [] }
  );
  
  let teeth = Array.isArray(existing.teeth) ? existing.teeth : [];
  let found = false;
  
  // Procedure history is preserved: "delete" becomes CANCELLED
  for (const tooth of teeth) {
    if (Array.isArray(tooth.procedures)) {
      for (const proc of tooth.procedures) {
        const pid = String(proc.procedureId || proc.id || "");
        if (pid === String(procedureId)) {
          proc.status = "CANCELLED";
          found = true;
          break;
        }
      }
    }
    if (found) break;
  }
  
  if (!found) {
    return res.status(404).json({ ok: false, error: "Procedure not found" });
  }
  
  // Check if form is completed
  // Form is considered complete if at least one procedure exists
  const totalProcedures = teeth.reduce((sum, t) => sum + (t.procedures?.length || 0), 0);
  const isFormCompleted = totalProcedures > 0;
  
  const payload = {
    schemaVersion: existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    teeth,
    formCompleted: isFormCompleted,
  };
  
  // Set formCompletedAt if form is completed for the first time
  if (isFormCompleted && !existing.formCompletedAt) {
    // First time completion
    payload.formCompletedAt = now();
  } else if (isFormCompleted && existing.formCompletedAt) {
    // Already completed, keep original completion time
    payload.formCompletedAt = existing.formCompletedAt;
  } else if (!isFormCompleted) {
    // Not completed, remove completion time
    payload.formCompletedAt = null;
  }

  // SUPABASE: Update patient treatments data (PRIMARY - production source of truth)
  if (isSupabaseEnabled()) {
    try {
      console.log(`[TREATMENTS DELETE] Updating treatments data in Supabase...`);
      const result = await saveTreatmentsSupabaseWithFallback(patientId, payload, "clinic");
      if (!result.ok) throw result.error;
      console.log(
        `[TREATMENTS DELETE] ✅ Treatments data updated in Supabase${result.usedFallback ? " (fallback:v1)" : ""}`
      );
    } catch (supabaseError) {
      console.error("[TREATMENTS] Supabase save failed", {
        message: supabaseError?.message,
        code: supabaseError?.code,
        details: supabaseError?.details,
      });
      return res.status(500).json({ ok: false, error: "treatments_save_failed", supabase: supabaseErrorPublic(supabaseError) });
    }

    // Best-effort sync: also persist v1 model into patients.treatment (new column) without breaking legacy UI
    try {
      const patchV1 = legacyTreatmentsToTreatmentV1(payload, "clinic");
      const { data: p, error: fetchErr } = await fetchPatientTreatmentRowSupabase(patientId, null);
      if (fetchErr) {
        console.error("[TREATMENTS DELETE] treatment(v1) fetch failed (ignored)", {
          message: fetchErr.message,
          code: fetchErr.code,
          details: fetchErr.details,
        });
      } else {
        const existingV1 = isPlainObject(p?.treatment) ? p.treatment : {};
        const mergedV1 = deepMerge(existingV1, patchV1);
        mergedV1.lastUpdatedAt = new Date().toISOString();
        const { error: saveErr } = await updatePatientTreatmentRowSupabase(patientId, null, mergedV1);
        if (saveErr) {
          console.error("[TREATMENTS DELETE] treatment(v1) save failed (ignored)", {
            message: saveErr.message,
            code: saveErr.code,
            details: saveErr.details,
          });
        }
      }
    } catch (e) {
      console.error("[TREATMENTS DELETE] treatment(v1) sync exception (ignored):", e?.message || e);
    }
  } else {
    if (!canUseFileFallback()) {
      console.error("[TREATMENTS] Supabase disabled (file fallback disabled)");
      return res.status(500).json(supabaseDisabledPayload("treatments"));
    }

    // FILE-BASED: Fallback storage (only when Supabase disabled)
    writeJson(treatmentsFile, payload);
  }
  
  // Update patient oral health scores after procedure deletion
  updatePatientOralHealthScores(patientId);
  
  res.json({ ok: true, deleted: true, treatments: payload });
});

// ================== CHAT MESSAGES ==================
// GET /api/patient/me/messages (mobile convenience)
app.get("/api/patient/me/messages", requireToken, (req, res) => {
  try {
    const patientId = String(req.patientId || "").trim();
    if (!patientId) return res.status(401).json({ ok: false, error: "unauthorized" });

    if (isSupabaseEnabled()) {
      fetchMessagesFromSupabase(patientId)
        .then(({ data, error }) => {
          if (error) {
            const supabasePublic = supabaseErrorPublic(error);
            console.error("[MESSAGES] Supabase fetch failed", {
              message: error.message,
              code: error.code,
              details: error.details,
            });
            if (isMissingTableError(error, "messages")) {
              return res.status(500).json({
                ok: false,
                error: "messages_table_missing",
                message: "Supabase schema missing: messages table. Run migration 008_create_messages_table.sql",
                supabase: supabasePublic,
              });
            }
            return res.status(500).json({ ok: false, error: "messages_fetch_failed", supabase: supabasePublic });
          }
          const messages = (data || []).map(mapDbMessageToLegacyMessage).filter(Boolean);
          return res.json({ ok: true, messages });
        })
        .catch((e) => {
          console.error("[MESSAGES] Supabase fetch exception:", e);
          return res.status(500).json({ ok: false, error: "messages_fetch_failed", exception: String(e?.message || e) });
        });
      return;
    }

    if (!canUseFileFallback()) {
      return res.status(500).json(supabaseDisabledPayload("messages"));
    }

    const CHAT_DIR = path.join(DATA_DIR, "chats");
    if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });

    const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
    const existing = readJson(chatFile, { messages: [] });
    const messages = Array.isArray(existing.messages) ? existing.messages : [];
    return res.json({ ok: true, messages });
  } catch (error) {
    console.error("[GET /api/patient/me/messages] Error:", error);
    return res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/patient/me/messages (mobile convenience)
app.post("/api/patient/me/messages", requireToken, (req, res) => {
  try {
    const patientId = String(req.patientId || "").trim();
    if (!patientId) return res.status(401).json({ ok: false, error: "unauthorized" });

    const body = req.body || {};
    const text = String(body.text || "").trim();
    const msgType = String(body.type || "text").trim() || "text";
    if (!text) return res.status(400).json({ ok: false, error: "text_required" });

    if (!isSupabaseEnabled()) {
      if (!canUseFileFallback()) return res.status(500).json(supabaseDisabledPayload("messages"));
      // dev fallback
      const CHAT_DIR = path.join(DATA_DIR, "chats");
      if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
      const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
      const existing = readJson(chatFile, { messages: [] });
      const messages = Array.isArray(existing.messages) ? existing.messages : [];
      const newMessage = {
        id: `msg_${now()}_${crypto.randomBytes(4).toString("hex")}`,
        text,
        from: "PATIENT",
        createdAt: now(),
        patientId,
      };
      messages.push(newMessage);
      writeJson(chatFile, { patientId, messages, updatedAt: now() });
      return res.json({ ok: true, message: newMessage });
    }

    insertMessageToSupabase({ patientId, sender: "patient", message: text, attachments: null, type: msgType })
      .then(({ data, error }) => {
        if (error) {
          const supabasePublic = supabaseErrorPublic(error);
          console.error("[MESSAGES] Supabase save failed", {
            message: error.message,
            code: error.code,
            details: error.details,
          });
          if (isMissingTableError(error, "messages")) {
            return res.status(500).json({
              ok: false,
              error: "messages_table_missing",
              message: "Supabase schema missing: messages table. Run migration 008_create_messages_table.sql",
              supabase: supabasePublic,
            });
          }
          return res.status(500).json({ ok: false, error: "messages_save_failed", supabase: supabasePublic });
        }
        const msg = mapDbMessageToLegacyMessage(data);
        return res.json({ ok: true, message: msg || { text, from: "PATIENT", createdAt: now(), patientId } });
      })
      .catch((e) => {
        console.error("[MESSAGES] Supabase save exception:", e);
        return res.status(500).json({ ok: false, error: "messages_save_failed", exception: String(e?.message || e) });
      });
  } catch (error) {
    console.error("[POST /api/patient/me/messages] Error:", error);
    return res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/patient/:patientId/messages
app.get("/api/patient/:patientId/messages", (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    const origin = req.headers.origin || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";
    
    console.log(`[GET /api/patient/:patientId/messages] Request received - patientId: ${patientId}, origin: ${origin}, userAgent: ${userAgent?.substring(0, 50)}`);
    
    // CORS headers are handled by global middleware - no need to override
    
    if (!patientId) {
      console.warn("[GET /api/patient/:patientId/messages] patientId missing");
      return res.status(400).json({ ok: false, error: "patientId_required", message: "Patient ID is required" });
    }

    if (isSupabaseEnabled()) {
      fetchMessagesFromSupabase(patientId)
        .then(({ data, error }) => {
          if (error) {
            const supabasePublic = supabaseErrorPublic(error);
            console.error("[MESSAGES] Supabase fetch failed", {
              message: error.message,
              code: error.code,
              details: error.details,
            });
            if (isMissingTableError(error, "messages")) {
              return res.status(500).json({
                ok: false,
                error: "messages_table_missing",
                message: "Supabase schema missing: messages table. Run migration 008_create_messages_table.sql",
                supabase: supabasePublic,
              });
            }
            return res.status(500).json({ ok: false, error: "messages_fetch_failed", supabase: supabasePublic });
          }

          if (Array.isArray(data) && data.length > 0) {
            const messages = data.map(mapDbMessageToLegacyMessage).filter(Boolean);
            return res.json({ ok: true, messages });
          }

          // Optional fallback: only if explicitly enabled and Supabase has no messages yet
          if (!canUseFileFallback()) {
            return res.json({ ok: true, messages: [] });
          }

          const CHAT_DIR = path.join(DATA_DIR, "chats");
          if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
          const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
          const existing = readJson(chatFile, { messages: [] });
          const messages = Array.isArray(existing.messages) ? existing.messages : [];
          return res.json({ ok: true, messages });
        })
        .catch((e) => {
          console.error("[MESSAGES] Supabase fetch exception:", e);
          return res.status(500).json({ ok: false, error: "messages_fetch_failed", exception: String(e?.message || e) });
        });
      return;
    }

    if (!canUseFileFallback()) {
      return res.status(500).json(supabaseDisabledPayload("messages"));
    }

    const CHAT_DIR = path.join(DATA_DIR, "chats");
    if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });

    const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
    const existing = readJson(chatFile, { messages: [] });
    
    const messages = Array.isArray(existing.messages) ? existing.messages : [];
    console.log(`[GET /api/patient/:patientId/messages] Returning ${messages.length} messages for patient ${patientId}`);
    res.json({ ok: true, messages });
  } catch (error) {
    console.error("[GET /api/patient/:patientId/messages] Error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error", message: "Failed to load messages" });
  }
});

// POST /api/patient/:patientId/messages
app.post("/api/patient/:patientId/messages", requireToken, (req, res) => {
  try {
    const rawPid = String(req.params.patientId || "").trim();
    const patientId = rawPid === "me" ? String(req.patientId || "").trim() : rawPid;
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    
    // Body'yi güvenli şekilde oku
    const body = req.body || {};
    const text = String(body.text || "").trim();
    const msgType = String(body.type || "text").trim() || "text";
    
    console.log("Patient message - patientId:", patientId, "text length:", text.length, "body keys:", Object.keys(body));
    
    if (!text) {
      return res.status(400).json({ ok: false, error: "text_required", received: body });
    }

    // Token'dan gelen patientId ile URL'deki patientId eşleşmeli
    if (req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patientId_mismatch" });
    }

    if (!isSupabaseEnabled()) {
      if (!canUseFileFallback()) return res.status(500).json(supabaseDisabledPayload("messages"));
      // dev fallback
      const CHAT_DIR = path.join(DATA_DIR, "chats");
      if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
      const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
      const existing = readJson(chatFile, { messages: [] });
      const messages = Array.isArray(existing.messages) ? existing.messages : [];
      const newMessage = {
        id: `msg_${now()}_${crypto.randomBytes(4).toString("hex")}`,
        text: String(text).trim(),
        from: "PATIENT",
        createdAt: now(),
        patientId: req.patientId,
      };
      messages.push(newMessage);
      writeJson(chatFile, { patientId, messages, updatedAt: now() });
      return res.json({ ok: true, message: newMessage });
    }

    insertMessageToSupabase({ patientId, sender: "patient", message: String(text).trim(), attachments: null, type: msgType })
      .then(({ data, error }) => {
        if (error) {
          const supabasePublic = supabaseErrorPublic(error);
          console.error("[MESSAGES] Supabase save failed", {
            message: error.message,
            code: error.code,
            details: error.details,
          });
          if (isMissingTableError(error, "messages")) {
            return res.status(500).json({
              ok: false,
              error: "messages_table_missing",
              message: "Supabase schema missing: messages table. Run migration 008_create_messages_table.sql",
              supabase: supabasePublic,
            });
          }
          return res.status(500).json({ ok: false, error: "messages_save_failed", supabase: supabasePublic });
        }
        const msg = mapDbMessageToLegacyMessage(data);
        return res.json({ ok: true, message: msg || { text, from: "PATIENT", createdAt: now(), patientId } });
      })
      .catch((e) => {
        console.error("[MESSAGES] Supabase save exception:", e);
        return res.status(500).json({ ok: false, error: "messages_save_failed", exception: String(e?.message || e) });
      });
  } catch (error) {
    console.error("Patient message send error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/patient/:patientId/messages/admin (Admin mesaj gönderir)
app.post("/api/patient/:patientId/messages/admin", (req, res) => {
  try {
    const patientId = req.params.patientId;
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    
    // Body'yi güvenli şekilde oku
    const body = req.body || {};
    const text = String(body.text || "").trim();
    const msgType = String(body.type || "text").trim() || "text";
    
    console.log("Admin message - patientId:", patientId, "text length:", text.length, "body keys:", Object.keys(body));
    
    if (!text) {
      return res.status(400).json({ ok: false, error: "text_required", received: body });
    }

    const sendAndRespond = (newMessage) => {
      // Send push notification to patient (never breaks API)
      const messagePreview = text.length > 100 ? text.substring(0, 100) + "..." : text;
      sendPushNotification(patientId, "Klinikten Yeni Mesaj", messagePreview, {
        url: "/chat",
        data: { messageId: newMessage.id }
      }).catch(err => {
        console.error("[PUSH] Failed to send push notification:", err);
      });
      return res.json({ ok: true, message: newMessage });
    };

    if (!isSupabaseEnabled()) {
      if (!canUseFileFallback()) return res.status(500).json(supabaseDisabledPayload("messages"));
      // dev fallback
      const CHAT_DIR = path.join(DATA_DIR, "chats");
      if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
      const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
      const existing = readJson(chatFile, { messages: [] });
      const messages = Array.isArray(existing.messages) ? existing.messages : [];
      const newMessage = {
        id: `msg_${now()}_${crypto.randomBytes(4).toString("hex")}`,
        text: String(text).trim(),
        from: "CLINIC",
        createdAt: now(),
      };
      messages.push(newMessage);
      writeJson(chatFile, { patientId, messages, updatedAt: now() });
      return sendAndRespond(newMessage);
    }

    insertMessageToSupabase({ patientId, sender: "clinic", message: String(text).trim(), attachments: null, type: msgType })
      .then(({ data, error }) => {
        if (error) {
          const supabasePublic = supabaseErrorPublic(error);
          console.error("[MESSAGES] Supabase save failed", {
            message: error.message,
            code: error.code,
            details: error.details,
          });
          if (isMissingTableError(error, "messages")) {
            return res.status(500).json({
              ok: false,
              error: "messages_table_missing",
              message: "Supabase schema missing: messages table. Run migration 008_create_messages_table.sql",
              supabase: supabasePublic,
            });
          }
          return res.status(500).json({ ok: false, error: "messages_save_failed", supabase: supabasePublic });
        }
        const msg = mapDbMessageToLegacyMessage(data) || {
          id: `msg_${now()}_${crypto.randomBytes(4).toString("hex")}`,
          text: String(text).trim(),
          from: "CLINIC",
          createdAt: now(),
        };
        return sendAndRespond(msg);
      })
      .catch((e) => {
        console.error("[MESSAGES] Supabase save exception:", e);
        return res.status(500).json({ ok: false, error: "messages_save_failed", exception: String(e?.message || e) });
      });
    
  } catch (error) {
    console.error("Admin message send error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/push/public-key (Returns VAPID public key for push notifications)
app.get("/api/push/public-key", (req, res) => {
  res.json({ ok: true, publicKey: VAPID_PUBLIC_KEY });
});

// POST /api/patient/:patientId/push-subscription (Register push subscription)
app.post("/api/patient/:patientId/push-subscription", requireToken, (req, res) => {
  try {
    const patientId = req.params.patientId;
    const subscription = req.body?.subscription;
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    
    if (req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patientId_mismatch" });
    }
    
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ ok: false, error: "subscription_required" });
    }
    
    const subscriptions = readJson(PUSH_SUBSCRIPTIONS_FILE, {});
    if (!subscriptions[patientId]) {
      subscriptions[patientId] = [];
    }
    
    // Check if subscription already exists
    const existingIndex = subscriptions[patientId].findIndex(
      sub => sub.endpoint === subscription.endpoint
    );
    
    if (existingIndex >= 0) {
      // Update existing subscription
      subscriptions[patientId][existingIndex] = subscription;
    } else {
      // Add new subscription
      subscriptions[patientId].push(subscription);
    }
    
    writeJson(PUSH_SUBSCRIPTIONS_FILE, subscriptions);
    
    console.log(`[PUSH] Subscription registered for patient ${patientId}`);
    res.json({ ok: true, message: "subscription_registered" });
  } catch (error) {
    console.error("Push subscription registration error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/chat/upload (patient uploads files/images to chat)
app.post("/api/chat/upload", requireToken, chatUpload.array("files", 5), async (req, res) => {
  try {
    const body = req.body || {};
    const bodyPid = String(body.patientId || "").trim();
    const patientId = String((bodyPid && bodyPid !== "me" ? bodyPid : req.patientId) || "").trim();
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    if (req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patientId_mismatch" });
    }

    // Messages must be persistent in production
    if (!isSupabaseEnabled() && !canUseFileFallback()) {
      return res.status(500).json(supabaseDisabledPayload("messages"));
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ ok: false, error: "no_files", message: "No files received" });
    }

    const isImageUpload = String(body.isImage || "").toLowerCase() === "true";
    const allowedImageMimes = new Set(["image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif"]);
    const allowedDocMimes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "application/x-zip-compressed",
    ]);

    const CHAT_UPLOAD_DIR = path.join(__dirname, "public", "uploads", "chat", patientId);
    if (!fs.existsSync(CHAT_UPLOAD_DIR)) fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

    const useFileStore = !isSupabaseEnabled() && canUseFileFallback();
    let chatFile = null;
    let messages = [];
    if (useFileStore) {
      const CHAT_DIR = path.join(DATA_DIR, "chats");
      if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
      chatFile = path.join(CHAT_DIR, `${patientId}.json`);
      const existing = readJson(chatFile, { messages: [] });
      messages = Array.isArray(existing.messages) ? existing.messages : [];
    }

    const uploadedFiles = [];
    for (const file of files) {
      const mime = String(file.mimetype || "").toLowerCase();
      const size = Number(file.size || 0);
      const originalName = String(file.originalname || "file");

      const isImage = isImageUpload || mime.startsWith("image/");
      if (isImage && !allowedImageMimes.has(mime)) {
        return res.status(400).json({ ok: false, error: "invalid_file_type", message: "Geçersiz resim formatı" });
      }
      if (!isImage && !allowedDocMimes.has(mime)) {
        return res.status(400).json({ ok: false, error: "invalid_file_type", message: "Geçersiz dosya formatı" });
      }

      if (isImage && size > 10 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: "file_too_large", message: "Resim 10MB'dan küçük olmalıdır." });
      }
      const isZip = mime === "application/zip" || mime === "application/x-zip-compressed";
      if (!isImage && isZip && size > 50 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: "file_too_large", message: "ZIP 50MB'dan küçük olmalıdır." });
      }
      if (!isImage && !isZip && size > 20 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: "file_too_large", message: "Dosya 20MB'dan küçük olmalıdır." });
      }

      let ext = path.extname(originalName || "").toLowerCase();
      if (!ext) {
        if (mime === "image/png") ext = ".png";
        else if (mime === "image/heic" || mime === "image/heif") ext = ".heic";
        else if (mime === "application/pdf") ext = ".pdf";
        else if (mime === "application/msword") ext = ".doc";
        else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") ext = ".docx";
        else if (mime === "application/vnd.ms-excel") ext = ".xls";
        else if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") ext = ".xlsx";
        else if (mime === "text/plain") ext = ".txt";
        else if (isZip) ext = ".zip";
        else ext = ".bin";
      }

      const safeName = `${patientId}_${now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
      const diskPath = path.join(CHAT_UPLOAD_DIR, safeName);
      fs.writeFileSync(diskPath, file.buffer);

      // Use relative URL so mobile app can prepend correct API_BASE
      // This ensures Android emulator uses 10.0.2.2 instead of localhost
      const fileUrl = `/uploads/chat/${encodeURIComponent(patientId)}/${encodeURIComponent(safeName)}`;
      const fileType = isImage ? "image" : "pdf";
      uploadedFiles.push({
        name: originalName,
        size,
        url: fileUrl,
        mimeType: mime,
        fileType,
      });

      // Photo metadata tags for patient-uploaded images
      const photoTags = isImage ? {
        source: "Patient Uploaded",
        sourceDescription: "Hasta tarafından mobil uygulama üzerinden yüklenmiştir.",
        photoType: "Pre-Treatment",
        photoTypeDescription: "Tedavi öncesi ön değerlendirme fotoğrafı",
        filterStatus: "No Filter Applied",
        filterStatusDescription: "Fotoğrafa herhangi bir filtre veya görsel manipülasyon uygulanmamıştır.",
        captureDate: new Date(now()).toLocaleDateString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        captureTimestamp: now(),
        // V2 fields for Before/After compatibility
        comparisonStatus: "Before", // Default for patient uploads
        clinicApprovalStatus: "Not Approved", // Default
        // Clinic-selectable fields (empty by default)
        visualQuality: null,
        clinicNote: null,
      } : null;

      const newMessage = {
        id: `msg_${now()}_${crypto.randomBytes(4).toString("hex")}`,
        text: "",
        from: "PATIENT",
        type: fileType,
        attachment: {
          name: originalName,
          size,
          url: fileUrl,
          mimeType: mime,
          fileType,
          ...(photoTags && { tags: photoTags }),
        },
        createdAt: now(),
        patientId,
      };

      if (isSupabaseEnabled()) {
        const { error: saveErr } = await insertMessageToSupabase({
          patientId,
          sender: "patient",
          message: "",
          attachments: newMessage.attachment,
          type: fileType,
        });
        if (saveErr) {
          const supabasePublic = supabaseErrorPublic(saveErr);
          console.error("[MESSAGES] Supabase save failed", {
            message: saveErr.message,
            code: saveErr.code,
            details: saveErr.details,
          });
          if (isMissingTableError(saveErr, "messages")) {
            return res.status(500).json({
              ok: false,
              error: "messages_table_missing",
              message: "Supabase schema missing: messages table. Run migration 008_create_messages_table.sql",
              supabase: supabasePublic,
            });
          }
          return res.status(500).json({ ok: false, error: "messages_save_failed", supabase: supabasePublic });
        }
      } else {
        messages.push(newMessage);
      }
    }

    if (useFileStore && chatFile) {
      writeJson(chatFile, { patientId, messages, updatedAt: now() });
    }
    return res.json({
      ok: true,
      files: uploadedFiles,
      message: uploadedFiles.length === 1 ? "File uploaded successfully" : `${uploadedFiles.length} files uploaded successfully`,
    });
  } catch (error) {
    console.error("[Chat Upload] Error:", error);
    return res.status(500).json({ ok: false, error: "upload_exception", message: error?.message || "Upload failed" });
  }
});

// POST /api/admin/chat/upload (Admin uploads files/images to patient chat)
app.post("/api/admin/chat/upload", requireAdminAuth, chatUpload.array("files", 5), async (req, res) => {
  try {
    console.log("[Admin Chat Upload] Request received");
    console.log("[Admin Chat Upload] Body keys:", Object.keys(req.body || {}));
    console.log("[Admin Chat Upload] Files:", Array.isArray(req.files) ? req.files.length : "not array", req.files);
    
    const body = req.body || {};
    const patientId = String(body.patientId || "").trim();
    console.log("[Admin Chat Upload] Patient ID:", patientId);
    
    if (!patientId) {
      console.error("[Admin Chat Upload] Missing patientId");
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    if (!isSupabaseEnabled() && !canUseFileFallback()) {
      return res.status(500).json(supabaseDisabledPayload("messages"));
    }

    const files = Array.isArray(req.files) ? req.files : [];
    console.log("[Admin Chat Upload] Files count:", files.length);
    
    if (files.length === 0) {
      console.error("[Admin Chat Upload] No files received");
      return res.status(400).json({ ok: false, error: "no_files", message: "No files received" });
    }

    const isImageUpload = String(body.isImage || "").toLowerCase() === "true";
    const allowedImageMimes = new Set(["image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif"]);
    const allowedDocMimes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "application/x-zip-compressed",
    ]);

    const CHAT_UPLOAD_DIR = path.join(__dirname, "public", "uploads", "chat", patientId);
    if (!fs.existsSync(CHAT_UPLOAD_DIR)) fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

    const useFileStore = !isSupabaseEnabled() && canUseFileFallback();
    let chatFile = null;
    let messages = [];
    if (useFileStore) {
      const CHAT_DIR = path.join(DATA_DIR, "chats");
      if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
      chatFile = path.join(CHAT_DIR, `${patientId}.json`);
      const existing = readJson(chatFile, { messages: [] });
      messages = Array.isArray(existing.messages) ? existing.messages : [];
    }

    const uploadedFiles = [];
    for (const file of files) {
      const mime = String(file.mimetype || "").toLowerCase();
      const size = Number(file.size || 0);
      const originalName = String(file.originalname || "file");

      const isImage = isImageUpload || mime.startsWith("image/");
      if (isImage && !allowedImageMimes.has(mime)) {
        return res.status(400).json({ ok: false, error: "invalid_file_type", message: "Geçersiz resim formatı" });
      }
      if (!isImage && !allowedDocMimes.has(mime)) {
        return res.status(400).json({ ok: false, error: "invalid_file_type", message: "Geçersiz dosya formatı" });
      }

      if (isImage && size > 10 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: "file_too_large", message: "Resim 10MB'dan küçük olmalıdır." });
      }
      const isZip = mime === "application/zip" || mime === "application/x-zip-compressed";
      if (!isImage && isZip && size > 50 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: "file_too_large", message: "ZIP 50MB'dan küçük olmalıdır." });
      }
      if (!isImage && !isZip && size > 20 * 1024 * 1024) {
        return res.status(400).json({ ok: false, error: "file_too_large", message: "Dosya 20MB'dan küçük olmalıdır." });
      }

      let ext = path.extname(originalName || "").toLowerCase();
      if (!ext) {
        if (mime === "image/png") ext = ".png";
        else if (mime === "image/heic" || mime === "image/heif") ext = ".heic";
        else if (mime === "application/pdf") ext = ".pdf";
        else if (mime === "application/msword") ext = ".doc";
        else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") ext = ".docx";
        else if (mime === "application/vnd.ms-excel") ext = ".xls";
        else if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") ext = ".xlsx";
        else if (mime === "text/plain") ext = ".txt";
        else if (isZip) ext = ".zip";
        else ext = ".bin";
      }

      const safeName = `${patientId}_${now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
      const diskPath = path.join(CHAT_UPLOAD_DIR, safeName);
      fs.writeFileSync(diskPath, file.buffer);

      // Use relative URL so mobile app can prepend correct API_BASE
      // This ensures Android emulator uses 10.0.2.2 instead of localhost
      const fileUrl = `/uploads/chat/${encodeURIComponent(patientId)}/${encodeURIComponent(safeName)}`;
      const fileType = isImage ? "image" : "pdf";
      uploadedFiles.push({
        name: originalName,
        size,
        url: fileUrl,
        mimeType: mime,
        fileType,
      });

      // Admin uploads - message from CLINIC
      const newMessage = {
        id: `msg_${now()}_${crypto.randomBytes(4).toString("hex")}`,
        text: "",
        from: "CLINIC",
        type: fileType,
        attachment: {
          name: originalName,
          size,
          url: fileUrl,
          mimeType: mime,
          fileType,
        },
        createdAt: now(),
      };
      if (isSupabaseEnabled()) {
        const { error: saveErr } = await insertMessageToSupabase({
          patientId,
          sender: "clinic",
          message: "",
          attachments: newMessage.attachment,
          type: fileType,
        });
        if (saveErr) {
          const supabasePublic = supabaseErrorPublic(saveErr);
          console.error("[MESSAGES] Supabase save failed", {
            message: saveErr.message,
            code: saveErr.code,
            details: saveErr.details,
          });
          if (isMissingTableError(saveErr, "messages")) {
            return res.status(500).json({
              ok: false,
              error: "messages_table_missing",
              message: "Supabase schema missing: messages table. Run migration 008_create_messages_table.sql",
              supabase: supabasePublic,
            });
          }
          return res.status(500).json({ ok: false, error: "messages_save_failed", supabase: supabasePublic });
        }
      } else {
        messages.push(newMessage);
      }
    }

    if (useFileStore && chatFile) {
      writeJson(chatFile, { patientId, messages, updatedAt: now() });
    }
    console.log("[Admin Chat Upload] Success! Uploaded", uploadedFiles.length, "file(s)");
    return res.json({
      ok: true,
      files: uploadedFiles,
      message: uploadedFiles.length === 1 ? "File uploaded successfully" : `${uploadedFiles.length} files uploaded successfully`,
    });
  } catch (error) {
    console.error("[Admin Chat Upload] Error:", error);
    console.error("[Admin Chat Upload] Error stack:", error?.stack);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== CLINIC INFO ==================
// GET /api/clinic (Public - mobile app için)
// Supports ?code=XXX query parameter to get specific clinic from CLINICS_FILE
app.get("/api/clinic", (req, res) => {
  const codeParam = String(req.query.code || "").trim().toUpperCase();
  console.log(`[CLINIC GET] Request with codeParam: "${codeParam}"`);
  
  // Helper function to validate and clean Google Maps URL
  const validateGoogleMapsUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    
    // Basic URL validation
    try {
      const urlObj = new URL(url);
      
      // Check if it's a Google Maps URL
      if (!urlObj.hostname.includes('maps.google.com') && !urlObj.hostname.includes('google.com/maps')) {
        console.log(`[CLINIC GET] Invalid Google Maps URL hostname: ${urlObj.hostname}`);
        return '';
      }
      
      // Check for basic Google Maps URL structure
      if (!url.includes('/maps/') && !url.includes('/place/')) {
        console.log(`[CLINIC GET] Invalid Google Maps URL structure: ${url}`);
        return '';
      }
      
      return url;
    } catch (error) {
      console.log(`[CLINIC GET] Invalid Google Maps URL format: ${url}`, error.message);
      return '';
    }
  };
  
  // If code parameter is provided, try to find clinic in CLINICS_FILE (multi-clinic mode)
  if (codeParam) {
    const clinics = readJson(CLINICS_FILE, {});
    for (const [clinicId, clinicData] of Object.entries(clinics)) {
      if (clinicData && (clinicData.clinicCode === codeParam || clinicData.code === codeParam)) {
        // Don't return password hash or sensitive data
        const { password, ...publicClinic } = clinicData;
        
        // Validate and clean Google Maps URL
        if (publicClinic.googleMapsUrl) {
          publicClinic.googleMapsUrl = validateGoogleMapsUrl(publicClinic.googleMapsUrl);
        }
        if (publicClinic.googleMapLink) {
          publicClinic.googleMapLink = validateGoogleMapsUrl(publicClinic.googleMapLink);
        }
        
        if (!publicClinic.referralLevels && publicClinic.settings?.referralLevels) {
          publicClinic.referralLevels = publicClinic.settings.referralLevels;
        }
        console.log(`[CLINIC GET] Found clinic in CLINICS_FILE: ${codeParam}, discounts: ${publicClinic.defaultInviterDiscountPercent}/${publicClinic.defaultInvitedDiscountPercent}`);
        return res.json(publicClinic);
      }
    }
    console.log(`[CLINIC GET] Clinic ${codeParam} not found in CLINICS_FILE, trying CLINIC_FILE...`);
    // If not found in CLINICS_FILE, try CLINIC_FILE as fallback
    const singleClinic = readJson(CLINIC_FILE, {});
    if (singleClinic && (singleClinic.clinicCode === codeParam || !codeParam)) {
      
      // Validate and clean Google Maps URL
      if (singleClinic.googleMapsUrl) {
        singleClinic.googleMapsUrl = validateGoogleMapsUrl(singleClinic.googleMapsUrl);
      }
      if (singleClinic.googleMapLink) {
        singleClinic.googleMapLink = validateGoogleMapsUrl(singleClinic.googleMapLink);
      }
      
      if (!singleClinic.referralLevels && singleClinic.settings?.referralLevels) {
        singleClinic.referralLevels = singleClinic.settings.referralLevels;
      }
      console.log(`[CLINIC GET] Found clinic in CLINIC_FILE: ${singleClinic.clinicCode}, discounts: ${singleClinic.defaultInviterDiscountPercent}/${singleClinic.defaultInvitedDiscountPercent}`);
      return res.json(singleClinic);
    }
  }
  
  // Default: read from CLINIC_FILE (single-clinic mode - for backward compatibility)
  console.log(`[CLINIC GET] No codeParam or clinic not found, using default from CLINIC_FILE`);
  const defaultClinic = {
    clinicCode: "MOON",
    name: "Clinifly Dental Clinic",
    googleReviews: [],
    trustpilotReviews: [],
    address: "Antalya, Türkiye",
    phone: "",
    email: "",
    website: "",
    logoUrl: "",
    googleMapsUrl: "",
    defaultInviterDiscountPercent: null,
    defaultInvitedDiscountPercent: null,
    referralLevels: {
      level1: null,
      level2: null,
      level3: null,
    },
    updatedAt: now(),
  };
  
      const clinic = readJson(CLINIC_FILE, defaultClinic);
      if (!clinic.referralLevels) {
        clinic.referralLevels = defaultClinic.referralLevels;
      }
  console.log(`[CLINIC GET] Returning default clinic with discounts: ${clinic.defaultInviterDiscountPercent}/${clinic.defaultInvitedDiscountPercent}`);
  res.json(clinic);
});

// GET /api/clinic/:code (Public - get clinic by code)
app.get("/api/clinic/:code", (req, res) => {
  const code = String(req.params.code || "").toUpperCase().trim();
  if (!code) {
    return res.status(400).json({ ok: false, error: "clinic_code_required" });
  }
  
  // Helper function to validate and clean Google Maps URL
  const validateGoogleMapsUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    
    try {
      const urlObj = new URL(url);
      
      if (!urlObj.hostname.includes('maps.google.com') && !urlObj.hostname.includes('google.com/maps')) {
        return '';
      }
      
      if (!url.includes('/maps/') && !url.includes('/place/')) {
        return '';
      }
      
      return url;
    } catch (error) {
      return '';
    }
  };
  
  const clinic = readJson(CLINIC_FILE, {});
  
  // Check if clinic code matches
  if (clinic.clinicCode && clinic.clinicCode.toUpperCase() === code) {
    // Don't return password hash to public endpoint
    const { password, ...publicClinic } = clinic;
    
    // Validate and clean Google Maps URL
    if (publicClinic.googleMapsUrl) {
      publicClinic.googleMapsUrl = validateGoogleMapsUrl(publicClinic.googleMapsUrl);
    }
    if (publicClinic.googleMapLink) {
      publicClinic.googleMapLink = validateGoogleMapsUrl(publicClinic.googleMapLink);
    }
    
    if (!publicClinic.referralLevels && publicClinic.settings?.referralLevels) {
      publicClinic.referralLevels = publicClinic.settings.referralLevels;
    }
    return res.json(publicClinic);
  }
  
  // If no match, return 404
  res.status(404).json({ ok: false, error: "clinic_not_found", code });
});

// ================== PROCEDURE DEFINITIONS (shared) ==================
// Public endpoint: admin UI + backend share the same allowed list.
app.get("/api/procedures", (req, res) => {
  res.json({
    ok: true,
    types: procedures.PROCEDURE_TYPES,
    statuses: ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"],
    categories: ["EVENTS", "PROSTHETIC", "RESTORATIVE", "ENDODONTIC", "SURGICAL", "IMPLANT"],
    extractionTypes: Array.from(procedures.EXTRACTION_TYPES),
  });
});

// Admin alias for deployments that expect scoped endpoint

// GET /api/admin/clinic (Admin için) - token-based (multi-clinic)
app.get("/api/admin/clinic", requireAdminAuth, (req, res) => {
  try {
    // requireAdminToken middleware already sets req.clinic
    // Use it directly - no need to lookup again
    if (!req.clinic) {
      console.error("[GET /api/admin/clinic] Clinic not found in req.clinic, clinicCode:", req.clinicCode, "clinicId:", req.clinicId);
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }
    
    // Remove sensitive fields
    const { password, password_hash, ...safe } = req.clinic;
    if (typeof safe.settings === "string") {
      try {
        safe.settings = JSON.parse(safe.settings);
      } catch (e) {
        safe.settings = {};
      }
    }
    if (!safe.referralLevels && safe.settings?.referralLevels) {
      safe.referralLevels = safe.settings.referralLevels;
    }
    if (!safe.referralLevels) {
      safe.referralLevels = {
        level1: safe.defaultInviterDiscountPercent ?? null,
        level2: null,
        level3: null,
      };
    }
    const levels = safe.referralLevels || {};
    safe.settings = {
      ...(safe.settings || {}),
      referralLevels: levels,
      referralLevel1Percent: levels.level1 ?? null,
      referralLevel2Percent: levels.level2 ?? null,
      referralLevel3Percent: levels.level3 ?? null,
    };
    res.json(safe);
  } catch (error) {
    console.error("Get admin clinic error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== PLAN HELPERS ==================
function normalizeClinicPlan(plan) {
  const raw = String(plan || "FREE").trim().toUpperCase();
  if (raw === "PROFESSIONAL") return "PRO";
  if (raw === "PREMIUM") return "PRO";
  return raw;
}

function planToMaxPatients(plan) {
  const p = normalizeClinicPlan(plan);
  // Keep this mapping consistent across all endpoints:
  // - FREE:   3 patients
  // - BASIC:  15 patients
  // - PRO:    effectively unlimited (use a very high number)
  if (p === "FREE") return 3;
  if (p === "BASIC") return 15;
  if (p === "PRO") return 999999;
  return 3;
}

// PUT /api/admin/clinic (Admin günceller) - token-based (multi-clinic)
app.put("/api/admin/clinic", requireAdminAuth, async (req, res) => {
  try {
      // 🔒 UPDATE sırasında unique alanları koru
    delete req.body.clinic_code
    delete req.body.clinicCode
    delete req.body.code

    console.log("[DEBUG] clinic update payload:", req.body)
// requireAdminToken middleware already sets req.clinic
    // Use it directly - no need to lookup again
    if (!req.clinic) {
      console.error("[PUT /api/admin/clinic] Clinic not found in req.clinic, clinicCode:", req.clinicCode, "clinicId:", req.clinicId);
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }
    
    const body = req.body || {};
    // Use req.clinic as existing data (no file lookup needed)
    const existing = req.clinic;

    // Subscription plan (single-clinic mode)
    const rawPlan = normalizeClinicPlan(body.plan || existing.plan || existing.subscriptionPlan || "FREE");
    const allowedPlans = ["FREE", "BASIC", "PRO"];
    if (!allowedPlans.includes(rawPlan)) {
      return res.status(400).json({ ok: false, error: `invalid_plan:${rawPlan}` });
    }

    const computedMaxPatients = planToMaxPatients(rawPlan);
    
    const referralLevels = normalizeReferralLevels(
      {
        referralLevel1Percent: body.referralLevel1Percent,
        referralLevel2Percent: body.referralLevel2Percent,
        referralLevel3Percent: body.referralLevel3Percent,
        // Also check settings.referralLevels from frontend
        level1: body.settings?.referralLevels?.level1,
        level2: body.settings?.referralLevels?.level2,
        level3: body.settings?.referralLevels?.level3,
      },
      existing.settings?.referralLevels || {}
    );
    const referralLevelError = validateReferralLevels(referralLevels);
    if (referralLevelError) {
      return res.status(400).json({ ok: false, error: referralLevelError });
    }

    const inviterPercent = referralLevels.level1 != null ? referralLevels.level1 : existing.defaultInviterDiscountPercent ?? null;
    const invitedPercent = referralLevels.level1 != null ? referralLevels.level1 : existing.defaultInvitedDiscountPercent ?? null;
    
    // Handle password change
    let passwordHash = existing.password;
    if (body.password && String(body.password).trim()) {
      // New password provided, hash it
      passwordHash = await bcrypt.hash(String(body.password).trim(), 10);
    }
    
    // Handle branding object
    const existingBranding = existing.branding || {};
    const bodyBranding = body.branding || {};
    const updatedBranding = {
      clinicName: bodyBranding.clinicName || existingBranding.clinicName || existing.name || "",
      clinicLogoUrl: bodyBranding.clinicLogoUrl || existingBranding.clinicLogoUrl || existing.logoUrl || "",
      address: bodyBranding.address || existingBranding.address || existing.address || "",
      googleMapLink: bodyBranding.googleMapLink || existingBranding.googleMapLink || existing.googleMapsUrl || "",
      primaryColor: bodyBranding.primaryColor || existingBranding.primaryColor || "#2563EB",
      secondaryColor: bodyBranding.secondaryColor || existingBranding.secondaryColor || "#10B981",
      welcomeMessage: bodyBranding.welcomeMessage || existingBranding.welcomeMessage || "",
      showPoweredBy: bodyBranding.showPoweredBy !== undefined ? bodyBranding.showPoweredBy : (existingBranding.showPoweredBy !== undefined ? existingBranding.showPoweredBy : true),
    };
    
    const updated = {
      ...existing,
      clinicCode: String(body.clinicCode || existing.clinicCode || existing.code || "MOON").trim().toUpperCase(),
      code: existing.code || String(body.clinicCode || existing.clinicCode || "MOON").trim().toUpperCase(),
      name: String(body.name || bodyBranding.clinicName || existing.name || "").trim(),
      plan: rawPlan,
      subscriptionPlan: rawPlan, // keep compatibility with older fields
      max_patients: computedMaxPatients,
      address: String(body.address || existing.address || ""),
      phone: String(body.phone || existing.phone || ""),
      email: String(existing.email || ""),
      website: String(body.website || existing.website || ""),
      logoUrl: String(body.logoUrl || bodyBranding.clinicLogoUrl || existing.logoUrl || existingBranding.clinicLogoUrl || ""),
      googleMapsUrl: String(body.googleMapsUrl || bodyBranding.googleMapLink || existing.googleMapsUrl || existingBranding.googleMapLink || ""),
      branding: updatedBranding,
      defaultInviterDiscountPercent: inviterPercent,
      defaultInvitedDiscountPercent: invitedPercent,
      settings: {
        ...(existing.settings || {}),
        branding: updatedBranding,
        defaultInviterDiscountPercent: inviterPercent,
        defaultInvitedDiscountPercent: invitedPercent,
        referralLevels,
        logoUrl: String(body.logoUrl || bodyBranding.clinicLogoUrl || existing.logoUrl || existingBranding.clinicLogoUrl || ""),
        googleMapsUrl: String(body.googleMapsUrl || bodyBranding.googleMapLink || existing.googleMapsUrl || existingBranding.googleMapLink || ""),
        googleReviews: Array.isArray(body.googleReviews) ? body.googleReviews : (existing.googleReviews || []),
        trustpilotReviews: Array.isArray(body.trustpilotReviews) ? body.trustpilotReviews : (existing.trustpilotReviews || []),
      },
      googleReviews: Array.isArray(body.googleReviews) ? body.googleReviews : (existing.googleReviews || []),
      trustpilotReviews: Array.isArray(body.trustpilotReviews) ? body.trustpilotReviews : (existing.trustpilotReviews || []),
      password: passwordHash, // Keep existing or update
      updatedAt: now(),
    };

    // SUPABASE: Update clinic (PRIMARY - production source of truth)
    if (isSupabaseEnabled() && req.clinicId) {
      try {
        console.log(`[PUT /api/admin/clinic] Updating clinic in Supabase: ${req.clinicId}`);
        
        // Prepare update data for Supabase (remove password from update, handle separately)
        const isCreate = false; // PUT endpoint - always update, never create
        
        const supabaseUpdate = {
         ...(isCreate ? { clinic_code: updated.clinicCode || updated.code } : {}),
          name: updated.name,
          plan: updated.plan,
          max_patients: updated.max_patients,
          address: updated.address,
          phone: updated.phone,
          website: updated.website,
          settings: {
            branding: updatedBranding,
            defaultInviterDiscountPercent: inviterPercent,
            defaultInvitedDiscountPercent: invitedPercent,
            referralLevels,
            referralLevel1Percent: referralLevels.level1, // Add this for compatibility
            googleReviews: updated.googleReviews,
            trustpilotReviews: updated.trustpilotReviews,
            logoUrl: updated.logoUrl,
            googleMapsUrl: updated.googleMapsUrl,
          }
        };
        
        // Update password separately if changed
        if (body.password && String(body.password).trim()) {
          supabaseUpdate.password_hash = passwordHash;
        }
        
        console.log("[DEBUG] isCreate:", isCreate);
        console.log("[DEBUG] supabaseUpdate keys:", Object.keys(supabaseUpdate));
        console.log("[DEBUG] supabaseUpdate payload:", supabaseUpdate);
        
        // 🔒 UPDATE sırasında unique alanları koru
        delete supabaseUpdate.clinic_code;
        
        console.log("[DEBUG] Supabase update payload:", supabaseUpdate);
        
        const { data, error } = await supabase
          .from("clinics")
          .update(supabaseUpdate)
          .eq("id", req.clinicId)
          .select()
          .single();
        
        if (error) {
          console.error("[PUT /api/admin/clinic] Supabase update error:", error);
          return res.status(400).json({ ok: false, error: error.message });
        }
        
        console.log(`[PUT /api/admin/clinic] ✅ Clinic updated in Supabase:`, data);
        
        // Return success response immediately for Supabase
        const { password_hash, ...safeData } = data || updated;
        return res.json({ ok: true, clinic: safeData });
        
      } catch (supabaseError) {
        console.error(`[PUT /api/admin/clinic] ❌ Failed to update clinic in Supabase:`, supabaseError.message);
        // Continue with file-based storage as fallback
      }
    }

    // FILE-BASED: Fallback storage (for backward compatibility)
    // Try to find clinic in file by clinicCode if req.clinicId is a UUID
    const clinics = readJson(CLINICS_FILE, {});
    let fileClinicId = req.clinicId;
    
    // If req.clinicId looks like a UUID, try to find file-based ID by clinicCode
    if (req.clinicId && req.clinicId.includes('-') && req.clinicCode) {
      const code = String(req.clinicCode).toUpperCase();
      for (const fid in clinics) {
        const c = clinics[fid];
        if (c && (c.clinicCode || c.code) && String(c.clinicCode || c.code).toUpperCase() === code) {
          fileClinicId = fid;
          break;
        }
      }
    }
    
    if (fileClinicId && clinics[fileClinicId] !== undefined) {
      clinics[fileClinicId] = updated;
      clinics[fileClinicId] = {
        ...updated,
        settings: {
          ...(updated.settings || {}),
          referralLevels,
        },
      };
      writeJson(CLINICS_FILE, clinics);
      console.log(`[PUT /api/admin/clinic] File-based clinic updated`);
    } else {
      console.log(`[PUT /api/admin/clinic] File-based clinic not found, skipping file update`);
    }
    
    const { password, password_hash, ...safe } = updated;
    res.json({ ok: true, clinic: safe });
  } catch (error) {
    console.error("Clinic update error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== REVIEWS IMPORT ==================
// POST /api/admin/reviews/import/google
app.post("/api/admin/reviews/import/google", (req, res) => {
  const { placeId, apiKey } = req.body || {};
  
  if (!placeId || !placeId.trim()) {
    return res.status(400).json({ ok: false, error: "placeId_required" });
  }
  
  const key = apiKey || process.env.GOOGLE_PLACES_API_KEY || "";
  if (!key || !key.trim()) {
    return res.status(400).json({ ok: false, error: "api_key_required" });
  }
  
  // Google Places API Details endpoint
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,reviews&key=${encodeURIComponent(key)}`;
  
  // Use https module for Node.js compatibility
  const https = require("https");
  https.get(url, (response) => {
    let data = "";
    response.on("data", (chunk) => { data += chunk; });
    response.on("end", () => {
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.status !== "OK" && jsonData.status !== "ZERO_RESULTS") {
          return res.status(400).json({ ok: false, error: `Google API error: ${jsonData.status} - ${jsonData.error_message || "Unknown error"}` });
        }
        const reviews = (jsonData.result?.reviews || []).map((r) => ({
          author: r.author_name || "",
          rating: r.rating || 5,
          text: r.text || "",
          date: r.time ? new Date(r.time * 1000).toISOString().split("T")[0] : "",
        }));
        res.json({ ok: true, reviews, placeName: jsonData.result?.name || "" });
      } catch (e) {
        console.error("Parse error:", e);
        res.status(500).json({ ok: false, error: "parse_error" });
      }
    });
  }).on("error", (e) => {
    console.error("Google API request error:", e);
    res.status(500).json({ ok: false, error: e.message || "request_failed" });
  });
});

// POST /api/admin/reviews/import/trustpilot
app.post("/api/admin/reviews/import/trustpilot", async (req, res) => {
  try {
    // Trustpilot API requires authentication and is more complex
    // For now, return a message that manual entry is needed
    res.json({ ok: false, error: "Trustpilot import not yet implemented. Please add reviews manually or use Trustpilot API." });
  } catch (error) {
    console.error("Trustpilot reviews import error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== REFERRALS ==================
// POST /api/referrals
// Create a referral (file-based persistence)
app.post("/api/referrals", requireToken, (req, res) => {
  try {
    const inviterPatientId = String(req.patientId || "").trim();
    const invitedPatientId = String(req.body?.invitedPatientId || "").trim();

    if (!inviterPatientId) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (!invitedPatientId) {
      return res.status(400).json({ ok: false, error: "invited_patient_id_required" });
    }
    if (inviterPatientId === invitedPatientId) {
      return res.status(400).json({ ok: false, error: "self_referral_forbidden" });
    }

    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    const existing = list.find(
      (r) =>
        r &&
        (r.inviterPatientId || r.inviter_patient_id) === inviterPatientId &&
        (r.invitedPatientId || r.invited_patient_id) === invitedPatientId &&
        !r.deleted_at
    );
    if (existing) {
      return res.status(409).json({ ok: false, error: "referral_already_exists", item: existing });
    }

    const newReferral = {
      id: rid("ref"),
      inviterPatientId,
      invitedPatientId,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      inviterDiscountPercent: null,
      invitedDiscountPercent: null,
      discountPercent: null,
    };
    list.push(newReferral);
    writeJson(REF_FILE, list);

    return res.json({ ok: true, item: newReferral });
  } catch (error) {
    console.error("Referral create error:", error);
    return res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/me/referrals
// Patient sees their own referrals (file-based)
app.get("/api/me/referrals", requireToken, (req, res) => {
  try {
    const patientId = String(req.patientId || "").trim();
    if (!patientId) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const status = req.query.status;
    const raw = readJson(REF_FILE, []);
    let items = (Array.isArray(raw) ? raw : Object.values(raw)).filter(
      (r) => r && (r.inviterPatientId || r.inviter_patient_id) === patientId
    );

    if (status && (status === "PENDING" || status === "APPROVED" || status === "REJECTED")) {
      items = items.filter((x) => x.status === status);
    }

    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return res.json({ ok: true, items });
  } catch (error) {
    console.error("Me referrals error:", error);
    return res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/admin/referrals?status=PENDING|APPROVED|REJECTED
app.get("/api/admin/referrals", requireAdminAuth, async (req, res) => {
  try {
    const statusRaw = req.query.status;
    const status = String(statusRaw || "").trim().toUpperCase();
    
    // PRODUCTION: Clinic isolation - use req.clinic.id (UUID) from requireAdminToken
    if (!req.clinic || !req.clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_not_authenticated", message: "Klinik kimlik doğrulaması yapılmadı." });
    }
    
    const clinicId = req.clinicId; // UUID from Supabase or file-based ID
    const clinicCode = req.clinicCode;
    
    console.log(`[REFERRALS] Fetching referrals for clinic: code=${clinicCode}, id=${clinicId}`);
    const respondFromFile = () => {
      const raw = readJson(REF_FILE, []);
      const list = Array.isArray(raw) ? raw : Object.values(raw);

      // Get patients to filter by clinic
      const patients = readJson(PAT_FILE, {});
      
      // Get list of patient IDs that belong to this clinic
      const clinicPatientIds = new Set();
      for (const pid in patients) {
        // ... (rest of the code remains the same)
        const patient = patients[pid];
        if (patient) {
          const patientClinicCode = (patient.clinicCode || patient.clinic_code || "").toUpperCase();
          if (patientClinicCode === clinicCode?.toUpperCase()) {
            clinicPatientIds.add(pid);
            clinicPatientIds.add(patient.patientId || patient.patient_id);
          }
        }
      }
      
      console.log(`[REFERRALS] Found ${clinicPatientIds.size} patients for clinic ${clinicCode}`);
      
      let items = [];
      if (clinicPatientIds.size === 0) {
        // No clinic patients found in file store; return all file referrals as fallback.
        items = list.filter((x) => x && !x.deleted_at);
      } else {
        // Filter referrals: only show referrals where inviter OR invited patient belongs to this clinic
        items = list.filter((x) => {
          if (!x || x.deleted_at) return false; // Exclude soft-deleted
          const inviterId = x.inviterPatientId || x.inviter_patient_id;
          const invitedId = x.invitedPatientId || x.invited_patient_id;
          
          const inviterBelongsToClinic = inviterId && clinicPatientIds.has(inviterId);
          const invitedBelongsToClinic = invitedId && clinicPatientIds.has(invitedId);
          
          const referralClinicCode = (x.clinicCode || x.clinic_code || "").toUpperCase();
          const clinicCodeMatches = referralClinicCode && referralClinicCode === clinicCode?.toUpperCase();
          
          return inviterBelongsToClinic || invitedBelongsToClinic || clinicCodeMatches;
        });
      }
      
      if (status && (status === "PENDING" || status === "APPROVED" || status === "REJECTED" || status === "USED")) {
        items = items.filter((x) => x && String(x.status || "").toUpperCase() === status);
      }
      
      // SECURITY: Remove dangerous fallback that returns all referrals
      // NEVER return referrals that don't belong to this clinic
      // if (items.length === 0 && list.length > 0) {
      //   items = list.filter((x) => x && !x.deleted_at);  // ❌ SECURITY RISK!
      // }

      console.log(`[REFERRALS] Returning ${items.length} referrals for clinic ${clinicCode}`);
      
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return res.json({ ok: true, items, source: "file" });
    };

    // SUPABASE: Primary source of truth
    if (isSupabaseEnabled()) {
      try {
        let items = (await getReferralsByClinicFromDB(clinicId, clinicCode)) || [];

        if (items.length === 0) {
          let clinicPatients = [];
          if (clinicId) {
            clinicPatients = await getPatientsByClinic(clinicId);
          }
          if ((!clinicPatients || clinicPatients.length === 0) && clinicCode) {
            try {
              const { data, error } = await supabase
                .from("patients")
                .select("id, patient_id, clinic_id, clinic_code")
                .eq("clinic_code", String(clinicCode).toUpperCase());
              if (error) {
                if (!isMissingColumnError(error, "clinic_code")) {
                  console.error("[REFERRALS] Supabase patient clinic_code lookup failed", {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                  });
                }
              } else if (Array.isArray(data)) {
                clinicPatients = data;
              }
            } catch (e) {
              console.error("[REFERRALS] Supabase patient clinic_code lookup exception:", e?.message || e);
            }
          }

          const patientIds = (clinicPatients || [])
            .map((p) => p.patient_id || p.id)
            .filter(Boolean);
          if (patientIds.length > 0) {
            const idsClause = patientIds.join(",");
            const { data: altData, error: altError } = await supabase
              .from("referrals")
              .select("*")
              .or(`inviter_patient_id.in.(${idsClause}),invited_patient_id.in.(${idsClause})`)
              .order("created_at", { ascending: false });
            if (!altError) {
              items = altData || [];
            }
          }
        }

        if (items.length === 0) {
          // Last-resort fallback: fetch referrals without clinic filter and
          // filter by patient clinic_id (covers referrals missing clinic_id).
          let q = supabase.from("referrals").select("*");
          if (status) {
            const raw = String(status || "").toUpperCase();
            const rawStatuses =
              raw === "PENDING"
                ? ["invited", "registered", "pending"]
                : raw === "APPROVED"
                  ? ["approved", "completed"]
                  : raw === "REJECTED"
                    ? ["rejected", "cancelled"]
                    : raw === "USED"
                      ? ["used"]
                      : [];
            if (rawStatuses.length > 0) {
              q = q.in("status", rawStatuses);
            }
          }
          const { data: allReferrals, error: allErr } = await q.order("created_at", { ascending: false });
          if (!allErr && Array.isArray(allReferrals) && allReferrals.length > 0) {
            const ids = new Set();
            allReferrals.forEach((r) => {
              const inviter = r.inviter_patient_id || r.referrer_patient_id;
              const invited = r.invited_patient_id || r.referred_patient_id;
              if (inviter) ids.add(inviter);
              if (invited) ids.add(invited);
            });
            const idList = Array.from(ids);
            let patientClinicMap = new Map();
            if (idList.length > 0) {
              const idsClause = idList.join(",");
              const { data: patientRows, error: patientErr } = await supabase
                .from("patients")
                .select("id, patient_id, clinic_id")
                .or(`id.in.(${idsClause}),patient_id.in.(${idsClause})`);
              if (!patientErr && Array.isArray(patientRows)) {
                patientRows.forEach((p) => {
                  if (p?.id) patientClinicMap.set(String(p.id), p.clinic_id || null);
                  if (p?.patient_id) patientClinicMap.set(String(p.patient_id), p.clinic_id || null);
                });
              } else if (patientErr && !isMissingColumnError(patientErr, "patient_id")) {
                console.error("[REFERRALS] Supabase patient lookup failed (fallback)", {
                  message: patientErr.message,
                  code: patientErr.code,
                  details: patientErr.details,
                });
              }
            }

            items = allReferrals.filter((r) => {
              if (!r) return false;
              if (clinicId && r.clinic_id && r.clinic_id === clinicId) return true;
              const inviter = r.inviter_patient_id || r.referrer_patient_id;
              const invited = r.invited_patient_id || r.referred_patient_id;
              const inviterClinic = inviter ? patientClinicMap.get(String(inviter)) : null;
              const invitedClinic = invited ? patientClinicMap.get(String(invited)) : null;
              return Boolean(clinicId && (inviterClinic === clinicId || invitedClinic === clinicId));
            });
          }
        }
        
        // Normalize to legacy shape for frontend
        items = items.map(mapReferralRowToLegacyItem).filter(Boolean);

        // Filter by status if provided
        if (status && (status === "PENDING" || status === "APPROVED" || status === "REJECTED" || status === "USED")) {
          items = items.filter((r) => String(r.status || "").toUpperCase() === status);
        }
        
        // Exclude soft-deleted referrals
        items = items.filter((r) => !r.deleted_at);
        
        // Sort by created date (newest first)
        items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        
        console.log(`[REFERRALS] Returning ${items.length} referrals from Supabase for clinic ${clinicCode}`);
        if (items.length === 0) {
          return respondFromFile();
        }
        return res.json({ ok: true, items, source: "supabase" });
      } catch (supabaseError) {
        console.error(`[REFERRALS] Supabase error:`, supabaseError.message);
        // Fall through to file-based
      }
    }
    
    return respondFromFile();
  } catch (error) {
    console.error("Referrals list error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// DELETE /api/admin/referrals/:referralId (admin cleanup)
app.delete("/api/admin/referrals/:referralId", requireAdminAuth, async (req, res) => {
  try {
    const referralId = String(req.params.referralId || "").trim();
    if (!referralId) return res.status(400).json({ ok: false, error: "referral_id_required" });

    // SUPABASE: delete by id (UUID) or referral_code (legacy)
    if (isSupabaseEnabled()) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(referralId);
      let q = supabase.from("referrals").delete();
      if (isUuid) {
        q = q.eq("id", referralId);
      } else {
        q = q.eq("referral_code", referralId);
      }
      if (req.clinicId) q = q.eq("clinic_id", req.clinicId);
      const { error } = await q;
      if (error) {
        console.error("[REFERRALS] Supabase delete failed", {
          message: error.message,
          code: error.code,
          details: error.details,
        });
        return res.status(500).json({ ok: false, error: "referral_delete_failed", supabase: supabaseErrorPublic(error) });
      }
    }

    // FILE fallback cleanup
    if (canUseFileFallback()) {
      const raw = readJson(REF_FILE, []);
      const list = Array.isArray(raw) ? raw : Object.values(raw);
      const filtered = list.filter((x) => {
        const id = x?.id || "";
        const code = x?.referralCode || x?.referral_code || "";
        return id !== referralId && code !== referralId;
      });
      writeJson(REF_FILE, filtered);

      const rawEvents = readJson(REF_EVENT_FILE, []);
      const events = Array.isArray(rawEvents) ? rawEvents : Object.values(rawEvents);
      const filteredEvents = events.filter((e) => {
        const rid = e?.referralId || e?.referral_id || "";
        return rid !== referralId;
      });
      writeJson(REF_EVENT_FILE, filteredEvents);
    }

    return res.json({ ok: true, deleted: true, id: referralId });
  } catch (error) {
    console.error("[REFERRALS] delete error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

function mapReferralRowToLegacyItem(r) {
  if (!r) return null;
  const rawStatus = String(r.status || "").toUpperCase();
  const normalizedStatus =
    rawStatus === "INVITED" || rawStatus === "REGISTERED"
      ? "PENDING"
      : rawStatus === "COMPLETED"
        ? "APPROVED"
        : rawStatus === "CANCELLED"
          ? "REJECTED"
          : rawStatus || "PENDING";
  const createdAt =
    r.createdAt ||
    (r.created_at ? Date.parse(r.created_at) : null) ||
    (r.updated_at ? Date.parse(r.updated_at) : null) ||
    now();

  return {
    id: r.id,
    status: normalizedStatus,
    inviterPatientId: r.inviter_patient_id || r.referrer_patient_id,
    invitedPatientId: r.invited_patient_id || r.referred_patient_id || null,
    referralCode: r.referral_code,
    createdAt,
    // v2 reward fields (optional)
    rewardAmount: r.reward_amount ?? null,
    rewardCurrency: r.reward_currency ?? "EUR",
    completedAt: r.completed_at || null,
  };
}

async function getPatientClinicIdForReferral(patientId) {
  // Best-effort: derive clinic_id from patients table for admin isolation/reporting
  try {
    // Prefer patient_id when available; fall back to id
    const q1 = await supabase
      .from("patients")
      .select("clinic_id, patient_id, id")
      .eq("patient_id", patientId)
      .single();
    if (!q1.error && q1.data?.clinic_id) return q1.data.clinic_id;

    const msg = String(q1.error?.message || "");
    const isMissingPatientIdCol =
      msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
    const isNotFound = String(q1.error?.code || "") === "PGRST116";
    if (q1.error && !isMissingPatientIdCol && !isNotFound) return null;

    const q2 = await supabase
      .from("patients")
      .select("clinic_id, id")
      .eq("id", patientId)
      .single();
    if (!q2.error && q2.data?.clinic_id) return q2.data.clinic_id;
    return null;
  } catch {
    return null;
  }
}

async function resolvePatientUuidForReferral(candidate) {
  const s = String(candidate || "").trim();
  if (!s) return null;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  if (isUuid) return s;
  if (!isSupabaseEnabled()) return null;
  try {
    const uuidLike = (v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());

    // Some schemas store the legacy id in `patient_id` and the UUID in `id`.
    // Others might only have `id`. Try both `id` and `patient_id` match.
    const q1 = await supabase
      .from("patients")
      .select("id, patient_id")
      .or(`id.eq.${s},patient_id.eq.${s}`)
      .limit(1)
      .maybeSingle();

    if (!q1.error && q1.data) {
      const candidates = [q1.data.id, q1.data.patient_id].filter(Boolean);
      const found = candidates.find((v) => uuidLike(v));
      if (found) return String(found).trim();
    }

    if (q1.error && isMissingColumnError(q1.error, "patient_id")) {
      const q2 = await supabase
        .from("patients")
        .select("id")
        .eq("id", s)
        .limit(1)
        .maybeSingle();
      if (!q2.error && q2.data?.id && uuidLike(q2.data.id)) {
        return String(q2.data.id).trim();
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function generateReferralCodeV2() {
  // Short, URL-safe code. Collision is guarded by DB unique index + retry.
  const bytes = crypto.randomBytes(6).toString("base64").replaceAll("+", "").replaceAll("/", "").replaceAll("=", "");
  return `R_${bytes.substring(0, 10).toUpperCase()}`;
}

// POST /api/referral/invite
// Patient creates an invite; legacy flow continues to work in parallel.
app.post("/api/referral/invite", requireToken, async (req, res) => {
  try {
    const patientId = String(req.patientId || "").trim();
    if (!patientId) return res.status(401).json({ ok: false, error: "unauthorized" });
    if (!isSupabaseEnabled()) return res.status(500).json({ ok: false, error: "supabase_disabled" });

    // Resolve inviter candidates (UUID vs legacy p_xxx) to support evolving schemas.
    let inviterRow = null;
    try {
      const q1 = await supabase
        .from("patients")
        .select("id, patient_id, clinic_id")
        .eq("patient_id", patientId)
        .maybeSingle();
      if (!q1.error && q1.data) inviterRow = q1.data;
      const isMissingPatientIdCol =
        q1.error && isMissingColumnError(q1.error, "patient_id");
      const isNotFound = String(q1.error?.code || "") === "PGRST116";
      if (!inviterRow && (isMissingPatientIdCol || isNotFound)) {
        const q2 = await supabase
          .from("patients")
          .select("id, patient_id, clinic_id")
          .eq("id", patientId)
          .maybeSingle();
        if (!q2.error && q2.data) inviterRow = q2.data;
      }
    } catch {
      // best-effort only
    }

    const uuidLike = (s) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));
    let inviterCandidates = Array.from(
      new Set([inviterRow?.id, inviterRow?.patient_id, patientId].filter(Boolean))
    );

    const resolvedInviterUuids = (await Promise.all(inviterCandidates.map(resolvePatientUuidForReferral))).filter(Boolean);
    inviterCandidates = Array.from(new Set([...inviterCandidates, ...resolvedInviterUuids]));
    inviterCandidates = [
      ...inviterCandidates.filter((x) => uuidLike(x)),
      ...inviterCandidates.filter((x) => !uuidLike(x)),
    ];

    const clinicId = req.clinicId || (await getPatientClinicIdForReferral(patientId));
    let clinicCode = null;
    if (clinicId) {
      try {
        const { data: clinicRow, error: clinicErr } = await supabase
          .from("clinics")
          .select("clinic_code")
          .eq("id", clinicId)
          .single();
        if (!clinicErr && clinicRow?.clinic_code) {
          clinicCode = String(clinicRow.clinic_code).trim().toUpperCase();
        } else if (clinicErr && String(clinicErr.code || "") !== "PGRST116") {
          console.warn("[REFERRAL] clinic_code lookup failed", {
            message: clinicErr.message,
            code: clinicErr.code,
            details: clinicErr.details,
          });
        }
      } catch (e) {
        console.warn("[REFERRAL] clinic_code lookup exception:", e?.message || e);
      }
    }

    let lastErr = null;
    for (let i = 0; i < 6; i++) {
      const referral_code = generateReferralCodeV2();
      const doInsert = async (payload) =>
        supabase.from("referrals").insert(payload).select("*").single();

      let inserted = null;
      let insertError = null;

      // Try different inviter id representations (uuid first, then legacy)
      for (const inviterId of inviterCandidates) {
        const insertPayload = {
          // keep existing schema fields (clinic_id is optional)
          ...(clinicId ? { clinic_id: clinicId } : {}),
          ...(clinicCode ? { clinic_code: clinicCode } : {}),
          inviter_patient_id: inviterId,
          referral_code,
          status: "PENDING",
          reward_currency: "EUR",
        };

        let { data, error } = await doInsert(insertPayload);

        // Schema-evolution fallbacks
        if (error && clinicCode && isMissingColumnError(error, "clinic_code")) {
          const fallbackPayload = { ...insertPayload };
          delete fallbackPayload.clinic_code;
          ({ data, error } = await doInsert(fallbackPayload));
        }
        if (error && isMissingColumnError(error, "reward_currency")) {
          const fallbackPayload = { ...insertPayload };
          delete fallbackPayload.reward_currency;
          ({ data, error } = await doInsert(fallbackPayload));
        }

        if (!error) {
          inserted = data;
          break;
        }

        insertError = error;
        // UUID mismatch -> try next candidate representation
        if (isInvalidUuidError(error)) continue;
        // Unique violation -> handled by outer retry (new referral code)
        break;
      }

      if (inserted) {
        let verified = inserted;
        try {
          const { data: verifyRow, error: verifyErr } = await supabase
            .from("referrals")
            .select("*")
            .eq("id", inserted.id)
            .single();
          if (!verifyErr && verifyRow) {
            verified = verifyRow;
          } else if (verifyErr) {
            console.warn("[REFERRAL] Insert verify failed (non-fatal)", {
              message: verifyErr.message,
              code: verifyErr.code,
              details: verifyErr.details,
            });
          }
        } catch (verifyException) {
          console.warn("[REFERRAL] Insert verify exception (non-fatal):", verifyException?.message || verifyException);
        }
        return res.json({
          ok: true,
          referralId: verified.id,
          referralCode: verified.referral_code,
          item: mapReferralRowToLegacyItem(verified),
        });
      }

      lastErr = insertError;
      // Unique violation -> retry with a new code
      if (String(insertError?.code || "") === "23505") continue;

      console.error("[REFERRAL] Supabase save failed", {
        message: insertError?.message,
        code: insertError?.code,
        details: insertError?.details,
      });
      return res.status(500).json({ ok: false, error: "referral_invite_failed" });
    }

    console.error("[REFERRAL] Supabase save failed (exhausted retries)", {
      message: lastErr?.message,
      code: lastErr?.code,
      details: lastErr?.details,
    });
    return res.status(500).json({ ok: false, error: "referral_invite_failed" });
  } catch (e) {
    console.error("[REFERRAL] invite error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// GET /api/patient/:patientId/referrals
// Get referrals where this patient is the inviter OR the invited patient (legacy-compatible)
app.get("/api/patient/:patientId/referrals", requireAdminOrPatientToken, async (req, res) => {
  console.log(`[GET /api/patient/:patientId/referrals] ========== START ==========`);
  console.log(`[GET /api/patient/:patientId/referrals] URL: ${req.url}`);
  console.log(`[GET /api/patient/:patientId/referrals] Method: ${req.method}`);
  console.log(`[GET /api/patient/:patientId/referrals] Params:`, req.params);
  console.log(`[GET /api/patient/:patientId/referrals] Query:`, req.query);
  
  try {
    const { patientId } = req.params;
    const status = req.query.status;
    
    console.log(`[GET /api/patient/:patientId/referrals] Request received - patientId: ${patientId}, status filter: ${status || 'none'}`);
    
    if (!patientId) {
      console.log(`[GET /api/patient/:patientId/referrals] Error: patientId_required`);
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    
    // Patient can only access their own referrals (admin can access any)
    if (!req.isAdmin && String(req.patientId || "").trim() !== String(patientId || "").trim()) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    const respondFromFile = () => {
      const raw = readJson(REF_FILE, []);
      const list = Array.isArray(raw) ? raw : Object.values(raw);
      console.log(`[GET /api/patient/:patientId/referrals] Total referrals in DB: ${list.length}`);

      const normalizedPatientId = String(patientId || "").trim();
      console.log(`[GET /api/patient/:patientId/referrals] Searching for patientId: "${normalizedPatientId}"`);

      if (list.length > 0) {
        console.log(`[GET /api/patient/:patientId/referrals] All referral patient IDs in DB:`, list.map((r) => ({
          id: r.id,
          inviterPatientId: r.inviterPatientId,
          invitedPatientId: r.invitedPatientId,
          inviterMatch: String(r.inviterPatientId || "").trim() === normalizedPatientId,
          invitedMatch: String(r.invitedPatientId || "").trim() === normalizedPatientId,
        })));
      }

      let items = list.filter((x) => {
        if (!x) return false;
        const inviterId = String(x.inviterPatientId || "").trim();
        const invitedId = String(x.invitedPatientId || "").trim();
        return inviterId === normalizedPatientId || invitedId === normalizedPatientId;
      });
      console.log(`[GET /api/patient/:patientId/referrals] Filtered referrals (inviter or invited): ${items.length}`);
      console.log(`[GET /api/patient/:patientId/referrals] Referral details:`, items.map((r) => ({
        id: r.id,
        status: r.status,
        inviterPatientId: r.inviterPatientId,
        invitedPatientId: r.invitedPatientId,
      })));

      if (status && (status === "PENDING" || status === "APPROVED" || status === "REJECTED")) {
        const beforeFilter = items.length;
        items = items.filter((x) => x.status === status);
        console.log(`[GET /api/patient/:patientId/referrals] After status filter (${status}): ${items.length} (was ${beforeFilter})`);
      }

      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      console.log(`[GET /api/patient/:patientId/referrals] Returning ${items.length} referrals for patient ${patientId}`);
      return res.json({ ok: true, items, source: "file" });
    };

    // PRODUCTION: Supabase is source of truth
    if (isSupabaseEnabled()) {
      const normalizedPatientId = String(patientId || "").trim();
      let patientUuid = null;
      try {
        const p = await getPatientById(normalizedPatientId);
        patientUuid = p?.id || null;
      } catch {}

      const candidates = [normalizedPatientId, patientUuid].filter(Boolean);
      const seen = new Set();
      const queryVariants = [];
      for (const candidate of candidates) {
        const clauses = [
          `inviter_patient_id.eq.${candidate},invited_patient_id.eq.${candidate}`,
        ];
        clauses.forEach((c) => {
          if (!seen.has(c)) {
            seen.add(c);
            queryVariants.push(c);
          }
        });
      }

      let lastError = null;
      for (const orClause of queryVariants) {
        let q = supabase.from("referrals").select(`
          *,
          inviter_patient:patients!fk_referrals_inviter (
            patientId:patient_id,
            name
          ),
          invited_patient:patients!fk_referrals_invited (
            patientId:patient_id,
            name
          )
        `).or(orClause);
        if (req.isAdmin && req.clinicId) q = q.eq("clinic_id", req.clinicId);
        const { data, error } = await q.order("created_at", { ascending: false });
        if (!error) {
          let items = (data || []).map(ref => {
            const legacyItem = mapReferralRowToLegacyItem(ref);
            if (legacyItem) {
              const result = {
                ...legacyItem,
                inviterPatientName: ref.inviter_patient?.name || null,
                invitedPatientName: ref.invited_patient?.name || null
              };
              console.log(`[REFERRALS] Patient endpoint - processed referral ${ref.id}:`, {
                inviterPatientId: ref.inviter_patient_id,
                invitedPatientId: ref.invited_patient_id,
                inviterPatientName: result.inviterPatientName,
                invitedPatientName: result.invitedPatientName,
                discountPercent: ref.discount_percent,
                inviterDiscountPercent: ref.inviter_discount_percent,
                invitedDiscountPercent: ref.invited_discount_percent,
                legacyDiscountPercent: legacyItem.discountPercent
              });
              return result;
            }
            return null;
          }).filter(Boolean);
          if (status) items = items.filter((x) => x.status === status);
          if (items.length === 0) {
            return respondFromFile();
          }
          return res.json({ ok: true, items, source: "supabase" });
        }
        lastError = error;
        if (isInvalidUuidError(error)) {
          continue;
        }
        if (!isMissingColumnError(error)) {
          console.error("[REFERRALS] Supabase fetch failed", {
            message: error.message,
            code: error.code,
            details: error.details,
          });
          break;
        }
      }

      if (canUseFileFallback()) {
        console.warn("[REFERRALS] Supabase fetch failed, using file fallback");
        return respondFromFile();
      }
      return res.status(500).json({
        ok: false,
        error: "referrals_fetch_failed",
        supabase: supabaseErrorPublic(lastError),
      });
    }

    // Legacy file fallback
    return respondFromFile();
  } catch (error) {
    console.error("[GET /api/patient/:patientId/referrals] Error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// PUT /api/referral/:referralId
// Status updates (registered/completed/cancelled). Admin only by default.
app.put("/api/referral/:referralId", requireAdminOrPatientToken, async (req, res) => {
  try {
    const referralId = String(req.params.referralId || "").trim();
    if (!referralId) return res.status(400).json({ ok: false, error: "referral_id_required" });
    if (!req.isAdmin) return res.status(403).json({ ok: false, error: "forbidden" });
    if (!isSupabaseEnabled()) return res.status(500).json({ ok: false, error: "supabase_disabled" });

    const body = isPlainObject(req.body) ? req.body : {};
    const nextStatus = body.status ? String(body.status).trim().toLowerCase() : "";
    const allowed = new Set(["invited", "registered", "completed", "cancelled"]);
    if (!allowed.has(nextStatus)) {
      return res.status(400).json({ ok: false, error: "invalid_status" });
    }

    const update = {
      status: nextStatus,
      ...(body.reward_amount !== undefined ? { reward_amount: body.reward_amount } : {}),
      ...(body.reward_currency ? { reward_currency: String(body.reward_currency).trim().toUpperCase() } : {}),
      ...(nextStatus === "completed" ? { completed_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    };

    let q = supabase.from("referrals").update(update).eq("id", referralId);
    if (req.clinicId) q = q.eq("clinic_id", req.clinicId);

    const { data, error } = await q.select("*").single();
    if (error) {
      console.error("[REFERRAL] Supabase save failed", {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      return res.status(500).json({ ok: false, error: "referral_update_failed" });
    }

    return res.json({ ok: true, item: mapReferralRowToLegacyItem(data), referral: data });
  } catch (e) {
    console.error("[REFERRAL] update error:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// PATCH /api/admin/referrals/:id/approve
app.patch("/api/admin/referrals/:id/approve", requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    
    // PRODUCTION: Clinic isolation - use req.clinic.id
    if (!req.clinic || !req.clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_not_authenticated" });
    }
    
    // PRODUCTION: Discount validation - 0-50% range (server-side)
    const inviterDiscountPercent = body.inviterDiscountPercent != null ? Number(body.inviterDiscountPercent) : null;
    const invitedDiscountPercent = body.invitedDiscountPercent != null ? Number(body.invitedDiscountPercent) : null;
    const discountPercent = body.discountPercent != null ? Number(body.discountPercent) : null;
    
    // Validasyon - 0-50% range (fraud prevention)
    if (inviterDiscountPercent != null && (Number.isNaN(inviterDiscountPercent) || inviterDiscountPercent < 0 || inviterDiscountPercent > 50)) {
      return res.status(400).json({ ok: false, error: "inviterDiscountPercent must be 0..50" });
    }
    if (invitedDiscountPercent != null && (Number.isNaN(invitedDiscountPercent) || invitedDiscountPercent < 0 || invitedDiscountPercent > 50)) {
      return res.status(400).json({ ok: false, error: "invitedDiscountPercent must be 0..50" });
    }
    if (discountPercent != null && (Number.isNaN(discountPercent) || discountPercent < 0 || discountPercent > 50)) {
      return res.status(400).json({ ok: false, error: "discountPercent must be 0..50" });
    }
    
    // SUPABASE: Primary source of truth
    if (isSupabaseEnabled()) {
      try {
        // Get referral from Supabase
        console.log("[REFERRAL APPROVE] Searching for referral with ID:", id);
        console.log("[REFERRAL APPROVE] Clinic ID from token:", req.clinicId);
        console.log("[REFERRAL APPROVE] Full clinic object:", req.clinic);
        
        const { data: referral, error: fetchError } = await supabase
          .from('referrals')
          .select('*')
          .eq('id', id)
          .eq('clinic_id', req.clinicId) // CRITICAL: Clinic isolation
          .single();
        
        if (fetchError || !referral) {
          console.warn("[REFERRAL APPROVE] Supabase referral not found, falling back to file");
          console.warn("[REFERRAL APPROVE] Fetch error:", fetchError);
          throw new Error("supabase_referral_not_found");
        }
        
        // PRODUCTION: Self-referral check
        if (referral.inviter_patient_id === referral.invited_patient_id) {
          return res.status(400).json({ ok: false, error: "self_referral_forbidden", message: "Kendi kendine referral yapılamaz." });
        }
        
        // PRODUCTION: State machine - only PENDING can be approved
        const currentStatus = String(referral.status || "").toUpperCase();
        if (!["PENDING", "INVITED", "REGISTERED"].includes(currentStatus)) {
          return res.status(409).json({ ok: false, error: "invalid_state_transition", message: `Sadece PENDING/INVITED/REGISTERED durumundaki referral onaylanabilir. Mevcut durum: ${referral.status}` });
        }
        
        const clinic = req.clinic || {};
        const referralLevels = normalizeReferralLevels(
          clinic?.settings?.referralLevels || clinic?.referralLevels || {},
          {
            level1: clinic.defaultInviterDiscountPercent ?? null,
            level2: null,
            level3: null,
          }
        );
        const referralLevelError = validateReferralLevels(referralLevels);
        if (referralLevelError) {
          return res.status(400).json({ ok: false, error: referralLevelError });
        }

        const inviterId = referral.inviter_patient_id || referral.referrer_patient_id;
        const invitedId = referral.invited_patient_id || referral.referred_patient_id;
        const inviterCountBefore = await countSuccessfulReferrals(inviterId, req.clinicId);
        const inviterCountAfter = inviterCountBefore + 1;
        const inviterPercentAfter = levelPercentForCount(inviterCountAfter, referralLevels);

        const finalInviterPercent = inviterDiscountPercent ?? inviterPercentAfter;
        const finalInvitedPercent = invitedDiscountPercent ?? inviterPercentAfter;
        const finalDiscountPercent = discountPercent ?? inviterPercentAfter;

        if (finalInviterPercent == null || finalInvitedPercent == null) {
          return res.status(400).json({
            ok: false,
            error: "Default discount percentages must be entered in Clinic Settings page",
          });
        }
        
        if (finalInviterPercent == null && finalInvitedPercent == null) {
          finalInviterPercent = finalDiscountPercent;
          finalInvitedPercent = finalDiscountPercent;
        } else if (finalInviterPercent == null) {
          finalInviterPercent = finalInvitedPercent;
        } else if (finalInvitedPercent == null) {
          finalInvitedPercent = finalInviterPercent;
        }
        
        if (finalDiscountPercent == null) {
          finalDiscountPercent = Math.round((finalInviterPercent + finalInvitedPercent) / 2);
        }
        
        // Update in Supabase
        const { data: updated, error: updateError } = await supabase
          .from('referrals')
          .update({
            status: 'APPROVED',
            inviter_discount_percent: finalInviterPercent,
            invited_discount_percent: finalInvitedPercent,
            discount_percent: finalDiscountPercent,
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .eq('clinic_id', req.clinicId) // CRITICAL: Clinic isolation
          .select()
          .single();
        
        if (updateError) {
          console.error(`[REFERRAL APPROVE] Supabase error:`, updateError);
          return res.status(500).json({ ok: false, error: "update_failed" });
        }
        
        console.log(`[REFERRAL APPROVE] ✅ Approved referral ${id} in Supabase`);

        // Update referral_state for inviter and invited
        const inviterPatient = await getPatientById(inviterId);
        const invitedPatient = await getPatientById(invitedId);
        const inviterState = normalizeReferralState(inviterPatient?.referral_state);
        const invitedState = normalizeReferralState(invitedPatient?.referral_state);

        const cap = referralLevels.level3 ?? referralLevels.level2 ?? referralLevels.level1 ?? 0;
        const inviterNext = computeReferralTotals(
          {
            ...inviterState,
            earnedDiscountPercent: finalInviterPercent,
          },
          cap
        );
        const invitedNext = computeReferralTotals(
          {
            ...invitedState,
            baseDiscountPercent: Math.max(invitedState.baseDiscountPercent, finalInvitedPercent),
          },
          cap
        );

        await updatePatientReferralState(inviterId, inviterNext);
        await updatePatientReferralState(invitedId, invitedNext);
        
        // TODO: Audit log - referral_approved event
        
        return res.json({ ok: true, item: updated });
      } catch (supabaseError) {
        console.error(`[REFERRAL APPROVE] Supabase error:`, supabaseError);
        // Fall through to file-based
      }
    }
    
    // FILE-BASED: Fallback
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    const idx = list.findIndex((x) => x && x.id === id);
    
    if (idx < 0) {
      return res.status(404).json({ ok: false, error: "referral_not_found" });
    }
    
    const referral = list[idx];
    
    // PRODUCTION: Self-referral check
    if (referral.inviterPatientId === referral.invitedPatientId) {
      return res.status(400).json({ ok: false, error: "self_referral_forbidden", message: "Kendi kendine referral yapılamaz." });
    }
    
    // PRODUCTION: State machine - only PENDING can be approved
    const fileStatus = String(referral.status || "").toUpperCase();
    if (!["PENDING", "INVITED", "REGISTERED"].includes(fileStatus)) {
      return res.status(409).json({ ok: false, error: "invalid_state_transition", message: `Sadece PENDING/INVITED/REGISTERED durumundaki referral onaylanabilir. Mevcut durum: ${referral.status}` });
    }
    
    const clinic = req.clinic || {};
    const referralLevels = normalizeReferralLevels(
      clinic?.settings?.referralLevels || clinic?.referralLevels || {},
      {
        level1: clinic.defaultInviterDiscountPercent ?? null,
        level2: null,
        level3: null,
      }
    );
    const referralLevelError = validateReferralLevels(referralLevels);
    if (referralLevelError) {
      return res.status(400).json({ ok: false, error: referralLevelError });
    }

    const inviterCountBefore = countSuccessfulReferralsFile(list, referral.inviterPatientId);
    const inviterPercentAfter = levelPercentForCount(inviterCountBefore + 1, referralLevels);

    let finalInviterPercent = inviterDiscountPercent ?? inviterPercentAfter;
    let finalInvitedPercent = invitedDiscountPercent ?? inviterPercentAfter;
    let finalDiscountPercent = discountPercent ?? inviterPercentAfter;

    if (finalInviterPercent == null || finalInvitedPercent == null) {
      return res.status(400).json({
        ok: false,
        error: "Default discount percentages must be entered in Clinic Settings page",
      });
    }

    // Güncelleme
    const updated = {
      ...list[idx],
      status: "APPROVED",
      approvedAt: now(),
    };
    
    // Yeni format varsa onu kullan
    if (finalInviterPercent != null || finalInvitedPercent != null) {
      updated.inviterDiscountPercent = finalInviterPercent;
      updated.invitedDiscountPercent = finalInvitedPercent;
      if (finalDiscountPercent != null) {
        updated.discountPercent = finalDiscountPercent;
      } else if (finalInviterPercent != null && finalInvitedPercent != null) {
        updated.discountPercent = Math.round((finalInviterPercent + finalInvitedPercent) / 2);
      } else {
        updated.discountPercent = finalInviterPercent ?? finalInvitedPercent;
      }
    } else if (finalDiscountPercent != null) {
      updated.discountPercent = finalDiscountPercent;
      updated.inviterDiscountPercent = finalDiscountPercent;
      updated.invitedDiscountPercent = finalDiscountPercent;
    }
    
    list[idx] = updated;
    writeJson(REF_FILE, list);
    
    res.json({ ok: true, item: updated });
  } catch (error) {
    console.error("Referral approve error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// PATCH /api/admin/referrals/:id/reject
app.patch("/api/admin/referrals/:id/reject", requireAdminAuth, async (req, res) => {
  try {
    console.log("[REFERRAL REJECT] ========================================");
    console.log("[REFERRAL REJECT] Request received");
    console.log("[REFERRAL REJECT] Params:", req.params);
    console.log("[REFERRAL REJECT] Headers:", req.headers);
    console.log("[REFERRAL REJECT] Body:", req.body);
    console.log("[REFERRAL REJECT] ========================================");
    
    const { id } = req.params;
    
    // PRODUCTION: Clinic isolation - use req.clinic.id
    if (!req.clinic || !req.clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_not_authenticated" });
    }
    
    // SUPABASE: Primary source of truth
    if (isSupabaseEnabled()) {
      try {
        // Get referral from Supabase
        console.log("[REFERRAL REJECT] Searching for referral with ID:", id);
        console.log("[REFERRAL REJECT] Clinic ID from token:", req.clinicId);
        
        const { data: referral, error: fetchError } = await supabase
          .from('referrals')
          .select('*')
          .eq('id', id)
          .eq('clinic_id', req.clinicId) // CRITICAL: Clinic isolation
          .single();
        
        if (fetchError || !referral) {
          console.warn("[REFERRAL REJECT] Supabase referral not found, falling back to file");
          throw new Error("supabase_referral_not_found");
        }
        
        // PRODUCTION: State machine - only PENDING can be rejected
        const currentStatus = String(referral.status || "").toUpperCase();
        if (!["PENDING", "INVITED", "REGISTERED"].includes(currentStatus)) {
          return res.status(409).json({ ok: false, error: "invalid_state_transition", message: `Sadece PENDING/INVITED/REGISTERED durumundaki referral reddedilebilir. Mevcut durum: ${referral.status}` });
        }
        
        // Update in Supabase
        console.log("[REFERRAL REJECT] Attempting to update referral with ID:", id);
        console.log("[REFERRAL REJECT] Clinic ID for update:", req.clinicId);
        console.log("[REFERRAL REJECT] Current referral status:", referral.status);
        
        const updateData = {
          status: 'REJECTED',
          inviter_discount_percent: null,
          invited_discount_percent: null,
          discount_percent: null,
          approved_at: null,
          updated_at: new Date().toISOString()
        };
        
        console.log("[REFERRAL REJECT] Update data:", updateData);
        
        const { data: updated, error: updateError } = await supabase
          .from('referrals')
          .update(updateData)
          .eq('id', id)
          .eq('clinic_id', req.clinicId) // CRITICAL: Clinic isolation
          .select()
          .single();
        
        if (updateError) {
          console.error(`[REFERRAL REJECT] Supabase error:`, {
            error: updateError,
            message: updateError.message,
            details: updateError.details,
            code: updateError.code,
            hint: updateError.hint
          });
          return res.status(500).json({ 
            ok: false, 
            error: "update_failed", 
            message: updateError.message || "Failed to reject referral",
            details: updateError.details
          });
        }
        
        console.log(`[REFERRAL REJECT] ✅ Rejected referral ${id} in Supabase`);
        
        // TODO: Audit log - referral_rejected event
        
        return res.json({ ok: true, item: updated });
      } catch (supabaseError) {
        console.error(`[REFERRAL REJECT] Supabase error:`, supabaseError);
        // Fall through to file-based
      }
    }
    
    // FILE-BASED: Fallback
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    const idx = list.findIndex((x) => x && x.id === id);
    
    if (idx < 0) {
      return res.status(404).json({ ok: false, error: "referral_not_found" });
    }
    
    // PRODUCTION: State machine - only PENDING/INVITED/REGISTERED can be rejected
    const fileStatus = String(list[idx].status || "").toUpperCase();
    if (!["PENDING", "INVITED", "REGISTERED"].includes(fileStatus)) {
      return res.status(409).json({ ok: false, error: "invalid_state_transition", message: `Sadece PENDING/INVITED/REGISTERED durumundaki referral reddedilebilir. Mevcut durum: ${list[idx].status}` });
    }
    
    list[idx] = {
      ...list[idx],
      status: "REJECTED",
      discountPercent: null,
      inviterDiscountPercent: null,
      invitedDiscountPercent: null,
      approvedAt: null,
      rejectedAt: now(),
    };
    
    writeJson(REF_FILE, list);
    res.json({ ok: true, item: list[idx] });
  } catch (error) {
    console.error("[REFERRAL REJECT] ========================================");
    console.error("[REFERRAL REJECT] ERROR CAUGHT:");
    console.error("[REFERRAL REJECT] Error:", error);
    console.error("[REFERRAL REJECT] Error message:", error?.message);
    console.error("[REFERRAL REJECT] Error stack:", error?.stack);
    console.error("[REFERRAL REJECT] ========================================");
    
    res.status(500).json({ 
      ok: false, 
      error: error?.message || "internal_error",
      details: error?.stack
    });
  }
});

// ================== REFERRAL EVENTS (Model 1: Invitee-based cap) ==================
// ReferralEvent: Payment-based referral system
// earned_discount = invitee_paid_amount * INVITER_RATE
// invitee_discount = invitee_paid_amount * INVITEE_RATE

// Helper: Round to currency (2 decimals)
function roundToCurrency(amount) {
  return Math.round(amount * 100) / 100;
}

// POST /api/referrals/payment-event
// Called when invitee payment is completed (PAID/CAPTURED status)
app.post("/api/referrals/payment-event", async (req, res) => {
  try {
    const {
      inviteePatientId,
      inviteePaymentId,
      inviteePaidAmount,
      inviterPaidAmount,
      currency = "USD",
      paymentStatus = "PAID",
    } = req.body || {};
    
    if (!inviteePatientId || !inviteePaymentId || !inviteePaidAmount) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }
    
    const paidAmount = Number(inviteePaidAmount);
    if (isNaN(paidAmount) || paidAmount <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_paid_amount" });
    }
    const inviterAmount = inviterPaidAmount != null ? Number(inviterPaidAmount) : null;
    if (inviterAmount != null && (isNaN(inviterAmount) || inviterAmount <= 0)) {
      return res.status(400).json({ ok: false, error: "invalid_inviter_paid_amount" });
    }
    
    // Only process PAID/CAPTURED payments
    if (paymentStatus !== "PAID" && paymentStatus !== "CAPTURED") {
      return res.status(400).json({ ok: false, error: "payment_not_completed" });
    }
    
    const handleFileFallback = () => {
      // Find referral relationship (inviter for this invitee)
      const referrals = readJson(REF_FILE, []);
      const referralList = Array.isArray(referrals) ? referrals : Object.values(referrals);
      
      // Find the first valid referral (inviter) for this invitee
      const referral = referralList.find(
        (r) => r.invitedPatientId === inviteePatientId && r.status === "APPROVED"
      );
      
      if (!referral) {
        return res.status(404).json({ ok: false, error: "no_referral_found" });
      }
      
      // Check if event already exists for this payment
      const events = readJson(REF_EVENT_FILE, []);
      const eventList = Array.isArray(events) ? events : Object.values(events);
      
      const existingEvent = eventList.find((e) => e.inviteePaymentId === inviteePaymentId);
      if (existingEvent) {
        return res.status(409).json({ ok: false, error: "event_already_exists" });
      }
      
      // Get clinic config for rates
      const clinic = readJson(CLINIC_FILE, {});
      const referralDiscountPercent =
        referral.inviterDiscountPercent ??
        referral.discountPercent ??
        clinic.defaultInviterDiscountPercent ??
        0;
      const inviterRate = Number(referralDiscountPercent || 0) / 100;
      const inviteeRate =
        Number(
          referral.invitedDiscountPercent ??
            referral.discountPercent ??
            clinic.defaultInvitedDiscountPercent ??
            referralDiscountPercent ??
            0
        ) / 100;
      const basePaidAmount = inviterAmount != null ? Math.min(paidAmount, inviterAmount) : paidAmount;
      
      // Calculate earned discount (from invitee's paid amount)
      const earnedDiscountAmount = roundToCurrency(basePaidAmount * inviterRate);
      
      // Create referral event
      const newEvent = {
        id: rid("refevt"),
        inviterPatientId: referral.inviterPatientId,
        inviteePatientId,
        inviteePaymentId,
        inviteePaidAmount: paidAmount,
        inviterPaidAmount: inviterAmount,
        basePaidAmount,
        currency,
        inviterRate,
        inviteeRate,
        earnedDiscountAmount,
        status: "EARNED",
        createdAt: now(),
      };
      
      eventList.push(newEvent);
      writeJson(REF_EVENT_FILE, eventList);
      
      // Update inviter's credit (add to patient record)
      const patients = readJson(PAT_FILE, {});
      if (patients[referral.inviterPatientId]) {
        const inviter = patients[referral.inviterPatientId];
        inviter.referralCredit = (inviter.referralCredit || 0) + earnedDiscountAmount;
        inviter.referralCreditUpdatedAt = now();
        writeJson(PAT_FILE, patients);
      }
      
      console.log(`[REFERRAL_EVENT] Created: ${newEvent.id}, Inviter: ${referral.inviterPatientId}, Credit: ${earnedDiscountAmount} ${currency}`);
      
      return res.json({ ok: true, event: newEvent });
    };

    if (isSupabaseEnabled()) {
      try {
        const { data: referrals, error: referralError } = await supabase
          .from("referrals")
          .select("*")
          .eq("invited_patient_id", inviteePatientId)
          .eq("status", "APPROVED")
          .order("created_at", { ascending: false })
          .limit(1);

        if (referralError) {
          if (isMissingTableError(referralError, "referrals") && canUseFileFallback()) {
            console.warn("[REFERRAL_EVENT] Supabase missing referrals table, using file fallback");
            return handleFileFallback();
          }
          return res.status(500).json({
            ok: false,
            error: "referral_fetch_failed",
            supabase: supabaseErrorPublic(referralError),
          });
        }

        const referral = Array.isArray(referrals) ? referrals[0] : null;
        if (!referral) {
          return res.status(404).json({ ok: false, error: "no_referral_found" });
        }

        const { data: existing, error: existingError } = await supabase
          .from("referral_events")
          .select("id")
          .eq("invitee_payment_id", inviteePaymentId)
          .limit(1);

        if (existingError) {
          if (isMissingTableError(existingError, "referral_events") && canUseFileFallback()) {
            console.warn("[REFERRAL_EVENT] Supabase missing referral_events table, using file fallback");
            return handleFileFallback();
          }
          return res.status(500).json({
            ok: false,
            error: "referral_event_fetch_failed",
            supabase: supabaseErrorPublic(existingError),
          });
        }

        if (Array.isArray(existing) && existing.length > 0) {
          return res.status(409).json({ ok: false, error: "event_already_exists" });
        }

        const clinic = referral.clinic_id ? await getClinicById(referral.clinic_id) : null;
        const clinicSettings = clinic?.settings || {};
        const referralDiscountPercent =
          referral.inviter_discount_percent ??
          referral.discount_percent ??
          clinicSettings.defaultInviterDiscountPercent ??
          0;
        const inviterRate = Number(referralDiscountPercent || 0) / 100;
        const inviteeRate =
          Number(
            referral.invited_discount_percent ??
              referral.discount_percent ??
              clinicSettings.defaultInvitedDiscountPercent ??
              referralDiscountPercent ??
              0
          ) / 100;
        const basePaidAmount = inviterAmount != null ? Math.min(paidAmount, inviterAmount) : paidAmount;
        const earnedDiscountAmount = roundToCurrency(basePaidAmount * inviterRate);

        const newEvent = {
          clinic_id: referral.clinic_id || null,
          inviter_patient_id: referral.inviter_patient_id,
          invitee_patient_id: inviteePatientId,
          invitee_payment_id: inviteePaymentId,
          invitee_paid_amount: paidAmount,
          inviter_paid_amount: inviterAmount,
          base_paid_amount: basePaidAmount,
          currency,
          inviter_rate: inviterRate,
          invitee_rate: inviteeRate,
          earned_discount_amount: earnedDiscountAmount,
          status: "EARNED",
          created_at: new Date().toISOString(),
        };

        const { data: inserted, error: insertError } = await supabase
          .from("referral_events")
          .insert(newEvent)
          .select("*")
          .single();

        if (insertError) {
          if (isMissingTableError(insertError, "referral_events") && canUseFileFallback()) {
            console.warn("[REFERRAL_EVENT] Supabase missing referral_events table, using file fallback");
            return handleFileFallback();
          }
          return res.status(500).json({
            ok: false,
            error: "referral_event_insert_failed",
            supabase: supabaseErrorPublic(insertError),
          });
        }

        try {
          const inviter = await getPatientById(referral.inviter_patient_id);
          const currentCredit = Number(inviter?.referral_credit || inviter?.referralCredit || 0);
          const updatedCredit = roundToCurrency(currentCredit + earnedDiscountAmount);
          const { error: creditError } = await supabase
            .from("patients")
            .update({
              referral_credit: updatedCredit,
              referral_credit_updated_at: new Date().toISOString(),
            })
            .eq("patient_id", referral.inviter_patient_id);

          if (creditError && isMissingColumnError(creditError, "referral_credit")) {
            console.warn("[REFERRAL_EVENT] referral_credit column missing; skipping credit update");
          } else if (creditError) {
            console.error("[REFERRAL_EVENT] Failed to update referral_credit:", creditError.message);
          }
        } catch (creditUpdateError) {
          console.error("[REFERRAL_EVENT] Credit update failed:", creditUpdateError?.message || creditUpdateError);
        }

        console.log(`[REFERRAL_EVENT] Created (Supabase): ${inserted?.id || "unknown"}, Inviter: ${referral.inviter_patient_id}, Credit: ${earnedDiscountAmount} ${currency}`);
        return res.json({ ok: true, event: inserted });
      } catch (supabaseError) {
        console.error("[REFERRAL_EVENT] Supabase flow failed:", supabaseError?.message || supabaseError);
        if (canUseFileFallback()) {
          console.warn("[REFERRAL_EVENT] Using file fallback after Supabase error");
          return handleFileFallback();
        }
        return res.status(500).json({ ok: false, error: "referral_event_failed" });
      }
    }

    return handleFileFallback();
  } catch (error) {
    console.error("Referral event creation error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/referrals/payment-refund
// Called when invitee payment is refunded/chargeback
app.post("/api/referrals/payment-refund", async (req, res) => {
  try {
    const { inviteePaymentId } = req.body || {};
    
    if (!inviteePaymentId) {
      return res.status(400).json({ ok: false, error: "payment_id_required" });
    }

    const handleFileFallback = () => {
      // Find existing event
      const events = readJson(REF_EVENT_FILE, []);
      const eventList = Array.isArray(events) ? events : Object.values(events);
      const eventIdx = eventList.findIndex((e) => e.inviteePaymentId === inviteePaymentId && e.status === "EARNED");
      
      if (eventIdx < 0) {
        return res.status(404).json({ ok: false, error: "event_not_found" });
      }
      
      const event = eventList[eventIdx];
      
      // Reverse the event
      event.status = "REVERSED";
      event.reversedAt = now();
      eventList[eventIdx] = event;
      writeJson(REF_EVENT_FILE, eventList);
      
      // Reverse inviter's credit (subtract from patient record)
      const patients = readJson(PAT_FILE, {});
      if (patients[event.inviterPatientId]) {
        const inviter = patients[event.inviterPatientId];
        inviter.referralCredit = Math.max(0, (inviter.referralCredit || 0) - event.earnedDiscountAmount);
        inviter.referralCreditUpdatedAt = now();
        writeJson(PAT_FILE, patients);
      }
      
      console.log(`[REFERRAL_EVENT] Reversed: ${event.id}, Credit reversed: ${event.earnedDiscountAmount} ${event.currency}`);
      
      return res.json({ ok: true, event });
    };

    if (isSupabaseEnabled()) {
      try {
        const { data: events, error: fetchError } = await supabase
          .from("referral_events")
          .select("*")
          .eq("invitee_payment_id", inviteePaymentId)
          .eq("status", "EARNED")
          .limit(1);

        if (fetchError) {
          if (isMissingTableError(fetchError, "referral_events") && canUseFileFallback()) {
            console.warn("[REFERRAL_EVENT] Supabase missing referral_events table, using file fallback");
            return handleFileFallback();
          }
          return res.status(500).json({
            ok: false,
            error: "referral_event_fetch_failed",
            supabase: supabaseErrorPublic(fetchError),
          });
        }

        const event = Array.isArray(events) ? events[0] : null;
        if (!event) {
          return res.status(404).json({ ok: false, error: "event_not_found" });
        }

        const { data: updated, error: updateError } = await supabase
          .from("referral_events")
          .update({ status: "REVERSED", reversed_at: new Date().toISOString() })
          .eq("id", event.id)
          .select("*")
          .single();

        if (updateError) {
          if (isMissingTableError(updateError, "referral_events") && canUseFileFallback()) {
            console.warn("[REFERRAL_EVENT] Supabase missing referral_events table, using file fallback");
            return handleFileFallback();
          }
          return res.status(500).json({
            ok: false,
            error: "referral_event_update_failed",
            supabase: supabaseErrorPublic(updateError),
          });
        }

        try {
          const inviter = await getPatientById(event.inviter_patient_id);
          const currentCredit = Number(inviter?.referral_credit || inviter?.referralCredit || 0);
          const updatedCredit = Math.max(0, roundToCurrency(currentCredit - Number(event.earned_discount_amount || 0)));
          const { error: creditError } = await supabase
            .from("patients")
            .update({
              referral_credit: updatedCredit,
              referral_credit_updated_at: new Date().toISOString(),
            })
            .eq("patient_id", event.inviter_patient_id);

          if (creditError && isMissingColumnError(creditError, "referral_credit")) {
            console.warn("[REFERRAL_EVENT] referral_credit column missing; skipping credit update");
          } else if (creditError) {
            console.error("[REFERRAL_EVENT] Failed to update referral_credit:", creditError.message);
          }
        } catch (creditUpdateError) {
          console.error("[REFERRAL_EVENT] Credit update failed:", creditUpdateError?.message || creditUpdateError);
        }

        console.log(`[REFERRAL_EVENT] Reversed (Supabase): ${updated?.id || "unknown"}, Credit reversed: ${updated?.earned_discount_amount} ${updated?.currency}`);
        return res.json({ ok: true, event: updated });
      } catch (supabaseError) {
        console.error("[REFERRAL_EVENT] Supabase refund flow failed:", supabaseError?.message || supabaseError);
        if (canUseFileFallback()) {
          console.warn("[REFERRAL_EVENT] Using file fallback after Supabase error");
          return handleFileFallback();
        }
        return res.status(500).json({ ok: false, error: "referral_refund_failed" });
      }
    }

    return handleFileFallback();
  } catch (error) {
    console.error("Referral event reversal error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/patient/:patientId/referral-credit
// Get inviter's total referral credit
app.get("/api/patient/:patientId/referral-credit", (req, res) => {
  try {
    const { patientId } = req.params;
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    const respondFromFile = () => {
      const patients = readJson(PAT_FILE, {});
      if (!patients[patientId]) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }
      const credit = patients[patientId].referralCredit || 0;
      return res.json({ ok: true, credit, currency: "USD" });
    };

    if (isSupabaseEnabled()) {
      getPatientById(patientId)
        .then((patient) => {
          if (!patient) {
            if (canUseFileFallback()) return respondFromFile();
            return res.status(404).json({ ok: false, error: "patient_not_found" });
          }
          if (patient.referral_credit == null && canUseFileFallback()) {
            return respondFromFile();
          }
          const credit = Number(patient.referral_credit || 0);
          return res.json({ ok: true, credit, currency: "USD" });
        })
        .catch((error) => {
          console.error("[REFERRAL_CREDIT] Supabase fetch failed:", error?.message || error);
          if (canUseFileFallback()) return respondFromFile();
          return res.status(500).json({ ok: false, error: "referral_credit_fetch_failed" });
        });
      return;
    }

    return respondFromFile();
  } catch (error) {
    console.error("Get referral credit error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/admin/referral-events
// Get all referral events (admin view)
app.get("/api/admin/referral-events", requireAdminAuth, async (req, res) => {
  try {
    const respondFromFile = () => {
      const events = readJson(REF_EVENT_FILE, []);
      const eventList = Array.isArray(events) ? events : Object.values(events);
      eventList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return res.json({ ok: true, items: eventList, source: "file" });
    };

    if (isSupabaseEnabled()) {
      const clinicId = req.clinicId || null;
      let q = supabase.from("referral_events").select("*");
      if (clinicId) q = q.eq("clinic_id", clinicId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) {
        if (isMissingTableError(error, "referral_events") && canUseFileFallback()) {
          console.warn("[REFERRAL_EVENTS] Supabase table missing, using file fallback");
          return respondFromFile();
        }
        return res.status(500).json({
          ok: false,
          error: "referral_events_fetch_failed",
          supabase: supabaseErrorPublic(error),
        });
      }

      const items = (data || []).map((row) => ({
        id: row.id,
        inviterPatientId: row.inviter_patient_id,
        inviteePatientId: row.invitee_patient_id,
        inviteePaymentId: row.invitee_payment_id,
        inviteePaidAmount: row.invitee_paid_amount,
        inviterPaidAmount: row.inviter_paid_amount,
        basePaidAmount: row.base_paid_amount,
        currency: row.currency,
        inviterRate: row.inviter_rate,
        inviteeRate: row.invitee_rate,
        earnedDiscountAmount: row.earned_discount_amount,
        status: row.status,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
        reversedAt: row.reversed_at ? new Date(row.reversed_at).getTime() : null,
      }));

      return res.json({ ok: true, items, source: "supabase" });
    }

    return respondFromFile();
  } catch (error) {
    console.error("Get referral events error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/admin/events
// Get all events from all patients (travel events + treatment events)
// Filters: upcoming (next 14 days, excluding today), overdue (past but not completed)
app.get("/api/admin/events", requireAdminAuth, async (req, res) => {
  try {
    const clinicCode = String(req.clinicCode || "").trim().toUpperCase();
    if (!clinicCode) {
      return res.status(401).json({ ok: false, error: "clinic_required" });
    }

    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    
    // Calculate date range for upcoming (next 14 days, excluding today)
    const upcomingEnd = new Date(today);
    upcomingEnd.setDate(upcomingEnd.getDate() + 14);
    upcomingEnd.setHours(23, 59, 59, 999);
    const upcomingEndTs = upcomingEnd.getTime();
    
    const allEvents = [];

    const toIso = (tsOrIso) => {
      if (!tsOrIso) return null;
      if (typeof tsOrIso === "string") {
        const t = Date.parse(tsOrIso);
        if (Number.isFinite(t)) return new Date(t).toISOString();
        return null;
      }
      const n = Number(tsOrIso);
      if (!Number.isFinite(n)) return null;
      return new Date(n).toISOString();
    };

    const dateTimeToIso = (dateStr, timeStr) => {
      if (!dateStr) return null;
      const time = timeStr ? String(timeStr) : "00:00";
      const iso = `${dateStr}T${time}:00`;
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) return null;
      return new Date(t).toISOString();
    };

    const addEvent = (evt) => {
      const timelineAt = evt.timelineAt || evt.timeline_at || null;
      const iso = timelineAt || dateTimeToIso(evt.date, evt.time) || toIso(evt.timestamp);
      if (!iso) return;
      const ts = Date.parse(iso);
      allEvents.push({
        ...evt,
        timelineAt: iso,
        timestamp: Number.isFinite(ts) ? ts : (evt.timestamp || 0),
      });
    };

    // PRODUCTION: Supabase patients are source of truth
    if (isSupabaseEnabled() && req.clinicId) {
      const priceMap = await fetchTreatmentPricesMap(req.clinicId);
      const useFileFallback = canUseFileFallback();
      const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");

      // Build events from Supabase patient JSON fields (travel / treatments / treatment_events)
      const clinicPatients = await getPatientsByClinic(req.clinicId);
      const list = Array.isArray(clinicPatients) ? clinicPatients : [];

      list.forEach((p) => {
        const patientId = String(p?.patient_id || p?.id || "").trim();
        if (!patientId) return;

        // TRAVEL (null-safe)
        const travel = p?.travel || {};
        // travel.events
        if (Array.isArray(travel?.events)) {
          travel.events.forEach((e) => {
            const iso = dateTimeToIso(e?.date, e?.time);
            if (!iso) return;
            addEvent({
              id: e.id || `travel_${patientId}_${iso}`,
              patientId,
              type: "TRAVEL_EVENT",
              eventType: e.type || "TRAVEL",
              title: e.title || "",
              description: e.desc || "",
              date: e.date,
              time: e.time || "",
              status: "PLANNED",
              source: "travel",
              timelineAt: iso,
            });
          });
        }

        // hotel check-in/out
        if (travel?.hotel && travel.hotel.name) {
          if (travel.hotel.checkIn) {
            const iso = dateTimeToIso(travel.hotel.checkIn, "00:00");
            if (iso) addEvent({
              id: `hotel_checkin_${patientId}_${iso}`,
              patientId,
              type: "HOTEL",
              eventType: "CHECKIN",
              title: `Otel Giriş: ${travel.hotel.name}`,
              description: travel.hotel.address || "",
              date: travel.hotel.checkIn,
              time: "",
              status: "PLANNED",
              source: "travel",
              timelineAt: iso,
            });
          }
          if (travel.hotel.checkOut) {
            const iso = dateTimeToIso(travel.hotel.checkOut, "00:00");
            if (iso) addEvent({
              id: `hotel_checkout_${patientId}_${iso}`,
              patientId,
              type: "HOTEL",
              eventType: "CHECKOUT",
              title: `Otel Çıkış: ${travel.hotel.name}`,
              description: travel.hotel.address || "",
              date: travel.hotel.checkOut,
              time: "",
              status: "PLANNED",
              source: "travel",
              timelineAt: iso,
            });
          }
        }

        // flights
        if (Array.isArray(travel?.flights)) {
          travel.flights.forEach((f) => {
            const iso = dateTimeToIso(f?.date, f?.time);
            if (!iso) return;
            addEvent({
              id: f.id || `flight_${patientId}_${iso}`,
              patientId,
              type: "FLIGHT",
              eventType: f.type || "OUTBOUND",
              title: `${String(f.type || "").toUpperCase() === "RETURN" ? "Dönüş" : "Gidiş"} Uçuşu`,
              description: `${String(f.from || "").toUpperCase()} → ${String(f.to || "").toUpperCase()}${f.flightNo ? ` (${f.flightNo})` : ""}`,
              date: f.date,
              time: f.time || "",
              status: "PLANNED",
              source: "travel",
              timelineAt: iso,
            });
          });
        }

        // TREATMENT PROCEDURES (legacy: patients.treatments payload)
        let treatments = p?.treatments || {};
        if (useFileFallback) {
          const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
          const hasSupabaseTreatments = Array.isArray(treatments?.teeth) && treatments.teeth.length > 0;
          if (!hasSupabaseTreatments && fs.existsSync(treatmentsFile)) {
            const fileTreatments = readJson(treatmentsFile, {});
            if (fileTreatments?.teeth) treatments = fileTreatments;
          }
        }
        const teeth = Array.isArray(treatments?.teeth) ? treatments.teeth : [];
        teeth.forEach((tooth) => {
          const toothId = tooth?.toothId;
          const procs = Array.isArray(tooth?.procedures) ? tooth.procedures : [];
          procs.forEach((proc) => {
            // scheduledAt preferred, else createdAt (both are ms)
            const timelineAt = toIso(proc?.scheduledAt) || toIso(proc?.createdAt);
            if (!timelineAt) return;
            const dt = new Date(Date.parse(timelineAt));
            addEvent({
              id: proc?.id || proc?.procedureId || `treatment_${patientId}_${timelineAt}`,
              patientId,
              type: "TREATMENT",
              eventType: proc?.type || "PROCEDURE",
              title: `${proc?.type || "Treatment"} - Tooth ${toothId}`,
              description: "",
              date: dt.toISOString().split("T")[0],
              time: dt.toTimeString().slice(0, 5),
              status: procedures.normalizeStatus(proc?.status || "PLANNED"),
              source: "treatment",
              toothId,
              timelineAt,
            });
          });
        });

        // TREATMENT EVENTS (patients.treatment_events)
        let tEvents = p?.treatment_events;
        if (useFileFallback) {
          const eventsFile = path.join(TREATMENTS_DIR, `${patientId}.events.json`);
          const hasSupabaseEvents = Array.isArray(tEvents) && tEvents.length > 0;
          if (!hasSupabaseEvents && fs.existsSync(eventsFile)) {
            const fileEvents = readJson(eventsFile, []);
            tEvents = fileEvents;
          }
        }
        tEvents = applyEventPrices(mapTreatmentEventsForCalendar(tEvents), priceMap);
        tEvents.forEach((e) => {
          const iso =
            toIso(e?.startAt) ||
            dateTimeToIso(e?.date, e?.time) ||
            toIso(e?.scheduledAt) ||
            toIso(e?.createdAt) ||
            toIso(e?.timestamp);
          if (!iso) return;
          const dt = new Date(Date.parse(iso));
          addEvent({
            id: e?.id || `treatment_event_${patientId}_${iso}`,
            patientId,
            type: "TREATMENT_EVENT",
            eventType: e?.type || "TREATMENT",
            title: e?.title || "Treatment",
            description: e?.desc || "",
            date: e?.date || dt.toISOString().split("T")[0],
            time: e?.time || dt.toTimeString().slice(0, 5),
            status: "PLANNED",
            source: "treatment",
            timelineAt: iso,
          });
        });
      });
    } else {
      // Legacy FILE-BASED: fallback only when explicitly enabled
      if (!canUseFileFallback()) {
        return res.status(500).json(supabaseDisabledPayload("admin-events"));
      }

      const patients = readJson(PAT_FILE, {});
      const patientClinicMap = {};
      Object.values(patients || {}).forEach((p) => {
        const pid = String(p?.patientId || p?.patient_id || "").trim();
        const code = String(p?.clinicCode || p?.clinic_code || "").trim().toUpperCase();
        if (pid && code) patientClinicMap[pid] = code;
      });
      const isAllowedPatient = (pid) =>
        pid && patientClinicMap[pid] && patientClinicMap[pid] === clinicCode;
      const TRAVEL_DIR = path.join(DATA_DIR, "travel");
      const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
    
    // Collect events from travel data
    if (fs.existsSync(TRAVEL_DIR)) {
      const travelFiles = fs.readdirSync(TRAVEL_DIR).filter(f => f.endsWith(".json"));
      for (const file of travelFiles) {
        try {
          const travelData = readJson(path.join(TRAVEL_DIR, file), {});
          const patientId = travelData.patientId || file.replace(".json", "");
          if (!isAllowedPatient(patientId)) continue;
          
          // Travel events
          if (Array.isArray(travelData.events)) {
            travelData.events.forEach(evt => {
              if (evt.date) {
                const eventDate = new Date(evt.date + (evt.time ? `T${evt.time}:00` : "T00:00:00"));
                const eventTs = eventDate.getTime();
                
                addEvent({
                  id: evt.id || `travel_${patientId}_${eventTs}`,
                  patientId,
                  type: "TRAVEL_EVENT",
                  eventType: evt.type || "TREATMENT",
                  title: evt.title || "",
                  description: evt.desc || "",
                  date: evt.date,
                  time: evt.time || "",
                  timestamp: eventTs,
                  status: "PLANNED", // Travel events are always planned
                  source: "travel"
                });
              }
            });
          }
          
          // Hotel check-in/check-out as events
          if (travelData.hotel && travelData.hotel.name) {
            // Check-in event
            if (travelData.hotel.checkIn) {
              const checkInDate = new Date(travelData.hotel.checkIn + "T00:00:00");
              const checkInTs = checkInDate.getTime();
              
              addEvent({
                id: `hotel_checkin_${patientId}_${checkInTs}`,
                patientId,
                type: "HOTEL",
                eventType: "CHECKIN",
                title: `Otel Giriş: ${travelData.hotel.name}`,
                description: travelData.hotel.address || "",
                date: travelData.hotel.checkIn,
                time: "",
                timestamp: checkInTs,
                status: "PLANNED",
                source: "travel"
              });
            }
            
            // Check-out event
            if (travelData.hotel.checkOut) {
              const checkOutDate = new Date(travelData.hotel.checkOut + "T00:00:00");
              const checkOutTs = checkOutDate.getTime();
              
              addEvent({
                id: `hotel_checkout_${patientId}_${checkOutTs}`,
                patientId,
                type: "HOTEL",
                eventType: "CHECKOUT",
                title: `Otel Çıkış: ${travelData.hotel.name}`,
                description: travelData.hotel.address || "",
                date: travelData.hotel.checkOut,
                time: "",
                timestamp: checkOutTs,
                status: "PLANNED",
                source: "travel"
              });
            }
          }
          
          // Flights as events
          if (Array.isArray(travelData.flights)) {
            travelData.flights.forEach(flight => {
              if (flight.date) {
                const flightDate = new Date(flight.date + (flight.time ? `T${flight.time}:00` : "T00:00:00"));
                const flightTs = flightDate.getTime();
                
                addEvent({
                  id: flight.id || `flight_${patientId}_${flightTs}`,
                  patientId,
                  type: "FLIGHT",
                  eventType: flight.type || "OUTBOUND",
                  title: `${flight.type === "RETURN" ? "Dönüş" : "Gidiş"} Uçuşu`,
                  description: `${flight.from?.toUpperCase() || ""} → ${flight.to?.toUpperCase() || ""}${flight.flightNo ? ` (${flight.flightNo})` : ""}`,
                  date: flight.date,
                  time: flight.time || "",
                  timestamp: flightTs,
                  status: "PLANNED",
                  source: "travel"
                });
                
                // Airport pickup event for ARRIVAL flights
                if ((flight.type === "ARRIVAL" || flight.type === "INBOUND") && travelData.airportPickup) {
                  const pickup = travelData.airportPickup;
                  if (pickup && (pickup.name || pickup.phone)) {
                    const pickupParts = [];
                    if (pickup.name) pickupParts.push(`İsim: ${pickup.name}`);
                    if (pickup.phone) pickupParts.push(`Tel: ${pickup.phone}`);
                    if (pickup.meetingPoint) pickupParts.push(`Buluşma: ${pickup.meetingPoint}`);
                    if (pickup.vehicle || pickup.vehicleInfo || pickup.plate) {
                      const vehicle = pickup.vehicle || pickup.vehicleInfo || "";
                      const plate = pickup.plate || "";
                      
                      if (vehicle && plate) {
                        pickupParts.push(`Araç: ${vehicle}, Plaka: ${plate}`);
                      } else if (vehicle) {
                        pickupParts.push(`Araç: ${vehicle}`);
                      } else if (plate) {
                        pickupParts.push(`Plaka: ${plate}`);
                      }
                    }
                    if (pickup.note || pickup.notes) {
                      pickupParts.push(`Not: ${pickup.note || pickup.notes}`);
                    }
                    
                    addEvent({
                      id: `airport_pickup_${patientId}_${flightTs}`,
                      patientId,
                      type: "AIRPORT_PICKUP",
                      eventType: "AIRPORT_PICKUP",
                      title: "Havalimanı Karşılama - Alan karşılama girildi",
                      description: pickupParts.join(" • ") || "Alan karşılama girildi",
                      date: flight.date,
                      time: flight.time || "",
                      timestamp: flightTs,
                      status: "PLANNED",
                      source: "travel"
                    });
                  }
                }
              }
            });
          }
        } catch (err) {
          console.error(`Error reading travel file ${file}:`, err);
        }
      }
    }
    
    // Collect events from treatments data
    if (fs.existsSync(TREATMENTS_DIR)) {
      const treatmentFiles = fs.readdirSync(TREATMENTS_DIR).filter(f => f.endsWith(".json"));
      for (const file of treatmentFiles) {
        try {
          const treatmentData = readJson(path.join(TREATMENTS_DIR, file), {});
          const patientId = treatmentData.patientId || file.replace(".json", "");
          if (!isAllowedPatient(patientId)) continue;
          
          if (Array.isArray(treatmentData.teeth)) {
            treatmentData.teeth.forEach(tooth => {
              if (Array.isArray(tooth.procedures)) {
                tooth.procedures.forEach(proc => {
                  if (proc.scheduledAt) {
                    const procDate = new Date(proc.scheduledAt);
                    const procTs = procDate.getTime();
                    
                    // Normalize status (PLANNED, ACTIVE, COMPLETED, CANCELLED)
                    const procStatus = procedures.normalizeStatus(proc.status || "PLANNED");
                    
                    addEvent({
                      id: proc.id || `treatment_${patientId}_${procTs}`,
                      patientId,
                      type: "TREATMENT",
                      eventType: proc.type || "PROCEDURE",
                      title: `${proc.type || "Treatment"} - Tooth ${tooth.toothId}`,
                      description: "",
                      date: procDate.toISOString().split("T")[0],
                      time: procDate.toTimeString().split(" ")[0].slice(0, 5),
                      timestamp: procTs,
                      status: procStatus,
                      source: "treatment",
                      toothId: tooth.toothId
                    });
                  }
                });
              }
            });
          }
        } catch (err) {
          console.error(`Error reading treatment file ${file}:`, err);
        }
      }
    }
    }
    
    // Separate into overdue, today, and upcoming
    const overdue = [];
    const todayEvents = [];
    const upcoming = [];
    
    // Calculate today end time
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const todayEndTs = todayEnd.getTime();
    
    // Treatment event types that should show as overdue
    const treatmentEventTypes = ["TREATMENT", "CONSULT", "FOLLOWUP", "LAB"];
    
    allEvents.forEach(evt => {
      const eventTs = evt.timestamp || (evt.timelineAt ? Date.parse(evt.timelineAt) : 0) || 0;
      const status = String(evt.status || "PLANNED").toUpperCase();
      const isCompleted = status === "DONE" || status === "COMPLETED";
      const isCancelled = status === "CANCELLED";
      const eventType = String(evt.type || "").toUpperCase();
      const isTreatmentEvent = treatmentEventTypes.includes(eventType);
      
      // Skip cancelled or completed events from upcoming/overdue lists
      if (isCancelled || isCompleted) {
        return; // Don't add to overdue or upcoming
      }
      
      // Overdue: past date but not completed - ONLY for treatment events
      // Double check: event must be in the past AND not completed
      if (eventTs < todayStart && isTreatmentEvent && !isCompleted && !isCancelled) {
        overdue.push(evt);
      }
      // Today: events happening today
      else if (eventTs >= todayStart && eventTs <= todayEndTs && !isCompleted && !isCancelled) {
        todayEvents.push(evt);
      }
      // Upcoming: next 14 days (excluding today), but only if not completed/cancelled
      else if (eventTs > todayEndTs && eventTs <= upcomingEndTs && !isCompleted && !isCancelled) {
        upcoming.push(evt);
      }
    });
    
    // Sort overdue by date (oldest first)
    overdue.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    // Sort upcoming by date (soonest first)
    upcoming.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    res.json({
      ok: true,
      overdue,
      today: todayEvents,
      upcoming,
      total: allEvents.length,
      overdueCount: overdue.length,
      todayCount: todayEvents.length,
      upcomingCount: upcoming.length
    });
  } catch (error) {
    console.error("Get admin events error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// WebSocket kodu kaldırıldı (audio call özelliği kaldırıldı)

// ================== ADMIN AUTHENTICATION ==================
// Middleware: Validate admin JWT token
async function requireAdminAuth(req, res, next) {
  try {
    console.log("[requireAdminAuth] ========================================");
    console.log("[requireAdminAuth] Request received for:", req.method, req.path);
    console.log("[requireAdminAuth] Auth header:", req.headers.authorization ? "present" : "missing");
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[requireAdminAuth] Missing or invalid auth header");
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // New JWT format: clinicCode is primary (not clinicId)
    const clinicCode = decoded.clinicCode;
    console.log("[requireAdminAuth] Token decoded, clinicCode:", clinicCode);
    
    if (!clinicCode) {
      console.error("[requireAdminAuth] No clinicCode in token!");
      return res.status(401).json({ ok: false, error: "invalid_token", message: "Token geçersiz." });
    }
    
    // SUPABASE: Primary lookup by clinicCode
    if (isSupabaseEnabled()) {
      const clinic = await getClinicByCode(clinicCode);
      
      if (clinic) {
        req.clinicId = clinic.id;              // Supabase UUID
        req.clinicCode = clinic.clinic_code;   // e.g. "ORDU"
        req.clinicStatus = clinic.status || "ACTIVE";  // Use direct status field
        req.clinic = clinic;
        
        console.log("[requireAdminAuth] Clinic auth check:", {
          clinicCode: req.clinicCode,
          clinicId: req.clinicId,
          status: req.clinicStatus,
          isSuspended: req.clinicStatus === "SUSPENDED"
        });
        
        // Only reject if clinic is suspended
        if (req.clinicStatus === "SUSPENDED") {
          console.log("[requireAdminAuth] ❌ Blocking suspended clinic:", req.clinicCode);
          return res.status(403).json({ ok: false, error: "clinic_suspended", message: "Clinic account has been suspended" });
        }
        
        console.log("[requireAdminAuth] ✅ Supabase auth successful for clinic:", req.clinicCode, "(uuid:", req.clinicId, ")");
        return next();
      }
      
      console.log("[requireAdminAuth] Clinic not found in Supabase, trying file fallback...");
    }
    
    // FILE FALLBACK (legacy)
    const code = String(clinicCode).toUpperCase();
    let clinic = null;
    
    // Check CLINICS_FILE
    const clinics = readJson(CLINICS_FILE, {});
    for (const cid in clinics) {
      const c = clinics[cid];
      if (c) {
        const cCode = c.clinicCode || c.code;
        if (cCode && String(cCode).toUpperCase() === code) {
          clinic = c;
          req.clinicId = cid;
          break;
        }
      }
    }
    
    // Check CLINIC_FILE (single clinic)
    if (!clinic) {
      const singleClinic = readJson(CLINIC_FILE, {});
      if (singleClinic?.clinicCode && String(singleClinic.clinicCode).toUpperCase() === code) {
        clinic = singleClinic;
      }
    }
    
    if (!clinic) {
      console.error("[requireAdminAuth] ❌ Clinic not found by code:", clinicCode);
      return res.status(401).json({ ok: false, error: "clinic_not_found" });
    }
    
    // Only reject if clinic is suspended
    if (clinic.status === "SUSPENDED") {
      return res.status(403).json({ ok: false, error: "clinic_suspended", message: "Clinic account has been suspended" });
    }
    
    req.clinicId = req.clinicId || clinic.clinicId || null;
    req.clinicCode = clinic.clinicCode || clinic.code;
    req.clinicStatus = clinic.status || "ACTIVE";
    req.clinic = clinic;
    console.log("[requireAdminAuth] ✅ File auth successful for clinic:", req.clinicCode);
    next();
  } catch (error) {
    console.error("[requireAdminAuth] Auth error:", error.name, error.message);
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      return res.status(401).json({ ok: false, error: "invalid_token", message: "Geçersiz token. Lütfen tekrar giriş yapın." });
    }
    return res.status(500).json({ ok: false, error: "auth_error", message: "Kimlik doğrulama hatası." });
  }
}

// POST /api/admin/register
// Clinic registration (email/password) - Supabase supported
app.post("/api/admin/register", async (req, res) => {
  try {
    const { email, password, name, phone, address, clinicCode } = req.body || {};
    
    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: "email_required" });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ ok: false, error: "password_required_min_6" });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: "name_required" });
    }
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required", message: "Clinic code is required." });
    }
    
    // Validate clinic code format: minimum 3 characters, only letters and numbers
    const clinicCodeTrimmed = String(clinicCode).trim().toUpperCase();
    if (clinicCodeTrimmed.length < 3) {
      return res.status(400).json({ ok: false, error: "clinic_code_too_short", message: "Clinic code must be at least 3 characters." });
    }
    
    // Allow only alphanumeric characters (letters and numbers), case insensitive
    if (!/^[A-Za-z0-9]+$/.test(clinicCodeTrimmed)) {
      return res.status(400).json({ ok: false, error: "clinic_code_invalid", message: "Clinic code can only contain letters and numbers." });
    }
    
    const emailLower = String(email).trim().toLowerCase();
    
    // Hash password
    const hashedPassword = await bcrypt.hash(String(password), 10);
    
    // SUPABASE: Primary storage
    if (isSupabaseEnabled()) {
      console.log("[ADMIN REGISTER] ========================================");
      console.log("[ADMIN REGISTER] Using Supabase for clinic registration");
      console.log("[ADMIN REGISTER] Clinic code:", clinicCodeTrimmed);
      console.log("[ADMIN REGISTER] Email:", emailLower);
      console.log("[ADMIN REGISTER] Name:", String(name).trim());
      console.log("[ADMIN REGISTER] ========================================");
      
      // Check if email already exists
      console.log("[ADMIN REGISTER] Checking if email exists...");
      const existingByEmail = await getClinicByEmail(emailLower);
      if (existingByEmail) {
        console.log("[ADMIN REGISTER] Email already exists:", existingByEmail.id);
        return res.status(400).json({ ok: false, error: "email_exists" });
      }
      console.log("[ADMIN REGISTER] Email is available");
      
      // OTP Verification Required for New Admins
      if (OTP_REQUIRED_FOR_NEW_ADMINS) {
        console.log("[ADMIN REGISTER] OTP verification required for new admin registration");
        
        // Generate and send OTP
        const otpCode = String(generateOTP()).trim();  // Standardize: String + trim
        const otpHash = await bcrypt.hash(otpCode, 10);
        
        console.log("[ADMIN REGISTER] Generated OTP for email verification:", otpCode);
        console.log("[ADMIN REGISTER] OTP hash generated for:", otpHash.substring(0, 10) + "...");
        
        try {
          // Send OTP email
          await sendOTPEmail(emailLower, otpCode, "en");
          console.log("[ADMIN REGISTER] OTP email sent to:", emailLower);
          
          // Store OTP in Supabase for verification
          console.log("[ADMIN REGISTER] About to store OTP for:", emailLower);
          console.log("[ADMIN REGISTER] Registration data:", JSON.stringify({
            name: String(name).trim(),
            phone: String(phone || "").trim(),
            address: String(address || "").trim(),
            password_hash: hashedPassword,
            registration_data: {
              clinic_code: clinicCodeTrimmed,
              email: emailLower,
              phone: String(phone || "").trim(),
              address: String(address || "").trim(),
              plan: "FREE",
              max_patients: 3
            }
          }, null, 2));
          
          await storeOTPForEmail(emailLower, otpHash, clinicCodeTrimmed, {
            name: String(name).trim(),
            phone: String(phone || "").trim(),
            address: String(address || "").trim(),
            password_hash: hashedPassword,
            registration_data: {
              clinic_code: clinicCodeTrimmed,
              email: emailLower,
              phone: String(phone || "").trim(),
              address: String(address || "").trim(),
              plan: "FREE",
              max_patients: 3
            }
          });
          
          console.log("[ADMIN REGISTER] OTP stored successfully for:", emailLower);
          
          return res.json({
            ok: true,
            requiresOTP: true,
            message: "Please check your email for verification code",
            email: emailLower,
            clinicCode: clinicCodeTrimmed
          });
          
        } catch (emailError) {
          console.error("[ADMIN REGISTER] Failed to send OTP email:", emailError);
          return res.status(500).json({
            ok: false,
            error: "email_send_failed",
            message: "Failed to send verification email. Please try again."
          });
        }
      }
      
      // Check if clinicCode already exists
      console.log("[ADMIN REGISTER] Checking if clinic code exists...");
      const existingByCode = await getClinicByCode(clinicCodeTrimmed);
      if (existingByCode) {
        console.log("[ADMIN REGISTER] Clinic code already exists:", existingByCode.id);
        return res.status(400).json({ ok: false, error: "clinic_code_exists" });
      }
      console.log("[ADMIN REGISTER] Clinic code is available");
      
      // Create clinic in Supabase
      console.log("[ADMIN REGISTER] Inserting clinic into Supabase...");
      try {
        const newClinic = await createClinic({
          clinic_code: clinicCodeTrimmed,
          email: emailLower,
          password_hash: hashedPassword,
          name: String(name).trim(),
          phone: String(phone || "").trim(),
          address: String(address || "").trim(),
          plan: "FREE",
          max_patients: 3,
          settings: {
            status: "ACTIVE",
            subscriptionStatus: "TRIAL",
            subscriptionPlan: null,
            verificationStatus: "verified",
            trialEndsAt: now() + (14 * 24 * 60 * 60 * 1000),
          }
        });
        
        if (!newClinic || !newClinic.id) {
          console.error("[ADMIN REGISTER] ❌ createClinic returned null or no id!");
          throw new Error("Failed to create clinic - no data returned");
        }
        
        // Generate JWT token - ONLY clinicCode
        const token = jwt.sign({ clinicCode: newClinic.clinic_code, role: "admin" }, JWT_SECRET, {
          expiresIn: JWT_EXPIRES_IN,
        });
        
        console.log("[ADMIN REGISTER] ========================================");
        console.log("[ADMIN REGISTER] ✅ SUCCESS - Clinic created in Supabase!");
        console.log("[ADMIN REGISTER] Clinic ID:", newClinic.id);
        console.log("[ADMIN REGISTER] Clinic Code:", newClinic.clinic_code);
        console.log("[ADMIN REGISTER] ========================================");
        
        return res.json({
          ok: true,
          clinicId: newClinic.id,
          clinicCode: newClinic.clinic_code,
          token,
          status: "ACTIVE",
          subscriptionStatus: "TRIAL",
        });
      } catch (supabaseError) {
        console.error("[ADMIN REGISTER] ❌ Supabase insert FAILED:", supabaseError.message);
        console.error("[ADMIN REGISTER] Full error:", JSON.stringify(supabaseError));
        throw supabaseError;
      }
    }
    
    // FILE FALLBACK: Legacy storage
    console.log("[ADMIN REGISTER] Using file storage (fallback)...");
    const clinics = readJson(CLINICS_FILE, {});
    
    // Check if email already exists
    for (const id in clinics) {
      const existingEmail = clinics[id]?.email;
      if (existingEmail && String(existingEmail).trim().toLowerCase() === emailLower) {
        return res.status(400).json({ ok: false, error: "email_exists" });
      }
    }
    
    // Check if clinicCode already exists
    for (const id in clinics) {
      const existingCode = clinics[id]?.clinicCode || clinics[id]?.code;
      if (existingCode && String(existingCode).trim().toUpperCase() === clinicCodeTrimmed) {
        return res.status(400).json({ ok: false, error: "clinic_code_exists" });
      }
    }
    
    // Create clinic
    const clinicId = rid("clinic");
    const clinic = {
      clinicId,
      email: emailLower,
      password: hashedPassword,
      name: String(name).trim(),
      phone: String(phone || "").trim(),
      address: String(address || "").trim(),
      clinicCode: clinicCodeTrimmed,
      plan: "FREE",
      max_patients: 3,
      status: "ACTIVE",
      subscriptionStatus: "TRIAL",
      subscriptionPlan: null,
      verificationStatus: "verified",
      trialEndsAt: now() + (14 * 24 * 60 * 60 * 1000),
      createdAt: now(),
      updatedAt: now(),
    };
    
    clinics[clinicId] = clinic;
    writeJson(CLINICS_FILE, clinics);
    
    // Generate JWT token - ONLY clinicCode
    const token = jwt.sign({ clinicCode: clinic.clinicCode, role: "admin" }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
    
    res.json({
      ok: true,
      clinicId,
      clinicCode: clinic.clinicCode,
      token,
      status: clinic.status,
      subscriptionStatus: clinic.subscriptionStatus,
    });
  } catch (err) {
    console.error("[ADMIN REGISTER ERROR]", err);
    return res.status(400).json({
      error: "registration_failed",
      message: err?.message || "Registration failed",
      code: err?.code || null,
    });
  }
});

// POST /api/admin/login
// Clinic login (clinic code + password) - OTP supported when enabled
// Supports both Supabase, CLINIC_FILE (single clinic) and CLINICS_FILE (multiple clinics)
app.post("/api/admin/login", async (req, res) => {
  try {
    const { clinicCode, password, email } = req.body || {};
    
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }
    
    if (!password || !String(password).trim()) {
      return res.status(400).json({ ok: false, error: "password_required" });
    }
    
    const code = String(clinicCode).trim().toUpperCase();
    
    // SUPABASE: Primary lookup
    if (isSupabaseEnabled()) {
      console.log("[ADMIN LOGIN] Using Supabase for clinic:", code);
      
      const clinic = await getClinicByCode(code);
      
      if (clinic) {
        // Verify password
        const passwordMatch = await bcrypt.compare(String(password).trim(), clinic.password_hash);
        if (!passwordMatch) {
          return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
        }
        
        // Check if OTP is required
        const createdAt = clinic.created_at || clinic.createdAt || clinic.created;
        const isNewClinic = createdAt && (now() - new Date(createdAt).getTime()) < (24 * 60 * 60 * 1000); // Less than 24h old
        const otpRequired = OTP_ENABLED_FOR_ADMINS && (OTP_REQUIRED_FOR_NEW_ADMINS && isNewClinic);
        
        console.log("[ADMIN LOGIN] OTP Check:", {
          clinicCode: code,
          createdAt,
          isNewClinic,
          otpRequired,
          OTP_ENABLED_FOR_ADMINS,
          OTP_REQUIRED_FOR_NEW_ADMINS
        });
        
        if (otpRequired && !email) {
          return res.json({
            ok: true,
            requiresOTP: true,
            message: "OTP doğrulaması gereklidir. Lütfen email adresinizi girin.",
            clinicCode: code
          });
        }
        
        if (otpRequired && email) {
          // Request OTP and don't return token yet
          try {
            const otpCode = generateOTP();
            const emailNormalized = String(email).trim().toLowerCase();
            await saveOTP(emailNormalized, otpCode);
            await sendOTPEmail(emailNormalized, otpCode, clinic.language || "en");
            
            return res.json({
              ok: true,
              requiresOTP: true,
              otpSent: true,
              message: "OTP kodu email adresinize gönderildi.",
              clinicCode: code,
              email: emailNormalized
            });
          } catch (emailError) {
            console.error("[ADMIN LOGIN] OTP send failed:", emailError);
            return res.status(500).json({ 
              ok: false, 
              error: "otp_send_failed", 
              message: "OTP gönderilemedi. Lütfen daha sonra tekrar deneyin." 
            });
          }
        }
        
        // Generate JWT token - ONLY clinicCode, NO clinicId
        // UUID will be fetched from Supabase at runtime
        const token = jwt.sign(
          { 
            clinicCode: clinic.clinic_code,
            role: "admin",
            otpVerified: !otpRequired
          },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );
        
        console.log("[ADMIN LOGIN] ✅ Supabase login successful for:", clinic.clinic_code);
        
        return res.json({
          ok: true,
          token,
          clinicCode: clinic.clinic_code,
          clinicId: clinic.id,  // Return for frontend, but NOT in JWT
          clinicName: clinic.name || "Clinic",
          status: clinic.settings?.status || "ACTIVE",
        });
      }
      
      console.log("[ADMIN LOGIN] Clinic not found in Supabase, trying file fallback...");
    }
    
    // FILE FALLBACK: Legacy storage
    let foundClinic = null;
    let foundClinicId = null;
    let isFromClinicsFile = false;
    
    // First check CLINIC_FILE (single clinic)
    const singleClinic = readJson(CLINIC_FILE, {});
    if (singleClinic && singleClinic.clinicCode) {
      const singleClinicCode = String(singleClinic.clinicCode).toUpperCase();
      if (singleClinicCode === code) {
        foundClinic = singleClinic;
        isFromClinicsFile = false;
      }
    }
    
    // Then check CLINICS_FILE (multiple clinics)
    if (!foundClinic) {
      const clinics = readJson(CLINICS_FILE, {});
      for (const clinicId in clinics) {
        const clinic = clinics[clinicId];
        if (clinic) {
          const clinicCodeToCheck = clinic.clinicCode || clinic.code;
          if (clinicCodeToCheck && String(clinicCodeToCheck).toUpperCase() === code) {
            foundClinic = clinic;
            foundClinicId = clinicId;
            isFromClinicsFile = true;
            break;
          }
        }
      }
    }
    
    // If clinic not found anywhere
    if (!foundClinic) {
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
    }
    
    // Check password
    if (!foundClinic.password) {
      // If no password is set, allow login with default password "admin123" (for initial setup)
      const defaultPassword = "admin123";
      if (password !== defaultPassword) {
        return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
      }
      // Set default password hash for first login
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      foundClinic.password = hashedPassword;
      
      if (isFromClinicsFile) {
        const clinics = readJson(CLINICS_FILE, {});
        if (clinics[foundClinicId]) {
          clinics[foundClinicId].password = hashedPassword;
          writeJson(CLINICS_FILE, clinics);
        }
      } else {
        writeJson(CLINIC_FILE, foundClinic);
      }
    } else {
      // Verify password hash
      const passwordMatch = await bcrypt.compare(String(password).trim(), foundClinic.password);
      if (!passwordMatch) {
        return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
      }
    }
    
    // Check if OTP is required for file-based clinics
    const createdAt = foundClinic.created_at || foundClinic.createdAt || foundClinic.created;
    const isNewClinic = createdAt && (now() - new Date(createdAt).getTime()) < (24 * 60 * 60 * 1000); // Less than 24h old
    const otpRequired = OTP_ENABLED_FOR_ADMINS && (OTP_REQUIRED_FOR_NEW_ADMINS && isNewClinic);
    
    console.log("[ADMIN LOGIN] File-based OTP Check:", {
      clinicCode: code,
      createdAt,
      isNewClinic,
      otpRequired,
      OTP_ENABLED_FOR_ADMINS,
      OTP_REQUIRED_FOR_NEW_ADMINS
    });
    
    if (otpRequired && !email) {
      return res.json({
        ok: true,
        requiresOTP: true,
        message: "OTP doğrulaması gereklidir. Lütfen email adresinizi girin.",
        clinicCode: code
      });
    }
    
    if (otpRequired && email) {
      // Request OTP and don't return token yet
      try {
        const otpCode = generateOTP();
        const emailNormalized = String(email).trim().toLowerCase();
        await saveOTP(emailNormalized, otpCode);
        await sendOTPEmail(emailNormalized, otpCode, foundClinic.language || "en");
        
        return res.json({
          ok: true,
          requiresOTP: true,
          otpSent: true,
          message: "OTP kodu email adresinize gönderildi.",
          clinicCode: code,
          email: emailNormalized
        });
      } catch (emailError) {
        console.error("[ADMIN LOGIN] OTP send failed:", emailError);
        return res.status(500).json({ 
          ok: false, 
          error: "otp_send_failed", 
          message: "OTP gönderilemedi. Lütfen daha sonra tekrar deneyin." 
        });
      }
    }
    
    // Generate JWT token - ONLY clinicCode, NO clinicId
    const token = jwt.sign(
      { 
        clinicCode: code,
        role: "admin" 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    console.log("[ADMIN LOGIN] ✅ File login successful for:", code);
    
    res.json({
      ok: true,
      token,
      clinicCode: code,
      clinicId: foundClinicId || foundClinic.clinicId || null,  // For frontend only
      clinicName: foundClinic.name || "Clinic",
      status: foundClinic.status || "PENDING",
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/admin/forgot-password/verify
// Verify clinic code and email for password reset
app.post("/api/admin/forgot-password/verify", (req, res) => {
  try {
    const { clinicCode, email } = req.body || {};
    
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }
    
    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: "email_required" });
    }
    
    const code = String(clinicCode).trim().toUpperCase();
    const emailLower = String(email).trim().toLowerCase();
    const clinic = readJson(CLINIC_FILE, {});
    
    // Check if clinic code matches
    if (!clinic.clinicCode || clinic.clinicCode.toUpperCase() !== code) {
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_email" });
    }
    
    // Check if email matches
    if (!clinic.email || clinic.email.toLowerCase() !== emailLower) {
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_email" });
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error("Forgot password verify error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/admin/forgot-password/reset
// Reset password after verification
app.post("/api/admin/forgot-password/reset", async (req, res) => {
  try {
    const { clinicCode, email, newPassword } = req.body || {};
    
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }
    
    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: "email_required" });
    }
    
    if (!newPassword || !String(newPassword).trim()) {
      return res.status(400).json({ ok: false, error: "new_password_required" });
    }
    
    if (String(newPassword).trim().length < 6) {
      return res.status(400).json({ ok: false, error: "password_too_short" });
    }
    
    const code = String(clinicCode).trim().toUpperCase();
    const emailLower = String(email).trim().toLowerCase();
    const clinic = readJson(CLINIC_FILE, {});
    
    // Verify clinic code and email again
    if (!clinic.clinicCode || clinic.clinicCode.toUpperCase() !== code) {
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_email" });
    }
    
    if (!clinic.email || clinic.email.toLowerCase() !== emailLower) {
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_email" });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(String(newPassword).trim(), 10);
    clinic.password = hashedPassword;
    clinic.updatedAt = now();
    
    writeJson(CLINIC_FILE, clinic);
    
    res.json({ ok: true });
  } catch (error) {
    console.error("Forgot password reset error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/admin/me
// Get current clinic info (requires auth)
app.get("/api/admin/me", requireAdminAuth, (req, res) => {
  try {
    const clinics = readJson(CLINICS_FILE, {});
    const clinic = clinics[req.clinicId];
    
    if (!clinic) {
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }
    
    // Don't send password
    const { password, ...clinicInfo } = clinic;
    
    res.json({ ok: true, clinic: clinicInfo });
  } catch (error) {
    console.error("Get admin me error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/admin/tokens
// Get list of patient tokens (requires auth)
app.get("/api/admin/tokens", requireAdminAuth, (req, res) => {
  try {
    const tokens = readJson(TOK_FILE, {});
    const items = Object.keys(tokens).map((token) => ({
      token,
      patientId: tokens[token]?.patientId,
      name: tokens[token]?.name || "-",
      phone: tokens[token]?.phone || "-",
      role: tokens[token]?.role || tokens[token]?.status || "PENDING",
      createdAt: tokens[token]?.createdAt || null,
    }));
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ ok: true, items });
  } catch (error) {
    console.error("Get admin tokens error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== SUPER ADMIN AUTHENTICATION ==================

// Middleware: Super Admin Guard
function superAdminGuard(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Missing or invalid authorization header" });
    }

    const token = authHeader.substring(7);

    try {
      const payload = jwt.verify(token, SUPER_ADMIN_JWT_SECRET);

      if (payload.role !== "super-admin") {
        return res.status(403).json({ ok: false, error: "forbidden", message: "Invalid role" });
      }

      req.superAdmin = payload;
      next();
    } catch (err) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Invalid or expired token" });
    }
  } catch (error) {
    console.error("Super admin guard error:", error);
    return res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
}

// POST /api/super-admin/login
// Super admin login (email + password from ENV)
app.post("/api/super-admin/login", (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "missing_credentials", message: "Missing credentials" });
    }

    if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
      console.error("[SUPER_ADMIN] Super admin credentials not configured in ENV");
      return res.status(500).json({ ok: false, error: "configuration_error", message: "Super admin not configured" });
    }

    if (email !== SUPER_ADMIN_EMAIL || password !== SUPER_ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: "invalid_credentials", message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { role: "super-admin", email },
      SUPER_ADMIN_JWT_SECRET,
      { expiresIn: "12h" }
    );

    console.log("[SUPER_ADMIN] Login successful");

    res.json({
      ok: true,
      token,
      email,
      message: "Login successful",
    });
  } catch (error) {
    console.error("[SUPER_ADMIN] Login error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// GET /api/super-admin/me
// Test endpoint (protected)
app.get("/api/super-admin/me", superAdminGuard, (req, res) => {
  try {
    res.json({
      ok: true,
      role: "super-admin",
      email: req.superAdmin?.email || SUPER_ADMIN_EMAIL,
      message: "Super admin authenticated",
    });
  } catch (error) {
    console.error("[SUPER_ADMIN] Me endpoint error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// GET /api/super-admin/clinics
// Get all clinics with basic statistics (protected)
app.get("/api/super-admin/clinics", superAdminGuard, async (req, res) => {
  try {
    const clinics = readJson(CLINICS_FILE, {});
    const singleClinic = readJson(CLINIC_FILE, {});
    const patients = readJson(PAT_FILE, {});
    const referrals = readJson(REF_FILE, {});
    
    // Get patients from Supabase for accurate stats
    let supabasePatients = [];
    let supabaseMessages = [];
    let supabaseReferrals = [];
    if (isSupabaseEnabled) {
      try {
        // Get patients
        const { data: patientsData, error: patientsError } = await supabase
          .from("patients")
          .select(`
            patient_id,
            clinic_id,
            name,
            email,
            phone,
            status,
            created_at
          `);
        
        if (!patientsError && patientsData) {
          supabasePatients = patientsData;
        }

        // Get messages
        const { data: messagesData, error: messagesError } = await supabase
          .from("messages")
          .select(`
            id,
            patient_id,
            content,
            created_at
          `);
        
        if (!messagesError && messagesData) {
          supabaseMessages = messagesData;
        }

        // Get referrals
        const { data: referralsData, error: referralsError } = await supabase
          .from("referrals")
          .select(`
            id,
            inviter_patient_id,
            invited_patient_id,
            status,
            created_at,
            approved_at
          `);
        
        if (!referralsError && referralsData) {
          supabaseReferrals = referralsData;
        }
        
      } catch (supabaseError) {
        console.warn("[SUPER_ADMIN] Failed to load data from Supabase:", supabaseError);
      }
    }
    
    // Convert clinics object to array
    let clinicsList = [];
    
    // Add clinics from Supabase
    if (isSupabaseEnabled) {
      try {
        const { data: supabaseClinics, error } = await supabase
          .from("clinics")
          .select(`
            id,
            name,
            email,
            clinic_code,
            phone,
            address,
            created_at,
            updated_at,
            plan,
            enabled_modules
          `)
          .order("created_at", { ascending: false });
        
        if (!error && supabaseClinics) {
          for (const clinic of supabaseClinics) {
            const clinicCode = (clinic.clinic_code || "").toUpperCase();
            
            // Debug: Log each clinic from Supabase
            console.log(`[SUPER_ADMIN] Processing Supabase clinic:`, {
              id: clinic.id,
              name: clinic.name,
              clinic_code: clinic.clinic_code,
              status: clinic.status,
              statusUpper: (clinic.status || "").toUpperCase()
            });
            
            // Calculate basic stats for this clinic using Supabase patients
            const clinicPatients = supabasePatients.filter(p => 
              p.clinic_id === clinic.id
            );
            
            // Create a set of clinic patient IDs for faster lookup
            const clinicPatientIds = new Set(clinicPatients.map(p => p.patient_id).filter(Boolean));
            
            // Filter referrals where either inviter or invited patient belongs to this clinic
            const clinicReferrals = supabaseReferrals.filter(r => {
              if (!r) return false;
              const inviterId = String(r.inviter_patient_id || "").trim();
              const invitedId = String(r.invited_patient_id || "").trim();
              return clinicPatientIds.has(inviterId) || clinicPatientIds.has(invitedId);
            });
            
            // Count messages for this clinic's patients using Supabase messages
            const messageCount = supabaseMessages.filter(m => 
              clinicPatientIds.has(m.patient_id)
            ).length;
            
            clinicsList.push({
              id: clinic.id,
              clinicId: clinic.id,
              name: clinic.name,
              email: clinic.email,
              clinicCode: clinic.clinic_code,
              phone: clinic.phone,
              address: clinic.address,
              status: "ACTIVE", // All Supabase clinics are considered active
              plan: clinic.plan,
              enabledModules: clinic.enabled_modules,
              createdAt: clinic.created_at,
              updatedAt: clinic.updated_at,
              stats: {
                patientCount: clinicPatients.length,
                messageCount: messageCount,
                referralCount: clinicReferrals.length,
                activeReferralCount: clinicReferrals.filter(r => (r.status || "").toUpperCase() === "APPROVED" || (r.status || "").toUpperCase() === "ACTIVE").length
              }
            });
          }
        }
      } catch (supabaseError) {
        console.warn("[SUPER_ADMIN] Failed to load clinics from Supabase:", supabaseError);
      }
    }
    
    // Add clinics from CLINICS_FILE
    for (const clinicId in clinics) {
      const clinic = clinics[clinicId];
      if (clinic) {
        const { password, ...clinicWithoutPassword } = clinic;
        const clinicCode = (clinic.clinicCode || clinic.code || "").toUpperCase();
        
        // Calculate basic stats for this clinic
        const clinicPatients = Object.values(patients).filter(p => 
          (p.clinicCode || p.clinic_code || "").toUpperCase() === clinicCode
        );
        
        // Create a set of clinic patient IDs for faster lookup
        const clinicPatientIds = new Set(clinicPatients.map(p => p.patientId || p.patient_id).filter(Boolean));
        
        // Filter referrals where either inviter or invited patient belongs to this clinic
        const referralsList = Array.isArray(referrals) ? referrals : Object.values(referrals);
        const clinicReferrals = referralsList.filter(r => {
          if (!r) return false;
          const inviterId = String(r.inviterPatientId || "").trim();
          const invitedId = String(r.invitedPatientId || "").trim();
          return clinicPatientIds.has(inviterId) || clinicPatientIds.has(invitedId);
        });
        
        // Count messages
        let messageCount = 0;
        clinicPatients.forEach(p => {
          if (p.messages && Array.isArray(p.messages)) {
            messageCount += p.messages.length;
          }
        });
        
        clinicsList.push({
          ...clinicWithoutPassword,
          clinicId: clinicId,
          id: clinicId,
          stats: {
            patientCount: clinicPatients.length,
            messageCount: messageCount,
            referralCount: clinicReferrals.length,
            activeReferralCount: clinicReferrals.filter(r => (r.status || "").toUpperCase() === "APPROVED" || (r.status || "").toUpperCase() === "ACTIVE").length
          }
        });
      }
    }
    
    // Add single clinic from CLINIC_FILE if it exists
    if (singleClinic && singleClinic.clinicCode) {
      const { password, ...clinicWithoutPassword } = singleClinic;
      const clinicCode = (singleClinic.clinicCode || "").toUpperCase();
      
      // Calculate basic stats
      const clinicPatients = Object.values(patients).filter(p => 
        (p.clinicCode || p.clinic_code || "").toUpperCase() === clinicCode
      );
      
      // Create a set of clinic patient IDs for faster lookup
      const clinicPatientIds = new Set(clinicPatients.map(p => p.patientId || p.patient_id).filter(Boolean));
      
      // Filter referrals where either inviter or invited patient belongs to this clinic
      const referralsList = Array.isArray(referrals) ? referrals : Object.values(referrals);
      const clinicReferrals = referralsList.filter(r => {
        if (!r) return false;
        const inviterId = String(r.inviterPatientId || "").trim();
        const invitedId = String(r.invitedPatientId || "").trim();
        return clinicPatientIds.has(inviterId) || clinicPatientIds.has(invitedId);
      });
      
      let messageCount = 0;
      clinicPatients.forEach(p => {
        if (p.messages && Array.isArray(p.messages)) {
          messageCount += p.messages.length;
        }
      });
      
      clinicsList.push({
        ...clinicWithoutPassword,
        clinicId: singleClinic.clinicId || "single",
        id: singleClinic.clinicId || "single",
        stats: {
          patientCount: clinicPatients.length,
          messageCount: messageCount,
          referralCount: clinicReferrals.length,
          activeReferralCount: clinicReferrals.filter(r => (r.status || "").toUpperCase() === "APPROVED" || (r.status || "").toUpperCase() === "ACTIVE").length,
          oralHealthAverage: null // Will be calculated below
        }
      });
    }
    
    // Calculate oral health averages for all clinics
    for (const clinic of clinicsList) {
      if (clinic.id && clinic.id !== "single") {
        clinic.stats.oralHealthAverage = await calculateClinicOralHealthAverage(clinic.id);
      } else if (clinic.clinicId === "single") {
        // For single clinic mode, we need to get the clinic UUID from clinics table
        try {
          const { data: clinicData } = await supabase
            .from('clinics')
            .select('id')
            .eq('clinic_code', (singleClinic.clinicCode || "").toUpperCase())
            .single();
          
          if (clinicData) {
            clinic.stats.oralHealthAverage = await calculateClinicOralHealthAverage(clinicData.id);
          }
        } catch (error) {
          console.log("[SUPER_ADMIN] Could not find clinic UUID for single clinic:", error);
        }
      }
    }
    
    // Sort by createdAt (newest first)
    clinicsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    console.log(`[SUPER_ADMIN] Returning ${clinicsList.length} clinics with stats`);
    
    res.json({ 
      ok: true, 
      clinics: clinicsList,
      count: clinicsList.length
    });
  } catch (error) {
    console.error("[SUPER_ADMIN] Get clinics error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// PATCH /api/super-admin/clinics/:clinicId/approve
// Approve a clinic (change status from PENDING to ACTIVE)
app.patch("/api/super-admin/clinics/:clinicId/approve", superAdminGuard, (req, res) => {
  try {
    const { clinicId } = req.params;
    
    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_id_required", message: "Clinic ID is required" });
    }
    
    const clinics = readJson(CLINICS_FILE, {});
    const singleClinic = readJson(CLINIC_FILE, {});
    
    let clinic = null;
    let isSingleClinic = false;
    
    // Check CLINICS_FILE first
    if (clinics[clinicId]) {
      clinic = clinics[clinicId];
    } 
    // Check CLINIC_FILE (single clinic)
    else if (singleClinic && (singleClinic.clinicId === clinicId || clinicId === "single")) {
      clinic = singleClinic;
      isSingleClinic = true;
    } else {
      return res.status(404).json({ ok: false, error: "clinic_not_found", message: "Clinic not found" });
    }
    
    // Update status to ACTIVE
    const oldStatus = clinic.status || "PENDING";
    clinic.status = "ACTIVE";
    clinic.approvedAt = Date.now();
    clinic.updatedAt = Date.now();
    
    // Save to appropriate file
    if (isSingleClinic) {
      writeJson(CLINIC_FILE, clinic);
    } else {
      clinics[clinicId] = clinic;
      writeJson(CLINICS_FILE, clinics);
    }
    
    console.log(`[SUPER_ADMIN] Clinic ${clinicId} approved (status: ${oldStatus} -> ACTIVE)`);
    
    const { password, ...clinicWithoutPassword } = clinic;
    res.json({ 
      ok: true, 
      clinic: clinicWithoutPassword,
      message: "Clinic approved successfully"
    });
  } catch (error) {
    console.error("[SUPER_ADMIN] Approve clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// PATCH /api/super-admin/clinics/:clinicId/reject
// Reject a clinic (change status to REJECTED)
app.patch("/api/super-admin/clinics/:clinicId/reject", superAdminGuard, (req, res) => {
  try {
    const { clinicId } = req.params;
    
    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_id_required", message: "Clinic ID is required" });
    }
    
    const clinics = readJson(CLINICS_FILE, {});
    const singleClinic = readJson(CLINIC_FILE, {});
    
    let clinic = null;
    let isSingleClinic = false;
    
    // Check CLINICS_FILE first
    if (clinics[clinicId]) {
      clinic = clinics[clinicId];
    } 
    // Check CLINIC_FILE (single clinic)
    else if (singleClinic && (singleClinic.clinicId === clinicId || clinicId === "single")) {
      clinic = singleClinic;
      isSingleClinic = true;
    } else {
      return res.status(404).json({ ok: false, error: "clinic_not_found", message: "Clinic not found" });
    }
    
    // Update status to REJECTED
    const oldStatus = clinic.status || "PENDING";
    clinic.status = "REJECTED";
    clinic.rejectedAt = Date.now();
    clinic.updatedAt = Date.now();
    
    // Save to appropriate file
    if (isSingleClinic) {
      writeJson(CLINIC_FILE, clinic);
    } else {
      clinics[clinicId] = clinic;
      writeJson(CLINICS_FILE, clinics);
    }
    
    console.log(`[SUPER_ADMIN] Clinic ${clinicId} rejected (status: ${oldStatus} -> REJECTED)`);
    
    const { password, ...clinicWithoutPassword } = clinic;
    res.json({ 
      ok: true, 
      clinic: clinicWithoutPassword,
      message: "Clinic rejected successfully"
    });
  } catch (error) {
    console.error("[SUPER_ADMIN] Reject clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// PATCH /api/super-admin/clinics/:clinicId/suspend
// Suspend a clinic (for fraud/abuse cases only)
app.patch("/api/super-admin/clinics/:clinicId/suspend", superAdminGuard, async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { reason } = req.body || {};
    
    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_id_required", message: "Clinic ID is required" });
    }
    
    const clinics = readJson(CLINICS_FILE, {});
    const singleClinic = readJson(CLINIC_FILE, {});
    
    let clinic = null;
    let isSingleClinic = false;
    let isSupabaseClinic = false;
    
    // Check CLINICS_FILE first
    if (clinics[clinicId]) {
      clinic = clinics[clinicId];
    } 
    // Check CLINIC_FILE (single clinic)
    else if (singleClinic && (singleClinic.clinicId === clinicId || clinicId === "single")) {
      clinic = singleClinic;
      isSingleClinic = true;
    } else {
      // Check Supabase
      if (isSupabaseEnabled) {
        try {
          console.log(`[SUPER_ADMIN] Looking for clinic in Supabase: ${clinicId}`);
          const { data: supabaseClinic, error } = await supabase
            .from("clinics")
            .select("id, name, email, status")
            .eq("id", clinicId)
            .single();
          
          console.log(`[SUPER_ADMIN] Supabase clinic lookup result:`, { 
            clinicId, 
            found: !!supabaseClinic, 
            status: supabaseClinic?.status,
            error: error?.message 
          });
          
          if (!error && supabaseClinic) {
            clinic = supabaseClinic;
            isSupabaseClinic = true;
          }
        } catch (supabaseError) {
          console.warn("[SUPER_ADMIN] Failed to check Supabase clinic:", supabaseError);
        }
      }
      
      if (!clinic) {
        return res.status(404).json({ ok: false, error: "clinic_not_found", message: "Clinic not found" });
      }
    }
    
    // Update status to SUSPENDED
    const oldStatus = clinic.status || "ACTIVE";
    
    if (isSupabaseClinic) {
      // Update in Supabase
      console.log(`[SUPER_ADMIN] Updating clinic in Supabase: ${clinicId}`, {
        currentStatus: oldStatus,
        newStatus: "SUSPENDED",
        reason: reason || "Suspended by super admin"
      });
      
      const { error } = await supabase
        .from("clinics")
        .update({
          status: "SUSPENDED",
          updated_at: new Date().toISOString()
        })
        .eq("id", clinicId);
      
      if (error) {
        console.error("[SUPER_ADMIN] Failed to suspend clinic in Supabase:", error);
        return res.status(500).json({ ok: false, error: "update_failed", message: "Failed to suspend clinic" });
      }
      
      console.log(`[SUPER_ADMIN] Successfully updated clinic in Supabase: ${clinicId}`);
    } else {
      // Update in file
      clinic.status = "SUSPENDED";
      clinic.suspendedAt = Date.now();
      clinic.suspendedReason = reason || "Suspended by super admin";
      clinic.updatedAt = Date.now();
      
      // Save to appropriate file
      if (isSingleClinic) {
        writeJson(CLINIC_FILE, clinic);
      } else {
        clinics[clinicId] = clinic;
        writeJson(CLINICS_FILE, clinics);
      }
    }
    
    console.log(`[SUPER_ADMIN] Clinic ${clinicId} suspended (status: ${oldStatus} -> SUSPENDED), reason: ${reason || "none"}, source: ${isSupabaseClinic ? "Supabase" : "File"}`);
    
    const { password, ...clinicWithoutPassword } = clinic;
    res.json({ 
      ok: true, 
      clinic: { ...clinicWithoutPassword, status: "SUSPENDED" },
      message: "Clinic suspended successfully"
    });
  } catch (error) {
    console.error("[SUPER_ADMIN] Suspend clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// PATCH /api/super-admin/clinics/:clinicId/activate
// Activate a clinic (change status from SUSPENDED to ACTIVE)
app.patch("/api/super-admin/clinics/:clinicId/activate", superAdminGuard, async (req, res) => {
  try {
    const { clinicId } = req.params;
    
    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_id_required", message: "Clinic ID is required" });
    }
    
    const clinics = readJson(CLINICS_FILE, {});
    const singleClinic = readJson(CLINIC_FILE, {});
    
    let clinic = null;
    let isSingleClinic = false;
    let isSupabaseClinic = false;
    
    // Check CLINICS_FILE first
    if (clinics[clinicId]) {
      clinic = clinics[clinicId];
    } 
    // Check CLINIC_FILE (single clinic)
    else if (singleClinic && (singleClinic.clinicId === clinicId || clinicId === "single")) {
      clinic = singleClinic;
      isSingleClinic = true;
    } else {
      // Check Supabase
      if (isSupabaseEnabled) {
        try {
          console.log(`[SUPER_ADMIN] Looking for clinic in Supabase: ${clinicId}`);
          const { data: supabaseClinic, error } = await supabase
            .from("clinics")
            .select("id, name, email, status")
            .eq("id", clinicId)
            .single();
          
          console.log(`[SUPER_ADMIN] Supabase clinic lookup result:`, { 
            clinicId, 
            found: !!supabaseClinic, 
            status: supabaseClinic?.status,
            error: error?.message 
          });
          
          if (!error && supabaseClinic) {
            clinic = supabaseClinic;
            isSupabaseClinic = true;
          }
        } catch (supabaseError) {
          console.warn("[SUPER_ADMIN] Failed to check Supabase clinic:", supabaseError);
        }
      }
      
      if (!clinic) {
        return res.status(404).json({ ok: false, error: "clinic_not_found", message: "Clinic not found" });
      }
    }
    
    // Update status to ACTIVE
    const oldStatus = clinic.status || "SUSPENDED";
    
    if (isSupabaseClinic) {
      // Update in Supabase
      console.log(`[SUPER_ADMIN] Activating clinic in Supabase: ${clinicId}`, {
        currentStatus: oldStatus,
        newStatus: "ACTIVE"
      });
      
      const { error } = await supabase
        .from("clinics")
        .update({
          status: "ACTIVE",
          updated_at: new Date().toISOString()
        })
        .eq("id", clinicId);
      
      if (error) {
        console.error("[SUPER_ADMIN] Failed to activate clinic in Supabase:", error);
        return res.status(500).json({ ok: false, error: "update_failed", message: "Failed to activate clinic" });
      }
      
      console.log(`[SUPER_ADMIN] Successfully activated clinic in Supabase: ${clinicId}`);
    } else {
      // Update in file
      clinic.status = "ACTIVE";
      clinic.suspendedAt = undefined;
      clinic.suspendedReason = undefined;
      clinic.updatedAt = Date.now();
      
      // Save to appropriate file
      if (isSingleClinic) {
        writeJson(CLINIC_FILE, clinic);
      } else {
        clinics[clinicId] = clinic;
        writeJson(CLINICS_FILE, clinics);
      }
    }
    
    console.log(`[SUPER_ADMIN] Clinic ${clinicId} activated (status: ${oldStatus} -> ACTIVE), source: ${isSupabaseClinic ? "Supabase" : "File"}`);
    
    const { password, ...clinicWithoutPassword } = clinic;
    res.json({ 
      ok: true, 
      clinic: { ...clinicWithoutPassword, status: "ACTIVE" },
      message: "Clinic activated successfully"
    });
  } catch (error) {
    console.error("[SUPER_ADMIN] Activate clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// GET /api/super-admin/clinics/:clinicId/statistics
// Get detailed statistics for a specific clinic (protected)
app.get("/api/super-admin/clinics/:clinicId/statistics", superAdminGuard, (req, res) => {
  try {
    const { clinicId } = req.params;
    
    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_id_required", message: "Clinic ID is required" });
    }
    
    const clinics = readJson(CLINICS_FILE, {});
    const singleClinic = readJson(CLINIC_FILE, {});
    const patients = readJson(PAT_FILE, {});
    const referrals = readJson(REF_FILE, {});
    
    // Find clinic
    let clinic = null;
    if (clinics[clinicId]) {
      clinic = clinics[clinicId];
    } else if (singleClinic && (singleClinic.clinicId === clinicId || clinicId === "single")) {
      clinic = singleClinic;
    } else {
      return res.status(404).json({ ok: false, error: "clinic_not_found", message: "Clinic not found" });
    }
    
    const clinicCode = (clinic.clinicCode || clinic.code || "").toUpperCase();
    
    // Get all patients for this clinic
    const clinicPatients = Object.values(patients).filter(p => 
      (p.clinicCode || p.clinic_code || "").toUpperCase() === clinicCode
    );
    
    // Get all referrals for this clinic
    const clinicReferrals = Object.values(referrals).filter(r =>
      (r.clinicCode || r.clinic_code || "").toUpperCase() === clinicCode
    );
    
    // Calculate statistics
    let totalMessages = 0;
    let messagesFromClinic = 0;
    let messagesFromPatient = 0;
    let lastMessageAt = 0;
    let totalTreatments = 0;
    let totalFiles = 0;
    let patientsWithTravel = 0;
    let travelFilledByPatient = 0;
    let travelFilledByClinic = 0;
    let treatmentCountsByPatient = [];
    
    clinicPatients.forEach(patient => {
      const patientId = patient.patientId || patient.patient_id || "";
      
      // Count messages
      if (patient.messages && Array.isArray(patient.messages)) {
        const patientMessages = patient.messages;
        totalMessages += patientMessages.length;
        
        patientMessages.forEach(msg => {
          const from = (msg.from || "").toUpperCase();
          if (from === "CLINIC" || from === "ADMIN") {
            messagesFromClinic++;
          } else if (from === "PATIENT" || from === "USER") {
            messagesFromPatient++;
          }
          
          const msgTime = msg.timestamp || msg.createdAt || 0;
          if (msgTime > lastMessageAt) {
            lastMessageAt = msgTime;
          }
          
          // Count files (images and documents)
          if (msg.type === "image" || msg.type === "file" || msg.fileUrl || msg.imageUrl) {
            totalFiles++;
          }
        });
      }
      
      // Count treatments
      if (patient.treatments && Array.isArray(patient.treatments)) {
        const patientTreatmentCount = patient.treatments.length;
        totalTreatments += patientTreatmentCount;
        treatmentCountsByPatient.push({
          patientId: patientId,
          treatmentCount: patientTreatmentCount
        });
      }
      
      // Travel statistics (null-safe)
      const travel = patient?.travel || {};
      if (Object.keys(travel).length > 0) {
        patientsWithTravel++;
        
        // Check flight info
        if (Array.isArray(travel.flights)) {
          travel.flights.forEach((flight) => {
            const filledBy = (flight?.filledBy || travel?.filledBy || "").toLowerCase();
            if (filledBy === "patient" || filledBy === "user") {
              travelFilledByPatient++;
            } else if (filledBy === "clinic" || filledBy === "admin") {
              travelFilledByClinic++;
            }
          });
        }
        
        // Check hotel info
        if (travel?.hotel) {
          const filledBy = (travel?.hotel?.filledBy || travel?.filledBy || "").toLowerCase();
          if (filledBy === "patient" || filledBy === "user") {
            travelFilledByPatient++;
          } else if (filledBy === "clinic" || filledBy === "admin") {
            travelFilledByClinic++;
          }
        }
      }
    });
    
    // Sort treatment counts (highest first)
    treatmentCountsByPatient.sort((a, b) => b.treatmentCount - a.treatmentCount);
    const avgTreatmentsPerPatient = clinicPatients.length > 0 ? (totalTreatments / clinicPatients.length).toFixed(2) : 0;
    
    // Referral statistics
    const successfulReferrals = clinicReferrals.filter(r => 
      (r.status || "").toUpperCase() === "APPROVED" || (r.status || "").toUpperCase() === "ACTIVE"
    );
    
    let totalDiscountAmount = 0;
    successfulReferrals.forEach(ref => {
      if (ref.discountAmount) {
        totalDiscountAmount += Number(ref.discountAmount) || 0;
      }
    });
    
    // Calculate activity in last 7 days
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let recentActivity = {
      newPatients: 0,
      newMessages: 0,
      newTreatments: 0
    };
    
    clinicPatients.forEach(patient => {
      const createdAt = patient.createdAt || patient.created_at || 0;
      if (createdAt >= sevenDaysAgo) {
        recentActivity.newPatients++;
      }
      
      if (patient.messages && Array.isArray(patient.messages)) {
        patient.messages.forEach(msg => {
          const msgTime = msg.timestamp || msg.createdAt || 0;
          if (msgTime >= sevenDaysAgo) {
            recentActivity.newMessages++;
          }
        });
      }
      
      if (patient.treatments && Array.isArray(patient.treatments)) {
        patient.treatments.forEach(treatment => {
          const treatmentTime = treatment.createdAt || treatment.date || 0;
          if (treatmentTime >= sevenDaysAgo) {
            recentActivity.newTreatments++;
          }
        });
      }
    });
    
    const statistics = {
      // Basic info
      clinic: {
        name: clinic.name || clinic.clinicName || "",
        address: clinic.address || "",
        phone: clinic.phone || "",
        email: clinic.email || "",
        createdAt: clinic.createdAt || 0,
        plan: clinic.plan || "FREE",
        status: clinic.status || "PENDING"
      },
      
      // Activity summary
      activity: {
        totalPatients: clinicPatients.length,
        totalMessages: totalMessages,
        totalFiles: totalFiles,
        totalTreatments: totalTreatments
      },
      
      // Treatment statistics
      treatments: {
        total: totalTreatments,
        averagePerPatient: parseFloat(avgTreatmentsPerPatient),
        topPatients: treatmentCountsByPatient.slice(0, 10).map(p => ({
          patientId: p.patientId.substring(0, 8) + "...", // Partial ID for privacy
          treatmentCount: p.treatmentCount
        }))
      },
      
      // Messaging statistics
      messaging: {
        total: totalMessages,
        fromClinic: messagesFromClinic,
        fromPatient: messagesFromPatient,
        lastMessageAt: lastMessageAt || null
      },
      
      // Referral statistics
      referrals: {
        total: clinicReferrals.length,
        successful: successfulReferrals.length,
        totalDiscountAmount: totalDiscountAmount
      },
      
      // Travel statistics
      travel: {
        patientsWithTravel: patientsWithTravel,
        filledByPatient: travelFilledByPatient,
        filledByClinic: travelFilledByClinic
      },
      
      // Recent activity (last 7 days)
      recentActivity: recentActivity
    };
    
    console.log(`[SUPER_ADMIN] Statistics for clinic ${clinicId}:`, {
      patients: statistics.activity.totalPatients,
      messages: statistics.activity.totalMessages,
      treatments: statistics.activity.totalTreatments
    });
    
    res.json({ 
      ok: true, 
      statistics: statistics
    });
  } catch (error) {
    console.error("[SUPER_ADMIN] Get clinic statistics error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// ================== CLINIC PAYMENT & SUBSCRIPTION ==================

// POST /api/admin/payment-success
// Called when clinic payment is successfully completed
// Payment = Verification - automatically activate plan and features
app.post("/api/admin/payment-success", requireAdminAuth, async (req, res) => {
  try {
    const { plan, amount, currency, paymentId, paymentMethod } = req.body || {};
    const clinicId = req.clinicId;
    const clinicCode = req.clinicCode;

    if (!plan) {
      return res.status(400).json({ ok: false, error: "plan_required", message: "Plan is required" });
    }

    const normalizedPlan = normalizeClinicPlan(plan);
    const maxPatients = planToMaxPatients(normalizedPlan);

    // Prefer Supabase clinic object when available (single source of truth)
    let clinic = req.clinic || null;

    // FILE FALLBACK (legacy) if clinic wasn't loaded (or Supabase disabled)
    let clinics = null;
    let singleClinic = null;
    let isSingleClinic = false;
    if (!clinic) {
      clinics = readJson(CLINICS_FILE, {});
      singleClinic = readJson(CLINIC_FILE, {});
      if (clinics?.[clinicId]) {
        clinic = clinics[clinicId];
      } else if (singleClinic && singleClinic.clinicCode === clinicCode) {
        clinic = singleClinic;
        isSingleClinic = true;
      }
    }

    if (!clinic) {
      return res.status(404).json({ ok: false, error: "clinic_not_found", message: "Clinic not found" });
    }

    const oldPlan = clinic.plan || "FREE";
    const oldStatus = clinic.status || clinic.settings?.status || "ACTIVE";

    const nowTs = Date.now();

    // Update in-memory object (for response + file fallback)
    clinic.plan = normalizedPlan;
    clinic.max_patients = maxPatients;
    clinic.status = "ACTIVE";
    clinic.subscriptionStatus = "ACTIVE";
    clinic.subscriptionPlan = normalizedPlan;
    clinic.verificationStatus = "verified";
    clinic.paymentCompletedAt = nowTs;
    clinic.lastPaymentId = paymentId || null;
    clinic.lastPaymentAmount = amount || null;
    clinic.lastPaymentCurrency = currency || "USD";
    clinic.lastPaymentMethod = paymentMethod || null;
    clinic.updatedAt = nowTs;

    // SUPABASE: persist plan + max_patients (critical)
    if (isSupabaseEnabled() && clinicId) {
      try {
        const mergedSettings = {
          ...(req.clinic?.settings || clinic.settings || {}),
          status: "ACTIVE",
          subscriptionStatus: "ACTIVE",
          subscriptionPlan: normalizedPlan,
          verificationStatus: "verified",
          paymentCompletedAt: nowTs,
          lastPaymentId: paymentId || null,
          lastPaymentAmount: amount || null,
          lastPaymentCurrency: currency || "USD",
          lastPaymentMethod: paymentMethod || null,
        };

        await updateClinic(clinicId, {
          plan: normalizedPlan,
          max_patients: maxPatients,
          settings: mergedSettings,
        });

        // Keep req.clinic in sync for downstream handlers
        if (req.clinic) {
          req.clinic.plan = normalizedPlan;
          req.clinic.max_patients = maxPatients;
          req.clinic.settings = mergedSettings;
        }
      } catch (e) {
        console.error("[PAYMENT] ❌ Failed to persist payment plan to Supabase:", e?.message || e);
        // Continue with file fallback
      }
    }

    // FILE FALLBACK: persist legacy storage (optional)
    try {
      if (!clinics) clinics = readJson(CLINICS_FILE, {});
      if (!singleClinic) singleClinic = readJson(CLINIC_FILE, {});

      if (isSingleClinic) {
        writeJson(CLINIC_FILE, clinic);
      } else if (clinics && clinicId) {
        clinics[clinicId] = clinic;
        writeJson(CLINICS_FILE, clinics);
      }
    } catch (e) {
      console.warn("[PAYMENT] File fallback persist failed (non-fatal):", e?.message || e);
    }

    console.log(`[PAYMENT] Clinic ${clinicId} (${clinicCode}) payment successful: ${oldPlan} -> ${normalizedPlan}, status: ${oldStatus} -> ACTIVE, max_patients: ${maxPatients}`);

    const { password, password_hash, ...clinicWithoutPassword } = clinic;
    res.json({
      ok: true,
      clinic: clinicWithoutPassword,
      message: "Payment successful. Plan activated and all features unlocked.",
      plan: normalizedPlan,
      status: "ACTIVE",
      verificationStatus: "verified",
      max_patients: maxPatients,
    });
  } catch (error) {
    console.error("[PAYMENT] Payment success error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// ================== TREATMENT PRICING & PAYMENTS ==================

// GET /api/admin/treatment-prices
// Get clinic treatment price list (requires auth)
app.get("/api/admin/treatment-prices", requireAdminAuth, async (req, res) => {
  try {
    if (!isSupabaseEnabled()) {
      return res.status(500).json(supabaseDisabledPayload("treatment_prices"));
    }

    // 🔒 FIX: Ensure clinicId is available
    const clinicId = req.clinicId || req.clinic?.id;
    console.log("[PRICES GET] clinicId:", clinicId);
    
    if (!clinicId) {
      console.error("[PRICES GET] Missing clinicId");
      return res.status(400).json({ ok: false, error: "clinic_id_missing" });
    }

    const { data, error } = await supabase
      .from("treatment_prices")
      .select("*")
      .eq("clinic_id", clinicId);

    if (error) {
      if (isMissingTableError(error, "treatment_prices")) {
        return res.status(500).json({
          ok: false,
          error: "treatment_prices_table_missing",
          message: "Supabase schema missing: treatment_prices. Apply migrations.",
          supabase: supabaseErrorPublic(error),
        });
      }
      console.error("[TREATMENT_PRICES] Supabase fetch failed", {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      return res.status(500).json({
        ok: false,
        error: "treatment_prices_fetch_failed",
        supabase: supabaseErrorPublic(error),
      });
    }

    const prices = (data || []).map((row) => ({
      id: row.id,
      treatment_name: row.treatment_code || row.type || row.name || "",
      default_price:
        row.price !== undefined && row.price !== null
          ? Number(row.price)
          : row.default_price !== undefined && row.default_price !== null
            ? Number(row.default_price)
            : 0,
      currency: row.currency || "EUR",
      is_active: row.is_active !== undefined ? row.is_active !== false : true,
    }));

    res.json({
      ok: true,
      prices,
      clinicCode: req.clinicCode,
    });
  } catch (error) {
    console.error("[TREATMENT_PRICES] Get error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// POST /api/admin/treatment-prices
// Create or update treatment price (requires auth)
app.post("/api/admin/treatment-prices", requireAdminAuth, async (req, res) => {
  try {
    if (!isSupabaseEnabled()) {
      return res.status(500).json(supabaseDisabledPayload("treatment_prices"));
    }

    // 🔒 FIX: Ensure clinicId is available
    const clinicId = req.clinicId || req.clinic?.id;
    console.log("[PRICES POST] clinicId:", clinicId);
    
    if (!clinicId) {
      console.error("[PRICES POST] Missing clinicId");
      return res.status(400).json({ ok: false, error: "clinic_id_missing" });
    }

    const { treatment_name, default_price, currency, is_active } = req.body || {};
    const name = String(treatment_name || "").trim();
    const priceValue = Number(default_price);
    const currencyValue = String(currency || "").trim().toUpperCase();

    if (!name || !currencyValue || Number.isNaN(priceValue)) {
      return res.status(400).json({
        ok: false,
        error: "missing_fields",
        message: "treatment_name, default_price, and currency are required",
      });
    }

    const treatmentCode = name.toUpperCase();
    const basePayload = {
      clinic_id: clinicId,
      treatment_code: treatmentCode,
      name,
      price: priceValue,
      currency: currencyValue,
    };

    const upsertPayload = {
      ...basePayload,
      ...(is_active !== undefined ? { is_active: is_active !== false } : {}),
    };

    let result = null;
    let onConflict = "clinic_id,treatment_code";
    let payloadToUse = { ...upsertPayload };

    for (let attempt = 0; attempt < 4; attempt += 1) {
      result = await supabase
        .from("treatment_prices")
        .upsert(payloadToUse, { onConflict })
        .select("*")
        .single();

      if (!result.error) break;

      if (isMissingColumnError(result.error, "is_active")) {
        const { is_active: _ignored, ...nextPayload } = payloadToUse;
        payloadToUse = nextPayload;
        continue;
      }

      if (isMissingColumnError(result.error, "name")) {
        const { name: _ignored, ...nextPayload } = payloadToUse;
        payloadToUse = nextPayload;
        continue;
      }

      if (isMissingColumnError(result.error, "treatment_code")) {
        const { treatment_code: _ignored, ...nextPayload } = payloadToUse;
        payloadToUse = { ...nextPayload, type: treatmentCode };
        onConflict = "clinic_id,type";
        continue;
      }

      break;
    }

    if (result.error) {
      if (isMissingTableError(result.error, "treatment_prices")) {
        return res.status(500).json({
          ok: false,
          error: "treatment_prices_table_missing",
          message: "Supabase schema missing: treatment_prices. Apply migrations.",
          supabase: supabaseErrorPublic(result.error),
        });
      }
      console.error("[TREATMENT_PRICES] Supabase upsert failed", {
        message: result.error.message,
        code: result.error.code,
        details: result.error.details,
      });
      return res.status(500).json({
        ok: false,
        error: "treatment_prices_save_failed",
        supabase: supabaseErrorPublic(result.error),
      });
    }

    const row = result.data || {};
    const responsePrice = {
      id: row.id,
      treatment_name: row.treatment_code || row.type || row.name || name,
      default_price:
        row.price !== undefined && row.price !== null
          ? Number(row.price)
          : row.default_price !== undefined && row.default_price !== null
            ? Number(row.default_price)
            : priceValue,
      currency: row.currency || currencyValue,
      is_active: row.is_active !== undefined ? row.is_active !== false : (is_active !== false),
    };

    console.log(`[TREATMENT_PRICES] Saved price for clinic ${req.clinicCode}: ${treatmentCode}`);

    res.json({
      ok: true,
      price: responsePrice,
      message: "Price saved",
    });
  } catch (error) {
    console.error("[TREATMENT_PRICES] Create/Update error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// DELETE /api/admin/treatment-prices/:id
// Delete treatment price (requires auth)
app.delete("/api/admin/treatment-prices/:id", requireAdminAuth, async (req, res) => {
  try {
    if (!isSupabaseEnabled()) {
      return res.status(500).json(supabaseDisabledPayload("treatment_prices"));
    }

    // 🔒 FIX: Ensure clinicId is available
    const clinicId = req.clinicId || req.clinic?.id;
    console.log("[PRICES DELETE] clinicId:", clinicId);
    
    if (!clinicId) {
      console.error("[PRICES DELETE] Missing clinicId");
      return res.status(400).json({ ok: false, error: "clinic_id_missing" });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ ok: false, error: "id_required", message: "Price ID is required" });
    }

    const { data, error } = await supabase
      .from("treatment_prices")
      .delete()
      .eq("clinic_id", clinicId)
      .eq("id", id)
      .select("id");

    if (error) {
      if (isMissingTableError(error, "treatment_prices")) {
        return res.status(500).json({
          ok: false,
          error: "treatment_prices_table_missing",
          message: "Supabase schema missing: treatment_prices. Apply migrations.",
          supabase: supabaseErrorPublic(error),
        });
      }
      console.error("[TREATMENT_PRICES] Supabase delete failed", {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      return res.status(500).json({
        ok: false,
        error: "treatment_prices_delete_failed",
        supabase: supabaseErrorPublic(error),
      });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ ok: false, error: "price_not_found", message: "Price not found" });
    }

    console.log(`[TREATMENT_PRICES] Deleted price ${id} for clinic ${req.clinicCode}`);
    res.json({ ok: true, message: "Price deleted" });
  } catch (error) {
    console.error("[TREATMENT_PRICES] Delete error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// GET /api/patient/:patientId/payment-summary
// Get patient payment summary (patient can view their own)
app.get("/api/patient/:patientId/payment-summary", requireToken, (req, res) => {
  try {
    const { patientId } = req.params;
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }
    
    // Verify patient can only see their own payment summary
    if (req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }
    
    // Get patient payment data
    const payments = readJson(PAYMENTS_FILE, {});
    const patientPayments = payments[patientId] || {};
    
    // Get treatment plan to calculate total agreed
    const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
    const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
    const treatments = readJson(treatmentsFile, { teeth: [] });
    
    // Calculate total agreed amount from treatment plan
    let totalAgreedAmount = 0;
    let currency = patientPayments.currency || "EUR";
    
    if (Array.isArray(treatments.teeth)) {
      for (const tooth of treatments.teeth) {
        if (Array.isArray(tooth.procedures)) {
          for (const proc of tooth.procedures) {
            if (proc.unit_price && proc.quantity) {
              totalAgreedAmount += (Number(proc.unit_price) * Number(proc.quantity));
              if (proc.currency) currency = proc.currency;
            } else if (proc.total_price) {
              totalAgreedAmount += Number(proc.total_price);
              if (proc.currency) currency = proc.currency;
            }
          }
        }
      }
    }
    
    // Use stored payment summary or calculate
    const totalPaidAmount = Number(patientPayments.total_paid_amount || 0);
    const remainingAmount = totalAgreedAmount - totalPaidAmount;
    
    const summary = {
      total_agreed_amount: totalAgreedAmount,
      total_paid_amount: totalPaidAmount,
      remaining_amount: remainingAmount,
      currency: currency,
      payers: patientPayments.payers || [],
      updatedAt: patientPayments.updatedAt || null,
    };
    
    res.json({ ok: true, summary });
  } catch (error) {
    console.error("[PAYMENT_SUMMARY] Get error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// GET /api/admin/patient/:patientId/payment-summary
// Get patient payment summary (requires auth)
app.get("/api/admin/patient/:patientId/payment-summary", requireAdminAuth, (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicCode = req.clinicCode;
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }
    
    // Get patient payment data
    const payments = readJson(PAYMENTS_FILE, {});
    const patientPayments = payments[patientId] || {};
    
    // Get treatment plan to calculate total agreed
    const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
    const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
    const treatments = readJson(treatmentsFile, { teeth: [] });
    
    // Calculate total agreed amount from treatment plan
    let totalAgreedAmount = 0;
    let currency = patientPayments.currency || "EUR";
    
    if (Array.isArray(treatments.teeth)) {
      for (const tooth of treatments.teeth) {
        if (Array.isArray(tooth.procedures)) {
          for (const proc of tooth.procedures) {
            if (proc.unit_price && proc.quantity) {
              totalAgreedAmount += (Number(proc.unit_price) * Number(proc.quantity));
              if (proc.currency) currency = proc.currency;
            } else if (proc.total_price) {
              totalAgreedAmount += Number(proc.total_price);
              if (proc.currency) currency = proc.currency;
            }
          }
        }
      }
    }
    
    // Use stored payment summary or calculate
    const totalPaidAmount = Number(patientPayments.total_paid_amount || 0);
    const remainingAmount = totalAgreedAmount - totalPaidAmount;
    
    const summary = {
      total_agreed_amount: totalAgreedAmount,
      total_paid_amount: totalPaidAmount,
      remaining_amount: remainingAmount,
      currency: currency,
      payers: patientPayments.payers || [],
      updatedAt: patientPayments.updatedAt || null,
    };
    
    res.json({ ok: true, summary });
  } catch (error) {
    console.error("[PAYMENT_SUMMARY] Get error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// PUT /api/admin/patient/:patientId/financial-snapshot
// Update patient financial snapshot (manual update by admin)
app.put("/api/admin/patient/:patientId/financial-snapshot", requireAdminAuth, (req, res) => {
  try {
    const { patientId } = req.params;
    const { financialSnapshot } = req.body;

    if (!financialSnapshot || typeof financialSnapshot !== 'object') {
      return res.status(400).json({
        ok: false,
        error: "financial_snapshot_required",
        message: "Financial snapshot data is required"
      });
    }

    // Validate fields
    const totalEstimatedCost = Number(financialSnapshot.totalEstimatedCost);
    const totalPaid = Number(financialSnapshot.totalPaid);
    const remainingBalance = Number(financialSnapshot.remainingBalance);

    if (isNaN(totalEstimatedCost) || totalEstimatedCost < 0) {
      return res.status(400).json({
        ok: false,
        error: "invalid_total_estimated_cost",
        message: "Total estimated cost must be a non-negative number"
      });
    }

    if (isNaN(totalPaid) || totalPaid < 0) {
      return res.status(400).json({
        ok: false,
        error: "invalid_total_paid",
        message: "Total paid must be a non-negative number"
      });
    }

    if (isNaN(remainingBalance) || remainingBalance < 0) {
      return res.status(400).json({
        ok: false,
        error: "invalid_remaining_balance",
        message: "Remaining balance must be a non-negative number"
      });
    }

    // Load patient
    const patients = readJson(PAT_FILE, {});
    const patient = patients[patientId];

    if (!patient) {
      return res.status(404).json({
        ok: false,
        error: "patient_not_found",
        message: "Patient not found"
      });
    }

    // Update financial snapshot
    if (!patient.financialSnapshot) {
      patient.financialSnapshot = {};
    }

    patient.financialSnapshot.totalEstimatedCost = totalEstimatedCost;
    patient.financialSnapshot.totalPaid = totalPaid;
    patient.financialSnapshot.remainingBalance = remainingBalance;
    patient.updatedAt = now();

    // Save
    patients[patientId] = patient;
    writeJson(PAT_FILE, patients);

    console.log(`[FINANCIAL SNAPSHOT] Updated for patient ${patientId}:`, patient.financialSnapshot);

    res.json({
      ok: true,
      financialSnapshot: patient.financialSnapshot
    });
  } catch (error) {
    console.error("[FINANCIAL SNAPSHOT] Update error:", error);
    res.status(500).json({
      ok: false,
      error: "internal_error",
      message: error.message || "Failed to update financial snapshot"
    });
  }
});

// POST /api/admin/patient/:patientId/payment-summary
// Update patient payment summary (requires auth)
app.post("/api/admin/patient/:patientId/payment-summary", requireAdminAuth, (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicCode = req.clinicCode;
    const { total_paid_amount, payers, currency } = req.body || {};
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }
    
    const payments = readJson(PAYMENTS_FILE, {});
    
    // Get treatment plan to calculate total agreed
    const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
    const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
    const treatments = readJson(treatmentsFile, { teeth: [] });
    
    // Calculate total agreed amount
    let totalAgreedAmount = 0;
    let treatmentCurrency = currency || "EUR";
    
    if (Array.isArray(treatments.teeth)) {
      for (const tooth of treatments.teeth) {
        if (Array.isArray(tooth.procedures)) {
          for (const proc of tooth.procedures) {
            if (proc.unit_price && proc.quantity) {
              totalAgreedAmount += (Number(proc.unit_price) * Number(proc.quantity));
              if (proc.currency) treatmentCurrency = proc.currency;
            } else if (proc.total_price) {
              totalAgreedAmount += Number(proc.total_price);
              if (proc.currency) treatmentCurrency = proc.currency;
            }
          }
        }
      }
    }
    
    const totalPaid = Number(total_paid_amount || payments[patientId]?.total_paid_amount || 0);
    const remainingAmount = totalAgreedAmount - totalPaid;
    
    payments[patientId] = {
      total_agreed_amount: totalAgreedAmount,
      total_paid_amount: totalPaid,
      remaining_amount: remainingAmount,
      currency: currency || treatmentCurrency,
      payers: payers || payments[patientId]?.payers || [],
      updatedAt: now(),
      clinicCode,
    };
    
    writeJson(PAYMENTS_FILE, payments);
    
    console.log(`[PAYMENT_SUMMARY] Updated payment summary for patient ${patientId}`);
    
    res.json({ 
      ok: true, 
      summary: payments[patientId],
      message: "Payment summary updated"
    });
  } catch (error) {
    console.error("[PAYMENT_SUMMARY] Update error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// POST /api/admin/verify-registration-otp
// Verify OTP and complete clinic registration
app.post("/api/admin/verify-registration-otp", async (req, res) => {
  try {
    const { email, otp, clinicCode } = req.body || {};
    
    if (!email || !otp || !clinicCode) {
      return res.status(400).json({ ok: false, error: "missing_fields", message: "Email, OTP, and clinic code are required" });
    }
    
    const emailLower = String(email).trim().toLowerCase();
    const clinicCodeTrimmed = String(clinicCode).trim().toUpperCase();
    
    console.log("[ADMIN VERIFY REG OTP] ========================================");
    console.log("[ADMIN VERIFY REG OTP] Verifying OTP for clinic registration");
    console.log("[ADMIN VERIFY REG OTP] Email:", emailLower);
    console.log("[ADMIN VERIFY REG OTP] Clinic Code:", clinicCodeTrimmed);
    console.log("[ADMIN VERIFY REG OTP] ========================================");
    console.log("[ADMIN VERIFY REG OTP] DEBUG: Querying 'otps' table for email:", emailLower);
    
    // Get OTP data
    const otpData = await getOTPsForEmail(emailLower);
    console.log("[ADMIN VERIFY REG OTP] DEBUG: getOTPsForEmail returned:", otpData ? "object" : "null");
    if (otpData) {
      console.log("[ADMIN VERIFY REG OTP] DEBUG: OTP data keys:", Object.keys(otpData));
      console.log("[ADMIN VERIFY REG OTP] DEBUG: OTP email:", otpData.email);
      console.log("[ADMIN VERIFY REG OTP] DEBUG: OTP has otp_hash:", !!otpData.otp_hash);
      console.log("[ADMIN VERIFY REG OTP] DEBUG: OTP created_at:", otpData.created_at);
    }
    if (!otpData) {  // Fixed: otpData is now object, not array
      console.log("[ADMIN VERIFY REG OTP] No OTP found for email");
      return res.status(400).json({ ok: false, error: "otp_not_found", message: "OTP not found or expired" });
    }
    
    // otpData is now the OTP object directly (not array)
    const latestOTP = otpData;
    
    // Check if already verified
    if (latestOTP.verified) {
      console.log("[ADMIN VERIFY REG OTP] OTP already verified");
      return res.status(400).json({ ok: false, error: "otp_already_verified", message: "OTP already verified" });
    }
    
    // Check expiration
    const now = Date.now();
    const createdAt = new Date(latestOTP.created_at).getTime();
    const expiresAt = latestOTP.expires_at ? new Date(latestOTP.expires_at).getTime() : createdAt + (5 * 60 * 1000); // 5 minutes default
    
    console.log("[ADMIN VERIFY REG OTP] Time debug:");
    console.log("[ADMIN VERIFY REG OTP] Current time:", new Date(now).toISOString());
    console.log("[ADMIN VERIFY REG OTP] Created at:", new Date(createdAt).toISOString());
    console.log("[ADMIN VERIFY REG OTP] Expires at:", new Date(expiresAt).toISOString());
    console.log("[ADMIN VERIFY REG OTP] Time elapsed (minutes):", (now - createdAt) / (1000 * 60));
    
    if (now > expiresAt) {
      console.log("[ADMIN VERIFY REG OTP] OTP expired");
      return res.status(400).json({ ok: false, error: "otp_expired", message: "OTP has expired" });
    }
    
    // Verify OTP
    const isValidOTP = await bcrypt.compare(String(otp), latestOTP.hashedOTP || latestOTP.otp_hash);
    if (!isValidOTP) {
      console.log("[ADMIN VERIFY REG OTP] Invalid OTP");
      return res.status(400).json({ ok: false, error: "invalid_otp", message: "Invalid OTP" });
    }
    
    console.log("[ADMIN VERIFY REG OTP] OTP verified successfully");
    
    // Debug: Log the OTP object structure
    console.log("[ADMIN VERIFY REG OTP] OTP object keys:", Object.keys(latestOTP));
    console.log("[ADMIN VERIFY REG OTP] Full OTP object:", JSON.stringify(latestOTP, null, 2));
    
    // Get registration data
    const registrationData = latestOTP.registration_data;
    if (!registrationData) {
      console.log("[ADMIN VERIFY REG OTP] No registration data found");
      return res.status(400).json({ ok: false, error: "registration_data_missing", message: "Registration data not found" });
    }
    
    // Resolve clinic_code from multiple sources
    const resolvedClinicCode = 
      clinicCodeTrimmed ||  // From request body
      registrationData?.clinic_code ||  // From registration data (snake_case)
      registrationData?.clinicCode;    // From registration data (camelCase)
    
    console.log("[ADMIN VERIFY REG OTP] DEBUG: clinic_code resolved as:", resolvedClinicCode);
    console.log("[ADMIN VERIFY REG OTP] DEBUG: sources - req.body:", clinicCodeTrimmed, "reg_data.snake:", registrationData?.clinic_code, "reg_data.camel:", registrationData?.clinicCode);
    
    if (!resolvedClinicCode) {
      console.log("[ADMIN VERIFY REG OTP] ERROR: clinic_code is missing in verify step");
      return res.status(400).json({ ok: false, error: "clinic_code_missing", message: "Clinic code is missing" });
    }
    
    // Check if clinic code already exists (double check)
    const existingByCode = await getClinicByCode(resolvedClinicCode);
    if (existingByCode) {
      console.log("[ADMIN VERIFY REG OTP] Clinic code already exists during verification");
      return res.status(400).json({ ok: false, error: "clinic_code_exists", message: "Clinic code already exists" });
    }
    
    // Create clinic in Supabase
    console.log("[ADMIN VERIFY REG OTP] Creating clinic in Supabase...");
    
    // Map registration data to clinic format
    const clinicData = {
      name: registrationData.name,
      email: registrationData.email,
      phone: registrationData.phone || '',
      address: registrationData.address || '',
      website: registrationData.website || '',
      clinic_code: resolvedClinicCode,  // Use resolved clinic code
      plan: registrationData.plan || 'FREE',
      max_patients: registrationData.max_patients || 50,
      password_hash: '$2b$10$placeholder.hash.for.registration' // Required field
    };
    
    console.log("[ADMIN VERIFY REG OTP] Mapped clinic data:", clinicData);
    const newClinic = await createClinic(clinicData);
    
    if (!newClinic) {
      console.log("[ADMIN VERIFY REG OTP] Failed to create clinic");
      return res.status(500).json({ ok: false, error: "clinic_creation_failed", message: "Failed to create clinic" });
    }
    
    console.log("[ADMIN VERIFY REG OTP] Clinic created successfully:", newClinic.id);
    
    // Mark OTP as verified/used
    await markOTPUsed(latestOTP.id);
    
    // Generate admin token
    const token = jwt.sign(
      { 
        clinicCode: clinicCodeTrimmed,
        clinicId: newClinic.id,
        role: "admin",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
      },
      JWT_SECRET
    );
    
    console.log("[ADMIN VERIFY REG OTP] Registration completed successfully");
    
    res.json({
      ok: true,
      message: "Clinic registered successfully",
      token,
      clinic: {
        id: newClinic.id,
        clinic_code: newClinic.clinic_code,
        email: newClinic.email,
        name: newClinic.name
      }
    });
    
  } catch (error) {
    console.error("[ADMIN VERIFY REG OTP] Error:", error);
    res.status(500).json({ 
      ok: false, 
      error: "internal_error", 
      message: "Registration verification failed" 
    });
  }
});

// POST /api/admin/resend-otp
// Resend OTP for clinic registration
app.post("/api/admin/resend-otp", async (req, res) => {
  try {
    const { email, clinicCode, clinicName } = req.body || {};
    
    if (!email || !clinicCode || !clinicName) {
      return res.status(400).json({ ok: false, error: "missing_fields", message: "Email, clinic code, and clinic name are required" });
    }
    
    const emailLower = String(email).trim().toLowerCase();
    const clinicCodeTrimmed = String(clinicCode).trim().toUpperCase();
    
    console.log("[ADMIN RESEND OTP] ========================================");
    console.log("[ADMIN RESEND OTP] Resending OTP for clinic registration");
    console.log("[ADMIN RESEND OTP] Email:", emailLower);
    console.log("[ADMIN RESEND OTP] Clinic Code:", clinicCodeTrimmed);
    console.log("[ADMIN RESEND OTP] ========================================");
    
    // Generate new OTP with standardization
    const otp = String(generateOTP()).trim();  // Standardize: String + trim
    const otpHash = await bcrypt.hash(otp, 10);  // Use same hash method
    
    console.log("[ADMIN RESEND OTP] Generated OTP:", otp);
    console.log("[ADMIN RESEND OTP] OTP hash generated:", otpHash.substring(0, 10) + "...");
    
    // Store OTP with registration data
    await storeOTPForEmail(emailLower, otpHash, clinicCodeTrimmed, {
      name: String(clinicName).trim(),
      phone: '',
      address: '',
      website: '',
      email: emailLower,
      clinicCode: clinicCodeTrimmed
    });
    
    console.log("[ADMIN RESEND OTP] OTP stored in Supabase for:", emailLower);
    
    // Send OTP email
    await sendOTPEmail(emailLower, otp, "tr");
    
    console.log("[ADMIN RESEND OTP] OTP resent successfully");
    
    res.json({
      ok: true,
      message: "OTP resent successfully"
    });
    
  } catch (error) {
    console.error("[ADMIN RESEND OTP] Error:", error);
    res.status(500).json({ 
      ok: false, 
      error: "internal_error", 
      message: "Failed to resend OTP" 
    });
  }
});

// ================== POST-BOOT INIT ==================
// Heavy async operations run AFTER server starts

// ================== PATIENT MANAGEMENT ==================

// POST /api/admin/patients - Create manual patient
app.post("/api/admin/patients", requireAdminAuth, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      notes,
      address
    } = req.body || {};
    
    console.log("[PATIENTS] Create manual patient request:", {
      firstName,
      lastName,
      email,
      phone,
      clinicId: req.clinicId,
      clinicCode: req.clinicCode
    });
    
    if (!firstName || !lastName) {
      return res.status(400).json({ 
        ok: false, 
        error: 'missing_fields',
        message: 'First name and last name are required' 
      });
    }
    
    const clinicId = req.clinicId;
    const patientId = `patient_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (isSupabaseEnabled()) {
      // First, try basic insert without optional fields
      const basicInsertData = {
        id: crypto.randomUUID(),
        patient_id: patientId,
        clinic_id: clinicId,
        first_name: firstName,
        last_name: lastName,
        patient_type: 'manual',
        created_at: new Date().toISOString()
      };
      
      console.log("[PATIENTS] Basic insert data:", basicInsertData);
      
      const { data, error } = await supabase
        .from('patients')
        .insert(basicInsertData)
        .select()
        .single();
      
      if (error) {
        console.error("[PATIENTS] Supabase basic insert error:", error);
        throw error;
      }
      
      console.log("[PATIENTS] Manual patient created in Supabase (basic):", data.id);
      
      // If basic insert works, try to update with optional fields
      const updateData = {};
      if (email) updateData.email = email;
      if (phone) updateData.phone = phone;
      if (dateOfBirth) updateData.date_of_birth = dateOfBirth;
      if (address) updateData.address = address;
      if (notes) updateData.notes = notes;
      
      // Add fullName and name fields for display
      updateData.full_name = `${firstName} ${lastName}`;
      updateData.name = `${firstName} ${lastName}`;
      
      if (Object.keys(updateData).length > 0) {
        console.log("[PATIENTS] Updating patient with optional fields:", updateData);
        
        const { data: updateResult, error: updateError } = await supabase
          .from('patients')
          .update(updateData)
          .eq('patient_id', patientId)
          .select()
          .single();
        
        if (updateError) {
          console.warn("[PATIENTS] Update failed, but basic insert succeeded:", updateError);
          // Continue with basic data
        } else {
          console.log("[PATIENTS] Patient updated successfully:", updateResult.id);
          return res.json({ ok: true, patient: updateResult });
        }
      }
      
      return res.json({ ok: true, patient: data });
    }
    
    // Fallback to file-based
    const patients = readJson(PAT_FILE, {});
    const newPatient = {
      patientId,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,  // Add fullName field
      name: `${firstName} ${lastName}`,        // Add name field for compatibility
      email: email || '',
      phone: phone || '',
      dateOfBirth: dateOfBirth || null,
      // Skip address field for now until Supabase schema is fixed
      // address: address || '',
      notes: notes || '',
      clinicCode: req.clinicCode,
      patient_type: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    patients[patientId] = newPatient;
    writeJson(PAT_FILE, patients);
    
    console.log("[PATIENTS] Manual patient created (file):", patientId);
    res.json({ ok: true, patient: newPatient });
    
  } catch (error) {
    console.error('[PATIENTS] Create error:', error);
    res.status(500).json({ ok: false, error: 'internal_error', message: error.message });
  }
});

async function postBootInit() {
  console.log("\n🧠 Post-boot init starting...");
  
  try {
    // Test Supabase connection
    if (isSupabaseEnabled()) {
      await testSupabaseConnection();
    } else {
      console.log("[POST-BOOT] Supabase not configured - using file storage");
    }
    
    // Verify SMTP
    if (emailTransporter) {
      emailTransporter.verify((error, success) => {
        if (error) {
          console.error("[POST-BOOT] ❌ SMTP verify failed:", error.message);
        } else {
          console.log("[POST-BOOT] ✅ SMTP ready to send emails");
        }
      });
    } else {
      console.log("[POST-BOOT] ⚠️  SMTP not configured - emails disabled");
    }
    
  } catch (e) {
    console.error("[POST-BOOT] Init error:", e.message);
  }
  
  console.log("🧠 Post-boot init done\n");
}

// DEBUG: Test endpoint for PATCH requests
app.patch("/debug/test-patch", (req, res) => {
  console.log("[DEBUG] PATCH test endpoint hit!");
  console.log("[DEBUG] Headers:", req.headers);
  console.log("[DEBUG] Body:", req.body);
  res.json({ ok: true, message: "PATCH test successful" });
});

// ================== ADMIN ROUTE ALIASES ==================
console.log("[INIT] Adding admin route aliases to correct entry point");

// 🔥 ADMIN ALIAS ROUTES (MUTLAKA INDEX.CJS İÇİNDE)
app.get(
  "/admin/doctor-applications",
  requireAdminAuth,
  async (req, res) => {
    console.log("[ADMIN ALIAS] /admin/doctor-applications hit!");
    console.log("[ADMIN ALIAS] req.admin:", req.admin);
    console.log("[ADMIN ALIAS] req.clinic:", req.clinic);
    console.log("[ADMIN ALIAS] req.clinicCode:", req.clinicCode);
    console.log("[ADMIN ALIAS] req.clinicId:", req.clinicId);
    console.log("[ADMIN ALIAS] Headers:", Object.keys(req.headers));
    console.log("[ADMIN ALIAS] Authorization:", req.headers.authorization ? "present" : "missing");
    
    try {
      // Get all doctor applications from DOCTORS table scoped to this clinic
      console.log("[ADMIN ALIAS] Querying doctor applications from DOCTORS table for clinic:", req.clinicCode);
      
      // Log the exact query being executed
      const query = supabase
        .from("doctors") // 🔥 FIX: Query DOCTORS table
        .select("*")
        .eq("clinic_code", req.clinicCode) // 🔥 CLINIC SCOPE FILTER
        .in("status", ["PENDING", "ACTIVE"]) // 🔥 STATUS FILTER
        .order("created_at", { ascending: false });
      
      console.log("[ADMIN ALIAS] Supabase query built with clinic_code:", req.clinicCode);
      
      const { data: doctors, error } = await query;

      console.log("[ADMIN ALIAS] Supabase query result:");
      console.log("  - Doctors count:", doctors?.length || 0);
      console.log("  - Error:", error);
      console.log("  - Clinic codes in results:", doctors?.map(d => d.clinic_code) || []);
      console.log("  - Sample doctor:", doctors?.[0] || "none");

      if (error) {
        console.error("[ADMIN ALIAS] Supabase error:", error);
        return res.status(500).json({ ok: false, error: "fetch_failed", details: error });
      }

      console.log("[ADMIN ALIAS] Sending success response with", doctors?.length, "doctors for clinic:", req.clinicCode);
      res.json({
        ok: true,
        doctors: doctors || [],
        clinicCode: req.clinicCode,
        debug: {
          clinicCode: req.clinicCode,
          clinicId: req.clinicId,
          resultCount: doctors?.length || 0,
          clinicCodesInResults: doctors?.map(d => d.clinic_code) || []
        }
      });
    } catch (handlerError) {
      console.error("[ADMIN ALIAS] Handler error:", handlerError);
      console.error("[ADMIN ALIAS] Stack trace:", handlerError.stack);
      res.status(500).json({ 
        ok: false, 
        error: "internal_error", 
        message: handlerError.message,
        stack: handlerError.stack 
      });
    }
  }
);

app.post(
  "/admin/approve-doctor",
  requireAdminAuth,
  async (req, res) => {
    console.log("[ADMIN ALIAS] /admin/approve-doctor hit!");
    console.log("[ADMIN ALIAS] req.admin:", req.admin);
    console.log("[ADMIN ALIAS] req.clinic:", req.clinic);
    console.log("[ADMIN ALIAS] req.clinicCode:", req.clinicCode);
    console.log("[ADMIN ALIAS] req.clinicId:", req.clinicId);
    console.log("[ADMIN ALIAS] req.body:", req.body);
    
    try {
      const { patientId } = req.body || {};
      console.log("[ADMIN ALIAS] Extracted patientId:", patientId);

      if (!patientId) {
        console.log("[ADMIN ALIAS] Missing patientId");
        return res.status(400).json({ ok: false, error: "missing_patient_id" });
      }

      // Update doctor status to ACTIVE, scoped to this clinic
    console.log("[ADMIN ALIAS] Updating doctor status to ACTIVE for clinic:", req.clinicCode);
    const { data: updatedDoctor, error: updateError } = await supabase
      .from("doctors") // 🔥 FIX: Update DOCTORS table
      .update({ 
        status: "ACTIVE"
      })
      .eq("doctor_id", patientId) // 🔥 FIX: Use doctor_id
      .eq("clinic_code", req.clinicCode) // 🔥 CLINIC SCOPE FILTER - only approve doctors from this clinic
      .select()
      .single();

      console.log("[ADMIN ALIAS] Update result:", { updatedDoctor, error: updateError });

      if (updateError) {
        console.error("[ADMIN ALIAS] Update error:", updateError);
        return res.status(500).json({ ok: false, error: "update_failed", details: updateError });
      }

      if (!updatedDoctor) {
      console.error("[ADMIN ALIAS] No doctor found with doctorId:", patientId, "for clinic:", req.clinicCode);
      return res.status(404).json({ ok: false, error: "doctor_not_found_or_unauthorized" });
    }

    console.log("[ADMIN ALIAS] Sending success response");
    res.json({
      ok: true,
      message: "Doctor approved successfully",
      doctor: {
        doctorId: updatedDoctor.doctor_id, // 🔥 FIX: Use doctor_id
        name: updatedDoctor.name,
        status: updatedDoctor.status,
        clinicId: updatedDoctor.clinic_id,
        clinicCode: updatedDoctor.clinic_code,
      },
      clinicCode: req.clinicCode,
    });
    } catch (handlerError) {
      console.error("[ADMIN ALIAS] Handler error:", handlerError);
      console.error("[ADMIN ALIAS] Stack trace:", handlerError.stack);
      res.status(500).json({ 
        ok: false, 
        error: "internal_error", 
        message: handlerError.message,
        stack: handlerError.stack 
      });
    }
  }
);

console.log("[INIT] Admin route aliases added to correct entry point");

// ================== START ==================
// Render uyumlu: Server HEMEN başlar, ağır işler sonra
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n========================================`);
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`========================================`);
  console.log(`📍 Health:   http://0.0.0.0:${PORT}/health`);
  console.log(`📍 Admin:    http://0.0.0.0:${PORT}/admin.html`);
  console.log(`📍 Privacy:  http://0.0.0.0:${PORT}/privacy`);
  console.log(`========================================`);
  console.log(`🗄️  Database: ${isSupabaseEnabled() ? 'SUPABASE' : 'FILE SYSTEM'}`);
  console.log(`📧 Email:    ${emailTransporter ? 'SMTP' : 'NOT CONFIGURED'}`);
  console.log(`========================================`);
  console.log(`[ENV DEBUG]`);
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 40) + '...' : 'NOT SET'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET (' + process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 10) + '...)' : 'NOT SET'}`);
  console.log(`[SMTP DEBUG]`);
  console.log(`  SMTP_HOST: ${SMTP_HOST || 'NOT SET'}`);
  console.log(`  SMTP_PORT: ${SMTP_PORT}`);
  console.log(`  SMTP_USER: ${SMTP_USER ? SMTP_USER.substring(0, 5) + '...' : 'NOT SET'}`);
  postBootInit();
});

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION] =====================================');
  console.error('[UNCAUGHT EXCEPTION] Error:', error);
  console.error('[UNCAUGHT EXCEPTION] Stack:', error.stack);
  console.error('[UNCAUGHT EXCEPTION] =====================================');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION] =====================================');
  console.error('[UNHANDLED REJECTION] Reason:', reason);
  console.error('[UNHANDLED REJECTION] Promise:', promise);
  console.error('[UNHANDLED REJECTION] =====================================');
});
