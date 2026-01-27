// Suspended Clinic UI Handler
(function() {
  'use strict';
  
  function checkAndShowSuspendedUI(status) {
    const statusUpper = (status || "").toUpperCase();
    const suspendedNotice = document.getElementById("suspendedNotice");
    const suspendedStatusBadge = document.getElementById("suspendedStatusBadge");
    const mainContentBlur = document.getElementById("mainContentBlur");
    
    if (statusUpper === "SUSPENDED") {
      // Show suspended UI
      if (suspendedNotice) suspendedNotice.style.display = "block";
      if (suspendedStatusBadge) suspendedStatusBadge.style.display = "block";
      if (mainContentBlur) mainContentBlur.style.display = "block";
      
      // Blur main content areas
      const contentAreas = document.querySelectorAll('.card, .stats-grid, .upcoming-list');
      contentAreas.forEach(area => {
        area.style.filter = "blur(2px)";
        area.style.pointerEvents = "none";
        area.style.userSelect = "none";
      });
      
      // Disable navigation links (except logout)
      const navLinks = document.querySelectorAll('.nav-link');
      navLinks.forEach(link => {
        if (!link.onclick?.toString().includes('logout')) {
          link.style.pointerEvents = "none";
          link.style.opacity = "0.5";
        }
      });
      
      console.log("[SUSPENDED] Clinic is SUSPENDED - showing suspended UI");
    } else {
      // Hide suspended UI for active clinics
      if (suspendedNotice) suspendedNotice.style.display = "none";
      if (suspendedStatusBadge) suspendedStatusBadge.style.display = "none";
      if (mainContentBlur) mainContentBlur.style.display = "none";
      
      // Restore main content
      const contentAreas = document.querySelectorAll('.card, .stats-grid, .upcoming-list');
      contentAreas.forEach(area => {
        area.style.filter = "none";
        area.style.pointerEvents = "auto";
        area.style.userSelect = "auto";
      });
      
      // Enable navigation links
      const navLinks = document.querySelectorAll('.nav-link');
      navLinks.forEach(link => {
        link.style.pointerEvents = "auto";
        link.style.opacity = "1";
      });
      
      console.log("[SUSPENDED] Clinic is ACTIVE - normal UI");
    }
  }
  
  // Hook into the existing loadClinicInfo function
  const originalLoadClinicInfo = window.loadClinicInfo;
  if (typeof originalLoadClinicInfo === 'function') {
    window.loadClinicInfo = async function() {
      const result = await originalLoadClinicInfo.apply(this, arguments);
      
      // After the original function completes, check for suspended status
      try {
        const API = "https://cliniflow-admin.onrender.com";
        const token = localStorage.getItem("admin_token");
        if (token) {
          const res = await fetch(`${API}/api/admin/clinic`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            }
          });
          if (res.ok) {
            const data = await res.json();
            checkAndShowSuspendedUI(data.status);
          }
        }
      } catch (e) {
        console.error("[SUSPENDED] Error checking clinic status:", e);
      }
      
      return result;
    };
  }
  
  // Show suspended details modal
  window.showSuspendedDetails = function() {
    alert('Hesabınız askıya alınmıştır. Destek ekibimiz sizinle iletişime geçecektir.\n\nYour account has been suspended. Our support team will contact you.');
  };
  
  // Export for external use
  window.checkSuspendedStatus = checkAndShowSuspendedUI;
})();
