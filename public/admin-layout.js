/**
 * admin-layout.js — Clinifly Admin Shared Layout
 * Injects sidebar + topbar, handles auth, active nav, clinic name.
 * All labels are i18n-aware and update on language change.
 */
(function () {

  /** When admin HTML is on backend static but API lives on cliniflow-admin service (must match login + JWT_SECRET there). */
  var RENDER_ADMIN_API_FALLBACK =
    (typeof window !== 'undefined' && window.CLINIFLOW_ADMIN_API_ORIGIN) ||
    'https://cliniflow-admin.onrender.com';
  function isBackendUiHost() {
    var h = typeof location !== 'undefined' ? String(location.hostname || '') : '';
    return /^cliniflow-backend[a-z0-9-]*\.onrender\.com$/i.test(h);
  }
  /** Always hit the same API origin as admin-login (avoids 401 when token was signed on admin service). */
  function getStoredAdminToken() {
    try {
      return localStorage.getItem('adminToken') || localStorage.getItem('admin_token') || '';
    } catch (_) {
      return '';
    }
  }

  function adminFetchUrl(path) {
    var p = String(path || '');
    if (!p.startsWith('/')) p = '/' + p;
    var u;
    if (typeof apiUrl === 'function') {
      u = apiUrl(p);
      if (String(u).indexOf('http') === 0) return u;
      if (isBackendUiHost() && (u === p || (u && u.charAt(0) === '/'))) {
        return String(RENDER_ADMIN_API_FALLBACK).replace(/\/+$/, '') + p;
      }
      return u;
    }
    if (typeof cliniflowApiBase === 'function') {
      var b = cliniflowApiBase();
      if (b) return String(b).replace(/\/+$/, '') + p;
    }
    if (isBackendUiHost()) return String(RENDER_ADMIN_API_FALLBACK).replace(/\/+$/, '') + p;
    return p;
  }

  /* ── Navigation items (key maps to dashboard.nav.{key}) ────── */
  const NAV = [
    { href: '/admin.html', icon: iconGrid(),     key: 'dashboard' },
    { href: '/admin-patients.html',  icon: iconUsers(),    key: 'patients',  badge: 'sbPatients' },
    { href: '/admin-treatment.html', icon: iconTooth(),    key: 'treatment' },
    { href: '/admin-schedule.html',  icon: iconCal(),      key: 'schedule' },
  ];
  const NAV2 = [
    { href: '/admin-doctor-applications-v2.html', icon: iconDoctor(), key: 'doctors', badge: 'sbDoctors' },
    { href: '/admin-chat.html',     icon: iconChat(),     key: 'chat',    badge: 'sbChat' },
    { href: '/admin-leads.html',     icon: iconInbox(),    key: 'leads' },
    { href: '/admin-files.html',    icon: iconFiles(),    key: 'files' },
    { href: '/admin-referrals.html', icon: iconReferrals(), key: 'referrals', badge: 'sbReferrals' },
    { href: '/admin-settings.html', icon: iconSettings(), key: 'settings' },
  ];

  /* ── i18n helper ─────────────────────────────────────────────── */
  function tn(key) {
    if (window.i18n && typeof window.i18n.t === 'function') return window.i18n.t(key);
    // Fallbacks
    const fallbacks = {
      'dashboard.nav.dashboard': 'Dashboard', 'dashboard.nav.patients': 'Patients',
      'dashboard.nav.treatment': 'Treatments', 'dashboard.nav.schedule': 'Calendar',
      'dashboard.nav.doctors': 'Doctors', 'dashboard.nav.chat': 'Messages', 'dashboard.nav.leads': 'Leads / Unassigned',
      'dashboard.nav.files': 'Files', 'dashboard.nav.referrals': 'Referrals', 'dashboard.nav.settings': 'Settings',
      'dashboard.sidebar.mainMenu': 'Main Menu', 'dashboard.sidebar.management': 'Management',
      'dashboard.sidebar.logout': 'Logout', 'dashboard.sidebar.clinic': 'Clinic',
    };
    return fallbacks[key] || key.split('.').pop();
  }

  /* ── SVG Icons ─────────────────────────────────────────────── */
  function svg(d, extra) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra||''}>${d}</svg>`;
  }
  function iconGrid()     { return svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'); }
  function iconUsers()    { return svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'); }
  function iconTooth()    { return svg('<path d="M12 2C9.2 2 7 4.2 7 7c0 1.5.6 2.8 1.4 3.8-.2 1.2-.4 2.5-.4 3.2 0 3.3 1.3 5 2.5 5s2-1.2 2-2.4c0-.8-.5-1.8-.5-1.8s-.5 1-.5 1.8c0 .9-.4 1.4-1 1.4S9 16.8 9 14c0-.8.2-2 .4-3.2C10 11.7 10.7 13 12 13s2.1-.3 2.6-2.2c.2 1.1.4 2.2.4 3.2 0 2.8-.8 5-2 5s-1-.5-1-1.4c0-.8-.5-1.8-.5-1.8s-.5 1-.5 1.8c0 1.2 1 2.4 2 2.4s2.5-1.7 2.5-5c0-.8-.2-2-.4-3.2C15.4 9.8 16 8.5 16 7c0-2.8-1.8-5-4-5z"/>'); }
  function iconCal()      { return svg('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'); }
  function iconDoctor()   { return svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'); }
  function iconChat()     { return svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'); }
  function iconInbox()    { return svg('<polyline points="22 12 18 12 15 21 9 21 6 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'); }
  function iconSettings() { return svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'); }
  function iconFiles()    { return svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'); }
  /** Referrals / invite network */
  function iconReferrals() {
    return svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>');
  }
  function iconLogout()   { return svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'); }

  /* ── Build nav item HTML ──────────────────────────────────── */
  function navItem(item, active) {
    const cls = active ? 'al-nav-item active' : 'al-nav-item';
    const badge = item.badge ? `<span class="al-nav-badge" id="${item.badge}"></span>` : '';
    return `<a href="${item.href}" class="${cls}" data-nav-key="${item.key}">
      <span class="al-nav-icon">${item.icon}</span>
      <span class="al-nav-label">${tn('dashboard.nav.' + item.key)}</span>
      ${badge}
    </a>`;
  }

  /* ── Build full sidebar HTML ─────────────────────────────── */
  function buildSidebar(currentHref) {
    const nav1 = NAV.map(i => navItem(i, currentHref.endsWith(i.key) || currentHref.includes(i.href.replace('/', '')))).join('');
    const nav2 = NAV2.map(i => navItem(i, currentHref.endsWith(i.key) || currentHref.includes(i.href.replace('/', '')))).join('');
    return `
      <a href="/admin.html" class="al-logo" style="text-decoration:none;">
        <div class="al-logo-icon">🦷</div>
        <div>
          <div class="al-logo-brand">Clinifly</div>
          <div class="al-logo-clinic" id="alClinicName">${tn('dashboard.sidebar.clinic')}</div>
        </div>
      </a>
      <nav class="al-nav">
        <div class="al-nav-section" id="alNavSection1">${tn('dashboard.sidebar.mainMenu')}</div>
        ${nav1}
        <div class="al-nav-section" id="alNavSection2" style="margin-top:14px;">${tn('dashboard.sidebar.management')}</div>
        ${nav2}
      </nav>
      <div class="al-sidebar-footer">
        <button class="al-logout-btn" id="alLogoutBtn" onclick="window.__alLogout()">
          <span class="al-nav-icon">${iconLogout()}</span>
          <span id="alLogoutLabel">${tn('dashboard.sidebar.logout')}</span>
        </button>
      </div>
    `;
  }

  /* ── Update sidebar labels (called on language change) ───── */
  function updateSidebarLabels() {
    // Nav item labels
    document.querySelectorAll('.al-nav-item[data-nav-key]').forEach(el => {
      const key = el.getAttribute('data-nav-key');
      const labelEl = el.querySelector('.al-nav-label');
      if (labelEl) labelEl.textContent = tn('dashboard.nav.' + key);
    });
    // Section headers
    const s1 = document.getElementById('alNavSection1');
    if (s1) s1.textContent = tn('dashboard.sidebar.mainMenu');
    const s2 = document.getElementById('alNavSection2');
    if (s2) s2.textContent = tn('dashboard.sidebar.management');
    // Logout
    const logoutLabel = document.getElementById('alLogoutLabel');
    if (logoutLabel) logoutLabel.textContent = tn('dashboard.sidebar.logout');
  }

  /* ── Build topbar HTML ───────────────────────────────────── */
  function buildTopbar(pageTitle) {
    return `
      <div class="al-topbar-left">
        <span class="al-page-title" id="alPageTitle">${pageTitle}</span>
      </div>
      <div class="al-topbar-right">
        <div class="al-lang" id="alLang">
          <span id="lang-tr" onclick="if(window.onLanguageChange)window.onLanguageChange('tr')">TR</span>
          <span id="lang-en" onclick="if(window.onLanguageChange)window.onLanguageChange('en')">EN</span>
          <span id="lang-ru" onclick="if(window.onLanguageChange)window.onLanguageChange('ru')">RU</span>
          <span id="lang-ka" onclick="if(window.onLanguageChange)window.onLanguageChange('ka')">KA</span>
        </div>
      </div>
    `;
  }

  /* ── Inject layout ───────────────────────────────────────── */
  function inject() {
    // Auth guard (must match admin.html: adminToken OR admin_token)
    const token = getStoredAdminToken();
    const p = window.location.pathname || '';
    if (!token && !p.includes('login') && !p.includes('register')) {
      window.location.href = '/admin-login.html';
      return;
    }

    // Already injected?
    if (document.getElementById('alSidebar')) return;

    const href = window.location.pathname;
    const pageTitle = document.title.replace(/ ?[-–|] ?Clinifly.*/i, '').replace(/🦷\s*/,'').trim() || 'Admin';

    // Create sidebar
    const sidebar = document.createElement('aside');
    sidebar.className = 'al-sidebar';
    sidebar.id = 'alSidebar';
    sidebar.innerHTML = buildSidebar(href);

    // Create topbar
    const topbar = document.createElement('header');
    topbar.className = 'al-topbar';
    topbar.id = 'alTopbar';
    topbar.innerHTML = buildTopbar(pageTitle);

    // Create main wrapper
    const main = document.createElement('div');
    main.className = 'al-main';
    main.id = 'alMain';

    // Move existing body children into main
    while (document.body.firstChild) {
      main.appendChild(document.body.firstChild);
    }

    // Prepend topbar inside main
    main.insertBefore(topbar, main.firstChild);

    // Add sidebar + main to body
    document.body.appendChild(sidebar);
    document.body.appendChild(main);
    document.body.classList.add('al-ready');

    // Load clinic name
    loadClinicName();

    // Start unread badge polling
    startBadgePolling();

    // Hook into i18n updates to refresh sidebar labels
    const prevOnI18nUpdated = window.onI18nUpdated;
    window.onI18nUpdated = function () {
      updateSidebarLabels();
      if (typeof prevOnI18nUpdated === 'function') prevOnI18nUpdated();
    };
  }

  /* ── Load clinic name ────────────────────────────────────── */
  async function loadClinicName() {
    try {
      const token = getStoredAdminToken();
      if (!token) return;
      const res = await fetch(adminFetchUrl('/api/admin/clinic'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        const name = d.branding?.clinicName || d.name || tn('dashboard.sidebar.clinic');
        const el = document.getElementById('alClinicName');
        if (el) el.textContent = name;
      } else if (res.status === 401 && typeof window.handle401 === 'function') {
        window.handle401(401);
      }
    } catch (_) {}
  }

  /* ── Logout ──────────────────────────────────────────────── */
  window.__alLogout = function () {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('admin_token');
    localStorage.removeItem('selected_patient_id');
    window.location.href = '/admin-login.html';
  };

  /* ── Global 401 handler — call after any failing fetch ───── */
  window.handle401 = function (status) {
    if (status === 401) {
      var p = (typeof location !== 'undefined' && location.pathname) ? location.pathname : '';
      if (p.includes('admin-login.html')) return false;
      console.warn('[AUTH] 401 — token geçersiz veya süresi dolmuş, login sayfasına yönlendiriliyor.');
      localStorage.removeItem('adminToken');
      localStorage.removeItem('admin_token');
      window.location.href = '/admin-login.html?reason=session_expired';
      return true;
    }
    return false;
  };

  /* ── Unread chat badge polling ───────────────────────────── */
  function updateChatBadge(count) {
    const el = document.getElementById('sbChat');
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : String(count);
      el.style.display = 'inline-flex';
    } else {
      el.style.display = 'none';
    }
  }

  /** Bekleyen doktor başvuruları (Doktorlar menüsü — #sbDoctors) */
  function updateDoctorsBadge(count) {
    const el = document.getElementById('sbDoctors');
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : String(count);
      el.style.display = 'inline-flex';
    } else {
      el.style.display = 'none';
    }
  }

  function updateReferralsBadge(count) {
    const el = document.getElementById('sbReferrals');
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : String(count);
      el.style.display = 'inline-flex';
    } else {
      el.style.display = 'none';
    }
  }

  async function pollUnreadCount() {
    try {
      const token = getStoredAdminToken();
      if (!token) return;
      const res = await fetch(adminFetchUrl('/api/admin/messages/unread-counts?totalOnly=1'), {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!res.ok) {
        if (res.status === 401 && typeof window.handle401 === 'function') window.handle401(401);
        return;
      }
      const data = await res.json();
      if (!data.ok) return;
      const total = Number(data.total || 0);
      updateChatBadge(total);
    } catch (_) {}
  }

  async function pollPendingReferrals() {
    try {
      const token = getStoredAdminToken();
      if (!token) return;
      const res = await fetch(adminFetchUrl('/api/admin/referrals?status=PENDING'), {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        cache: 'no-store'
      });
      if (!res.ok) {
        if (res.status === 401 && typeof window.handle401 === 'function') window.handle401(401);
        return;
      }
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : (Array.isArray(data.referrals) ? data.referrals : []);
      updateReferralsBadge(items.length);
    } catch (_) {}
  }

  async function pollPendingDoctorApplications() {
    try {
      const token = getStoredAdminToken();
      if (!token) return;
      // admin-doctor-applications-v2.html ile aynı kaynak (clinic_code); /api/admin/doctors clinic_id kullanır, sayım sapabilir.
      const res = await fetch(adminFetchUrl('/admin/doctor-list'), {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!res.ok) {
        if (res.status === 401 && typeof window.handle401 === 'function') window.handle401(401);
        return;
      }
      const data = await res.json();
      if (!data.ok) return;
      const doctors = Array.isArray(data.doctors) ? data.doctors : [];
      const pending = doctors.filter(function (d) {
        return String(d.status || '').toUpperCase() === 'PENDING';
      }).length;
      updateDoctorsBadge(pending);
    } catch (_) {}
  }

  function startBadgePolling() {
    pollUnreadCount();
    pollPendingDoctorApplications();
    pollPendingReferrals();
    setInterval(function () {
      if (typeof document !== 'undefined' && document.hidden) return;
      pollUnreadCount();
      pollPendingDoctorApplications();
      pollPendingReferrals();
    }, 45000);
  }

  /* ── Run ─────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      pollUnreadCount();
      pollPendingDoctorApplications();
      pollPendingReferrals();
    }
  });

})();
