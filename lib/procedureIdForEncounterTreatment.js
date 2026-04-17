'use strict';

const crypto = require('crypto');

/** Namespace UUID — only used if callers need stable v5 for non-DB purposes */
const ENCOUNTER_PROCEDURE_TYPE_NAMESPACE = 'a3f2c8d1-5e4b-4c2a-9f01-7e8d6c5b4a39';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function namespaceToBuffer(namespaceUuid) {
  const hex = String(namespaceUuid).replace(/-/g, '');
  return Buffer.from(hex, 'hex');
}

function formatUuidFromBytes(b) {
  const h = Buffer.from(b).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** RFC 4122 UUID v5 from namespace + name (SHA-1). */
function uuidV5(name, namespaceUuid) {
  const ns = namespaceToBuffer(namespaceUuid);
  const n = Buffer.from(String(name), 'utf8');
  const hash = crypto.createHash('sha1').update(Buffer.concat([ns, n])).digest();
  const out = Buffer.alloc(16);
  hash.copy(out, 0, 0, 16);
  out[6] = (out[6] & 0x0f) | 0x50;
  out[8] = (out[8] & 0x3f) | 0x80;
  return formatUuidFromBytes(out);
}

/**
 * encounter_treatments.procedure_id — set only for a real UUID (FK to procedures.id).
 * Canonical type codes (FILLING, …) → omit column; use procedure_type only.
 * @returns {string|undefined}
 */
function procedureIdForEncounterTreatmentColumn(rawProcedureIdFromBody) {
  const raw =
    rawProcedureIdFromBody != null && rawProcedureIdFromBody !== ''
      ? String(rawProcedureIdFromBody).trim()
      : '';
  if (UUID_RE.test(raw)) return raw;
  return undefined;
}

module.exports = {
  procedureIdForEncounterTreatmentColumn,
  uuidV5,
  ENCOUNTER_PROCEDURE_TYPE_NAMESPACE,
};
