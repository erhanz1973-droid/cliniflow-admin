#!/usr/bin/env node
/* eslint-disable no-console */
// Sets patients.referral_code = patients.patient_id (or id) in Supabase
// Usage: node scripts/set-referral-code-to-patient-id.js

require("dotenv").config();

const { supabase, isSupabaseEnabled } = require("../lib/supabase");

async function run() {
  if (!isSupabaseEnabled()) {
    console.error("[SET] Supabase is not enabled. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("patients")
    .select("id, patient_id, referral_code")
    .limit(10000);

  if (error) {
    console.error("[SET] Failed to load patients:", error.message);
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of data || []) {
    const pid = row?.patient_id || row?.id;
    if (!pid) {
      skipped += 1;
      continue;
    }
    if (row.referral_code && String(row.referral_code).trim()) {
      skipped += 1;
      continue;
    }

    const { error: updateErr } = await supabase
      .from("patients")
      .update({ referral_code: String(pid) })
      .eq("id", row.id);

    if (updateErr) {
      failed += 1;
      console.error("[SET] Failed to update referral_code:", row.id, updateErr.message);
    } else {
      updated += 1;
    }
  }

  console.log("[SET] Done.", { updated, skipped, failed });
}

run().catch((err) => {
  console.error("[SET] Unexpected error:", err?.message || err);
  process.exit(1);
});
