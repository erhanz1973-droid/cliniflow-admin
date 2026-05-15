// API helpers for Admin Treatment (load /api-base.js before this file)
const API_BASE = typeof window.cliniflowApiBase === 'function' ? window.cliniflowApiBase() : '';
const STATUS_ORDER = ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"];
let PROCEDURE_DEFS = [];
let TYPE_TO_CATEGORY = {};
let EXTRACTION_TYPES = new Set(["EXTRACTION", "SURGICAL_EXTRACTION"]);

function getAdminToken(){
  try { return localStorage.getItem("adminToken") || ""; } catch { return ""; }
}
window.getAdminToken = getAdminToken;

function adminHeaders(extra = {}){
  const token = getAdminToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}`, "x-actor": "admin" } : {}),
    ...extra,
  };
}
window.adminHeaders = adminHeaders;

async function getPatientsCached(force = false) {
  // ...existing code from admin-treatment.html...
}
window.getPatientsCached = getPatientsCached;

async function getAdminPlansForPatientCached(patientKey, force = false) {
  // ...existing code from admin-treatment.html...
}
window.getAdminPlansForPatientCached = getAdminPlansForPatientCached;

async function loadPatientFullRecord(patientId) {
  // ...existing code from admin-treatment.html...
  // Normalize DATA.teeth structure
  if (window.DATA && Array.isArray(window.DATA.teeth)) {
    window.DATA.teeth.forEach(t => {
      if (!t.procedures && t.treatments) {
        t.procedures = t.treatments;
      }
      if (!Array.isArray(t.procedures)) {
        t.procedures = [];
      }
    });
    // Log structure for debugging
    console.log("TOOTH STRUCTURE:", window.DATA.teeth[0]);
    // Refresh UI
    if (typeof refreshBadgeAndColors === 'function') refreshBadgeAndColors();
    if (typeof renderSelectedToothList === 'function') renderSelectedToothList();
    // Ensure all 32 FDI teeth exist in DATA.teeth
    const ALL_TEETH = [
      11,12,13,14,15,16,17,18,
      21,22,23,24,25,26,27,28,
      31,32,33,34,35,36,37,38,
      41,42,43,44,45,46,47,48
    ];
    ALL_TEETH.forEach(id => {
      if (!window.DATA.teeth.find(t => String(t.toothId) === String(id))) {
        window.DATA.teeth.push({
          toothId: id,
          procedures: [],
          diagnoses: []
        });
      }
    });
    // Rerender UI to reflect all teeth
    if (typeof refreshBadgeAndColors === 'function') refreshBadgeAndColors();
    if (typeof renderTeeth === 'function') renderTeeth();
  }
  // At the end, ensure UI is refreshed
  if (typeof renderDiagnoses === 'function') renderDiagnoses();
  if (typeof renderToothDiagnosisSummary === 'function') renderToothDiagnosisSummary();
  if (typeof refreshBadgeAndColors === 'function') refreshBadgeAndColors();
}
window.loadPatientFullRecord = loadPatientFullRecord;

async function loadProcedureDefs() {
  // ...existing code from admin-treatment.html...
}
window.loadProcedureDefs = loadProcedureDefs;

async function loadTreatmentPrices() {
  // ...existing code from admin-treatment.html...
}
window.loadTreatmentPrices = loadTreatmentPrices;

async function loadDoctorsDirectory() {
  // ...existing code from admin-treatment.html...
}
window.loadDoctorsDirectory = loadDoctorsDirectory;
