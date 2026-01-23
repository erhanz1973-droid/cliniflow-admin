#!/usr/bin/env node
/* eslint-disable no-console */
// Migrates file-based treatments to Supabase patients.treatments
// Usage: node scripts/migrate-treatments-to-supabase.js

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { supabase, isSupabaseEnabled } = require("../lib/supabase");

const DATA_DIR = path.join(__dirname, "..", "data");
const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
const PATIENTS_FILE = path.join(DATA_DIR, "patients.json");

function normalizePhone(phone) {
  if (!phone) return "";
  let cleaned = String(phone).trim().replace(/\s+/g, "");
  cleaned = cleaned.replace(/\D/g, "");
  if (cleaned.startsWith("90") && cleaned.length > 10) cleaned = cleaned.substring(2);
  if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
  return cleaned;
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.warn("[MIGRATE] Failed to read JSON:", filePath, err?.message || err);
    return null;
  }
}

async function fetchTreatmentsRow(patientId) {
  if (!supabase) return { error: new Error("supabase_not_configured") };
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    patientId
  );

  let q1 = supabase
    .from("patients")
    .select("id, patient_id, clinic_id, treatments")
    .eq("patient_id", patientId);
  const r1 = await q1;
  if (!r1.error) {
    const row = Array.isArray(r1.data) ? r1.data[0] : r1.data;
    if (row) return { data: row, key: "patient_id" };
  }

  const msg = String(r1.error?.message || "");
  const isMissingPatientIdCol = msg.toLowerCase().includes("patient_id") && msg.toLowerCase().includes("does not exist");
  const isNotFound = String(r1.error?.code || "") === "PGRST116";
  const isMultiple = msg.toLowerCase().includes("single json object");
  if (isMultiple && Array.isArray(r1.data) && r1.data.length > 0) {
    return { data: r1.data[0], key: "patient_id", warning: "multiple_rows_patient_id" };
  }
  if (r1.error && !isMissingPatientIdCol && !isNotFound) return { error: r1.error };

  if (!isUuid) return { error: r1.error };

  let q2 = supabase.from("patients").select("id, clinic_id, treatments").eq("id", patientId);
  const r2 = await q2.single();
  if (!r2.error) return { data: r2.data, key: "id" };
  return { error: r2.error };
}

function hasTeeth(payload) {
  return Array.isArray(payload?.teeth) && payload.teeth.length > 0;
}

function shouldMigrate(filePayload, existingPayload) {
  const fileUpdatedAt = Number(filePayload?.updatedAt || 0);
  const existingUpdatedAt = Number(existingPayload?.updatedAt || 0);
  const existingHasTeeth = hasTeeth(existingPayload);
  const fileHasTeeth = hasTeeth(filePayload);

  if (!existingPayload) return true;
  if (!existingHasTeeth && fileHasTeeth) return true;
  if (fileUpdatedAt && existingUpdatedAt && fileUpdatedAt > existingUpdatedAt) return true;
  return false;
}

async function findPatientByEmailOrPhone(email, phone) {
  const emailNormalized = email ? String(email).trim().toLowerCase() : "";
  const phoneNormalized = normalizePhone(phone);

  if (emailNormalized) {
    const r = await supabase
      .from("patients")
      .select("id, patient_id, clinic_id, email, phone, treatments")
      .eq("email", emailNormalized)
      .limit(1);
    if (!r.error && Array.isArray(r.data) && r.data.length > 0) return r.data[0];
  }

  if (phoneNormalized) {
    const r = await supabase
      .from("patients")
      .select("id, patient_id, clinic_id, email, phone, treatments")
      .eq("phone", phoneNormalized)
      .limit(1);
    if (!r.error && Array.isArray(r.data) && r.data.length > 0) return r.data[0];
  }

  return null;
}

