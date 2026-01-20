console.log("🔥 RUNNING INDEX.CJS FROM ROOT /cliniflow-admin");

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

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "clinifly-secret-key-change-in-production";
const JWT_EXPIRES_IN = "30d"; // 30 days

// Super Admin ENV variables
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "";
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "";
const SUPER_ADMIN_JWT_SECRET = process.env.SUPER_ADMIN_JWT_SECRET || "super-admin-secret-key-change-in-production";

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ================== STATIC ADMIN FILES ==================
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

const now = () => Date.now();
const rid = (p) => p + "_" + crypto.randomBytes(6).toString("hex");
const makeToken = () => "t_" + crypto.randomBytes(10).toString("base64url");

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
const SMTP_HOST = process.env.SMTP_HOST || "smtp-relay.brevo.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "noreply@clinifly.com";

// Nodemailer transporter for Brevo SMTP
let emailTransporter = null;
if (SMTP_USER && SMTP_PASS) {
  emailTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  console.log(`[EMAIL] SMTP configured for ${SMTP_HOST}:${SMTP_PORT}`);
} else {
  console.warn("[EMAIL] SMTP credentials not configured. OTP emails will not be sent.");
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
  return await bcrypt.compare(plainOTP, hashedOTP);
}

/**
 * Get OTPs for an email
 */
function getOTPsForEmail(email) {
  const otps = readJson(OTP_FILE, {});
  return otps[email.toLowerCase().trim()] || null;
}

/**
 * Save OTP for an email
 */
async function saveOTP(email, otpCode, attempts = 0) {
  const otps = readJson(OTP_FILE, {});
  const emailKey = email.toLowerCase().trim();
  const hashedOTP = await hashOTP(otpCode);
  
  otps[emailKey] = {
    hashedOTP,
    createdAt: now(),
    expiresAt: now() + OTP_EXPIRY_MS,
    attempts: attempts,
    verified: false,
  };
  
  writeJson(OTP_FILE, otps);
  return otps[emailKey];
}

/**
 * Increment OTP attempt count
 */
function incrementOTPAttempt(email) {
  const otps = readJson(OTP_FILE, {});
  const emailKey = email.toLowerCase().trim();
  if (otps[emailKey]) {
    otps[emailKey].attempts = (otps[emailKey].attempts || 0) + 1;
    writeJson(OTP_FILE, otps);
  }
}

/**
 * Mark OTP as verified and invalidate it
 */
function markOTPVerified(email) {
  const otps = readJson(OTP_FILE, {});
  const emailKey = email.toLowerCase().trim();
  if (otps[emailKey]) {
    otps[emailKey].verified = true;
    otps[emailKey].expiresAt = now(); // Immediately expire
    writeJson(OTP_FILE, otps);
  }
}

/**
 * Clean up expired OTPs (optional cleanup function)
 */
function cleanupExpiredOTPs() {
  const otps = readJson(OTP_FILE, {});
  const nowTime = now();
  let cleaned = false;
  
  for (const email in otps) {
    const otpData = otps[email];
    if (otpData.expiresAt < nowTime || otpData.verified) {
      delete otps[email];
      cleaned = true;
    }
  }
  
  if (cleaned) {
    writeJson(OTP_FILE, otps);
  }
}

/**
 * Send OTP email using Brevo SMTP
 */
