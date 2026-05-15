// State and helpers for Admin Treatment
let DATA = { patientId:"", teeth:[] };
/**
 * Ensures DATA.teeth contains all 32 teeth, each with procedures and diagnosis arrays.
 */
function normalizeTeethData() {
  const allTeeth = [
    11,12,13,14,15,16,17,18,
    21,22,23,24,25,26,27,28,
    31,32,33,34,35,36,37,38,
    41,42,43,44,45,46,47,48
  ];
  const map = new Map();
  (DATA.teeth || []).forEach(t => {
    map.set(Number(t.toothId), t);
  });
  DATA.teeth = allTeeth.map(id => {
    return map.get(id) || {
      toothId: id,
      procedures: [],
      diagnosis: []
    };
  });
}
window.normalizeTeethData = normalizeTeethData;

const ALL_FDI_TEETH = [
  "11","12","13","14","15","16","17","18",
  "21","22","23","24","25","26","27","28",
  "31","32","33","34","35","36","37","38",
  "41","42","43","44","45","46","47","48"
];

function ensureAllTeethExist(){
  if(!DATA) DATA = {};
  if(!Array.isArray(DATA.teeth)) DATA.teeth = [];
  const map = new Map();
  DATA.teeth.forEach(t=>{
    const id = String(
      t?.toothId ??
      t?.tooth_id ??
      t?.toothNumber ??
      t?.tooth_number ??
      t?.toothNo ??
      t?.id ??
      ""
    ).trim();
    if(!id) return;
    map.set(id,{
      toothId:id,
      procedures:Array.isArray(t.procedures)?t.procedures:[],
      diagnosis:Array.isArray(t.diagnosis)?t.diagnosis:[],
      diagnoses:Array.isArray(t.diagnoses)?t.diagnoses:[]
    });
  });
  ALL_FDI_TEETH.forEach(id=>{
    if(!map.has(id)){
      map.set(id,{
        toothId:id,
        procedures:[],
        diagnosis:[],
        diagnoses:[]
      });
    }
  });
  DATA.teeth = Array.from(map.values());
  console.log("[TEETH FIX] total teeth:", DATA.teeth.length);
}
window.ensureAllTeethExist = ensureAllTeethExist;
let SELECTED_TOOTH = null;
let CURRENT_PATIENT_ID = null;
let CURRENT_PLAN_ID = null;
let PLAN_CHAT_MESSAGES = [];
let IS_ADDING_PROCEDURE = false;
let TRAVEL_EVENTS = [];
let EDITING_PROC = null;
let TREATMENT_PRICES = {};
let DOCTOR_NAME_BY_ID = Object.create(null);
const DEBUG_LEVEL = String(new URLSearchParams(window.location.search).get("debug") || "").trim();
const DEBUG_UI = DEBUG_LEVEL === "1" || DEBUG_LEVEL === "2";
const VERBOSE_DEBUG_UI = DEBUG_LEVEL === "2";
const PATIENTS_CACHE = { data: null, fetchedAt: 0, ttlMs: 30000, pending: null };
const PLANS_CACHE = new Map();

window.DATA = DATA;
window.SELECTED_TOOTH = SELECTED_TOOTH;
window.CURRENT_PATIENT_ID = CURRENT_PATIENT_ID;
window.CURRENT_PLAN_ID = CURRENT_PLAN_ID;
window.PLAN_CHAT_MESSAGES = PLAN_CHAT_MESSAGES;
window.IS_ADDING_PROCEDURE = IS_ADDING_PROCEDURE;
window.TRAVEL_EVENTS = TRAVEL_EVENTS;
window.EDITING_PROC = EDITING_PROC;
window.TREATMENT_PRICES = TREATMENT_PRICES;
window.DOCTOR_NAME_BY_ID = DOCTOR_NAME_BY_ID;

function toothKey(id){
  // ...existing code from admin-treatment.html...
}
window.toothKey = toothKey;

function findTooth(toothId){
  // ...existing code from admin-treatment.html...
}
window.findTooth = findTooth;

function ensureTooth(toothId){
  // ...existing code from admin-treatment.html...
}
window.ensureTooth = ensureTooth;

function normalizeStatusUI(s){
  // ...existing code from admin-treatment.html...
}
window.normalizeStatusUI = normalizeStatusUI;

function isToothLockedUI(tooth){
  // ...existing code from admin-treatment.html...
}
window.isToothLockedUI = isToothLockedUI;

function hasActiveConflictUI(tooth, category, excludeProcedureId){
  // ...existing code from admin-treatment.html...
}
window.hasActiveConflictUI = hasActiveConflictUI;

function makeProcedureId(){
  // ...existing code from admin-treatment.html...
}
window.makeProcedureId = makeProcedureId;
