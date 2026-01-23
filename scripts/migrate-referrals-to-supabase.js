#!/usr/bin/env node
/* eslint-disable no-console */
// Migrates file-based referrals to Supabase referrals table
// Usage: node scripts/migrate-referrals-to-supabase.js

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { supabase, isSupabaseEnabled } = require("../lib/supabase");

const DATA_DIR = path.join(__dirname, "..", "data");
const REF_FILE = path.join(DATA_DIR, "referrals.json");
const PATIENTS_FILE = path.join(DATA_DIR, "patients.json");

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.warn("[MIGRATE] Failed to read JSON:", filePath, err?.message || err);
    return fallback;
  }
}


function normalizeStatus(raw) {
  const val = String(raw || "").trim().toUpperCase();
  if (!val) return "PENDING";
  if (val === "APPROVED" || val === "REJECTED" || val === "PENDING" || val === "INVITED") return val;
  if (val === "REGISTERED") return "APPROVED";
  if (val === "COMPLETED") return "COMPLETED";
  if (val === "CANCELLED") return "CANCELLED";
  return "PENDING";
}

function isMissingColumnError(error, columnName) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");
  if (!columnName) return code === "PGRST204" || code === "42703";
  return (code === "PGRST204" || code === "42703") && msg.includes(columnName.toLowerCase());
}

async function findPatientByIdOrReferralCode(patientId, patientsById) {
  const pid = String(patientId || "").trim();
  if (!pid) return null;

  const patientFromFile = patientsById?.[pid] || null;
  const referralCode = patientFromFile?.referralCode || patientFromFile?.referral_code || "";

  // Try patient_id first
  let r = await supabase
    .from("patients")
    .select("id, patient_id, clinic_id, email, phone")
    .eq("patient_id", pid)
    .limit(1);
  if (!r.error && Array.isArray(r.data) && r.data.length > 0) return r.data[0];

  // Try referral_code (file hint first, fallback to patientId)
  const code = String(referralCode || pid).trim();
  if (code) {
    r = await supabase
      .from("patients")
      .select("id, patient_id, clinic_id, email, phone, referral_code")
      .eq("referral_code", code)
      .limit(1);
    if (!r.error && Array.isArray(r.data) && r.data.length > 0) return r.data[0];
  }

  return null;
}

async function referralExists(inviterId, invitedId) {
  const r = await supabase
    .from("referrals")
    .select("id")
    .eq("inviter_patient_id", inviterId)
    .eq("invited_patient_id", invitedId)
    .limit(1);
  return !r.error && Array.isArray(r.data) && r.data.length > 0;
}

async function upsertReferral(row) {
  let payload = { ...row };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const r = await supabase
      .from("referrals")
      .insert(payload)
      .select("id")
      .single();
    if (!r.error) return r.data;
    if (isMissingColumnError(r.error, "referral_code") && payload.referral_code) {
      const { referral_code: _ignored, ...nextPayload } = payload;
      payload = nextPayload;
      continue;
    }
    throw r.error;
  }
  return null;
}

async function run() {
  if (!isSupabaseEnabled()) {
    console.error("[MIGRATE] Supabase is not enabled. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const rawReferrals = readJson(REF_FILE, []);
  const referralList = Array.isArray(rawReferrals) ? rawReferrals : Object.values(rawReferrals || {});
  if (!referralList.length) {
    console.log("[MIGRATE] No referrals found in file.");
    process.exit(0);
  }

  const rawPatients = readJson(PATIENTS_FILE, {});
  const patientsById = Array.isArray(rawPatients)
    ? rawPatients.reduce((acc, p) => {
        const pid = String(p?.patientId || p?.patient_id || p?.id || "").trim();
        if (pid) acc[pid] = p;
        return acc;
      }, {})
    : rawPatients;

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const ref of referralList) {
    const inviterIdRaw = ref?.inviterPatientId || ref?.inviter_patient_id || ref?.referrer_patient_id || "";
    const invitedIdRaw = ref?.invitedPatientId || ref?.invited_patient_id || ref?.referred_patient_id || "";
    const inviterId = String(inviterIdRaw || "").trim();
    const invitedId = String(invitedIdRaw || "").trim();
    if (!inviterId || !invitedId) {
      skipped += 1;
      continue;
    }

    const inviter = await findPatientByIdOrReferralCode(inviterId, patientsById);
    const invited = await findPatientByIdOrReferralCode(invitedId, patientsById);
    if (!inviter || !invited) {
      console.warn("[MIGRATE] Could not resolve patients:", { inviterId, invitedId });
      skipped += 1;
      continue;
    }

    try {
      const exists = await referralExists(inviter.patient_id || inviter.id, invited.patient_id || invited.id);
      if (exists) {
        skipped += 1;
        continue;
      }

      const referralCode = ref?.referralCode || ref?.referral_code || `REF_${inviterId}_${invitedId}_${Date.now()}`;
      const status = normalizeStatus(ref?.status);
      const row = {
        clinic_id: inviter.clinic_id || invited.clinic_id || null,
        inviter_patient_id: inviter.patient_id || inviter.id,
        invited_patient_id: invited.patient_id || invited.id,
        referral_code: referralCode,
        status,
        inviter_discount_percent: ref?.inviterDiscountPercent ?? null,
        invited_discount_percent: ref?.invitedDiscountPercent ?? null,
        discount_percent: ref?.discountPercent ?? null,
        reward_amount: ref?.rewardAmount ?? null,
        reward_currency: ref?.rewardCurrency || "EUR",
        created_at: ref?.createdAt ? new Date(Number(ref.createdAt)).toISOString() : undefined,
        updated_at: ref?.updatedAt ? new Date(Number(ref.updatedAt)).toISOString() : undefined,
      };

      Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);

      await upsertReferral(row);
      migrated += 1;
      console.log("[MIGRATE] Migrated referral:", inviterId, "->", invitedId);
    } catch (err) {
      console.error("[MIGRATE] Failed to migrate referral:", inviterId, invitedId, err?.message || err);
      failed += 1;
    }
  }

  console.log("[MIGRATE] Done.", { migrated, skipped, failed });
}

run().catch((err) => {
  console.error("[MIGRATE] Unexpected error:", err?.message || err);
  process.exit(1);
});
