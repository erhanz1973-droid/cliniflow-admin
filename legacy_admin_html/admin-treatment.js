// DATA, SELECTED_TOOTH, API_BASE are declared in the inline script of admin-treatment.html

function toothKey(v) {
  return String(v).trim();
}

function ensureTooth(id) {
  let t = DATA.teeth.find(x => toothKey(x.toothId) === toothKey(id));
  if (!t) {
    t = {
      toothId: id,
      procedures: [],
      diagnoses: []
    };
    DATA.teeth.push(t);
  }
  return t;
}

function findTooth(id) {
  return DATA.teeth.find(t => toothKey(t.toothId) === toothKey(id));
}

function renderTeeth() {
  const grid = document.getElementById("toothGrid");
  grid.innerHTML = "";
  const all = [
    11,12,13,14,15,16,17,18,
    21,22,23,24,25,26,27,28,
    31,32,33,34,35,36,37,38,
    41,42,43,44,45,46,47,48
  ];
  all.forEach(id => {
    const el = document.createElement("div");
    el.className = "tooth";
    const t = findTooth(id);
    if (t && t.procedures.length > 0) {
      el.classList.add("has");
    }
    if (SELECTED_TOOTH == id) {
      el.classList.add("active");
    }
    el.textContent = id;
    el.onclick = () => selectTooth(id);
    grid.appendChild(el);
  });
}

function selectTooth(id) {
  SELECTED_TOOTH = id;
  document.getElementById("selectedTooth").textContent = id;
  renderTeeth();
  renderProcedures();
}

function renderProcedures() {
  const list = document.getElementById("procedureList");
  list.innerHTML = "";
  if (!SELECTED_TOOTH) {
    return;
  }
  const tooth = findTooth(SELECTED_TOOTH);
  if (!tooth || tooth.procedures.length === 0) {
    list.innerHTML = "<i>işlem yok</i>";
    return;
  }
  tooth.procedures.forEach(p => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `\n<b>${p.type}</b>\n<br>\nstatus: ${p.status}\n`;
    list.appendChild(div);
  });
}

function getAdminToken() {
  const t = localStorage.getItem("adminToken") || localStorage.getItem("admin_token") || "";
  return t.startsWith("Bearer ") ? t : `Bearer ${t}`;
}

async function loadPatientFullRecord(patientId) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/patients/${patientId}/full-record`, {
      headers: { Authorization: getAdminToken() }
    });
    const json = await res.json();
    const data = json.data || json;
    const treatments = data.treatments || [];
    const diagnoses = data.diagnoses || [];
    const teethMap = {};
    treatments.forEach(t => {
      const toothId = t.tooth_number || t.toothNumber || t.tooth_id || t.toothId;
      if (!toothId) return;
      if (!teethMap[toothId]) {
        teethMap[toothId] = {
          toothId,
          procedures: [],
          diagnoses: []
        };
      }
      teethMap[toothId].procedures.push({
        id: t.id,
        type: t.procedure_name || t.type || "PROC",
        status: t.status || "PLANNED"
      });
    });
    diagnoses.forEach(d => {
      const toothId = d.tooth_number || d.toothNumber || d.tooth_id || d.toothId;
      if (!toothId) return;
      if (!teethMap[toothId]) {
        teethMap[toothId] = {
          toothId,
          procedures: [],
          diagnoses: []
        };
      }
      teethMap[toothId].diagnoses.push(d);
    });
    DATA = {
      patientId,
      teeth: Object.values(teethMap)
    };
    // Ensure all 32 FDI teeth exist
    const ALL_TEETH = [
      11,12,13,14,15,16,17,18,
      21,22,23,24,25,26,27,28,
      31,32,33,34,35,36,37,38,
      41,42,43,44,45,46,47,48
    ];
    ALL_TEETH.forEach(id => {
      if (!DATA.teeth.find(t => String(t.toothId) === String(id))) {
        DATA.teeth.push({
          toothId: id,
          procedures: [],
          diagnoses: []
        });
      }
    });
    console.log("Normalized teeth:", DATA.teeth.length);
    ensureAllTeethExist();
    if (typeof refreshBadgeAndColors === 'function') refreshBadgeAndColors();
    renderTeeth && renderTeeth();
  } catch(e) {
    console.error(e);
  }
}

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

function init(){
  const params = new URLSearchParams(window.location.search);
  const patientId = params.get("patientId") || localStorage.getItem("selected_patient_id") || "";
  if(!patientId) return; // silently wait — main HTML handles the "select patient" message
  loadPatientFullRecord(patientId);
}

init();
