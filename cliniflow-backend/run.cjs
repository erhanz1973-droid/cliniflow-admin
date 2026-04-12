#!/usr/bin/env node
/**
 * Production entry for Render (use: npm start, or `node run.cjs`).
 * Loads root ../index.cjs — no .env file required; platform env vars only in production.
 */
const path = require("path");
const fs = require("fs");

process.on("uncaughtException", (err) => {
  console.error("[cliniflow-backend] uncaughtException:", err && err.stack ? err.stack : err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[cliniflow-backend] unhandledRejection:", reason);
  process.exit(1);
});

console.log("[cliniflow-backend] run.cjs bootstrap (no .env file required on Render)");
console.log("[cliniflow-backend] cwd:", process.cwd());
console.log("[cliniflow-backend] __dirname:", __dirname);

if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch (_) {
    /* dotenv optional */
  }
}

const rootIndex = path.resolve(__dirname, "..", "index.cjs");
console.log("[cliniflow-backend] loading:", rootIndex);
console.log("[cliniflow-backend] root index exists:", fs.existsSync(rootIndex));

// Print first 300 chars of the file so we can verify which version is loaded
if (fs.existsSync(rootIndex)) {
  try {
    const head = fs.readFileSync(rootIndex, "utf8").slice(0, 300);
    const simLine = fs.readFileSync(rootIndex, "utf8").match(/SIM ENDPOINT v\d+[^\n]*/)?.[0] ?? "(not found)";
    console.log("[cliniflow-backend] index.cjs sim endpoint banner:", simLine);
  } catch (_) {}
}

if (!fs.existsSync(rootIndex)) {
  console.error(
    `[cliniflow-backend] FATAL: root server not found at:\n  ${rootIndex}\n` +
      "  Fix: In Render → Settings, set Root Directory to the monorepo root (folder that contains both index.cjs and cliniflow-backend/)."
  );
  process.exit(1);
}

console.log("==> CLINIFLOW BACKEND v7 — async sim jobs active");

try {
  require(rootIndex);
} catch (e) {
  console.error(
    "[cliniflow-backend] FATAL: failed to load root index.cjs (missing root npm deps? run npm install from repo root):",
    e && e.message ? e.message : e
  );
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
}
