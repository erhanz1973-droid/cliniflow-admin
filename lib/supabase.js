// Supabase Client Configuration
// This module provides Supabase client for database and storage operations

const { createClient } = require('@supabase/supabase-js');
const {
  resolveClinicCoords,
  hasFiniteCoords,
  normalizeClinicCoordinateFields,
  pickMapUrlFromClinic,
  buildGeocodeQuery,
} = require('./clinicCoords.cjs');

/** Project URL only — no /rest/v1 path. */
function normalizeSupabaseUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  let u = raw.trim().replace(/\/+$/, "");
  u = u.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  return u;
}

/**
 * When env is missing, return a non-null object so `supabase.from` never throws.
 * Queries reject with a clear error instead of "Cannot read properties of null".
 */
function createUnconfiguredSupabaseStub() {
  const rejectQuery = () => {
    console.error("SUPABASE IS NULL ❌");
    return Promise.reject(
      new Error("Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    );
  };
  const queryBuilder = () => {
    const chain = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (onFulfilled, onRejected) => rejectQuery().then(onFulfilled, onRejected);
          }
          if (prop === "catch") {
            return (onRejected) => rejectQuery().catch(onRejected);
          }
          if (prop === "finally") {
            return (onFinally) => rejectQuery().finally(onFinally);
          }
          return () => chain;
        },
      }
    );
    return chain;
  };
  return {
    from: () => queryBuilder(),
    rpc: () => queryBuilder(),
    channel: () => queryBuilder(),
    storage: {
      from: () => ({
        upload: () => rejectQuery(),
        download: () => rejectQuery(),
        list: () => rejectQuery(),
        remove: () => rejectQuery(),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };
}

console.log("SUPABASE URL:", process.env.SUPABASE_URL);
console.log("USING SERVICE ROLE:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseConfigured = !!(supabaseUrl && supabaseServiceKey);
const SUPABASE_DEBUG = String(process.env.SUPABASE_DEBUG || "").trim() === "1";
const CLINIC_BY_CODE_CACHE_TTL_MS = Number.parseInt(String(process.env.CLINIC_BY_CODE_CACHE_TTL_MS || "10000"), 10) || 10000;
const clinicByCodeCache = new Map();

if (!supabaseConfigured) {
  console.error('[SUPABASE] ❌ CRITICAL: Supabase credentials not configured!');
  console.error('[SUPABASE] Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  console.error("SUPABASE IS NULL ❌");
}

// Backend: service role bypasses RLS (never expose this key to the mobile app).
const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : createUnconfiguredSupabaseStub();

// Log initialization status (NO async operations here - fast startup)
if (supabaseConfigured) {
  console.log('[SUPABASE] ✅ Client created (service_role)');
} else {
  console.log('[SUPABASE] ⚠️  Using stub client — credentials missing');
}

// Post-boot connection test (called AFTER server starts)
async function testSupabaseConnection() {
  if (!supabaseConfigured) {
    console.log('[SUPABASE] Skipping connection test - client not initialized');
    return false;
  }
  
  try {
    console.log('[SUPABASE] Testing database connection...');
    
    // Test 1: Count clinics
    const { count, error: countError } = await supabase
      .from('clinics')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('[SUPABASE] ❌ Connection test failed:', countError.message);
      if (countError.message.includes('does not exist')) {
        console.error('[SUPABASE] ⚠️  Table "clinics" does not exist! Run migrations.');
      }
      return false;
    }
    
    console.log('[SUPABASE] ✅ Database connected. Clinics count:', count || 0);
    return true;
  } catch (e) {
    console.error('[SUPABASE] ❌ Connection test error:', e.message);
    return false;
  }
}

// ================== CLINIC OPERATIONS ==================

async function getClinicByCode(clinicCode) {
  if (SUPABASE_DEBUG) {
    console.log('[SUPABASE] getClinicByCode called with:', clinicCode);
    console.log('[SUPABASE] SUPABASE_URL:', process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 30) + '...' : 'NOT SET');
    console.log('[SUPABASE] supabase client:', supabaseConfigured ? 'CONFIGURED' : 'STUB');
  }
  
  if (!supabaseConfigured) {
    if (SUPABASE_DEBUG) {
      console.log('[SUPABASE] ❌ Client is null, returning null');
    }
    return null;
  }
  
  const searchCode = String(clinicCode || '').trim().toUpperCase();
  if (!searchCode) return null;

  const nowTs = Date.now();
  const cached = clinicByCodeCache.get(searchCode);
  if (cached && cached.expiresAt > nowTs) {
    return cached.value;
  }

  if (SUPABASE_DEBUG) {
    console.log('[SUPABASE] Searching for clinic_code:', searchCode);
  }
  
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('clinic_code', searchCode)
    .single();
  
  if (SUPABASE_DEBUG) {
    console.log('[SUPABASE] Query result - data:', data ? JSON.stringify(data).substring(0, 100) : 'NULL');
    console.log('[SUPABASE] Query result - error:', error ? JSON.stringify(error) : 'NULL');
  }
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('[SUPABASE] getClinicByCode error:', error.message);
  }
  
  if (!data) {
    if (SUPABASE_DEBUG) {
      console.log('[SUPABASE] ❌ Clinic NOT found for code:', searchCode);
      const { data: allClinics, error: listError } = await supabase
        .from('clinics')
        .select('clinic_code, email, created_at')
        .limit(10);
      console.log('[SUPABASE] All clinics:', allClinics ? JSON.stringify(allClinics).substring(0, 200) : 'NULL');
      console.log('[SUPABASE] List error:', listError ? JSON.stringify(listError) : 'NULL');
    }

    clinicByCodeCache.set(searchCode, { value: null, expiresAt: nowTs + CLINIC_BY_CODE_CACHE_TTL_MS });
    
    return null;
  }
  
  clinicByCodeCache.set(searchCode, { value: data, expiresAt: nowTs + CLINIC_BY_CODE_CACHE_TTL_MS });
  if (SUPABASE_DEBUG) {
    console.log('[SUPABASE] ✅ Clinic found:', data);
  }
  return data;
}

async function getClinicById(clinicId) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('id', clinicId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('[SUPABASE] getClinicById error:', error.message);
  }
  return data;
}

