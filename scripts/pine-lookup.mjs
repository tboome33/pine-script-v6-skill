#!/usr/bin/env node
/**
 * pine-lookup.mjs — query the bundled Pine Script v6 reference (pineDocs.json)
 * by name, namespace, or keyword WITHOUT loading the 1.8 MB blob into context.
 *
 * Data source: references/pineDocs.json (verbatim from
 * github.com/tradesdontlie/pine-script-v6-extension, MIT). 1114 documented
 * items: 470 functions, 192 methods, 196 constants, 146 variables, 56 types,
 * 22 operators, 19 controls, 10 annotations, 3 fields.
 *
 * USAGE
 *   node pine-lookup.mjs <query> [flags]
 *
 *   node pine-lookup.mjs ta.ema           # exact detail for one symbol
 *   node pine-lookup.mjs "ta."            # list every ta.* member (prefix)
 *   node pine-lookup.mjs ema              # substring search across all names
 *   node pine-lookup.mjs request.security # exact detail (full signature + args)
 *
 * FLAGS
 *   --examples     include full code example(s) in detail view
 *   --kind=K       restrict to one category: functions|methods|variables|
 *                  constants|types|operators|controls|annotations|fields
 *   --json         emit the raw matched JSON entry/entries (machine-readable)
 *   --names        list-mode: print only names (no syntax), one per line
 *
 * EXIT: 0 on hit, 1 when nothing matched (so callers can branch).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_PATH = join(__dirname, '..', 'references', 'pineDocs.json');

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')).map((a) => a.split('=')[0]));
const kindFlag = (argv.find((a) => a.startsWith('--kind=')) || '').split('=')[1] || null;
const query = argv.find((a) => !a.startsWith('--'));

if (!query) {
  console.error(
    'Usage: node pine-lookup.mjs <query> [--examples] [--kind=functions|methods|variables|constants|types|operators|controls|annotations|fields] [--json] [--names]\n' +
      'Examples:\n' +
      '  node pine-lookup.mjs ta.ema\n' +
      '  node pine-lookup.mjs "ta."        (trailing dot = list namespace)\n' +
      '  node pine-lookup.mjs security      (substring search)',
  );
  process.exit(2);
}

// ---- load + flatten ------------------------------------------------------
if (!existsSync(DOCS_PATH)) {
  console.error(
    'pineDocs.json is not installed (it is fetched on demand, not bundled).\n' +
      'Run:  node ' + join(__dirname, 'fetch-pine-docs.mjs'),
  );
  process.exit(2);
}
let raw;
try {
  raw = JSON.parse(readFileSync(DOCS_PATH, 'utf8'));
} catch (e) {
  console.error(`Cannot read ${DOCS_PATH}: ${e.message}\nTry re-fetching: node ${join(__dirname, 'fetch-pine-docs.mjs')} --force`);
  process.exit(2);
}

/** Flatten { category: [ { docs: [entry, ...] } ] } → [{...entry, _cat}]. */
const all = [];
for (const [cat, wrapperArr] of Object.entries(raw)) {
  if (!Array.isArray(wrapperArr)) continue;
  for (const wrapper of wrapperArr) {
    const docs = wrapper && wrapper.docs;
    if (!Array.isArray(docs)) continue;
    for (const entry of docs) {
      if (entry && typeof entry === 'object' && entry.name) {
        all.push({ ...entry, _cat: cat });
      }
    }
  }
}

const pool = kindFlag ? all.filter((e) => e._cat === kindFlag) : all;

// ---- helpers -------------------------------------------------------------
/** Strip Pine doc markdown link noise: [label](#anchor) → label. Tidy whitespace. */
function clean(s) {
  if (!s) return '';
  return String(s)
    .replace(/\[([^\]]+)\]\(#[^)]*\)/g, '$1') // [na](#var_na) -> na
    .replace(/\r/g, '')
    .trim();
}

function fmtArgs(args) {
  if (!Array.isArray(args) || args.length === 0) return '  (no parameters)';
  return args
    .map((a) => {
      const req = a.required ? 'required' : 'optional';
      const def = a.default !== null && a.default !== undefined ? ` = ${a.default}` : '';
      const type = a.displayType ? ` <${a.displayType}>` : '';
      const desc = clean(a.desc);
      return `  • ${a.name}${type} (${req}${def})${desc ? ` — ${desc}` : ''}`;
    })
    .join('\n');
}

function detail(e) {
  const lines = [];
  lines.push(`━━ ${e.name}  [${e.kind || e._cat}]`);
  const syntax = e.methodSyntax || e.syntax;
  if (syntax) lines.push(`SYNTAX:\n  ${clean(syntax).split('\n').join('\n  ')}`);
  if (e.desc) lines.push(`DESC:\n  ${clean(e.desc).split('\n').join('\n  ')}`);
  if (e.type || e.displayType) lines.push(`TYPE: ${e.displayType || e.type}`);
  if (e.args) lines.push(`ARGS:\n${fmtArgs(e.args)}`);
  const ret = e.returnedType || (Array.isArray(e.returnedTypes) ? e.returnedTypes.join(', ') : e.returns);
  if (ret) lines.push(`RETURNS: ${clean(typeof ret === 'string' ? ret : JSON.stringify(ret))}`);
  if (Array.isArray(e.seeAlso) && e.seeAlso.length) {
    lines.push(`SEE ALSO: ${e.seeAlso.map(clean).join(', ')}`);
  }
  if (flags.has('--examples') && e.examples) {
    lines.push(`EXAMPLE:\n${String(e.examples).replace(/\r/g, '')}`);
  }
  return lines.join('\n');
}

function listLine(e) {
  if (flags.has('--names')) return e.name;
  const syntax = e.syntax || e.methodSyntax || e.displayType || e.type || '';
  const oneLine = clean(syntax).split('\n')[0];
  return `  ${e.name.padEnd(34)} ${oneLine}`.trimEnd();
}

// ---- match strategy ------------------------------------------------------
const q = query.toLowerCase();
const isNamespaceList = query.endsWith('.'); // "ta." -> list members

let mode, hits;

if (isNamespaceList) {
  const prefix = q; // includes trailing dot
  hits = pool.filter((e) => e.name.toLowerCase().startsWith(prefix));
  mode = 'list';
} else {
  const exact = pool.filter((e) => e.name.toLowerCase() === q);
  if (exact.length) {
    hits = exact;
    mode = 'detail';
  } else {
    // substring across names, ranked: startsWith first, then includes
    const starts = pool.filter((e) => e.name.toLowerCase().startsWith(q));
    const incl = pool.filter(
      (e) => !e.name.toLowerCase().startsWith(q) && e.name.toLowerCase().includes(q),
    );
    hits = [...starts, ...incl];
    mode = hits.length === 1 ? 'detail' : 'list';
  }
}

if (!hits.length) {
  console.error(`No match for "${query}"${kindFlag ? ` in kind=${kindFlag}` : ''}.`);
  console.error('Try a substring (e.g. "ema"), a namespace ("ta."), or check spelling.');
  process.exit(1);
}

if (flags.has('--json')) {
  const out = hits.map(({ _cat, ...rest }) => rest);
  console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
  process.exit(0);
}

if (mode === 'detail') {
  console.log(hits.map(detail).join('\n\n'));
} else {
  hits.sort((a, b) => a.name.localeCompare(b.name));
  const header = isNamespaceList
    ? `${hits.length} member(s) of "${query}"`
    : `${hits.length} match(es) for "${query}" — pass an exact name for full detail`;
  if (!flags.has('--names')) console.log(header + '\n');
  console.log(hits.map(listLine).join('\n'));
}
process.exit(0);
