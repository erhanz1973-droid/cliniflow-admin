console.log("INIT TREATMENT MODULE LOADED");
// Page boot logic for Admin Treatment
async function init() {
    console.log("INIT() RUNNING");
  // ...existing code from admin-treatment.html...
  // After loading treatments, normalize teeth
  if (window.DATA && Array.isArray(window.DATA.teeth)) {
    window.normalizeTeethData();
    console.log("normalizeTeethData() called. DATA.teeth length:", window.DATA.teeth.length);
  }
}
window.init = init;

async function loadClinicName() {
  // ...existing code from admin-treatment.html...
}
window.loadClinicName = loadClinicName;

document.addEventListener("DOMContentLoaded", () => {
  init();
  loadClinicName();
});
// Page boot logic for Admin Treatment
async function init() {
  // ...existing code from admin-treatment.html...
}
async function loadClinicName() {
  // ...existing code from admin-treatment.html...
}
// Boot logic
window.addEventListener('DOMContentLoaded', init);