async function getClinicByEmail(email) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('[SUPABASE] getClinicByEmail error:', error.message);
  }
  return data;
}

async function createClinic(clinicData) {
  if (!supabaseConfigured) {
    console.error('[SUPABASE] createClinic called but supabase client is null!');
    return null;
  }

  let row = normalizeClinicCoordinateFields({ ...clinicData });

  if (!hasFiniteCoords(row)) {
    const mapUrl = pickMapUrlFromClinic(row);
    const geoQuery = buildGeocodeQuery(row);
    try {
      const coords = await resolveClinicCoords(mapUrl, geoQuery);
      if (coords) {
        row.latitude = coords.latitude;
        row.longitude = coords.longitude;
      }
    } catch (e) {
      console.warn('[SUPABASE] createClinic coordinate resolution failed:', e?.message || e);
    }
  }

  const strictCoords = String(process.env.REQUIRE_CLINIC_COORDINATES || '').trim() === '1';
  if (!hasFiniteCoords(row)) {
    if (strictCoords) {
      const err = new Error('CLINIC_COORDINATES_REQUIRED: Set latitude/longitude, map_link/google_maps_url, or a geocodable address (GOOGLE_GEOCODING_API_KEY).');
      err.code = 'CLINIC_COORDINATES_REQUIRED';
      throw err;
    }
    console.warn('[SUPABASE] createClinic: clinic created without coordinates — nearby search will skip until backfilled. Set REQUIRE_CLINIC_COORDINATES=1 to enforce.');
  }

  console.log('[SUPABASE] createClinic inserting:', JSON.stringify({
    clinic_code: row.clinic_code,
    email: row.email,
    name: row.name,
    hasCoords: hasFiniteCoords(row),
  }));

  const { data, error } = await supabase
    .from('clinics')
    .insert(row)
    .select()
    .single();
  
  console.log('[SUPABASE] createClinic result:', { data: data ? { id: data.id, clinic_code: data.clinic_code } : null, error: error?.message || null });
  
  if (error) {
    console.error('[SUPABASE] createClinic FULL error:', JSON.stringify(error));
    throw error;
  }
  
  console.log('[SUPABASE] ✅ Clinic created successfully:', data.id, data.clinic_code);
  return data;
}

