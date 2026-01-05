const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? Number(process.env.PORT) : 5050;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "cliniflow-secret-key-change-in-production";
const JWT_EXPIRES_IN = "30d"; // 30 days

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public"))); // /admin.html

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

// ================== HEALTH ==================
app.get("/health", (req, res) => {
  res.setHeader("X-CLINIFLOW-SERVER", "INDEX_CJS_ADMIN_V3");
  res.json({ ok: true, server: "index.cjs", time: now() });
});

// ================== REGISTER ==================
app.post("/api/register", (req, res) => {
  const { name = "", phone = "", referralCode = "", clinicCode = "" } = req.body || {};
  if (!String(phone).trim()) {
    return res.status(400).json({ ok: false, error: "phone_required" });
  }

  // Validate clinic code if provided
  let validatedClinicCode = null;
  if (clinicCode && String(clinicCode).trim()) {
    const code = String(clinicCode).trim().toUpperCase();
    const clinic = readJson(CLINIC_FILE, {});
    if (clinic.clinicCode && clinic.clinicCode.toUpperCase() === code) {
      validatedClinicCode = code;
    } else {
      return res.status(400).json({ ok: false, error: "invalid_clinic_code", code });
    }
  }

  const patientId = rid("p");
  const requestId = rid("req");
  const token = makeToken();

  // patients
  const patients = readJson(PAT_FILE, {});
  patients[patientId] = {
    patientId,
    name: String(name || ""),
    phone: String(phone || ""),
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
    phone: String(phone || ""),
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

  res.json({ ok: true, token, patientId, requestId, role: "PENDING", status: "PENDING" });
});

// ================== PATIENT REGISTER (alias) ==================
app.post("/api/patient/register", (req, res) => {
  const { name = "", phone = "", referralCode = "", clinicCode = "" } = req.body || {};
  if (!String(phone).trim()) {
    return res.status(400).json({ ok: false, error: "phone_required" });
  }

  // Validate clinic code if provided
  let validatedClinicCode = null;
  if (clinicCode && String(clinicCode).trim()) {
    const code = String(clinicCode).trim().toUpperCase();
    const clinic = readJson(CLINIC_FILE, {});
    if (clinic.clinicCode && clinic.clinicCode.toUpperCase() === code) {
      validatedClinicCode = code;
    } else {
      return res.status(400).json({ ok: false, error: "invalid_clinic_code", code });
    }
  }

  const patientId = rid("p");
  const requestId = rid("req");
  const token = makeToken();

  // patients
  const patients = readJson(PAT_FILE, {});
  patients[patientId] = {
    patientId,
    name: String(name || ""),
    phone: String(phone || ""),
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
    phone: String(phone || ""),
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

  res.json({ ok: true, token, patientId, requestId, role: "PENDING", status: "PENDING" });
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
    return res.status(401).json({ ok: false, error: "missing_token" });
  }

  const tokens = readJson(TOK_FILE, {});
  const t = tokens[finalToken];
  if (!t?.patientId) {
    console.log(`[AUTH] Bad token: ${finalToken.substring(0, 10)}... (not found in tokens.json)`);
    console.log(`[AUTH] Available tokens: ${Object.keys(tokens).length} tokens`);
    return res.status(401).json({ ok: false, error: "bad_token" });
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

// ================== PATIENT ME (alias) ==================
app.get("/api/patient/me", requireToken, (req, res) => {
  const patients = readJson(PAT_FILE, {});
  const p = patients[req.patientId] || null;

  // Priority: patient.status > token.role > "PENDING"
  const finalStatus = p?.status || req.role || "PENDING";
  
  console.log(`[ME] patientId: ${req.patientId}, patient.status: ${p?.status}, token.role: ${req.role}, finalStatus: ${finalStatus}`);

  res.json({
    ok: true,
    patientId: req.patientId,
    role: finalStatus, // Return the final status as role too
    status: finalStatus, // Return the final status
    name: p?.name || "",
    phone: p?.phone || "",
  });
});

// ================== ADMIN LIST ==================
app.get("/api/admin/registrations", (req, res) => {
  const raw = readJson(REG_FILE, {});
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ ok: true, list });
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
      notes: "ADMIN",
    },
  };
  
  const data = readJson(travelFile, defaultData);
  console.log(`[GET /travel/${patientId}] airportPickup in data:`, data?.airportPickup);
  console.log(`[GET /travel/${patientId}] data keys:`, Object.keys(data));
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
  
  writeJson(travelFile, payload);
  console.log(`[POST /travel/${patientId}] File written, verifying...`);
  const verify = readJson(travelFile, {});
  console.log(`[POST /travel/${patientId}] Verified airportPickup in file:`, verify?.airportPickup);
  console.log(`[POST /travel/${patientId}] Verified file keys:`, Object.keys(verify));
  
  res.json({ ok: true, saved: true, travel: payload });
});

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
  };
  
  const data = readJson(treatmentsFile, defaultData);
  const teethCount = data.teeth?.length || 0;
  const totalProcedures = data.teeth?.reduce((sum, t) => sum + (t.procedures?.length || 0), 0) || 0;
  
  console.log(`[TREATMENTS GET] Response data:`, {
    patientId: data.patientId,
    teethCount,
    totalProcedures,
  });
  console.log(`[TREATMENTS GET] ========== END ==========`);
  
  res.json(data);
});

