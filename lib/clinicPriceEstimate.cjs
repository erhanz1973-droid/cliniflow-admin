/**
 * Dynamic price estimates from clinic-specific treatment prices + AI treatment keys.
 * All amounts are clinic-defined; missing keys count as 0.
 */

"use strict";

function parseSettingsMaybe(settings) {
  if (settings == null) return {};
  if (typeof settings === "object" && !Array.isArray(settings)) return settings;
  if (typeof settings === "string") {
    try {
      return JSON.parse(settings);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Merge price map from clinics.prices (jsonb) or clinics.settings.prices (legacy).
 * Keys normalized to lowercase strings; values must be finite non-negative numbers.
 * @returns {Record<string, number> | null}
 */
function mergeClinicPrices(clinic) {
  const st = parseSettingsMaybe(clinic?.settings);
  const raw = clinic?.prices ?? st.prices ?? null;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim().toLowerCase();
    if (!key) continue;
    const num = Number(v);
    if (Number.isFinite(num) && num >= 0) out[key] = Math.round(num * 100) / 100;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {Array<{ id: string, name?: string, prices?: object, settings?: object, currency?: string }>} clinics
 * @param {string[]} treatments normalized treatment keys (lowercase)
 * @returns {{ minPrice: number | null, maxPrice: number | null, clinics: Array<{ clinicId: string, name: string, total: number, currency: string }> }}
 */
function calculatePrices(clinics, treatments) {
  const tKeys = (treatments || [])
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);
  if (!tKeys.length) {
    return { minPrice: null, maxPrice: null, clinics: [] };
  }

  const results = [];
  for (const clinic of clinics || []) {
    const priceMap = mergeClinicPrices(clinic);
    if (!priceMap) continue;

    let total = 0;
    for (const t of tKeys) {
      total += priceMap[t] ?? 0;
    }
    total = Math.round(total * 100) / 100;

    const st = parseSettingsMaybe(clinic?.settings);
    const currency =
      (typeof clinic.currency === "string" && clinic.currency.trim()) ||
      (typeof st.currency === "string" && st.currency.trim()) ||
      "USD";

    results.push({
      clinicId: String(clinic.id),
      name: clinic.name || "Klinik",
      total,
      currency: currency.toUpperCase(),
    });
  }

  results.sort((a, b) => a.total - b.total);

  const totals = results.map((r) => r.total).filter((n) => Number.isFinite(n));
  if (!totals.length) {
    return { minPrice: null, maxPrice: null, clinics: [] };
  }

  return {
    minPrice: Math.min(...totals),
    maxPrice: Math.max(...totals),
    clinics: results,
  };
}

/**
 * Parse treatments from Express query: treatments=cleaning,whitening or repeated keys.
 */
function parseTreatmentsFromQuery(query) {
  const raw = query?.treatments;
  if (raw == null) return [];
  const parts = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const p of parts) {
    String(p)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((x) => out.push(x));
  }
  return out;
}

module.exports = {
  mergeClinicPrices,
  calculatePrices,
  parseTreatmentsFromQuery,
};