async function updateClinic(clinicId, updates) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('clinics')
    .update(updates)
    .eq('id', clinicId)
    .select()
    .single();
  
  if (error) {
    console.error('[SUPABASE] updateClinic error:', error.message);
    throw error;
  }
  return data;
}

async function getAllClinics() {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[SUPABASE] getAllClinics error:', error.message);
    return [];
  }
  return data || [];
}

// ================== PATIENT OPERATIONS ==================

function isNotFoundError(error) {
  return String(error?.code || "") === "PGRST116";
}

function isMissingColumnError(error, columnName) {
  const msg = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  const combined = `${msg} ${details} ${hint}`.toLowerCase();
  return combined.includes("does not exist") && combined.includes(String(columnName || "").toLowerCase());
}

async function getPatientById(patientId) {
  if (!supabaseConfigured) return null;
  // Some environments use `patients.patient_id` (p_xxx), others use `patients.id` (p_xxx or UUID).
  // Try `patient_id` first, then fallback to `id`.
  const attempts = [
    { column: "patient_id", label: "patient_id" },
    { column: "id", label: "id" },
  ];

  for (const a of attempts) {
    const { data, error } = await supabase
      .from("patients")
      .select("*, clinics(id, name, clinic_code)")
      .eq(a.column, patientId)
      .single();

    if (!error) return data;
    if (isNotFoundError(error)) continue;
    if (a.column === "patient_id" && isMissingColumnError(error, "patient_id")) continue;

    console.error("[SUPABASE] getPatientById error:", error.message);
    return null;
  }

  return null;
}

async function getPatientByPhone(phone) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('patients')
    .select('*, clinics(id, name, clinic_code)')
    .eq('phone', phone)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('[SUPABASE] getPatientByPhone error:', error.message);
  }
  return data;
}

async function getPatientByEmail(email) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('patients')
    .select('*, clinics(id, name, clinic_code)')
    .eq('email', email.toLowerCase())
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('[SUPABASE] getPatientByEmail error:', error.message);
  }
  return data;
}

async function getPatientsByClinic(clinicId) {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('patients')
    .select(`
      id,
      patient_id,
      name,
      phone,
      status,
      created_at,
      primary_doctor_id
    `)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[SUPABASE] getPatientsByClinic error:', error.message);
    return [];
  }
  return data || [];
}

async function createPatient(patientData) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('patients')
    .insert(patientData)
    .select()
    .single();
  
  if (error) {
    console.error('[SUPABASE] createPatient error:', error.message);
    throw error;
  }
  return data;
}

async function updatePatient(patientId, updates) {
  if (!supabaseConfigured) return null;
  // Prefer `patient_id` when available, fallback to `id`.
  const attempts = [
    { column: "patient_id", label: "patient_id" },
    { column: "id", label: "id" },
  ];

  let lastError = null;
  for (const a of attempts) {
    const { data, error } = await supabase
      .from("patients")
      .update(updates)
      .eq(a.column, patientId)
      .select()
      .single();

    if (!error) return data;
    lastError = error;
    if (isNotFoundError(error)) continue;
    if (a.column === "patient_id" && isMissingColumnError(error, "patient_id")) continue;

    console.error("[SUPABASE] updatePatient error:", error.message);
    throw error;
  }

  console.error("[SUPABASE] updatePatient error:", lastError?.message || "unknown");
  throw lastError || new Error("updatePatient_failed");
}

// ================== CHAT MESSAGES ==================
async function getChatMessagesByPatient(clinicId, patientId) {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SUPABASE] getChatMessagesByPatient error:', error.message);
    return [];
  }
  return data || [];
}

async function createChatMessage(messageData) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('chat_messages')
    .insert(messageData)
    .select()
    .single();

  if (error) {
    console.error('[SUPABASE] createChatMessage error:', error.message);
    throw error;
  }
  return data;
}

async function countPatientsByClinic(clinicId) {
  if (!supabaseConfigured) return 0;
  const { count, error } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId);
  
  if (error) {
    console.error('[SUPABASE] countPatientsByClinic error:', error.message);
    return 0;
  }
  return count || 0;
}

