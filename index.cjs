/**
 * Render / npm start entry — implementation lives in cliniflow-backend/index.cjs
 * (repo root must expose index.cjs for `node index.cjs`).
 */
console.log("[cliniflow-admin] boot", {
  time: new Date().toISOString(),
  node: process.version,
  cwd: process.cwd(),
  port: process.env.PORT || "(unset)",
});
try {
  require("./cliniflow-backend/index.cjs");
} catch (err) {
  console.error("[cliniflow-admin] FATAL: failed to load cliniflow-backend/index.cjs");
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
