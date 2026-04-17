#!/usr/bin/env node
/* eslint-disable no-console */
// Sync referralCode from data/patients.json to Supabase patients.referral_code
// Usage: node scripts/migrate-patient-referral-codes.js

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { supabase, isSupabaseEnabled } = require("../lib/supabase");

const DATA_DIR = path.join(__dirname, "..", "data");
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

async function updateReferralCode(patientId, referralCode) {
  const r = await supabase
    .from("patients")
    .update({ referral_code: referralCode })
    .eq("patient_id", patientId)
    .select("id, patient_id")
    .limit(1);
  if (r.error) throw r.error;
  return Array.isArray(r.data) ? r.data.length : 0;
}

async function run() {
  if (!isSupabaseEnabled()) {
    console.error("[MIGRATE] Supabase is not enabled. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const rawPatients = readJson(PATIENTS_FILE, {});
  const patientsById = Array.isArray(rawPatients)
    ? rawPatients.reduce((acc, p) => {
        const pid = String(p?.patientId || p?.patient_id || p?.id || "").trim();
        if (pid) acc[pid] = p;
        return acc;
      }, {})
    : rawPatients;

  const entries = Object.entries(patientsById || {});
  if (!entries.length) {
    console.log("[MIGRATE] No patients found in file.");
    process.exit(0);
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [patientId, patient] of entries) {
    const referralCode = String(patient?.referralCode || patient?.referral_code || "").trim();
    if (!referralCode) {
      skipped += 1;
      continue;
    }

    try {
      const count = await updateReferralCode(patientId, referralCode);
      if (count > 0) {
        updated += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      failed += 1;
      console.error("[MIGRATE] Failed to update referral_code:", patientId, err?.message || err);
    }
  }

  console.log("[MIGRATE] Done.", { updated, skipped, failed });
}

run().catch((err) => {
  console.error("[MIGRATE] Unexpected error:", err?.message || err);
  process.exit(1);
});