/**
 * Paginated version of getPatientsByClinic.
 * Returns { data, total } where data is a page of patients.
 */
async function getPatientsByClinicPaginated(clinicId, { page = 1, limit = 20 } = {}) {
  if (!supabaseConfigured) return { data: [], total: 0 };
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  const { data, error, count } = await supabase
    .from('patients')
    .select(
      `id, patient_id, name, phone, status, created_at, primary_doctor_id`,
      { count: 'exact' }
    )
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('[SUPABASE] getPatientsByClinicPaginated error:', error.message);
    return { data: [], total: 0 };
  }
  return { data: data || [], total: count || 0 };
}

// ================== OTP OPERATIONS ==================

async function createOTP(email, otpHash, expiresAt) {
  if (!supabaseConfigured) return null;
  
  // Delete any existing OTPs for this email first
  await supabase.from('otps').delete().eq('email', email.toLowerCase());
  
  const { data, error } = await supabase
    .from('otps')
    .insert({
      email: email.toLowerCase(),
      otp_hash: otpHash,
      expires_at: new Date(expiresAt).toISOString(),
      attempts: 0,
      used: false
    })
    .select()
    .single();
  
  if (error) {
    console.error('[SUPABASE] createOTP error:', error.message);
    throw error;
  }
  return data;
}

async function getOTPByEmail(email) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('otps')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();  // Use maybeSingle() instead of single()
  
  if (error && error.code !== 'PGRST116') {
    console.error('[SUPABASE] getOTPByEmail error:', error.message);
  }
  return data;
}

async function incrementOTPAttempts(otpId) {
  if (!supabaseConfigured) return;
  const { error } = await supabase
    .from('otps')
    .update({ attempts: supabase.rpc('increment_attempts', { row_id: otpId }) })
    .eq('id', otpId);
  
  // Fallback: just increment by fetching and updating
  if (error) {
    const { data: otp } = await supabase.from('otps').select('attempts').eq('id', otpId).single();
    if (otp) {
      await supabase.from('otps').update({ attempts: (otp.attempts || 0) + 1 }).eq('id', otpId);
    }
  }
}

async function markOTPUsed(otpId) {
  if (!supabaseConfigured) return;
  const { error } = await supabase
    .from('otps')
    .update({ used: true })
    .eq('id', otpId);
  
  if (error) {
    console.error('[SUPABASE] markOTPUsed error:', error.message);
  }
}

async function deleteOTP(email) {
  if (!supabaseConfigured) return;
  const { error } = await supabase
    .from('otps')
    .delete()
    .eq('email', email.toLowerCase());
  
  if (error) {
    console.error('[SUPABASE] deleteOTP error:', error.message);
  }
}

async function cleanupExpiredOTPs() {
  if (!supabaseConfigured) return;
  const { error } = await supabase
    .from('otps')
    .delete()
    .lt('expires_at', new Date().toISOString());
  
  if (error) {
    console.error('[SUPABASE] cleanupExpiredOTPs error:', error.message);
  }
}

// ================== ADMIN TOKEN OPERATIONS ==================

async function createAdminToken(token, clinicId, expiresAt) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('admin_tokens')
    .insert({
      token,
      clinic_id: clinicId,
      expires_at: new Date(expiresAt).toISOString()
    })
    .select()
    .single();
  
  if (error) {
    console.error('[SUPABASE] createAdminToken error:', error.message);
    throw error;
  }
  return data;
}

// ==================== ADMIN AUTHENTICATION ====================

async function getAdminByEmailAndClinicCode(email, clinicCode) {
  if (!supabaseConfigured) {
    console.log('[SUPABASE] ❌ Supabase client is null');
    return null;
  }

  const emailNormalized = String(email).trim().toLowerCase();
  const codeUpperCase = String(clinicCode).trim().toUpperCase();
  
  console.log('[SUPABASE] getAdminByEmailAndClinicCode called:', { email: emailNormalized, clinicCode: codeUpperCase });
  
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('email', emailNormalized)
    .eq('clinic_code', codeUpperCase)
    .maybeSingle();

  if (error) {
    console.error('[SUPABASE] Admin lookup error:', error.message, error.code);
    return null;
  }

  console.log('[SUPABASE] Admin found:', { id: data?.id, email: data?.email, clinicCode: data?.clinic_code });
  return data || null;
}

