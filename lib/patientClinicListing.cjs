/**
 * Shared logic: visible clinics for a patient (nearby → country → cap),
 * same rules as GET /api/patient/clinics.
 */

"use strict";

function filterActiveClinicRows(rows) {
  return (rows || []).filter((c) => {
    const s = String(c.status ?? "active").toLowerCase();
    return !["suspended", "reject", "rejected", "inactive", "closed"].includes(s);
  });
}

function excludePatientClinic(rows, excludeClinicId) {
  if (!excludeClinicId) return rows;
  const ex = String(excludeClinicId).trim();
  return rows.filter((c) => String(c.id) !== ex);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ patientId?: string|null, lat?: any, lng?: any, country?: any, selectFull: string, selectLite: string }} opts
 * @returns {Promise<{ rows: any[] }>}
 */
async function fetchPatientVisibleClinicRows(supabase, opts) {
  const { patientId, lat, lng, country, selectFull, selectLite } = opts;

  let excludeClinicId = null;
  if (patientId) {
    let pt = null;
    const r1 = await supabase.from("patients").select("clinic_id").eq("id", patientId).maybeSingle();
    if (!r1.error && r1.data) pt = r1.data;
    if (!pt?.clinic_id) {
      const r2 = await supabase.from("patients").select("clinic_id").eq("patient_id", patientId).maybeSingle();
      if (!r2.error && r2.data) pt = r2.data;
    }
    excludeClinicId = pt?.clinic_id || null;
  }

  const latN = lat != null && String(lat).trim() !== "" ? parseFloat(String(lat)) : NaN;
  const lngN = lng != null && String(lng).trim() !== "" ? parseFloat(String(lng)) : NaN;
  const hasCoords = Number.isFinite(latN) && Number.isFinite(lngN);
  const countryStr = country != null ? String(country).trim() : "";

  async function clinicsFromTable(apply) {
    let q = supabase.from("clinics").select(selectFull).order("name", { ascending: true });
    q = apply(q);
    let { data: raw, error } = await q;
    if (error) {
      let q2 = supabase.from("clinics").select(selectLite).order("name", { ascending: true });
      q2 = apply(q2);
      const r2 = await q2;
      raw = r2.data;
      error = r2.error;
    }
    if (error) throw error;
    return raw || [];
  }

  let rows = [];

  if (hasCoords) {
    const { data, error } = await supabase.rpc("nearby_clinics", {
      user_lat: latN,
      user_lng: lngN,
      radius_km: 10,
    });
    if (error) {
      console.warn("[patientClinicListing] nearby_clinics RPC:", error.message);
    } else if (Array.isArray(data) && data.length) {
      rows = excludePatientClinic(filterActiveClinicRows(data), excludeClinicId);
    }
  }

  if (!rows.length && countryStr) {
    const raw = await clinicsFromTable((q) => q.eq("country", countryStr).limit(200));
    rows = excludePatientClinic(filterActiveClinicRows(raw), excludeClinicId);
  }

  if (!rows.length) {
    const raw = await clinicsFromTable((q) => q.limit(20));
    rows = excludePatientClinic(filterActiveClinicRows(raw), excludeClinicId);
  }

  return { rows, excludeClinicId };
}

module.exports = { fetchPatientVisibleClinicRows };
