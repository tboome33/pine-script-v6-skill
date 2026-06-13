#!/usr/bin/env node
/**
 * fetch-pine-docs.mjs — download the Pine Script v6 reference (pineDocs.json)
 * from the upstream source into references/pineDocs.json.
 *
 * The reference data is NOT bundled in this repo (it originates from
 * TradingView's official Pine reference and is only redistributed by the
 * upstream MIT project). This script fetches it on demand, pinned to a known
 * commit, and verifies integrity (byte size + SHA-256) so the install is
 * deterministic and tamper-evident.
 *
 * USAGE
 *   node scripts/fetch-pine-docs.mjs          # fetch if missing (idempotent)
 *   node scripts/fetch-pine-docs.mjs --force  # re-download even if present
 *
 * EXIT: 0 on success (or already-present), non-zero on failure.
 *
 * To bump to a newer upstream revision: update PIN below (commit SHA),
 * then run with --force and refresh EXPECTED_BYTES / EXPECTED_SHA256 from the
 * script's own mismatch report.
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---- pin (single source of truth for the upstream revision) --------------
const UPSTREAM_REPO = 'tradesdontlie/pine-script-v6-extension';
const PIN = '053ebf7d338b4b2b1cd301cb1211d64743f8c7cd'; // commit SHA
const UPSTREAM_PATH = 'Pine_Script_Documentation/pineDocs.json';
const URL = `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${PIN}/${UPSTREAM_PATH}`;

// integrity — refuse to install anything that doesn't match byte-for-byte
const EXPECTED_BYTES = 1887562;
const EXPECTED_SHA256 = 'af9b1c64f49126c78763eddf8cdb607691ca5b24640836b1be563e3dc9f8c642';

// expected top-level shape, as a final sanity check
const EXPECTED_KEYS = [
  'types', 'methods', 'controls', 'variables', 'constants',
  'functions', 'operators', 'annotations', 'fields',
];

// ---- paths ---------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const REF_DIR = join(__dirname, '..', 'references');
const DEST = join(REF_DIR, 'pineDocs.json');

const force = process.argv.includes('--force');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function validate(buf, { fatal }) {
  const problems = [];
  if (buf.length !== EXPECTED_BYTES) {
    problems.push(`size ${buf.length} ≠ expected ${EXPECTED_BYTES}`);
  }
  const got = sha256(buf);
  if (got !== EXPECTED_SHA256) {
    problems.push(`sha256 ${got} ≠ expected ${EXPECTED_SHA256}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    problems.push(`not valid JSON: ${e.message}`);
  }
  if (parsed) {
    const missing = EXPECTED_KEYS.filter((k) => !(k in parsed));
    if (missing.length) problems.push(`missing top-level keys: ${missing.join(', ')}`);
  }
  if (problems.length && fatal) {
    console.error('✗ integrity check failed:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  return { ok: problems.length === 0, problems, parsed };
}

function countItems(parsed) {
  let n = 0;
  for (const k of EXPECTED_KEYS) {
    for (const w of parsed[k] || []) n += Array.isArray(w.docs) ? w.docs.length : 0;
  }
  return n;
}

// ---- already present? ----------------------------------------------------
if (existsSync(DEST) && !force) {
  const buf = readFileSync(DEST);
  const { ok, parsed } = validate(buf, { fatal: false });
  if (ok) {
    console.log(`✓ pineDocs.json already present and valid (${countItems(parsed)} built-ins). Use --force to re-download.`);
    process.exit(0);
  }
  console.log('• existing pineDocs.json is stale/corrupt — re-downloading…');
}

// ---- download ------------------------------------------------------------
console.log(`↓ fetching pineDocs.json from ${UPSTREAM_REPO}@${PIN.slice(0, 7)} …`);

let buf;
try {
  if (typeof fetch !== 'function') {
    console.error('✗ global fetch() unavailable — please use Node.js 18 or newer.');
    process.exit(1);
  }
  const res = await fetch(URL);
  if (!res.ok) {
    console.error(`✗ HTTP ${res.status} ${res.statusText} for ${URL}`);
    process.exit(1);
  }
  buf = Buffer.from(await res.arrayBuffer());
} catch (e) {
  console.error(`✗ network error: ${e.message}`);
  console.error(`  Manual fallback: download ${URL}`);
  console.error(`  and save it as references/pineDocs.json`);
  process.exit(1);
}

const { parsed } = validate(buf, { fatal: true });

if (!existsSync(REF_DIR)) mkdirSync(REF_DIR, { recursive: true });
writeFileSync(DEST, buf);
console.log(`✓ saved references/pineDocs.json (${buf.length} bytes, ${countItems(parsed)} built-ins, sha256 ok).`);
