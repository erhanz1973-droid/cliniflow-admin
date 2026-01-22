// Supabase Client Configuration
// This module provides Supabase client for database and storage operations

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[SUPABASE] ❌ CRITICAL: Supabase credentials not configured!');
  console.error('[SUPABASE] Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Log initialization status (NO async operations here - fast startup)
if (supabase) {
  console.log('[SUPABASE] ✅ Client created (service_role)');
} else {
  console.log('[SUPABASE] ⚠️  Client not created - credentials missing');
}

// Post-boot connection test (called AFTER server starts)
async function testSupabaseConnection() {
  if (!supabase) {
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
  console.log('[SUPABASE] getClinicByCode called with:', clinicCode);
  console.log('[SUPABASE] SUPABASE_URL:', process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 30) + '...' : 'NOT SET');
  console.log('[SUPABASE] supabase client:', supabase ? 'EXISTS' : 'NULL');
  
  if (!supabase) {
    console.log('[SUPABASE] ❌ Client is null, returning null');
    return null;
  }
  
  const searchCode = clinicCode.toUpperCase();
  console.log('[SUPABASE] Searching for clinic_code:', searchCode);
  
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('clinic_code', searchCode)
    .single();
  
  console.log('[SUPABASE] Query result - data:', data ? JSON.stringify(data).substring(0, 100) : 'NULL');
  console.log('[SUPABASE] Query result - error:', error ? JSON.stringify(error) : 'NULL');
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('[SUPABASE] getClinicByCode error:', error.message);
  }
  
  if (!data) {
    console.log('[SUPABASE] ❌ Clinic NOT found for code:', searchCode);
    // Debug: List all clinics
    const { data: allClinics, error: listError } = await supabase
      .from('clinics')
      .select('clinic_code, name')
      .limit(10);
    console.log('[SUPABASE] Available clinics:', allClinics ? JSON.stringify(allClinics) : 'ERROR: ' + listError?.message);
  } else {
    console.log('[SUPABASE] ✅ Clinic found:', data.clinic_code, data.name);
  }
  
  return data;
}

async function getClinicById(clinicId) {
  if (!supabase) return null;
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
  if (!supabase) return null;
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
  if (!supabase) {
    console.error('[SUPABASE] createClinic called but supabase client is null!');
    return null;
  }
  
  console.log('[SUPABASE] createClinic inserting:', JSON.stringify({
    clinic_code: clinicData.clinic_code,
    email: clinicData.email,
    name: clinicData.name,
  }));
  
  const { data, error } = await supabase
    .from('clinics')
    .insert(clinicData)
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
  if (!supabase) return null;
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
  if (!supabase) return [];
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

async function getPatientById(patientId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('patients')
    .select('*, clinics(id, name, clinic_code)')
    .eq('id', patientId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('[SUPABASE] getPatientById error:', error.message);
  }
  return data;
}

async function getPatientByPhone(phone) {
  if (!supabase) return null;
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
  if (!supabase) return null;
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
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[SUPABASE] getPatientsByClinic error:', error.message);
    return [];
  }
  return data || [];
}

async function createPatient(patientData) {
  if (!supabase) return null;
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
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('patients')
    .update(updates)
    .eq('id', patientId)
    .select()
    .single();
  
  if (error) {
    console.error('[SUPABASE] updatePatient error:', error.message);
    throw error;
  }
  return data;
}

// ================== CHAT MESSAGES ==================
async function getChatMessagesByPatient(clinicId, patientId) {
  if (!supabase) return [];
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
  if (!supabase) return null;
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
  if (!supabase) return 0;
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

// ================== OTP OPERATIONS ==================

async function createOTP(email, otpHash, expiresAt) {
  if (!supabase) return null;
  
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
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('otps')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('[SUPABASE] getOTPByEmail error:', error.message);
  }
  return data;
}

async function incrementOTPAttempts(otpId) {
  if (!supabase) return;
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
  if (!supabase) return;
  const { error } = await supabase
    .from('otps')
    .update({ used: true })
    .eq('id', otpId);
  
  if (error) {
    console.error('[SUPABASE] markOTPUsed error:', error.message);
  }
}

async function deleteOTP(email) {
  if (!supabase) return;
  const { error } = await supabase
    .from('otps')
    .delete()
    .eq('email', email.toLowerCase());
  
  if (error) {
    console.error('[SUPABASE] deleteOTP error:', error.message);
  }
}

async function cleanupExpiredOTPs() {
  if (!supabase) return;
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
  if (!supabase) return null;
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

async function getAdminToken(token) {
  if (!supabase) return null;
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
  if (!supabase) return;
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
  if (!supabase) return null;
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

async function getReferralsByClinic(clinicId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('referrals')
    .select('*, referrer:referrer_patient_id(id, name), referred:referred_patient_id(id, name)')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[SUPABASE] getReferralsByClinic error:', error.message);
    return [];
  }
  return data || [];
}

// ================== PUSH SUBSCRIPTION OPERATIONS ==================

async function savePushSubscription(patientId, endpoint, keys) {
  if (!supabase) return null;
  
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
  if (!supabase) return [];
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

module.exports = { 
  supabase,
  isSupabaseEnabled: () => supabase !== null,
  testSupabaseConnection, // Post-boot test function
  
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
  
  // Referrals
  createReferral,
  getReferralsByClinic,
  
  // Push Subscriptions
  savePushSubscription,
  getPushSubscriptionsByPatient
};