// POST /api/patient/:patientId/treatments
app.post("/api/patient/:patientId/treatments", (req, res) => {
  const patientId = req.params.patientId;
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  const existing = readJson(treatmentsFile, { teeth: [] });
  
  // Frontend'den gelen format: { toothId, procedure: { type, status, scheduledAt } }
  const { toothId, procedure } = req.body || {};
  
  if (!toothId || !procedure) {
    return res.status(400).json({ ok: false, error: "toothId and procedure required" });
  }
  
  // Mevcut teeth array'ini al
  let teeth = Array.isArray(existing.teeth) ? existing.teeth : [];
  
  // Bu toothId için mevcut tooth'u bul veya yeni oluştur
  let tooth = teeth.find((t) => String(t.toothId) === String(toothId));
  
  if (!tooth) {
    tooth = { toothId: String(toothId), procedures: [] };
    teeth.push(tooth);
  }
  
  // Yeni procedure'ü ekle
  const newProcedure = {
    id: `${patientId}-${toothId}-${now()}`,
    type: String(procedure.type || ""),
    status: String(procedure.status || "PLANNED"),
    scheduledAt: procedure.scheduledAt ? Number(procedure.scheduledAt) : now(),
    createdAt: now(),
  };
  
  if (!Array.isArray(tooth.procedures)) {
    tooth.procedures = [];
  }
  tooth.procedures.push(newProcedure);
  
  // Güncellenmiş data
  const payload = {
    schemaVersion: existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    teeth,
  };
  
  writeJson(treatmentsFile, payload);
  res.json({ ok: true, saved: true, treatments: payload });
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
          proc.type = String(req.body?.type || proc.type);
          proc.status = String(req.body?.status || proc.status);
          proc.scheduledAt = req.body?.scheduledAt ? Number(req.body.scheduledAt) : proc.scheduledAt;
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
  
  const payload = {
    schemaVersion: existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    teeth,
  };
  
  writeJson(treatmentsFile, payload);
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
  
  // Procedure'ü bul ve sil
  for (const tooth of teeth) {
    if (Array.isArray(tooth.procedures)) {
      const originalLength = tooth.procedures.length;
      tooth.procedures = tooth.procedures.filter((proc) => String(proc.id) !== String(procedureId));
      if (tooth.procedures.length < originalLength) {
        found = true;
        break;
      }
    }
  }
  
  if (!found) {
    return res.status(404).json({ ok: false, error: "Procedure not found" });
  }
  
  const payload = {
    schemaVersion: existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    teeth,
  };
  
  writeJson(treatmentsFile, payload);
  res.json({ ok: true, deleted: true, treatments: payload });
});