async function updateTreatments(patientId, payload, targetRow) {
  if (!supabase) throw new Error("supabase_not_configured");
  const shouldUpdatePatientId = String(process.env.MIGRATE_UPDATE_PATIENT_ID || "").toLowerCase() === "true";
  const updatePayload = {
    treatments: payload,
    updated_at: new Date().toISOString(),
  };

  if (shouldUpdatePatientId && targetRow && targetRow.patient_id && targetRow.patient_id !== patientId) {
    updatePayload.patient_id = patientId;
  }

  if (targetRow?.id) {
    const r = await supabase
      .from("patients")
      .update(updatePayload)
      .eq("id", targetRow.id)
      .select("id");
    if (r.error) throw r.error;
    return Array.isArray(r.data) ? r.data.length : 0;
  }

  const r1 = await supabase
    .from("patients")
    .update(updatePayload)
    .eq("patient_id", patientId)
    .select("id");
  if (r1.error) throw r1.error;
  return Array.isArray(r1.data) ? r1.data.length : 0;
}

async function run() {
  if (!isSupabaseEnabled()) {
    console.error("[MIGRATE] Supabase is not enabled. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  if (!fs.existsSync(TREATMENTS_DIR)) {
    console.log("[MIGRATE] No treatments directory found:", TREATMENTS_DIR);
    process.exit(0);
  }

  const files = fs.readdirSync(TREATMENTS_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".events.json"));
  if (files.length === 0) {
    console.log("[MIGRATE] No treatment files found.");
    process.exit(0);
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  const rawPatients = readJson(PATIENTS_FILE, {}) || {};
  const patientsById = Array.isArray(rawPatients)
    ? rawPatients.reduce((acc, p) => {
        const pid = String(p?.patientId || p?.patient_id || p?.id || "").trim();
        if (pid) acc[pid] = p;
        return acc;
      }, {})
    : rawPatients;

  for (const file of files) {
    const filePath = path.join(TREATMENTS_DIR, file);
    const payload = readJson(filePath);
    if (!payload || typeof payload !== "object") {
      console.warn("[MIGRATE] Skipping invalid JSON:", file);
      skipped += 1;
      continue;
    }

    const patientId = String(payload.patientId || file.replace(".json", "")).trim();
    if (!patientId) {
      console.warn("[MIGRATE] Missing patientId for file:", file);
      skipped += 1;
      continue;
    }

    let { data: existingRow, error } = await fetchTreatmentsRow(patientId);
    let matchedBy = "patient_id";
    if (error || !existingRow) {
      const meta = patientsById[patientId] || {};
      const email = meta?.email || meta?.patientEmail || meta?.mail || "";
      const phone = meta?.phone || meta?.phoneNumber || meta?.phone_number || meta?.mobile || meta?.tel || "";
      if (email || phone) {
        const fallbackRow = await findPatientByEmailOrPhone(email, phone);
        if (fallbackRow) {
          existingRow = fallbackRow;
          matchedBy = "email_or_phone";
          error = null;
        }
      }
    }

    if (error || !existingRow) {
      console.warn("[MIGRATE] Could not find patient in Supabase:", patientId, error?.message || error);
      skipped += 1;
      continue;
    }

    const existingPayload = existingRow?.treatments || null;
    if (!shouldMigrate(payload, existingPayload)) {
      console.log("[MIGRATE] Skipping (Supabase newer or already has teeth):", patientId);
      skipped += 1;
      continue;
    }

    try {
      const updatedCount = await updateTreatments(patientId, payload, existingRow);
      if (updatedCount > 0) {
        console.log("[MIGRATE] Migrated treatments for patient:", patientId, `(rows: ${updatedCount}, matchedBy: ${matchedBy})`);
        migrated += 1;
      } else {
        console.warn("[MIGRATE] No patient row updated for:", patientId);
        skipped += 1;
      }
    } catch (err) {
      console.error("[MIGRATE] Failed to migrate treatments:", patientId, err?.message || err);
      failed += 1;
    }
  }

  console.log("[MIGRATE] Done.", { migrated, skipped, failed });
}

run().catch((err) => {
  console.error("[MIGRATE] Unexpected error:", err?.message || err);
  process.exit(1);
});