async function sendOTPEmail(email, otpCode) {
  if (!emailTransporter) {
    throw new Error("SMTP not configured");
  }

  const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clinifly - OTP Code</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f4f4f4;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #2563eb;
      margin-bottom: 10px;
    }
    .otp-code {
      background-color: #f0f0f0;
      border: 2px dashed #2563eb;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      font-size: 32px;
      font-weight: bold;
      letter-spacing: 8px;
      color: #2563eb;
      margin: 30px 0;
    }
    .warning {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Clinifly</div>
      <h1 style="margin: 0; color: #111827;">Email Verification Code</h1>
    </div>
    
    <p>Hello,</p>
    <p>You requested a login code for your Clinifly account. Use the code below to complete your login:</p>
    
    <div class="otp-code">${otpCode}</div>
    
    <div class="warning">
      <strong>⚠️ Important:</strong>
      <ul style="margin: 10px 0; padding-left: 20px;">
        <li>This code expires in <strong>5 minutes</strong></li>
        <li>Do not share this code with anyone</li>
        <li>If you didn't request this code, please ignore this email</li>
      </ul>
    </div>
    
    <p>If you didn't request this code, you can safely ignore this email.</p>
    
    <div class="footer">
      <p>This is an automated email. Please do not reply.</p>
      <p>&copy; ${new Date().getFullYear()} Clinifly. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;

  const textTemplate = `
Clinifly - Email Verification Code

Hello,

You requested a login code for your Clinifly account.

Your OTP code is: ${otpCode}

This code expires in 5 minutes. Do not share this code with anyone.

If you didn't request this code, you can safely ignore this email.

---
This is an automated email. Please do not reply.
© ${new Date().getFullYear()} Clinifly. All rights reserved.
  `;

  const mailOptions = {
    from: SMTP_FROM,
    to: email,
    subject: "Clinifly - Your Login Code",
    text: textTemplate,
    html: htmlTemplate,
  };

  await emailTransporter.sendMail(mailOptions);
  console.log(`[OTP] Email sent to ${email}`);
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
function requireAdminToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[requireAdminToken] Missing or invalid auth header");
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Geçersiz token. Lütfen tekrar giriş yapın." });
    }

    const token = authHeader.substring(7);
    console.log("[requireAdminToken] Token received, length:", token.length, "starts with:", token.substring(0, 10));
    
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("[requireAdminToken] Token decoded, clinicCode:", decoded.clinicCode, "clinicId:", decoded.clinicId);

    // Try to find clinic by clinicId first, then by clinicCode
    let clinic = null;
    const clinics = readJson(CLINICS_FILE, {});
    
    if (decoded.clinicId) {
      clinic = clinics[decoded.clinicId];
    }
    
    // If not found by clinicId, search by clinicCode
    if (!clinic && decoded.clinicCode) {
      const code = String(decoded.clinicCode).toUpperCase();
      for (const clinicId in clinics) {
        const c = clinics[clinicId];
        if (c) {
          const clinicCodeToCheck = c.clinicCode || c.code;
          if (clinicCodeToCheck && String(clinicCodeToCheck).toUpperCase() === code) {
            clinic = c;
            // Update decoded.clinicId for consistency
            decoded.clinicId = clinicId;
            break;
          }
        }
      }
    }
    
    // Also check CLINIC_FILE (single clinic) as fallback
    if (!clinic && decoded.clinicCode) {
      const singleClinic = readJson(CLINIC_FILE, {});
      const code = String(decoded.clinicCode).toUpperCase();
      if (singleClinic && singleClinic.clinicCode && String(singleClinic.clinicCode).toUpperCase() === code) {
        clinic = singleClinic;
      }
    }
    
    if (!clinic) {
      console.error("[requireAdminToken] Clinic not found, clinicCode:", decoded.clinicCode, "clinicId:", decoded.clinicId);
      return res.status(401).json({ ok: false, error: "clinic_not_found", message: "Klinik bulunamadı." });
    }

    req.clinicId = decoded.clinicId || null;
    req.clinicCode = clinic.clinicCode || clinic.code;
    req.clinicStatus = clinic.status || "PENDING";
    console.log("[requireAdminToken] Auth successful for clinic:", req.clinicCode, "clinicId:", req.clinicId);
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
app.get("/health", (req, res) => {
  res.setHeader("X-CLINIFLY-SERVER", "INDEX_CJS_ADMIN_V3");
  res.json({ ok: true, server: "index.cjs", time: now() });
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

// ================== STATIC MIDDLEWARE (serves entire public/ directory) ==================
// This must be placed AFTER redirect routes but BEFORE API routes
// All static files (HTML, CSS, JS, images, etc.) in public/ will be served automatically

const publicPath = path.join(__dirname, "public");
console.log("🔥 PUBLIC DIR:", path.join(__dirname, "public"));
console.log("[STATIC] Serving public from:", publicPath);

app.use(express.static(publicPath));
app.use((req, res, next) => {
  if (req.path.endsWith(".html")) {
    return res.sendFile(path.join(publicPath, req.path));
  }
  next();
});

// ================== REGISTER ==================
app.post("/api/register", async (req, res) => {
  const { name = "", phone = "", email = "", referralCode = "", clinicCode = "" } = req.body || {};
  
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
  
  if (!String(phone).trim()) {
    return res.status(400).json({ ok: false, error: "phone_required", message: "Telefon numarası gereklidir." });
  }
  
  // Normalize phone number for validation and storage
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized || phoneNormalized.length < 10) {
    return res.status(400).json({ 
      ok: false, 
      error: "invalid_phone", 
      message: "Geçersiz telefon numarası formatı." 
    });
  }
  
  // Check if phone number already exists (phone must be unique)
  const patientsCheck = readJson(PAT_FILE, {});
  for (const pid in patientsCheck) {
    if (patientsCheck[pid].phone) {
      const existingPhoneNormalized = normalizePhone(patientsCheck[pid].phone);
      if (existingPhoneNormalized === phoneNormalized) {
      return res.status(400).json({ 
        ok: false, 
          error: "phone_already_exists",
          message: "Bu telefon numarası ile zaten bir hesap kayıtlı." 
      });
    }
  }
  }

  // Validate clinic code if provided
  let validatedClinicCode = null;
  if (clinicCode && String(clinicCode).trim()) {
    const code = String(clinicCode).trim().toUpperCase();
    let foundClinic = null;
    
    console.log(`[REGISTER] Validating clinic code: ${code}`);
    
    // First check CLINIC_FILE (single clinic object)
    const singleClinic = readJson(CLINIC_FILE, {});
    if (singleClinic && singleClinic.clinicCode) {
      const singleClinicCode = String(singleClinic.clinicCode).toUpperCase();
      console.log(`[REGISTER] Checking CLINIC_FILE: clinicCode=${singleClinic.clinicCode}, upper=${singleClinicCode}`);
      if (singleClinicCode === code) {
        foundClinic = singleClinic;
        console.log(`[REGISTER] Found matching clinic in CLINIC_FILE`);
      }
    }
    
    // Then check CLINICS_FILE (multiple clinics object)
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
      console.log(`[REGISTER] Clinic code "${code}" not found in CLINIC_FILE or CLINICS_FILE`);
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

  const patientId = rid("p");
  const requestId = rid("req");
  const token = makeToken();

  // phoneNormalized is already defined and validated above

  // patients
  const patients = readJson(PAT_FILE, {});
  patients[patientId] = {
    patientId,
    name: String(name || ""),
    phone: phoneNormalized, // Save normalized phone
    email: emailNormalized,
    status: "PENDING",
    clinicCode: validatedClinicCode,
    createdAt: now(),
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
      const refCode = String(referralCode).trim();
      // Find inviter by referral code (check patients for matching referralCode)
      // For now, we'll use a simple approach: store referral codes in patient records
      // and match by code
      const allPatients = readJson(PAT_FILE, {});
      let inviterPatientId = null;
      let inviterPatientName = null;
      
      // Search for patient with matching referral code
      for (const pid in allPatients) {
        const p = allPatients[pid];
        // For now, we'll match by patientId if referralCode matches patientId pattern
        // Or check if patient has referralCode field
        if (p.referralCode === refCode || pid === refCode) {
          inviterPatientId = pid;
          inviterPatientName = p.name || "Unknown";
          break;
        }
      }
      
      // If no match found by referralCode field, try matching by patientId
      // (for backward compatibility, patientId can be used as referral code)
      if (!inviterPatientId && allPatients[refCode]) {
        inviterPatientId = refCode;
        inviterPatientName = allPatients[refCode].name || "Unknown";
      }
      
      // Create referral record if inviter found
      if (inviterPatientId) {
        const referrals = readJson(REF_FILE, []);
        const referralList = Array.isArray(referrals) ? referrals : Object.values(referrals);
        
        const newReferral = {
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
        };
        
        referralList.push(newReferral);
        writeJson(REF_FILE, referralList);
        console.log(`[REGISTER] Created referral: ${newReferral.id} (inviter: ${inviterPatientId}, invited: ${patientId})`);
      } else {
        console.log(`[REGISTER] Referral code not found: ${refCode}`);
      }
    } catch (err) {
      console.error("[REGISTER] Referral creation error:", err);
      // Don't fail registration if referral creation fails
    }
  }

  // Send OTP for email verification instead of returning token immediately
  try {
    // Clean up expired OTPs
    cleanupExpiredOTPs();
    
    // Generate OTP
    const otpCode = generateOTP();
    
    // Save OTP (hashed)
    await saveOTP(emailNormalized, otpCode, 0);
    
    // Send email
    if (emailTransporter) {
      try {
        await sendOTPEmail(emailNormalized, otpCode);
        console.log(`[REGISTER] OTP sent to ${emailNormalized} for patient ${patientId}`);
      } catch (emailError) {
        console.error("[REGISTER] Failed to send OTP email:", emailError);
        // Continue even if email fails - user can request OTP again
      }
    } else {
      console.warn("[REGISTER] SMTP not configured - OTP not sent");
    }
    
    // Return success without token - user must verify OTP first
    res.json({ 
      ok: true, 
      message: "Kayıt başarılı. Email adresinize gönderilen OTP kodunu girin.",
      patientId, 
      email: emailNormalized,
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
  const { name = "", phone = "", email = "", referralCode = "", clinicCode = "" } = req.body || {};
  
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
  
  if (!String(phone).trim()) {
    return res.status(400).json({ ok: false, error: "phone_required", message: "Telefon numarası gereklidir." });
  }
  
  // Normalize phone number for validation and storage
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized || phoneNormalized.length < 10) {
    return res.status(400).json({ 
      ok: false, 
      error: "invalid_phone", 
      message: "Geçersiz telefon numarası formatı." 
    });
  }
  
  // Check if phone number already exists (phone must be unique)
  const patientsCheckEmail = readJson(PAT_FILE, {});
  for (const pid in patientsCheckEmail) {
    if (patientsCheckEmail[pid].phone) {
      const existingPhoneNormalized = normalizePhone(patientsCheckEmail[pid].phone);
      if (existingPhoneNormalized === phoneNormalized) {
      return res.status(400).json({ 
        ok: false, 
          error: "phone_already_exists",
          message: "Bu telefon numarası ile zaten bir hesap kayıtlı." 
      });
    }
  }
  }

  // Validate clinic code if provided
  let validatedClinicCode = null;
  if (clinicCode && String(clinicCode).trim()) {
    const code = String(clinicCode).trim().toUpperCase();
    let foundClinic = null;
    
    console.log(`[REGISTER /api/patient/register] Validating clinic code: ${code}`);
    
    // First check CLINIC_FILE (single clinic object)
    const singleClinic = readJson(CLINIC_FILE, {});
    if (singleClinic && singleClinic.clinicCode) {
      const singleClinicCode = String(singleClinic.clinicCode).toUpperCase();
      console.log(`[REGISTER /api/patient/register] Checking CLINIC_FILE: clinicCode=${singleClinic.clinicCode}, upper=${singleClinicCode}`);
      if (singleClinicCode === code) {
        foundClinic = singleClinic;
        console.log(`[REGISTER /api/patient/register] Found matching clinic in CLINIC_FILE`);
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

  const patientId = rid("p");
  const requestId = rid("req");
  const token = makeToken();

  // phoneNormalized is already defined and validated above

  // patients
  const patients = readJson(PAT_FILE, {});
  patients[patientId] = {
    patientId,
    name: String(name || ""),
    phone: phoneNormalized, // Save normalized phone
    email: emailNormalized,
    status: "PENDING",
    clinicCode: validatedClinicCode,
    createdAt: now(),
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

  // Handle referral code if provided (same logic as /api/register)
  if (referralCode && String(referralCode).trim()) {
    try {
      const refCode = String(referralCode).trim();
      const allPatients = readJson(PAT_FILE, {});
      let inviterPatientId = null;
      let inviterPatientName = null;
      
      for (const pid in allPatients) {
        const p = allPatients[pid];
        if (p.referralCode === refCode || pid === refCode) {
          inviterPatientId = pid;
          inviterPatientName = p.name || "Unknown";
          break;
        }
      }
      
      if (!inviterPatientId && allPatients[refCode]) {
        inviterPatientId = refCode;
        inviterPatientName = allPatients[refCode].name || "Unknown";
      }
      
      if (inviterPatientId) {
        const referrals = readJson(REF_FILE, []);
        const referralList = Array.isArray(referrals) ? referrals : Object.values(referrals);
        
        const newReferral = {
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
        };
        
        referralList.push(newReferral);
        writeJson(REF_FILE, referralList);
        console.log(`[PATIENT/REGISTER] Created referral: ${newReferral.id} (inviter: ${inviterPatientId}, invited: ${patientId})`);
      }
    } catch (err) {
      console.error("[PATIENT/REGISTER] Referral creation error:", err);
    }
  }

  // Send OTP for email verification instead of returning token immediately
  try {
    // Clean up expired OTPs
    cleanupExpiredOTPs();
    
    // Generate OTP
    const otpCode = generateOTP();
    
    // Save OTP (hashed)
    await saveOTP(emailNormalized, otpCode, 0);
    
    // Send email
    if (emailTransporter) {
      try {
        await sendOTPEmail(emailNormalized, otpCode);
        console.log(`[REGISTER /api/patient/register] OTP sent to ${emailNormalized} for patient ${patientId}`);
      } catch (emailError) {
        console.error("[REGISTER /api/patient/register] Failed to send OTP email:", emailError);
        // Continue even if email fails - user can request OTP again
      }
    } else {
      console.warn("[REGISTER /api/patient/register] SMTP not configured - OTP not sent");
    }
    
    // Return success without token - user must verify OTP first
    res.json({ 
      ok: true, 
      message: "Kayıt başarılı. Email adresinize gönderilen OTP kodunu girin.",
      patientId, 
      email: emailNormalized,
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
    console.log(`[AUTH] Bad token: ${finalToken.substring(0, 20)}... (not found in tokens.json)`);
    console.log(`[AUTH] Available tokens: ${Object.keys(tokens).length} tokens`);
    console.log(`[AUTH] Token length: ${finalToken.length}, starts with: ${finalToken.substring(0, 5)}`);
    
    // Check if token might be a JWT (starts with eyJ)
    if (finalToken.startsWith("eyJ")) {
      console.log("[AUTH] Token appears to be JWT format, but requireToken only supports legacy tokens");
      console.log("[AUTH] Patient should use /api/patient/login to get a valid token");
    }
    
    return res.status(401).json({ 
      ok: false, 
      error: "bad_token",
      message: "Geçersiz token. Lütfen tekrar giriş yapın."
    });
  }

  req.patientId = t.patientId;
  req.role = t.role || "PENDING";
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

// ================== PHONE-BASED EMAIL OTP AUTHENTICATION ==================
// POST /auth/request-otp
// Request OTP: takes phone number, finds patient, sends OTP to patient's email
app.post("/auth/request-otp", async (req, res) => {
  try {
    const { phone } = req.body || {};
    
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ ok: false, error: "phone_required", message: "Telefon numarası gereklidir." });
    }
    
    // Normalize phone number for comparison
    const phoneNormalized = normalizePhone(phone);
    
    if (!phoneNormalized || phoneNormalized.length < 10) {
      return res.status(400).json({ 
        ok: false, 
        error: "invalid_phone", 
        message: "Geçersiz telefon numarası formatı." 
      });
    }
    
    // Find patient by phone number (normalize both for comparison)
    const patients = readJson(PAT_FILE, {});
    let foundPatient = null;
    let foundPatientId = null;
    let foundEmail = null;
    
    for (const pid in patients) {
      const patientPhone = patients[pid].phone;
      if (patientPhone) {
        const normalizedPatientPhone = normalizePhone(patientPhone);
        if (normalizedPatientPhone === phoneNormalized) {
          foundPatient = patients[pid];
          foundPatientId = pid;
          foundEmail = foundPatient.email;
          break;
        }
      }
    }
    
    if (!foundPatient) {
      return res.status(404).json({ 
        ok: false, 
        error: "patient_not_found", 
        message: "Bu telefon numarası ile kayıtlı hasta bulunamadı. Lütfen telefon numaranızı kontrol edin veya kayıt olun." 
      });
    }
    
    if (!foundEmail || !String(foundEmail).trim()) {
      return res.status(400).json({ 
        ok: false, 
        error: "email_not_found", 
        message: "Bu hastanın email adresi kayıtlı değil. Lütfen admin ile iletişime geçin." 
      });
    }
    
    const emailNormalized = String(foundEmail).trim().toLowerCase();
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNormalized)) {
      return res.status(400).json({ ok: false, error: "invalid_email", message: "Hastanın email adresi geçersiz." });
    }
    
    // Check rate limit (use phone for rate limiting, but email for OTP storage)
    if (!checkRateLimit(phoneNormalized)) {
      return res.status(429).json({ 
        ok: false, 
        error: "rate_limit_exceeded", 
        message: "Çok fazla OTP isteği. Lütfen daha sonra tekrar deneyin." 
      });
    }
    
    // Check if SMTP is configured
    if (!emailTransporter) {
      console.error("[OTP] SMTP not configured");
      return res.status(500).json({ 
        ok: false, 
        error: "smtp_not_configured", 
        message: "Email servisi yapılandırılmamış. Lütfen destek ile iletişime geçin." 
      });
    }
    
    // Clean up expired OTPs
    cleanupExpiredOTPs();
    
    // Generate OTP
    const otpCode = generateOTP();
    
    // Save OTP with phone as key (for lookup) but email for sending
    // We'll store phone-to-email mapping in OTP data
    const otps = readJson(OTP_FILE, {});
    const phoneKey = `phone_${phoneNormalized}`;
    const hashedOTP = await hashOTP(otpCode);
    
    otps[phoneKey] = {
      hashedOTP,
      email: emailNormalized, // Store email for sending
      phone: phoneNormalized, // Store phone for lookup
      patientId: foundPatientId,
      createdAt: now(),
      expiresAt: now() + OTP_EXPIRY_MS,
      attempts: 0,
      verified: false,
    };
    writeJson(OTP_FILE, otps);
    
    // Also save under email key for backward compatibility if needed
    await saveOTP(emailNormalized, otpCode, 0);
    
    // Send email
    try {
      await sendOTPEmail(emailNormalized, otpCode);
      console.log(`[OTP] OTP sent to ${emailNormalized} for phone ${phoneNormalized} (patient ${foundPatientId})`);
      
      res.json({
        ok: true,
        message: "OTP email adresinize gönderildi",
        // Don't return email for security, just confirm it was sent
        phone: phoneNormalized.replace(/(\d{3})(\d{3})(\d{4})/, "*** *** $3"), // Mask phone
      });
    } catch (emailError) {
      console.error("[OTP] Failed to send email:", emailError);
      return res.status(500).json({ 
        ok: false, 
        error: "email_send_failed", 
        message: "OTP email gönderilemedi. Lütfen tekrar deneyin." 
      });
    }
  } catch (error) {
    console.error("[OTP] Request OTP error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /auth/verify-otp
// Verify OTP: takes phone + OTP, generates JWT token
app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body || {};
    
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ ok: false, error: "phone_required", message: "Telefon numarası gereklidir." });
    }
    
    if (!otp || !String(otp).trim()) {
      return res.status(400).json({ ok: false, error: "otp_required", message: "OTP kodu gereklidir." });
    }
    
    // Normalize phone number for comparison
    const phoneNormalized = normalizePhone(phone);
    const otpCode = String(otp).trim();
    
    // Validate normalized phone number
    if (!phoneNormalized || phoneNormalized.length < 10) {
      return res.status(400).json({ 
        ok: false, 
        error: "invalid_phone", 
        message: "Geçersiz telefon numarası formatı. Lütfen telefon numaranızı kontrol edin." 
      });
    }
    
    console.log(`[OTP] Verify OTP request: phone=${phone}, normalized=${phoneNormalized}, otp=${otpCode}`);
    
    // OTP is stored by email, not by phone
    // First, find patient by phone to get their email
      const patients = readJson(PAT_FILE, {});
      let foundPatient = null;
      let foundEmail = null;
      
      for (const pid in patients) {
      const patientPhone = patients[pid].phone;
      if (patientPhone) {
        // Normalize both phones for comparison
        const normalizedPatientPhone = normalizePhone(patientPhone);
        if (normalizedPatientPhone === phoneNormalized) {
          foundPatient = patients[pid];
          foundEmail = foundPatient.email;
          console.log(`[OTP] Found patient ${pid} with email: ${foundEmail}`);
          break;
        }
      }
    }
    
    if (!foundPatient || !foundEmail) {
      console.log(`[OTP] Patient not found for phone: ${phone} (normalized: ${phoneNormalized})`);
      return res.status(404).json({ 
        ok: false, 
        error: "patient_not_found", 
        message: "Bu telefon numarası ile kayıtlı hasta bulunamadı. Lütfen telefon numaranızı kontrol edin veya kayıt olun." 
      });
    }
    
    // Get OTP by email (OTP is stored by email during registration)
        const emailNormalized = String(foundEmail).trim().toLowerCase();
    let otpData = getOTPsForEmail(emailNormalized);
    
    console.log(`[OTP] Looking for OTP by email: ${emailNormalized}, OTP found: ${!!otpData}`);
    
    // Legacy: Also check if OTP was stored by phone (older format)
    if (!otpData) {
      const otps = readJson(OTP_FILE, {});
      const phoneKey = `phone_${phoneNormalized}`;
      otpData = otps[phoneKey];
      console.log(`[OTP] Checked legacy phone key: ${phoneKey}, OTP found: ${!!otpData}`);
    }
    
    if (!otpData) {
      console.log(`[OTP] OTP not found for email: ${emailNormalized} or phone: ${phoneNormalized}`);
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
    if (otpData.expiresAt < now()) {
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
    const isValid = await verifyOTP(otpCode, otpData.hashedOTP);
    
    if (!isValid) {
      // Increment attempt count
      if (phoneKey && otps[phoneKey]) {
        otps[phoneKey].attempts = (otps[phoneKey].attempts || 0) + 1;
        writeJson(OTP_FILE, otps);
      } else if (otpData.email) {
        incrementOTPAttempt(otpData.email);
      }
      
      return res.status(401).json({ 
        ok: false, 
        error: "invalid_otp", 
        message: "Geçersiz OTP kodu. Lütfen tekrar deneyin." 
      });
    }
    
    // OTP is valid - we already found patient above
    const foundPatientId = Object.keys(patients).find(pid => {
      const patientPhone = patients[pid].phone;
      if (patientPhone) {
        const normalizedPatientPhone = normalizePhone(patientPhone);
        return normalizedPatientPhone === phoneNormalized;
      }
      return false;
    });
    
    if (!foundPatient || !foundPatientId) {
      return res.status(404).json({ 
        ok: false, 
        error: "patient_not_found", 
        message: "Bu telefon numarası ile kayıtlı hasta bulunamadı." 
      });
    }
    
    // Mark OTP as verified (by email - OTP is stored by email)
    if (emailNormalized) {
      markOTPVerified(emailNormalized);
    }
    
    // Generate JWT token (7-14 days expiry, using 14 days)
    const tokenExpiry = Math.floor(Date.now() / 1000) + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60);
    const token = jwt.sign(
      { 
        patientId: foundPatientId,
        email: emailNormalized || "",
        phone: phoneNormalized,
        type: "patient",
      },
      JWT_SECRET,
      { expiresIn: `${TOKEN_EXPIRY_DAYS}d` }
    );
    
    // Also save token in legacy tokens.json for backward compatibility
    const tokens = readJson(TOK_FILE, {});
    tokens[token] = {
      patientId: foundPatientId,
      role: foundPatient.status || "PENDING",
      createdAt: now(),
      email: emailNormalized || "",
      phone: phoneNormalized,
    };
    writeJson(TOK_FILE, tokens);
    
    console.log(`[OTP] OTP verified successfully for phone ${phoneNormalized} (patient ${foundPatientId}), token generated`);
    
    res.json({
      ok: true,
      token,
      patientId: foundPatientId,
      status: foundPatient.status || "PENDING",
      name: foundPatient.name || "",
      phone: phoneNormalized,
      email: emailNormalized || "",
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
app.get("/api/patient/me", requireToken, (req, res) => {
  const patients = readJson(PAT_FILE, {});
  const p = patients[req.patientId] || null;

  // Priority: patient.status > token.role > "PENDING"
  const finalStatus = p?.status || req.role || "PENDING";
  
  console.log(`[ME] patientId: ${req.patientId}, patient.status: ${p?.status}, token.role: ${req.role}, finalStatus: ${finalStatus}`);

  const clinicCode = p?.clinicCode || p?.clinic_code || "";
  let clinicPlan = p?.clinicPlan || "FREE";
  
  // Load clinic branding info (for all plans, not just PRO)
  let branding = null;
  if (clinicCode) {
    try {
      // First try CLINICS_FILE (multi-clinic system)
      const clinics = readJson(CLINICS_FILE, {});
      let clinic = null;
      
      // Find clinic by clinicCode in CLINICS_FILE
      for (const [clinicId, clinicData] of Object.entries(clinics)) {
        if (clinicData && (clinicData.clinicCode === clinicCode || clinicData.code === clinicCode)) {
          clinic = clinicData;
          break;
        }
      }
      
      // If not found in CLINICS_FILE, try CLINIC_FILE (single-clinic system)
      if (!clinic) {
        const singleClinic = readJson(CLINIC_FILE, {});
        if (singleClinic && (singleClinic.clinicCode === clinicCode || !clinicCode)) {
          clinic = singleClinic;
        }
      }
      
      if (clinic) {
        // Get clinicPlan from clinic if not set in patient
        if (!p?.clinicPlan) {
          clinicPlan = clinic.plan || clinic.subscriptionPlan || clinicPlan;
        }
        
        branding = {
          clinicName: clinic.branding?.clinicName || clinic.name || "",
          clinicLogoUrl: clinic.branding?.clinicLogoUrl || clinic.logoUrl || "",
          address: clinic.branding?.address || clinic.address || "",
          googleMapLink: clinic.branding?.googleMapLink || clinic.googleMapsUrl || "",
          primaryColor: clinic.branding?.primaryColor,
          secondaryColor: clinic.branding?.secondaryColor,
          welcomeMessage: clinic.branding?.welcomeMessage,
          showPoweredBy: clinic.branding?.showPoweredBy !== false,
          phone: clinic.phone || "",
        };
        console.log(`[ME] Branding loaded for clinicCode: ${clinicCode}, clinicPlan: ${clinicPlan}, clinicLogoUrl: ${branding.clinicLogoUrl}, clinicName: ${branding.clinicName}`);
      } else {
        console.log(`[ME] Clinic not found for clinicCode: ${clinicCode}`);
      }
    } catch (error) {
      console.error("[ME] Error loading clinic branding:", error);
    }
  }

  // Load financial snapshot from patient data
  const financialSnapshot = p?.financialSnapshot || {
    totalEstimatedCost: 0,
    totalPaid: 0,
    remainingBalance: 0,
  };

  res.json({
    ok: true,
    patientId: req.patientId,
    role: finalStatus, // Return the final status as role too
    status: finalStatus, // Return the final status
    name: p?.name || "",
    phone: p?.phone || "",
    clinicCode: clinicCode,
    clinicPlan: clinicPlan,
    branding: branding,
    financialSnapshot: financialSnapshot,
  });
});

// ================== ADMIN LIST ==================
app.get("/api/admin/registrations", (req, res) => {
  const raw = readJson(REG_FILE, {});
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ ok: true, list });
});

app.get("/api/admin/patients", requireAdminToken, (req, res) => {
  const raw = readJson(REG_FILE, {});
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  const clinicCode = String(req.clinicCode || "").trim().toUpperCase();
  const filtered = clinicCode
    ? list.filter((r) => String(r?.clinicCode || r?.clinic_code || "").trim().toUpperCase() === clinicCode)
    : list;
  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  
  // Add oral health scores to each patient
  const patientsWithScores = filtered.map(patient => {
    const patientId = patient.patientId || patient.id || "";
    if (patientId) {
      const scores = calculateOralHealthScore(patientId);
      return {
        ...patient,
        beforeScore: scores.beforeScore,
        afterScore: scores.afterScore,
        oralHealthCompleted: scores.completed
      };
    }
    return patient;
  });
  
  res.json({ ok: true, list: patientsWithScores, patients: patientsWithScores }); // Both for compatibility
});

// ================== ADMIN APPROVE ==================
app.post("/api/admin/approve", (req, res) => {
  const { requestId, patientId } = req.body || {};
  // PRIORITY: Use patientId first if available (more reliable), then requestId
  if (!requestId && !patientId) {
    return res.status(400).json({ ok: false, error: "requestId_or_patientId_required" });
  }

  console.log(`[APPROVE] ========== START APPROVE ==========`);
  console.log(`[APPROVE] Request body:`, JSON.stringify({ requestId, patientId }, null, 2));
  console.log(`[APPROVE] Will search with patientId: ${patientId}, requestId: ${requestId}`);

  const regsRaw = readJson(REG_FILE, {});
  let r = null;
  
  console.log(`[APPROVE] registrations.json type: ${Array.isArray(regsRaw) ? 'array' : typeof regsRaw}`);
  if (Array.isArray(regsRaw)) {
    console.log(`[APPROVE] registrations.json array length: ${regsRaw.length}`);
  } else if (regsRaw && typeof regsRaw === "object") {
    console.log(`[APPROVE] registrations.json object keys count: ${Object.keys(regsRaw).length}`);
    console.log(`[APPROVE] First 5 keys:`, Object.keys(regsRaw).slice(0, 5));
  }

  // PRIORITY: Search by patientId first (more reliable), then by requestId
  // First, try to find in registrations.json
  if (Array.isArray(regsRaw)) {
    console.log(`[APPROVE] registrations.json is an array with ${regsRaw.length} items`);
    
    // PRIORITY 1: Search by patientId (most reliable)
    if (patientId) {
      r = regsRaw.find((x) => x && (x.patientId === patientId || x.requestId === patientId)) || null;
      if (r) {
        console.log(`[APPROVE] ✅ Found in array by patientId:`, { requestId: r.requestId, patientId: r.patientId });
      } else {
        console.log(`[APPROVE] ❌ Not found in array by patientId: ${patientId}`);
      }
    }
    
    // PRIORITY 2: Search by requestId (if different from patientId)
    if (!r && requestId && requestId !== patientId) {
      r = regsRaw.find((x) => x && x.requestId === requestId) || null;
      if (r) {
        console.log(`[APPROVE] ✅ Found in array by requestId:`, { requestId: r.requestId, patientId: r.patientId });
      } else {
        console.log(`[APPROVE] ❌ Not found in array by requestId: ${requestId}`);
      }
    }
    
  } else if (regsRaw && typeof regsRaw === "object") {
    console.log(`[APPROVE] registrations.json is an object with ${Object.keys(regsRaw).length} keys`);
    
    // PRIORITY 1: Search by patientId in values (also check requestId field)
    if (patientId) {
      r = Object.values(regsRaw).find((x) => x && (x.patientId === patientId || x.requestId === patientId)) || null;
      if (r) {
        console.log(`[APPROVE] ✅ Found in object by patientId:`, { requestId: r.requestId, patientId: r.patientId });
      } else {
        console.log(`[APPROVE] ❌ Not found in object by patientId: ${patientId}`);
      }
    }
    
    // PRIORITY 2: Try requestId as key (if different from patientId)
    if (!r && requestId && requestId !== patientId) {
      r = regsRaw[requestId] || null;
      if (r) {
        console.log(`[APPROVE] ✅ Found in object by requestId key:`, { requestId: r.requestId, patientId: r.patientId });
      }
    }
    
    // PRIORITY 3: Search all values by requestId (if different from patientId)
    if (!r && requestId && requestId !== patientId) {
      r = Object.values(regsRaw).find((x) => x && x.requestId === requestId) || null;
      if (r) {
        console.log(`[APPROVE] ✅ Found in object by requestId value:`, { requestId: r.requestId, patientId: r.patientId });
      } else {
        console.log(`[APPROVE] ❌ Not found in object by requestId: ${requestId}`);
      }
    }
  } else {
    console.log(`[APPROVE] registrations.json is empty or invalid`);
  }

  // If not found in registrations, try patients.json
  // PRIORITY: If we have patientId, use it directly (most reliable)
  if (!r?.patientId) {
    console.log(`[APPROVE] Registration not found, checking patients.json`);
    const patients = readJson(PAT_FILE, {});
    console.log(`[APPROVE] Total patients in patients.json: ${Object.keys(patients).length}`);
    console.log(`[APPROVE] Available patient IDs (first 10):`, Object.keys(patients).slice(0, 10));
    
    let patient = null;
    
    // PRIORITY 1: If we have patientId from request, use it directly (most reliable)
    if (patientId) {
      // Try direct key lookup first
      patient = patients[patientId] || null;
      if (patient) {
        console.log(`[APPROVE] ✅ Found patient directly by patientId key: ${patientId}`);
      } else {
        // Try searching by patientId field in all patients
        console.log(`[APPROVE] Direct lookup failed, searching by patientId field...`);
        for (const pid in patients) {
          const p = patients[pid];
          if (p && (pid === patientId || p.patientId === patientId)) {
            patient = p;
            console.log(`[APPROVE] ✅ Found patient by searching: ${pid} (patientId field: ${p.patientId})`);
            break;
          }
        }
        if (!patient) {
          console.log(`[APPROVE] ❌ Patient not found by patientId: ${patientId}`);
        }
      }
    }
    
    // PRIORITY 2: Search all patients by patientId field (if patientId not found by direct lookup)
    if (!patient && patientId) {
      for (const pid in patients) {
        const p = patients[pid];
        if (p && (pid === patientId || p.patientId === patientId)) {
          patient = p;
          console.log(`[APPROVE] ✅ Found patient by searching with patientId: ${pid} (patientId: ${p.patientId})`);
          break;
        }
      }
    }
    
    // PRIORITY 3: Try requestId as search key (last resort)
    if (!patient && requestId) {
      patient = patients[requestId] || null;
      if (patient) {
        console.log(`[APPROVE] ✅ Found patient by requestId as key: ${requestId}`);
      }
    }
    
    // PRIORITY 4: Last resort - Search all registrations to find patientId from requestId (any format)
    if (!patient && requestId) {
      console.log(`[APPROVE] Last resort: Searching all registrations for requestId: ${requestId}`);
      const allRegs = readJson(REG_FILE, {});
      const regList = Array.isArray(allRegs) ? allRegs : Object.values(allRegs);
      const foundReg = regList.find((reg) => reg && reg.requestId === requestId);
      if (foundReg && foundReg.patientId) {
        patient = patients[foundReg.patientId] || null;
        if (patient) {
          console.log(`[APPROVE] ✅ Found patient via registration lookup: ${foundReg.patientId}`);
          // Use the found registration
          r = foundReg;
        } else {
          console.log(`[APPROVE] ❌ Found registration but patient not found: ${foundReg.patientId}`);
        }
      } else {
        console.log(`[APPROVE] ❌ Registration not found with requestId: ${requestId}`);
      }
    }
    
    if (patient) {
      console.log(`[APPROVE] Found patient directly in patients.json, creating registration entry`);
      // Create a registration entry for this patient
      const patientIdToUse = patient.patientId || patientId;
      const newReg = {
        requestId: requestId || `req_${patientIdToUse}`,
        patientId: patientIdToUse,
        name: patient.name || "",
        phone: patient.phone || "",
        status: "PENDING",
        clinicCode: patient.clinicCode || null,
        createdAt: patient.createdAt || now(),
        updatedAt: now(),
      };
      
      // Add to registrations
      const regs = readJson(REG_FILE, {});
      if (Array.isArray(regs)) {
        regs.push(newReg);
        writeJson(REG_FILE, regs);
      } else {
        const regsObj = regs || {};
        regsObj[newReg.requestId] = newReg;
        writeJson(REG_FILE, regsObj);
      }
      
      r = newReg;
      console.log(`[APPROVE] Created registration entry:`, newReg);
    } else {
      const availableIds = Object.keys(patients).slice(0, 10);
      console.log(`[APPROVE] Patient not found in patients.json.`);
      console.log(`[APPROVE] Searched for: requestId=${requestId}, patientId=${patientId}`);
      console.log(`[APPROVE] Available patient IDs (first 10):`, availableIds);
      const errorMessage = `Patient not found. Searched with: ${JSON.stringify({ requestId, patientId })}. Available patient IDs: ${availableIds.join(", ")}`;
      return res.status(404).json({ 
        ok: false, 
        error: "not_found", 
        message: errorMessage 
      });
    }
  }

  // patient APPROVED
  const patients = readJson(PAT_FILE, {});
  patients[r.patientId] = {
    ...(patients[r.patientId] || { patientId: r.patientId, createdAt: now() }),
    name: r.name || patients[r.patientId]?.name || "",
    phone: r.phone || patients[r.patientId]?.phone || "",
    status: "APPROVED",
    updatedAt: now(),
  };
  writeJson(PAT_FILE, patients);

  // tokens for patient -> APPROVED
  const tokens = readJson(TOK_FILE, {});
  let upgradedTokens = 0;
  for (const tk of Object.keys(tokens)) {
    if (tokens[tk]?.patientId === r.patientId) {
      tokens[tk].role = "APPROVED";
      upgradedTokens++;
      console.log(`[APPROVE] Upgraded token: ${tk.substring(0, 10)}... for patientId: ${r.patientId}`);
    }
  }
  writeJson(TOK_FILE, tokens);
  console.log(`[APPROVE] Total tokens upgraded: ${upgradedTokens} for patientId: ${r.patientId}`);

  // registrations update
  if (Array.isArray(regsRaw)) {
    regsRaw.forEach((x) => {
      if (x && x.patientId === r.patientId) {
        x.status = "APPROVED";
        x.updatedAt = now();
        x.requestId = x.requestId || requestId;
      }
    });
    writeJson(REG_FILE, regsRaw);
  } else {
    const key = r.requestId || requestId;
    regsRaw[key] = { ...r, status: "APPROVED", updatedAt: now(), requestId: key };
    writeJson(REG_FILE, regsRaw);
  }

  res.json({ ok: true, patientId: r.patientId, status: "APPROVED", upgradedTokens });
});

// ================== PATIENT TRAVEL ==================
// GET /api/patient/:patientId/travel
app.get("/api/patient/:patientId/travel", (req, res) => {
  const patientId = req.params.patientId;
  const TRAVEL_DIR = path.join(DATA_DIR, "travel");
  if (!fs.existsSync(TRAVEL_DIR)) fs.mkdirSync(TRAVEL_DIR, { recursive: true });
  
  const travelFile = path.join(TRAVEL_DIR, `${patientId}.json`);
  const defaultData = {
    schemaVersion: 1,
    updatedAt: now(),
    patientId,
    hotel: null,
    flights: [],
    notes: "",
    airportPickup: null,
    editPolicy: {
      hotel: "ADMIN",
      flights: "ADMIN",
      airportPickup: "ADMIN",
      notes: "ADMIN",
    },
  };
  
  const data = readJson(travelFile, defaultData);
  
  // Ensure formCompleted and formCompletedAt fields exist
  if (data.formCompleted === undefined) {
    // Check if form is completed (backward compatibility)
    const hasHotel = data.hotel && data.hotel.checkIn && data.hotel.checkOut;
    const hasOutboundFlight = Array.isArray(data.flights) && 
      data.flights.some(f => (f.type || "OUTBOUND") === "OUTBOUND" && f.date);
    data.formCompleted = hasHotel && hasOutboundFlight;
    if (data.formCompleted && !data.formCompletedAt) {
      data.formCompletedAt = data.updatedAt || now();
    }
  }
  
  console.log(`[GET /travel/${patientId}] airportPickup in data:`, data?.airportPickup);
  console.log(`[GET /travel/${patientId}] data keys:`, Object.keys(data));
  console.log(`[GET /travel/${patientId}] Form completed: ${data.formCompleted}, completedAt: ${data.formCompletedAt}`);
  res.json(data);
});

// POST /api/patient/:patientId/travel
app.post("/api/patient/:patientId/travel", (req, res) => {
  const patientId = req.params.patientId;
  const TRAVEL_DIR = path.join(DATA_DIR, "travel");
  if (!fs.existsSync(TRAVEL_DIR)) fs.mkdirSync(TRAVEL_DIR, { recursive: true });
  
  const travelFile = path.join(TRAVEL_DIR, `${patientId}.json`);
  const existing = readJson(travelFile, {});
  
  // Debug: airportPickup'ı kontrol et
  console.log(`[POST /travel/${patientId}] req.body type:`, typeof req.body);
  console.log(`[POST /travel/${patientId}] req.body keys:`, req.body ? Object.keys(req.body) : 'null');
  console.log(`[POST /travel/${patientId}] airportPickup in req.body:`, req.body?.airportPickup);
  console.log(`[POST /travel/${patientId}] airportPickup type:`, typeof req.body?.airportPickup);
  console.log(`[POST /travel/${patientId}] airportPickup !== undefined:`, req.body?.airportPickup !== undefined);
  console.log(`[POST /travel/${patientId}] existing airportPickup:`, existing?.airportPickup);
  
  // Eğer req.body'de hotel/flights/notes varsa kullan, yoksa mevcut verileri koru
  // airportPickup için: req.body'de varsa kullan, yoksa existing'den al, o da yoksa null
  let airportPickupValue = null;
  if (req.body?.airportPickup !== undefined) {
    airportPickupValue = req.body.airportPickup; // null, obje, veya başka bir değer olabilir
    console.log(`[POST /travel/${patientId}] Using req.body.airportPickup`);
  } else if (existing?.airportPickup !== undefined) {
    airportPickupValue = existing.airportPickup;
    console.log(`[POST /travel/${patientId}] Using existing.airportPickup`);
  } else {
    console.log(`[POST /travel/${patientId}] airportPickup will be null`);
  }
  
  console.log(`[POST /travel/${patientId}] airportPickupValue determined:`, JSON.stringify(airportPickupValue, null, 2));
  
  // Debug: Check hotel and flights in req.body
  console.log(`[POST /travel/${patientId}] req.body.hotel:`, JSON.stringify(req.body?.hotel, null, 2));
  console.log(`[POST /travel/${patientId}] req.body.flights:`, JSON.stringify(req.body?.flights, null, 2));
  console.log(`[POST /travel/${patientId}] existing.hotel:`, JSON.stringify(existing?.hotel, null, 2));
  console.log(`[POST /travel/${patientId}] existing.flights:`, JSON.stringify(existing?.flights, null, 2));
  
  const payload = {
    schemaVersion: req.body?.schemaVersion || existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    hotel: req.body?.hotel !== undefined ? req.body.hotel : (existing.hotel || null),
    flights: req.body?.flights !== undefined 
      ? (Array.isArray(req.body.flights) ? req.body.flights : [])
      : (Array.isArray(existing.flights) ? existing.flights : []),
    notes: req.body?.notes !== undefined 
      ? String(req.body.notes || "")
      : String(existing.notes || ""),
    airportPickup: airportPickupValue,
    editPolicy: req.body?.editPolicy || existing.editPolicy || {
      hotel: "ADMIN",
      flights: "ADMIN",
      airportPickup: "ADMIN",
      notes: "ADMIN",
    },
    events: req.body?.events !== undefined
      ? (Array.isArray(req.body.events) ? req.body.events : [])
      : (Array.isArray(existing.events) ? existing.events : []),
  };
  
  console.log(`[POST /travel/${patientId}] Final payload airportPickup:`, JSON.stringify(payload.airportPickup, null, 2));
  console.log(`[POST /travel/${patientId}] Full payload keys:`, Object.keys(payload));
  console.log(`[POST /travel/${patientId}] Payload has airportPickup:`, payload.hasOwnProperty('airportPickup'));
  console.log(`[POST /travel/${patientId}] Payload airportPickup type:`, typeof payload.airportPickup);
  console.log(`[POST /travel/${patientId}] Payload airportPickup value:`, payload.airportPickup);
  
  // airportPickup'ı her zaman payload'a ekle (null olsa bile)
  if (!payload.hasOwnProperty('airportPickup')) {
    console.log(`[POST /travel/${patientId}] WARNING: airportPickup missing from payload, adding null`);
    payload.airportPickup = null;
  }
  
  // Payload'ı JSON string'e çevirip kontrol et
  const payloadString = JSON.stringify(payload, null, 2);
  console.log(`[POST /travel/${patientId}] Payload JSON string contains airportPickup:`, payloadString.includes('airportPickup'));
  console.log(`[POST /travel/${patientId}] Final payload hotel:`, JSON.stringify(payload.hotel, null, 2));
  console.log(`[POST /travel/${patientId}] Final payload flights:`, JSON.stringify(payload.flights, null, 2));
  
  // Check if form is completed
  // Form is considered complete if:
  // - Hotel has checkIn and checkOut dates
  // - At least one outbound flight exists
  const hasHotel = payload.hotel && payload.hotel.checkIn && payload.hotel.checkOut;
  const hasOutboundFlight = Array.isArray(payload.flights) && 
    payload.flights.some(f => (f.type || "OUTBOUND") === "OUTBOUND" && f.date);
  const isFormCompleted = hasHotel && hasOutboundFlight;
  
  // Add form completion status
  payload.formCompleted = isFormCompleted;
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
  
  writeJson(travelFile, payload);
  console.log(`[POST /travel/${patientId}] File written, verifying...`);
  const verify = readJson(travelFile, {});
  console.log(`[POST /travel/${patientId}] Verified airportPickup in file:`, verify?.airportPickup);
  console.log(`[POST /travel/${patientId}] Verified file keys:`, Object.keys(verify));
  console.log(`[POST /travel/${patientId}] Form completed: ${isFormCompleted}, completedAt: ${payload.formCompletedAt}`);
  
  // Send push notification if airport pickup info was added/updated
  const hadAirportPickup = existing?.airportPickup && 
    (existing.airportPickup.name || existing.airportPickup.phone);
  const hasAirportPickup = payload.airportPickup && 
    (payload.airportPickup.name || payload.airportPickup.phone);
  
  // Send notification if:
  // 1. Airport pickup info was just added (didn't exist before, exists now)
  // 2. Or airport pickup info was updated (existed before, exists now, but changed)
  if (hasAirportPickup && (!hadAirportPickup || JSON.stringify(existing?.airportPickup) !== JSON.stringify(payload.airportPickup))) {
    const pickupName = payload.airportPickup.name || "Karşılayıcı";
    const pickupPhone = payload.airportPickup.phone || "";
    const notificationTitle = "🚗 Havalimanı Karşılama Bilgisi";
    const notificationMessage = `Havalimanı karşılama bilgileriniz güncellendi. ${pickupName}${pickupPhone ? ` (${pickupPhone})` : ""} sizi karşılayacak.`;
    
    // Send push notification asynchronously (don't wait for it)
    sendPushNotification(patientId, notificationTitle, notificationMessage, {
      icon: "/icon-192x192.png",
      badge: "/badge-72x72.png",
      url: "/travel",
      data: {
        type: "AIRPORT_PICKUP",
        patientId: patientId,
        from: "CLINIC"
      }
    }).catch(err => {
      console.error(`[POST /travel/${patientId}] Failed to send airport pickup notification:`, err);
    });
    
    console.log(`[POST /travel/${patientId}] Airport pickup notification sent`);
  }
  
  res.json({ ok: true, saved: true, travel: payload });
});

// ================== PATIENT HEALTH FORM ==================
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

// GET /api/patient/:patientId/health
app.get("/api/patient/:patientId/health", requireToken, (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });
  if (req.patientId !== patientId) {
    return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
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
});

// POST /api/patient/:patientId/health
app.post("/api/patient/:patientId/health", requireToken, (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });
  if (req.patientId !== patientId) {
    return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
  }

  const patient = getPatientRecordById(patientId);
  if (!patient) return res.status(404).json({ ok: false, error: "patient_not_found" });

  const HEALTH_DIR = ensureHealthDir();
  const filePath = path.join(HEALTH_DIR, `${patientId}.json`);
  const existing = readJson(filePath, {});

  const formData = req.body?.formData || {};
  const isComplete = req.body?.isComplete === true;
  const nowTs = now();
  const payload = {
    patientId,
    clinicCode: patient.clinicCode || patient.clinic_code || null,
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
});

// PUT /api/patient/:patientId/health
app.put("/api/patient/:patientId/health", requireToken, (req, res) => {
  // Same behavior as POST
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });
  if (req.patientId !== patientId) {
    return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
  }

  const patient = getPatientRecordById(patientId);
  if (!patient) return res.status(404).json({ ok: false, error: "patient_not_found" });

  const HEALTH_DIR = ensureHealthDir();
  const filePath = path.join(HEALTH_DIR, `${patientId}.json`);
  const existing = readJson(filePath, {});

  const formData = req.body?.formData || {};
  const isComplete = req.body?.isComplete === true;
  const nowTs = now();
  const payload = {
    patientId,
    clinicCode: patient.clinicCode || patient.clinic_code || null,
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
});

// GET /api/admin/patients/:patientId/health
app.get("/api/admin/patients/:patientId/health", requireAdminAuth, (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

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
app.get("/api/patient/:patientId/treatments", (req, res) => {
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
  
  const data = readJson(treatmentsFile, defaultData);
  
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
  
  // Load treatment events from travel data
  let treatmentEvents = [];
  try {
    const TRAVEL_DIR = path.join(DATA_DIR, "travel");
    if (fs.existsSync(TRAVEL_DIR)) {
      const travelFile = path.join(TRAVEL_DIR, `${patientId}.json`);
      if (fs.existsSync(travelFile)) {
        const travelData = readJson(travelFile, {});
        if (Array.isArray(travelData.events)) {
          // Filter treatment-related events (TREATMENT, CONSULT, FOLLOWUP, LAB)
          treatmentEvents = travelData.events.filter(evt => {
            const type = String(evt.type || "").toUpperCase();
            return type === "TREATMENT" || type === "CONSULT" || type === "FOLLOWUP" || type === "LAB";
          });
          console.log(`[TREATMENTS GET] Loaded ${treatmentEvents.length} treatment events from travel data`);
        }
      }
    }
  } catch (err) {
    console.error(`[TREATMENTS GET] Error loading treatment events:`, err);
  }
  
  // Add treatment events to response
  data.events = treatmentEvents;
  
  console.log(`[TREATMENTS GET] ========== END ==========`);
  
  // Return data directly (matching the format saved by POST)
  res.json(data);
});

// POST /api/patient/:patientId/treatments
app.post("/api/patient/:patientId/treatments", (req, res) => {
  const patientId = req.params.patientId;
  console.log(`[TREATMENTS POST] ========== START ==========`);
  console.log(`[TREATMENTS POST] Request for patientId: ${patientId}`);
  console.log(`[TREATMENTS POST] Request body:`, JSON.stringify(req.body, null, 2));
  
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  console.log(`[TREATMENTS POST] Treatments file path: ${treatmentsFile}`);
  
  const existing = readJson(treatmentsFile, { teeth: [] });
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
  
  writeJson(treatmentsFile, payload);
  
  // Verify the write
  const verify = readJson(treatmentsFile, {});
  const savedTeethCount = verify.teeth?.length || 0;
  const savedTotalProcedures = verify.teeth?.reduce((sum, t) => sum + (t.procedures?.length || 0), 0) || 0;
  
  console.log(`[TREATMENTS POST] Data saved. Verification:`, {
    teethCount: savedTeethCount,
    totalProcedures: savedTotalProcedures,
    formCompleted: payload.formCompleted,
    formCompletedAt: payload.formCompletedAt,
  });
  console.log(`[TREATMENTS POST] ========== END ==========`);
  
  // Update patient oral health scores after treatment plan change
  updatePatientOralHealthScores(patientId);
  
  // Return the updated data in the same format as GET endpoint
  res.json({ ok: true, saved: true, treatments: payload, teeth: payload.teeth });
});

// PUT /api/patient/:patientId/treatments/:procedureId
app.put("/api/patient/:patientId/treatments/:procedureId", (req, res) => {
  const patientId = req.params.patientId;
  const procedureId = req.params.procedureId;
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  const existing = readJson(treatmentsFile, { teeth: [] });
  
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
  
  writeJson(treatmentsFile, payload);
  
  // Update patient oral health scores after treatment plan update
  updatePatientOralHealthScores(patientId);
  
  res.json({ ok: true, updated: true, treatments: payload });
});

// DELETE /api/patient/:patientId/treatments/:procedureId
app.delete("/api/patient/:patientId/treatments/:procedureId", (req, res) => {
  const patientId = req.params.patientId;
  const procedureId = req.params.procedureId;
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  const existing = readJson(treatmentsFile, { teeth: [] });
  
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
  
  writeJson(treatmentsFile, payload);
  
  // Update patient oral health scores after procedure deletion
  updatePatientOralHealthScores(patientId);
  
  res.json({ ok: true, deleted: true, treatments: payload });
});

// ================== CHAT MESSAGES ==================
// GET /api/patient/:patientId/messages
app.get("/api/patient/:patientId/messages", (req, res) => {
  try {
    const patientId = req.params.patientId;
    const origin = req.headers.origin || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";
    
    console.log(`[GET /api/patient/:patientId/messages] Request received - patientId: ${patientId}, origin: ${origin}, userAgent: ${userAgent?.substring(0, 50)}`);
    
    if (!patientId) {
      console.warn("[GET /api/patient/:patientId/messages] patientId missing");
      return res.status(400).json({ ok: false, error: "patientId_required", message: "Patient ID is required" });
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
    const patientId = req.params.patientId;
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    
    // Body'yi güvenli şekilde oku
    const body = req.body || {};
    const text = String(body.text || "").trim();
    
    console.log("Patient message - patientId:", patientId, "text length:", text.length, "body keys:", Object.keys(body));
    
    if (!text) {
      return res.status(400).json({ ok: false, error: "text_required", received: body });
    }

    // Token'dan gelen patientId ile URL'deki patientId eşleşmeli
    if (req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patientId_mismatch" });
    }

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
    
    const payload = {
      patientId,
      messages,
      updatedAt: now(),
    };
    
    writeJson(chatFile, payload);
    res.json({ ok: true, message: newMessage });
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
    
    console.log("Admin message - patientId:", patientId, "text length:", text.length, "body keys:", Object.keys(body));
    
    if (!text) {
      return res.status(400).json({ ok: false, error: "text_required", received: body });
    }

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
    
    const payload = {
      patientId,
      messages,
      updatedAt: now(),
    };
    
    writeJson(chatFile, payload);
    
    // Send push notification to patient
    const messagePreview = text.length > 100 ? text.substring(0, 100) + "..." : text;
    sendPushNotification(patientId, "Klinikten Yeni Mesaj", messagePreview, {
      url: "/chat",
      data: { messageId: newMessage.id }
    }).catch(err => {
      console.error("[PUSH] Failed to send push notification:", err);
      // Don't fail the request if push fails
    });
    
    res.json({ ok: true, message: newMessage });
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
app.post("/api/chat/upload", requireToken, chatUpload.array("files", 5), (req, res) => {
  try {
    const body = req.body || {};
    const patientId = String(body.patientId || req.patientId || "").trim();
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    if (req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patientId_mismatch" });
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

    const CHAT_DIR = path.join(DATA_DIR, "chats");
    if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
    const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
    const existing = readJson(chatFile, { messages: [] });
    const messages = Array.isArray(existing.messages) ? existing.messages : [];

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
      messages.push(newMessage);
    }

    writeJson(chatFile, { patientId, messages, updatedAt: now() });
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
app.post("/api/admin/chat/upload", requireAdminToken, chatUpload.array("files", 5), (req, res) => {
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

    const CHAT_DIR = path.join(DATA_DIR, "chats");
    if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });
    const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
    const existing = readJson(chatFile, { messages: [] });
    const messages = Array.isArray(existing.messages) ? existing.messages : [];

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
      messages.push(newMessage);
    }

    writeJson(chatFile, { patientId, messages, updatedAt: now() });
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
  
  // If code parameter is provided, try to find clinic in CLINICS_FILE (multi-clinic mode)
  if (codeParam) {
    const clinics = readJson(CLINICS_FILE, {});
    for (const [clinicId, clinicData] of Object.entries(clinics)) {
      if (clinicData && (clinicData.clinicCode === codeParam || clinicData.code === codeParam)) {
        // Don't return password hash or sensitive data
        const { password, ...publicClinic } = clinicData;
        console.log(`[CLINIC GET] Found clinic in CLINICS_FILE: ${codeParam}, discounts: ${publicClinic.defaultInviterDiscountPercent}/${publicClinic.defaultInvitedDiscountPercent}`);
        return res.json(publicClinic);
      }
    }
    console.log(`[CLINIC GET] Clinic ${codeParam} not found in CLINICS_FILE, trying CLINIC_FILE...`);
    // If not found in CLINICS_FILE, try CLINIC_FILE as fallback
    const singleClinic = readJson(CLINIC_FILE, {});
    if (singleClinic && (singleClinic.clinicCode === codeParam || !codeParam)) {
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
    updatedAt: now(),
  };
  
  const clinic = readJson(CLINIC_FILE, defaultClinic);
  console.log(`[CLINIC GET] Returning default clinic with discounts: ${clinic.defaultInviterDiscountPercent}/${clinic.defaultInvitedDiscountPercent}`);
  res.json(clinic);
});

// GET /api/clinic/:code (Public - get clinic by code)
app.get("/api/clinic/:code", (req, res) => {
  const code = String(req.params.code || "").toUpperCase().trim();
  if (!code) {
    return res.status(400).json({ ok: false, error: "clinic_code_required" });
  }
  
  const clinic = readJson(CLINIC_FILE, {});
  
  // Check if clinic code matches
  if (clinic.clinicCode && clinic.clinicCode.toUpperCase() === code) {
    // Don't return password hash to public endpoint
    const { password, ...publicClinic } = clinic;
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
    categories: ["PROSTHETIC", "RESTORATIVE", "ENDODONTIC", "SURGICAL", "IMPLANT"],
    extractionTypes: Array.from(procedures.EXTRACTION_TYPES),
  });
});

// GET /api/admin/clinic (Admin için) - token-based (multi-clinic)
app.get("/api/admin/clinic", requireAdminToken, (req, res) => {
  try {
    let clinic = null;
    
    // Try CLINICS_FILE first if clinicId is available
    if (req.clinicId) {
      const clinics = readJson(CLINICS_FILE, {});
      clinic = clinics[req.clinicId];
    }
    
    // If not found, search by clinicCode
    if (!clinic && req.clinicCode) {
      const clinics = readJson(CLINICS_FILE, {});
      const code = String(req.clinicCode).toUpperCase();
      for (const clinicId in clinics) {
        const c = clinics[clinicId];
        if (c) {
          const clinicCodeToCheck = c.clinicCode || c.code;
          if (clinicCodeToCheck && String(clinicCodeToCheck).toUpperCase() === code) {
            clinic = c;
            req.clinicId = clinicId; // Update for consistency
            break;
          }
        }
      }
    }
    
    // Fallback to CLINIC_FILE (single clinic)
    if (!clinic && req.clinicCode) {
      const singleClinic = readJson(CLINIC_FILE, {});
      const code = String(req.clinicCode).toUpperCase();
      if (singleClinic && singleClinic.clinicCode && String(singleClinic.clinicCode).toUpperCase() === code) {
        clinic = singleClinic;
      }
    }
    
    if (!clinic) {
      console.error("[GET /api/admin/clinic] Clinic not found, clinicCode:", req.clinicCode, "clinicId:", req.clinicId);
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }
    
    const { password, ...safe } = clinic;
    res.json(safe);
  } catch (error) {
    console.error("Get admin clinic error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// PUT /api/admin/clinic (Admin günceller) - token-based (multi-clinic)
app.put("/api/admin/clinic", requireAdminToken, async (req, res) => {
  try {
    const body = req.body || {};
    const clinics = readJson(CLINICS_FILE, {});
    const existing = clinics[req.clinicId] || {};
    if (!clinics[req.clinicId]) {
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }

    // Subscription plan (single-clinic mode)
    const rawPlanInput = String(body.plan || existing.plan || existing.subscriptionPlan || "FREE").trim().toUpperCase();
    const rawPlan = rawPlanInput === "PROFESSIONAL" ? "PRO" : rawPlanInput;
    const allowedPlans = ["FREE", "BASIC", "PRO"];
    if (!allowedPlans.includes(rawPlan)) {
      return res.status(400).json({ ok: false, error: `invalid_plan:${rawPlan}` });
    }

    const computedMaxPatients = rawPlan === "FREE" ? 3 : (rawPlan === "BASIC" ? 10 : null);
    
    const inviterPercent = body.defaultInviterDiscountPercent != null 
      ? Number(body.defaultInviterDiscountPercent) 
      : (existing.defaultInviterDiscountPercent != null ? existing.defaultInviterDiscountPercent : null);
    const invitedPercent = body.defaultInvitedDiscountPercent != null 
      ? Number(body.defaultInvitedDiscountPercent) 
      : (existing.defaultInvitedDiscountPercent != null ? existing.defaultInvitedDiscountPercent : null);
    
    // Validasyon
    if (inviterPercent != null && (Number.isNaN(inviterPercent) || inviterPercent < 0 || inviterPercent > 99)) {
      return res.status(400).json({ ok: false, error: "defaultInviterDiscountPercent must be 0-99" });
    }
    if (invitedPercent != null && (Number.isNaN(invitedPercent) || invitedPercent < 0 || invitedPercent > 99)) {
      return res.status(400).json({ ok: false, error: "defaultInvitedDiscountPercent must be 0-99" });
    }
    
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
      googleReviews: Array.isArray(body.googleReviews) ? body.googleReviews : (existing.googleReviews || []),
      trustpilotReviews: Array.isArray(body.trustpilotReviews) ? body.trustpilotReviews : (existing.trustpilotReviews || []),
      password: passwordHash, // Keep existing or update
      updatedAt: now(),
    };

    clinics[req.clinicId] = updated;
    writeJson(CLINICS_FILE, clinics);
    const { password, ...safe } = updated;
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
// GET /api/admin/referrals?status=PENDING|APPROVED|REJECTED
app.get("/api/admin/referrals", requireAdminAuth, (req, res) => {
  try {
    const status = req.query.status;
    const clinicCode = req.clinicCode; // Get clinic code from auth middleware
    const clinicId = req.clinicId;
    
    if (!clinicCode && !clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_not_authenticated", message: "Klinik kimlik doğrulaması yapılmadı." });
    }
    
    console.log(`[REFERRALS] Fetching referrals for clinic: code=${clinicCode}, id=${clinicId}`);
    
    // Get all referrals
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    
    // Get all patients to filter by clinic
    const patients = readJson(PAT_FILE, {});
    
    // Get list of patient IDs that belong to this clinic
    const clinicPatientIds = new Set();
    for (const pid in patients) {
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
    
    // Filter referrals: only show referrals where inviter OR invited patient belongs to this clinic
    let items = list.filter((x) => {
      if (!x) return false;
      const inviterId = x.inviterPatientId || x.inviter_patient_id;
      const invitedId = x.invitedPatientId || x.invited_patient_id;
      
      // Check if either inviter or invited patient belongs to this clinic
      const inviterBelongsToClinic = inviterId && clinicPatientIds.has(inviterId);
      const invitedBelongsToClinic = invitedId && clinicPatientIds.has(invitedId);
      
      // Also check by clinicCode in referral if exists
      const referralClinicCode = (x.clinicCode || x.clinic_code || "").toUpperCase();
      const clinicCodeMatches = referralClinicCode && referralClinicCode === clinicCode?.toUpperCase();
      
      return inviterBelongsToClinic || invitedBelongsToClinic || clinicCodeMatches;
    });
    
    // Apply status filter if provided
    if (status && (status === "PENDING" || status === "APPROVED" || status === "REJECTED")) {
      items = items.filter((x) => x && x.status === status);
    }
    
    console.log(`[REFERRALS] Returning ${items.length} referrals for clinic ${clinicCode}`);
    
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ items });
  } catch (error) {
    console.error("Referrals list error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/patient/:patientId/referrals
// Get referrals where this patient is the inviter OR the invited patient
app.get("/api/patient/:patientId/referrals", (req, res) => {
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
    
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    console.log(`[GET /api/patient/:patientId/referrals] Total referrals in DB: ${list.length}`);
    
    // Filter: referrals where this patient is the inviter OR the invited patient
    // Normalize patientId for comparison (trim whitespace)
    const normalizedPatientId = String(patientId || "").trim();
    console.log(`[GET /api/patient/:patientId/referrals] Searching for patientId: "${normalizedPatientId}"`);
    
    // Log all referral patient IDs for debugging
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
    
    // Optional status filter
    if (status && (status === "PENDING" || status === "APPROVED" || status === "REJECTED")) {
      const beforeFilter = items.length;
      items = items.filter((x) => x.status === status);
      console.log(`[GET /api/patient/:patientId/referrals] After status filter (${status}): ${items.length} (was ${beforeFilter})`);
    }
    
    // Sort by created date (newest first)
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    console.log(`[GET /api/patient/:patientId/referrals] Returning ${items.length} referrals for patient ${patientId}`);
    res.json({ ok: true, items });
  } catch (error) {
    console.error("[GET /api/patient/:patientId/referrals] Error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// PATCH /api/admin/referrals/:id/approve
app.patch("/api/admin/referrals/:id/approve", requireAdminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    
    const inviterDiscountPercent = body.inviterDiscountPercent != null ? Number(body.inviterDiscountPercent) : null;
    const invitedDiscountPercent = body.invitedDiscountPercent != null ? Number(body.invitedDiscountPercent) : null;
    const discountPercent = body.discountPercent != null ? Number(body.discountPercent) : null;
    
    // Validasyon
    if (inviterDiscountPercent != null && (Number.isNaN(inviterDiscountPercent) || inviterDiscountPercent < 0 || inviterDiscountPercent > 99)) {
      return res.status(400).json({ error: "inviterDiscountPercent must be 0..99" });
    }
    if (invitedDiscountPercent != null && (Number.isNaN(invitedDiscountPercent) || invitedDiscountPercent < 0 || invitedDiscountPercent > 99)) {
      return res.status(400).json({ error: "invitedDiscountPercent must be 0..99" });
    }
    if (discountPercent != null && (Number.isNaN(discountPercent) || discountPercent < 0 || discountPercent > 99)) {
      return res.status(400).json({ error: "discountPercent must be 0..99" });
    }
    
    // En az bir indirim yüzdesi belirtilmeli
    if (inviterDiscountPercent == null && invitedDiscountPercent == null && discountPercent == null) {
      return res.status(400).json({ error: "At least one discount percent must be provided" });
    }
    
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    const idx = list.findIndex((x) => x && x.id === id);
    
    if (idx < 0) {
      return res.status(404).json({ error: "not found" });
    }
    
    if (list[idx].status !== "PENDING") {
      return res.status(409).json({ error: "only PENDING can be approved" });
    }
    
    // Güncelleme
    const updated = {
      ...list[idx],
      status: "APPROVED",
      approvedAt: now(),
    };
    
    // Yeni format varsa onu kullan
    if (inviterDiscountPercent != null || invitedDiscountPercent != null) {
      updated.inviterDiscountPercent = inviterDiscountPercent;
      updated.invitedDiscountPercent = invitedDiscountPercent;
      if (discountPercent != null) {
        updated.discountPercent = discountPercent;
      } else if (inviterDiscountPercent != null && invitedDiscountPercent != null) {
        updated.discountPercent = Math.round((inviterDiscountPercent + invitedDiscountPercent) / 2);
      } else {
        updated.discountPercent = inviterDiscountPercent ?? invitedDiscountPercent;
      }
    } else if (discountPercent != null) {
      updated.discountPercent = discountPercent;
      updated.inviterDiscountPercent = discountPercent;
      updated.invitedDiscountPercent = discountPercent;
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
app.patch("/api/admin/referrals/:id/reject", requireAdminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    const idx = list.findIndex((x) => x && x.id === id);
    
    if (idx < 0) {
      return res.status(404).json({ error: "not found" });
    }
    
    if (list[idx].status !== "PENDING") {
      return res.status(409).json({ error: "only PENDING can be rejected" });
    }
    
    list[idx] = {
      ...list[idx],
      status: "REJECTED",
      discountPercent: null,
      inviterDiscountPercent: null,
      invitedDiscountPercent: null,
      approvedAt: null,
    };
    
    writeJson(REF_FILE, list);
    res.json({ ok: true, item: list[idx] });
  } catch (error) {
    console.error("Referral reject error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
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
app.post("/api/referrals/payment-event", (req, res) => {
  try {
    const {
      inviteePatientId,
      inviteePaymentId,
      inviteePaidAmount,
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
    
    // Only process PAID/CAPTURED payments
    if (paymentStatus !== "PAID" && paymentStatus !== "CAPTURED") {
      return res.status(400).json({ ok: false, error: "payment_not_completed" });
    }
    
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
    const inviterRate = (clinic.defaultInviterDiscountPercent || 0) / 100; // Convert % to decimal
    const inviteeRate = (clinic.defaultInvitedDiscountPercent || 0) / 100; // Convert % to decimal
    
    // Calculate earned discount (from invitee's paid amount)
    const earnedDiscountAmount = roundToCurrency(paidAmount * inviterRate);
    
    // Create referral event
    const newEvent = {
      id: rid("refevt"),
      inviterPatientId: referral.inviterPatientId,
      inviteePatientId,
      inviteePaymentId,
      inviteePaidAmount: paidAmount,
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
    
    res.json({ ok: true, event: newEvent });
  } catch (error) {
    console.error("Referral event creation error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/referrals/payment-refund
// Called when invitee payment is refunded/chargeback
app.post("/api/referrals/payment-refund", (req, res) => {
  try {
    const { inviteePaymentId } = req.body || {};
    
    if (!inviteePaymentId) {
      return res.status(400).json({ ok: false, error: "payment_id_required" });
    }
    
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
    
    res.json({ ok: true, event });
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
    const patients = readJson(PAT_FILE, {});
    
    if (!patients[patientId]) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }
    
    const credit = patients[patientId].referralCredit || 0;
    
    res.json({ ok: true, credit, currency: "USD" });
  } catch (error) {
    console.error("Get referral credit error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/admin/referral-events
// Get all referral events (admin view)
app.get("/api/admin/referral-events", requireAdminAuth, (req, res) => {
  try {
    const events = readJson(REF_EVENT_FILE, []);
    const eventList = Array.isArray(events) ? events : Object.values(events);
    
    // Sort by created date (newest first)
    eventList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    res.json({ ok: true, items: eventList });
  } catch (error) {
    console.error("Get referral events error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/admin/events
// Get all events from all patients (travel events + treatment events)
// Filters: upcoming (next 14 days, excluding today), overdue (past but not completed)
app.get("/api/admin/events", requireAdminToken, (req, res) => {
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
                
                allEvents.push({
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
              
              allEvents.push({
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
              
              allEvents.push({
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
                
                allEvents.push({
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
                    
                    allEvents.push({
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
                    
                    allEvents.push({
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
      const eventTs = evt.timestamp || 0;
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
function requireAdminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify clinic exists and is not suspended
    // Payment = Verification - all clinics are ACTIVE by default after registration
    const clinics = readJson(CLINICS_FILE, {});
    const clinic = clinics[decoded.clinicId];
    if (!clinic) {
      return res.status(401).json({ ok: false, error: "clinic_not_found" });
    }
    // Only reject if clinic is suspended (fraud/abuse cases)
    if (clinic.status === "SUSPENDED") {
      return res.status(403).json({ ok: false, error: "clinic_suspended", message: "Clinic account has been suspended" });
    }
    
    req.clinicId = decoded.clinicId;
    req.clinicCode = clinic.clinicCode;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
    return res.status(500).json({ ok: false, error: "auth_error" });
  }
}

// POST /api/admin/register
// Clinic registration (email/password)
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
    const clinicCodeTrimmed = String(clinicCode).trim();
    if (clinicCodeTrimmed.length < 3) {
      return res.status(400).json({ ok: false, error: "clinic_code_too_short", message: "Clinic code must be at least 3 characters." });
    }
    
    // Allow only alphanumeric characters (letters and numbers), case insensitive
    if (!/^[A-Za-z0-9]+$/.test(clinicCodeTrimmed)) {
      return res.status(400).json({ ok: false, error: "clinic_code_invalid", message: "Clinic code can only contain letters and numbers." });
    }
    
    const clinics = readJson(CLINICS_FILE, {});
    const emailLower = String(email).trim().toLowerCase();
    
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
      if (existingCode && String(existingCode).trim().toUpperCase() === String(clinicCode).trim().toUpperCase()) {
        return res.status(400).json({ ok: false, error: "clinic_code_exists" });
      }
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(String(password), 10);
    
    // Create clinic
    const clinicId = rid("clinic");
    const clinic = {
      clinicId,
      email: emailLower,
      password: hashedPassword,
      name: String(name).trim(),
      phone: String(phone || "").trim(),
      address: String(address || "").trim(),
      clinicCode: String(clinicCode).trim().toUpperCase(),
      plan: "FREE",
      max_patients: 3,
      status: "ACTIVE", // ACTIVE by default - payment = verification
      subscriptionStatus: "TRIAL", // TRIAL, ACTIVE, EXPIRED, CANCELLED
      subscriptionPlan: null, // BASIC, PROFESSIONAL, ENTERPRISE
      verificationStatus: "verified", // verified = payment completed
      trialEndsAt: now() + (14 * 24 * 60 * 60 * 1000), // 14 days trial
      createdAt: now(),
      updatedAt: now(),
    };
    
    clinics[clinicId] = clinic;
    writeJson(CLINICS_FILE, clinics);
    
    // Generate JWT token
    const token = jwt.sign({ clinicId, clinicCode: clinic.clinicCode }, JWT_SECRET, {
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
  } catch (error) {
    console.error("Admin register error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/admin/login
// Clinic login (clinic code + password)
// Supports both CLINIC_FILE (single clinic) and CLINICS_FILE (multiple clinics)
app.post("/api/admin/login", async (req, res) => {
  try {
    const { clinicCode, password } = req.body || {};
    
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }
    
    if (!password || !String(password).trim()) {
      return res.status(400).json({ ok: false, error: "password_required" });
    }
    
    const code = String(clinicCode).trim().toUpperCase();
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
    
    // If clinic not found
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
        // Update in CLINICS_FILE
        const clinics = readJson(CLINICS_FILE, {});
        if (clinics[foundClinicId]) {
          clinics[foundClinicId].password = hashedPassword;
          writeJson(CLINICS_FILE, clinics);
        }
      } else {
        // Update in CLINIC_FILE
        writeJson(CLINIC_FILE, foundClinic);
      }
    } else {
      // Verify password hash
      const passwordMatch = await bcrypt.compare(String(password).trim(), foundClinic.password);
      if (!passwordMatch) {
        return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
      }
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        clinicCode: code, 
        clinicId: foundClinicId || foundClinic.clinicId || null,
        type: "admin" 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({
      ok: true,
      token,
      clinicCode: code,
      clinicId: foundClinicId || foundClinic.clinicId || null,
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
      { role: "super-admin" },
      SUPER_ADMIN_JWT_SECRET,
      { expiresIn: "12h" }
    );

    console.log("[SUPER_ADMIN] Login successful");

    res.json({ 
      ok: true, 
      token,
      message: "Login successful"
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
      message: "Super admin authenticated"
    });
  } catch (error) {
    console.error("[SUPER_ADMIN] Me endpoint error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// GET /api/super-admin/clinics
// Get all clinics with basic statistics (protected)
app.get("/api/super-admin/clinics", superAdminGuard, (req, res) => {
  try {
    const clinics = readJson(CLINICS_FILE, {});
    const singleClinic = readJson(CLINIC_FILE, {});
    const patients = readJson(PAT_FILE, {});
    const referrals = readJson(REF_FILE, {});
    
    // Convert clinics object to array
    let clinicsList = [];
    
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
          activeReferralCount: clinicReferrals.filter(r => (r.status || "").toUpperCase() === "APPROVED" || (r.status || "").toUpperCase() === "ACTIVE").length
        }
      });
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
app.patch("/api/super-admin/clinics/:clinicId/suspend", superAdminGuard, (req, res) => {
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
    
    // Update status to SUSPENDED
    const oldStatus = clinic.status || "ACTIVE";
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
    
    console.log(`[SUPER_ADMIN] Clinic ${clinicId} suspended (status: ${oldStatus} -> SUSPENDED), reason: ${reason || "none"}`);
    
    const { password, ...clinicWithoutPassword } = clinic;
    res.json({ 
      ok: true, 
      clinic: clinicWithoutPassword,
      message: "Clinic suspended successfully"
    });
  } catch (error) {
    console.error("[SUPER_ADMIN] Suspend clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// PATCH /api/super-admin/clinics/:clinicId/activate
// Activate a clinic (change status from SUSPENDED to ACTIVE)
app.patch("/api/super-admin/clinics/:clinicId/activate", superAdminGuard, (req, res) => {
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
    const oldStatus = clinic.status || "SUSPENDED";
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
    
    console.log(`[SUPER_ADMIN] Clinic ${clinicId} activated (status: ${oldStatus} -> ACTIVE)`);
    
    const { password, ...clinicWithoutPassword } = clinic;
    res.json({ 
      ok: true, 
      clinic: clinicWithoutPassword,
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
      
      // Travel statistics
      if (patient.travel) {
        patientsWithTravel++;
        const travel = patient.travel;
        
        // Check flight info
        if (travel.flights && Array.isArray(travel.flights)) {
          travel.flights.forEach(flight => {
            const filledBy = (flight.filledBy || travel.filledBy || "").toLowerCase();
            if (filledBy === "patient" || filledBy === "user") {
              travelFilledByPatient++;
            } else if (filledBy === "clinic" || filledBy === "admin") {
              travelFilledByClinic++;
            }
          });
        }
        
        // Check hotel info
        if (travel.hotel) {
          const filledBy = (travel.hotel.filledBy || travel.filledBy || "").toLowerCase();
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
app.post("/api/admin/payment-success", requireAdminAuth, (req, res) => {
  try {
    const { plan, amount, currency, paymentId, paymentMethod } = req.body || {};
    const clinicId = req.clinicId;
    const clinicCode = req.clinicCode;
    
    if (!plan) {
      return res.status(400).json({ ok: false, error: "plan_required", message: "Plan is required" });
    }
    
    const clinics = readJson(CLINICS_FILE, {});
    const singleClinic = readJson(CLINIC_FILE, {});
    
    let clinic = null;
    let isSingleClinic = false;
    
    // Find clinic
    if (clinics[clinicId]) {
      clinic = clinics[clinicId];
    } else if (singleClinic && singleClinic.clinicCode === clinicCode) {
      clinic = singleClinic;
      isSingleClinic = true;
    } else {
      return res.status(404).json({ ok: false, error: "clinic_not_found", message: "Clinic not found" });
    }
    
    // Payment = Verification - automatically activate
    const oldPlan = clinic.plan || "FREE";
    const oldStatus = clinic.status || "ACTIVE";
    
    // Update clinic: payment = verification
    clinic.plan = plan.toUpperCase(); // PRO, BASIC, PREMIUM, etc.
    clinic.status = "ACTIVE"; // Ensure ACTIVE
    clinic.verificationStatus = "verified"; // Payment = verification
    clinic.subscriptionStatus = "ACTIVE";
    clinic.subscriptionPlan = plan.toUpperCase();
    clinic.paymentCompletedAt = Date.now();
    clinic.lastPaymentId = paymentId || null;
    clinic.lastPaymentAmount = amount || null;
    clinic.lastPaymentCurrency = currency || "USD";
    clinic.lastPaymentMethod = paymentMethod || null;
    clinic.updatedAt = Date.now();
    
    // Set plan limits based on plan
    if (plan.toUpperCase() === "PRO" || plan.toUpperCase() === "PREMIUM") {
      clinic.max_patients = 999999; // Unlimited for paid plans
    } else if (plan.toUpperCase() === "BASIC") {
      clinic.max_patients = 50; // Basic plan limit
    } else {
      clinic.max_patients = 3; // FREE plan limit
    }
    
    // Save clinic
    if (isSingleClinic) {
      writeJson(CLINIC_FILE, clinic);
    } else {
      clinics[clinicId] = clinic;
      writeJson(CLINICS_FILE, clinics);
    }
    
    console.log(`[PAYMENT] Clinic ${clinicId} (${clinicCode}) payment successful: ${oldPlan} -> ${plan}, status: ${oldStatus} -> ACTIVE, verificationStatus: verified`);
    
    const { password, ...clinicWithoutPassword } = clinic;
    res.json({
      ok: true,
      clinic: clinicWithoutPassword,
      message: "Payment successful. Plan activated and all features unlocked.",
      plan: clinic.plan,
      status: clinic.status,
      verificationStatus: clinic.verificationStatus
    });
  } catch (error) {
    console.error("[PAYMENT] Payment success error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// ================== TREATMENT PRICING & PAYMENTS ==================

// GET /api/admin/treatment-prices
// Get clinic treatment price list (requires auth)
app.get("/api/admin/treatment-prices", requireAdminAuth, (req, res) => {
  try {
    const clinicCode = req.clinicCode;
    const prices = readJson(TREATMENT_PRICES_FILE, {});
    const clinicPrices = prices[clinicCode] || [];
    
    res.json({ 
      ok: true, 
      prices: clinicPrices,
      clinicCode 
    });
  } catch (error) {
    console.error("[TREATMENT_PRICES] Get error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// POST /api/admin/treatment-prices
// Create or update treatment price (requires auth)
app.post("/api/admin/treatment-prices", requireAdminAuth, (req, res) => {
  try {
    const clinicCode = req.clinicCode;
    const { id, treatment_name, default_price, currency, is_active } = req.body || {};
    
    if (!treatment_name || !default_price || !currency) {
      return res.status(400).json({ ok: false, error: "missing_fields", message: "treatment_name, default_price, and currency are required" });
    }
    
    const prices = readJson(TREATMENT_PRICES_FILE, {});
    if (!prices[clinicCode]) {
      prices[clinicCode] = [];
    }
    
    const priceId = id || `price_${now()}_${crypto.randomBytes(4).toString("hex")}`;
    const existingIndex = prices[clinicCode].findIndex(p => p.id === priceId);
    
    const priceItem = {
      id: priceId,
      treatment_name: String(treatment_name).trim(),
      default_price: Number(default_price),
      currency: String(currency).trim().toUpperCase(),
      is_active: is_active !== false, // Default to true
      updatedAt: now(),
      createdAt: existingIndex >= 0 ? prices[clinicCode][existingIndex].createdAt : now(),
    };
    
    if (existingIndex >= 0) {
      prices[clinicCode][existingIndex] = priceItem;
    } else {
      prices[clinicCode].push(priceItem);
    }
    
    writeJson(TREATMENT_PRICES_FILE, prices);
    
    console.log(`[TREATMENT_PRICES] ${existingIndex >= 0 ? 'Updated' : 'Created'} price for clinic ${clinicCode}: ${treatment_name}`);
    
    res.json({ 
      ok: true, 
      price: priceItem,
      message: existingIndex >= 0 ? "Price updated" : "Price created"
    });
  } catch (error) {
    console.error("[TREATMENT_PRICES] Create/Update error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error?.message || "Internal server error" });
  }
});

// DELETE /api/admin/treatment-prices/:id
// Delete treatment price (requires auth)
app.delete("/api/admin/treatment-prices/:id", requireAdminAuth, (req, res) => {
  try {
    const clinicCode = req.clinicCode;
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ ok: false, error: "id_required", message: "Price ID is required" });
    }
    
    const prices = readJson(TREATMENT_PRICES_FILE, {});
    if (!prices[clinicCode]) {
      return res.status(404).json({ ok: false, error: "no_prices", message: "No prices found for this clinic" });
    }
    
    const index = prices[clinicCode].findIndex(p => p.id === id);
    if (index < 0) {
      return res.status(404).json({ ok: false, error: "price_not_found", message: "Price not found" });
    }
    
    prices[clinicCode].splice(index, 1);
    writeJson(TREATMENT_PRICES_FILE, prices);
    
    console.log(`[TREATMENT_PRICES] Deleted price ${id} for clinic ${clinicCode}`);
    
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


// ================== START ==================
// Render uyumlu: app.listen(process.env.PORT || 3000)
app.listen(process.env.PORT || 3000, () => {
  const port = process.env.PORT || 3000;
  console.log(`✅ Server running on port ${port}`);
  console.log(`✅ Health (JSON):  http://127.0.0.1:${port}/health`);
  console.log(`✅ Health (HTML):  http://127.0.0.1:${port}/health.html`);
  console.log(`✅ Admin:          http://127.0.0.1:${port}/admin.html`);
  console.log(`✅ Travel:         http://127.0.0.1:${port}/admin-travel.html`);
});