async function getAdminToken(token) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('admin_tokens')
    .select('*, clinics(*)')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('[SUPABASE] getAdminToken error:', error.message);
  }
  return data;
}

async function deleteAdminToken(token) {
  if (!supabaseConfigured) return;
  const { error } = await supabase
    .from('admin_tokens')
    .delete()
    .eq('token', token);
  
  if (error) {
    console.error('[SUPABASE] deleteAdminToken error:', error.message);
  }
}

// ================== REFERRAL OPERATIONS ==================

async function createReferral(referralData) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('referrals')
    .insert(referralData)
    .select()
    .single();
  
  if (error) {
    console.error('[SUPABASE] createReferral error:', error.message);
    throw error;
  }
  return data;
}

/** Attach inviterPatientName / invitedPatientName without fragile PostgREST embed FK names. */
async function enrichReferralRowsWithPatientNames(rows) {
  if (!supabaseConfigured || !Array.isArray(rows) || rows.length === 0) return rows;
  const idSet = new Set();
  for (const r of rows) {
    const a = r.inviter_patient_id || r.referrer_patient_id;
    const b = r.invited_patient_id || r.referred_patient_id;
    if (a) idSet.add(String(a));
    if (b) idSet.add(String(b));
  }
  const ids = Array.from(idSet).filter(Boolean);
  if (ids.length === 0) return rows;

  const nameByKey = new Map();
  const isUuid = (s) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));
  const uuidIds = ids.filter(isUuid);
  const textIds = ids.filter((x) => !isUuid(x));

  const ingestPatients = (pts) => {
    (pts || []).forEach((p) => {
      if (!p?.name) return;
      if (p.id) nameByKey.set(String(p.id), p.name);
      if (p.patient_id) nameByKey.set(String(p.patient_id), p.name);
    });
  };

  for (let i = 0; i < uuidIds.length; i += 80) {
    const chunk = uuidIds.slice(i, i + 80);
    const { data: pts } = await supabase.from("patients").select("id, patient_id, name").in("id", chunk);
    ingestPatients(pts);
  }
  for (let i = 0; i < textIds.length; i += 80) {
    const chunk = textIds.slice(i, i + 80);
    const { data: pts } = await supabase.from("patients").select("id, patient_id, name").in("patient_id", chunk);
    ingestPatients(pts);
  }

  return rows.map((r) => {
    const inv = r.inviter_patient_id || r.referrer_patient_id;
    const invd = r.invited_patient_id || r.referred_patient_id;
    return {
      ...r,
      inviterPatientName:
        r.inviterPatientName ||
        r.inviter_patient_name ||
        (inv ? nameByKey.get(String(inv)) : null) ||
        null,
      invitedPatientName:
        r.invitedPatientName ||
        r.invited_patient_name ||
        (invd ? nameByKey.get(String(invd)) : null) ||
        null,
    };
  });
}

