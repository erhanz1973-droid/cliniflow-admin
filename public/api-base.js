/**
 * Backend API origin for standalone admin (static site on Render, etc.).
 *
 * Override (any host):
 *   <script>window.CLINIFLOW_API_BASE_URL="https://your-api.example.com"</script> before this file
 *   or <meta name="cliniflow-api-base" content="https://your-api.example.com" />
 *
 * Railway backend (admin on Render, API on Railway):
 *   <script>window.__CLINIFLOW_RAILWAY_BACKEND__="https://YOUR-APP.up.railway.app"</script> before this file
 *   or <meta name="cliniflow-api-base" content="https://YOUR-APP.up.railway.app" />
 *
 * Defaults:
 *   localhost / 127.0.0.1 → http://<host>:10000
 *   cliniflow-admin.onrender.com → https://cliniflow-backend-dg8a.onrender.com (legacy: admin static → API on old Render backend)
 *   cliniflow-backend-*.onrender.com → https://cliniflow-admin.onrender.com (static HTML on backend → full admin API on admin service)
 */
(function () {
  'use strict';
  var w = typeof window !== 'undefined' ? window : {};

  var DEFAULT_BACKEND_RENDER = 'https://cliniflow-backend-dg8a.onrender.com';
  var DEFAULT_ADMIN_API_RENDER = 'https://cliniflow-admin.onrender.com';
  var RENDER_ADMIN_HOST = 'cliniflow-admin.onrender.com';

  function stripTrailingSlash(s) {
    return String(s || '').replace(/\/+$/, '');
  }

  /** Admin UI is served from backend static; Node routes like /api/admin/messages/* live on cliniflow-admin service. */
  function isBackendStaticUiHost(hostname) {
    var h = String(hostname || '');
    if (h === 'cliniflow-backend-dg8a.onrender.com') return true;
    return /^cliniflow-backend[a-z0-9-]*\.onrender\.com$/i.test(h);
  }

  function resolveOnce() {
    if (typeof w.CLINIFLOW_API_BASE_URL === 'string' && w.CLINIFLOW_API_BASE_URL.trim()) {
      return stripTrailingSlash(w.CLINIFLOW_API_BASE_URL);
    }
    var meta = typeof document !== 'undefined' ? document.querySelector('meta[name="cliniflow-api-base"]') : null;
    var fromMeta = meta && meta.getAttribute('content');
    if (fromMeta && String(fromMeta).trim()) {
      return stripTrailingSlash(fromMeta);
    }
    /** Set once when API is on Railway (public URL) and admin is on Render or another host. */
    if (typeof w.__CLINIFLOW_RAILWAY_BACKEND__ === 'string' && w.__CLINIFLOW_RAILWAY_BACKEND__.trim()) {
      return stripTrailingSlash(w.__CLINIFLOW_RAILWAY_BACKEND__);
    }
    var h = typeof w.location !== 'undefined' ? w.location.hostname : '';
    if (h === 'localhost' || h === '127.0.0.1') {
      return stripTrailingSlash('http://' + h + ':10000');
    }
    if (isBackendStaticUiHost(h)) {
      return stripTrailingSlash(DEFAULT_ADMIN_API_RENDER);
    }
    if (h === RENDER_ADMIN_HOST) {
      return stripTrailingSlash(DEFAULT_BACKEND_RENDER);
    }
    return '';
  }

  var cached = resolveOnce();

  w.cliniflowApiBase = function () {
    return cached;
  };

  w.apiUrl = function (path) {
    var p = String(path || '');
    if (!p.startsWith('/')) p = '/' + p;
    return cached ? cached + p : p;
  };

  /** Same origin as DEFAULT_ADMIN_API_RENDER — use in HTML fallbacks if this script is cached old. */
  w.CLINIFLOW_ADMIN_API_ORIGIN = DEFAULT_ADMIN_API_RENDER;
})();
