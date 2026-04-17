/**
 * Clinic geolocation helpers — URL parsing, geocoding, normalization.
 * Used by index.cjs, lib/supabase.js, and scripts/migrate-clinic-coordinates.cjs
 */

/**
 * Simple q=lat,lng extractor (e.g. https://maps.google.com/?q=41.7151,44.8271)
 * @returns {{ lat: number, lng: number } | null}
 */
function extractLatLng(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/[?&]q=([0-9.-]+),([0-9.-]+)/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Extracts { latitude, longitude } from a Google Maps URL.
 * Returns null if no coords are found.
 *
 * Supported patterns (in priority order):
 *  1. /@lat,lng  — standard place/directions URLs
 *  2. !3dlat!4dlng — embed/data fragment
 *  3. ?q=lat,lng  — simple query with coords
 *  4. ?ll=lat,lng — legacy ll param
 *  5. ?q=loc:lat,lng — loc: prefix variant
 */
function parseGoogleMapsCoords(url) {
  if (!url || typeof url !== "string") return null;
  const simple = extractLatLng(url);
  if (simple) return { latitude: simple.lat, longitude: simple.lng };

  try {
    let m = url.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
    if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };

    m = url.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
    if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };

    const qs = url.includes("?") ? new URL(url).searchParams : null;

    const q = qs?.get("q") || "";
    m = q.replace(/\s/g, "").match(/^(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)$/);
    if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };

    m = q.match(/loc:(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/i);
    if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };

    const ll = qs?.get("ll") || "";
    m = ll.match(/^(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
    if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };

    return null;
  } catch {
    return null;
  }
}

/**
 * Geocodes an address using Google Geocoding API.
 * @returns {{ latitude: number, longitude: number } | null}
 */
async function geocodeAddressWithGoogle(address, apiKey) {
  if (!address || !apiKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return null;
    }
    const loc = data?.results?.[0]?.geometry?.location;
    if (!loc) return null;
    return { latitude: loc.lat, longitude: loc.lng };
  } catch {
    return null;
  }
}

/**
 * Master resolver: parse URL first, fall back to geocoding address.
 * @param {string} googleMapsUrl
 * @param {string} address free-text address or "name, city, country"
 */
async function resolveClinicCoords(googleMapsUrl, address) {
  const fromUrl = parseGoogleMapsCoords(googleMapsUrl);
  if (fromUrl) return fromUrl;

  const geocodeKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  if (geocodeKey && address && String(address).trim()) {
    const fromGeocode = await geocodeAddressWithGoogle(String(address).trim(), geocodeKey);
    if (fromGeocode) return fromGeocode;
  }
  return null;
}

function parseCoord(v) {
  if (v == null || v === "") return NaN;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

/** True if clinic row has usable latitude/longitude (snake or legacy lat/lng columns). */
function hasFiniteCoords(clinic) {
  let lat = parseCoord(clinic.latitude ?? clinic.lat);
  let lng = parseCoord(clinic.longitude ?? clinic.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return true;
}

/** Normalize legacy lat/lng into latitude/longitude on a plain object (mutates). */
function normalizeClinicCoordinateFields(row) {
  const out = { ...row };
  const lat = parseCoord(out.latitude ?? out.lat);
  const lng = parseCoord(out.longitude ?? out.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    out.latitude = lat;
    out.longitude = lng;
  }
  delete out.lat;
  delete out.lng;
  return out;
}

function parseSettingsMaybe(settings) {
  if (!settings) return {};
  if (typeof settings === "object") return settings;
  if (typeof settings === "string") {
    try {
      return JSON.parse(settings);
    } catch {
      return {};
    }
  }
  return {};
}

/** First non-empty map URL from row + settings JSON. */
function pickMapUrlFromClinic(clinic) {
  const s = parseSettingsMaybe(clinic.settings);
  const branding = s.branding && typeof s.branding === "object" ? s.branding : {};
  const candidates = [
    clinic.google_maps_url,
    clinic.googleMapsUrl,
    clinic.map_link,
    s.googleMapsUrl,
    s.googleMapLink,
    s.google_maps_url,
    branding.googleMapsUrl,
    branding.googleMapLink,
  ];
  for (const u of candidates) {
    if (u && typeof u === "string" && u.trim()) return u.trim();
  }
  return "";
}

/** Build a geocoding query: prefer full address, then name + city + country. */
function buildGeocodeQuery(clinic) {
  const parts = [
    clinic.address,
    clinic.city,
    clinic.country,
  ]
    .filter((x) => x != null && String(x).trim())
    .map((x) => String(x).trim());
  if (parts.length) return parts.join(", ");

  const name = clinic.name ? String(clinic.name).trim() : "";
  const city = clinic.city ? String(clinic.city).trim() : "";
  const country = clinic.country ? String(clinic.country).trim() : "";
  if (name && city) return [name, city, country].filter(Boolean).join(", ");
  if (name) return name;
  return "";
}

module.exports = {
  extractLatLng,
  parseGoogleMapsCoords,
  geocodeAddressWithGoogle,
  resolveClinicCoords,
  hasFiniteCoords,
  normalizeClinicCoordinateFields,
  pickMapUrlFromClinic,
  buildGeocodeQuery,
};
