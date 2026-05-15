/**
 * Backend API origin for standalone admin (static site).
 *
 * Overrides (optional, set before this script loads):
 *   window.CLINIFLOW_API_BASE_URL
 *   <meta name="cliniflow-api-base" content="https://..." />
 *   window.__CLINIFLOW_RAILWAY_BACKEND__
 */
(function () {
  'use strict';
  var w = typeof window !== 'undefined' ? window : {};

  const API_BASE = 'https://cliniflow-backend-clean-production.up.railway.app';

  function stripTrailingSlash(s) {
    return String(s || '').replace(/\/+$/, '');
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
    if (typeof w.__CLINIFLOW_RAILWAY_BACKEND__ === 'string' && w.__CLINIFLOW_RAILWAY_BACKEND__.trim()) {
      return stripTrailingSlash(w.__CLINIFLOW_RAILWAY_BACKEND__);
    }
    var h = typeof w.location !== 'undefined' ? w.location.hostname : '';
    if (h === 'localhost' || h === '127.0.0.1') {
      return stripTrailingSlash('http://' + h + ':10000');
    }
    return stripTrailingSlash(API_BASE);
  }

  var cached = resolveOnce();

  w.API_BASE = cached;
  w.cliniflowApiBase = function () {
    return cached;
  };

  w.apiUrl = function (path) {
    var p = String(path || '');
    if (!p.startsWith('/')) p = '/' + p;
    return cached ? cached + p : p;
  };

  /** Same origin as API (login + JWT + admin routes). */
  w.CLINIFLOW_ADMIN_API_ORIGIN = cached;
})();