// ================== CHAT MESSAGES ==================
// GET /api/patient/:patientId/messages
app.get("/api/patient/:patientId/messages", (req, res) => {
  try {
    const patientId = req.params.patientId;
    console.log("GET /api/patient/:patientId/messages - patientId:", patientId);
    
    if (!patientId) {
      console.warn("GET messages: patientId missing");
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    const CHAT_DIR = path.join(DATA_DIR, "chats");
    if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });

    const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
    const existing = readJson(chatFile, { messages: [] });
    
    const messages = Array.isArray(existing.messages) ? existing.messages : [];
    console.log("GET messages: Returning", messages.length, "messages for patient", patientId);
    res.json({ ok: true, messages });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
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
    res.json({ ok: true, message: newMessage });
  } catch (error) {
    console.error("Admin message send error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== CLINIC INFO ==================
// GET /api/clinic (Public - mobile app için)
app.get("/api/clinic", (req, res) => {
  const defaultClinic = {
    clinicCode: "MOON",
    name: "Cliniflow Dental Clinic",
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

// GET /api/admin/clinic (Admin için)
app.get("/api/admin/clinic", (req, res) => {
  const defaultClinic = {
    clinicCode: "MOON",
    name: "Cliniflow Dental Clinic",
    address: "Antalya, Türkiye",
    phone: "",
    email: "",
    website: "",
    logoUrl: "",
    googleMapsUrl: "",
    googleReviews: [],
    trustpilotReviews: [],
    updatedAt: now(),
  };
  
  const clinic = readJson(CLINIC_FILE, defaultClinic);
  res.json(clinic);
});

// PUT /api/admin/clinic (Admin günceller)
app.put("/api/admin/clinic", async (req, res) => {
  try {
    const body = req.body || {};
    const existing = readJson(CLINIC_FILE, {});
    
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
    
    const updated = {
      clinicCode: String(body.clinicCode || existing.clinicCode || "MOON"),
      name: String(body.name || existing.name || "Cliniflow Dental Clinic"),
      address: String(body.address || existing.address || "Antalya, Türkiye"),
      phone: String(body.phone || existing.phone || ""),
      email: String(body.email || existing.email || ""),
      website: String(body.website || existing.website || ""),
      logoUrl: String(body.logoUrl || existing.logoUrl || ""),
      googleMapsUrl: String(body.googleMapsUrl || existing.googleMapsUrl || ""),
      defaultInviterDiscountPercent: inviterPercent,
      defaultInvitedDiscountPercent: invitedPercent,
      googleReviews: Array.isArray(body.googleReviews) ? body.googleReviews : (existing.googleReviews || []),
      trustpilotReviews: Array.isArray(body.trustpilotReviews) ? body.trustpilotReviews : (existing.trustpilotReviews || []),
      password: passwordHash, // Keep existing or update
      updatedAt: now(),
    };
    
    writeJson(CLINIC_FILE, updated);
    res.json({ ok: true, clinic: updated });
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
app.get("/api/admin/referrals", (req, res) => {
  try {
    const status = req.query.status;
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    
    let items = list;
    if (status && (status === "PENDING" || status === "APPROVED" || status === "REJECTED")) {
      items = list.filter((x) => x && x.status === status);
    }
    
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ items });
  } catch (error) {
    console.error("Referrals list error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/patient/:patientId/referrals
// Get referrals where this patient is the inviter (only their own referrals)
app.get("/api/patient/:patientId/referrals", (req, res) => {
  try {
    const { patientId } = req.params;
    const status = req.query.status;
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    
    // Filter: only referrals where this patient is the inviter
    let items = list.filter((x) => x && x.inviterPatientId === patientId);
    
    // Optional status filter
    if (status && (status === "PENDING" || status === "APPROVED" || status === "REJECTED")) {
      items = items.filter((x) => x.status === status);
    }
    
    // Sort by created date (newest first)
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    res.json({ ok: true, items });
  } catch (error) {
    console.error("Get patient referrals error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// PATCH /api/admin/referrals/:id/approve
app.patch("/api/admin/referrals/:id/approve", (req, res) => {
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
app.patch("/api/admin/referrals/:id/reject", (req, res) => {
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
app.get("/api/admin/referral-events", (req, res) => {
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
    
    // Verify clinic exists and is active
    const clinics = readJson(CLINICS_FILE, {});
    const clinic = clinics[decoded.clinicId];
    if (!clinic || clinic.status !== "ACTIVE") {
      return res.status(401).json({ ok: false, error: "clinic_not_active" });
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
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }
    
    const clinics = readJson(CLINICS_FILE, {});
    const emailLower = String(email).trim().toLowerCase();
    
    // Check if email already exists
    for (const id in clinics) {
      if (clinics[id].email.toLowerCase() === emailLower) {
        return res.status(400).json({ ok: false, error: "email_exists" });
      }
    }
    
    // Check if clinicCode already exists
    for (const id in clinics) {
      if (clinics[id].clinicCode.toUpperCase() === String(clinicCode).trim().toUpperCase()) {
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
      status: "PENDING", // PENDING, ACTIVE, SUSPENDED
      subscriptionStatus: "TRIAL", // TRIAL, ACTIVE, EXPIRED, CANCELLED
      subscriptionPlan: null, // BASIC, PROFESSIONAL, ENTERPRISE
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
    const clinic = readJson(CLINIC_FILE, {});
    
    // Check if clinic code matches
    if (!clinic.clinicCode || clinic.clinicCode.toUpperCase() !== code) {
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
    }
    
    // Check password
    if (!clinic.password) {
      // If no password is set, allow login with default password "admin123" (for initial setup)
      const defaultPassword = "admin123";
      if (password !== defaultPassword) {
        return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
      }
      // Set default password hash for first login
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      clinic.password = hashedPassword;
      writeJson(CLINIC_FILE, clinic);
    } else {
      // Verify password hash
      const passwordMatch = await bcrypt.compare(String(password).trim(), clinic.password);
      if (!passwordMatch) {
        return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
      }
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { clinicCode: code, type: "admin" },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({
      ok: true,
      token,
      clinicCode: code,
      clinicName: clinic.name || "Clinic",
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

// ================== START ==================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running: http://127.0.0.1:${PORT}`);
  console.log(`✅ Health:        http://127.0.0.1:${PORT}/health`);
  console.log(`✅ Admin:         http://127.0.0.1:${PORT}/admin.html`);
});