async function getReferralsByClinic(clinicId, clinicCode) {
  if (!supabaseConfigured) return [];
  const attempts = [];
  if (clinicId) {
    attempts.push({ column: "clinic_id", value: clinicId, label: "clinic_id" });
  }
  if (clinicCode) {
    attempts.push({ column: "clinic_code", value: String(clinicCode).toUpperCase(), label: "clinic_code" });
  }

  let lastError = null;
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from("referrals")
      .select("*")
      .eq(attempt.column, attempt.value)
      .order("created_at", { ascending: false });

    if (error) {
      lastError = error;
      if (isMissingColumnError(error, attempt.column)) {
        continue;
      }
      console.error(`[SUPABASE] getReferralsByClinic error (${attempt.label}):`, error.message);
      continue;
    }

    if (Array.isArray(data) && data.length > 0) {
      return await enrichReferralRowsWithPatientNames(data);
    }
  }

  // Rows without clinic_id / clinic_code: find via patients of this clinic (same as routes/admin/referrals.js)
  if (clinicId) {
    try {
      const { data: clinicPatients, error: cpErr } = await supabase
        .from("patients")
        .select("id, patient_id")
        .eq("clinic_id", clinicId);

      if (!cpErr && Array.isArray(clinicPatients) && clinicPatients.length > 0) {
        const patientUUIDs = clinicPatients.map((p) => p.id).filter(Boolean);
        const patientTextIds = clinicPatients.map((p) => p.patient_id).filter(Boolean);
        const idSets = [...new Set([...patientUUIDs, ...patientTextIds])];

        const allRows = [];
        for (let i = 0; i < idSets.length; i += 50) {
          const chunk = idSets.slice(i, i + 50);
          const { data: r1 } = await supabase.from("referrals").select("*").in("inviter_patient_id", chunk);
          const { data: r2 } = await supabase.from("referrals").select("*").in("invited_patient_id", chunk);
          if (r1) allRows.push(...r1);
          if (r2) allRows.push(...r2);
        }

        const seen = new Set();
        const unique = allRows.filter((r) => {
          const key = r.referral_id || r.id;
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (unique.length > 0) {
          unique.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          return await enrichReferralRowsWithPatientNames(unique);
        }
      }
    } catch (e) {
      console.warn("[SUPABASE] getReferralsByClinic patient fallback:", e?.message);
    }
  }

  if (lastError) {
    console.warn("[SUPABASE] getReferralsByClinic: no rows; last error:", lastError.message);
  }
  return [];
}

// ================== PUSH SUBSCRIPTION OPERATIONS ==================

async function savePushSubscription(patientId, endpoint, keys) {
  if (!supabaseConfigured) return null;
  
  // Upsert: update if exists, insert if not
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert({
      patient_id: patientId,
      endpoint,
      keys
    }, {
      onConflict: 'patient_id,endpoint'
    })
    .select()
    .single();
  
  if (error) {
    console.error('[SUPABASE] savePushSubscription error:', error.message);
    throw error;
  }
  return data;
}

async function getPushSubscriptionsByPatient(patientId) {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('patient_id', patientId);
  
  if (error) {
    console.error('[SUPABASE] getPushSubscriptionsByPatient error:', error.message);
    return [];
  }
  return data || [];
}

// ================== EXPORTS ==================
// Node: `const { supabase } = require("./lib/supabase");` — single module for this server.

module.exports = { 
  supabase,
  isSupabaseEnabled: () => supabaseConfigured,
  testSupabaseConnection, // Post-boot test function
  
  // Cache invalidation helpers
  clearClinicCache: (clinicCode) => {
    if (clinicCode) {
      clinicByCodeCache.delete(String(clinicCode).trim().toUpperCase());
    } else {
      clinicByCodeCache.clear();
    }
  },

  // Clinics
  getClinicByCode,
  getClinicById,
  getClinicByEmail,
  createClinic,
  updateClinic,
  getAllClinics,
  
  // Patients
  getPatientById,
  getPatientByPhone,
  getPatientByEmail,
  getPatientsByClinic,
  getPatientsByClinicPaginated,
  createPatient,
  updatePatient,
  countPatientsByClinic,
  
  // Chat Messages
  getChatMessagesByPatient,
  createChatMessage,
  
  // OTPs
  createOTP,
  getOTPByEmail,
  incrementOTPAttempts,
  markOTPUsed,
  deleteOTP,
  cleanupExpiredOTPs,
  
  // Admin Tokens
  createAdminToken,
  getAdminToken,
  deleteAdminToken,
  
  // Admin Authentication
  getAdminByEmailAndClinicCode,
  
  // Referrals
  createReferral,
  getReferralsByClinic,
  
  // Doctor Operations
  createDoctor,
  
  // Push Subscriptions
  savePushSubscription,
  getPushSubscriptionsByPatient
};

// ================== DOCTOR OPERATIONS ==================

async function createDoctor(doctorData) {
  if (!supabaseConfigured) throw new Error("supabase_not_initialized");

  const { data, error } = await supabase
    .from("doctors")
    .insert(doctorData)
    .select()
    .single();

  if (error) {
    console.error("[SUPABASE] createDoctor FULL error:", error);
    throw error;
  }

  return data;
}
