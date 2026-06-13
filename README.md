# Pine Script v6 — Claude Code Skill

A [Claude Code](https://docs.claude.com/en/docs/claude-code) skill for writing,
debugging, reviewing, and migrating **TradingView Pine Script v6** code.

Its job is to kill the #1 failure mode of LLM-generated Pine: **hallucinated
APIs** (wrong function names, wrong argument order, v5/v6 confusion). It does
that by giving the model an **offline, queryable reference of every Pine v6
built-in** plus a tight set of v6 gotchas — then defers to the live compiler
for the final word.

## What's inside

```
pine-script-v6/
├── SKILL.md                      # the skill entry point (workflow + rules)
├── scripts/
│   ├── pine-lookup.mjs           # query the reference without loading 1.8 MB into context
│   └── fetch-pine-docs.mjs       # download pineDocs.json on demand (integrity-checked)
└── references/
    ├── pineDocs.json             # ⤓ NOT committed — fetched by fetch-pine-docs.mjs (see Attribution)
    ├── v6-gotchas.md             # 6 deterministic analyzer rules + common pitfalls
    ├── v5-to-v6-migration.md     # high-frequency v5 → v6 changes
    └── UPSTREAM-LICENSE.txt       # MIT license of the data source
```

The bundled reference covers **1,114 items**: 470 functions, 196 constants,
192 methods, 146 variables, 56 types, 22 operators, 19 control keywords,
10 annotations, 3 fields.

## Why a lookup script instead of grep?

`references/pineDocs.json` is pretty-printed across ~43k lines. Grepping it is
noisy and burns context. `pine-lookup.mjs` parses it once and returns just the
entry you asked for — exact signature, typed arguments, return type, see-also,
and optionally the official code example.

## Installation

Requires [Node.js](https://nodejs.org) 18+ and Claude Code.

```bash
git clone https://github.com/tboome33/pine-script-v6-skill ~/.claude/skills/pine-script-v6
node ~/.claude/skills/pine-script-v6/scripts/fetch-pine-docs.mjs
```

The second step downloads the built-in reference (`pineDocs.json`, ~1.8 MB) from
the upstream source — it is **not** committed to this repo (see Attribution). The
download is pinned to a specific upstream commit and verified by byte size +
SHA-256, so the result is deterministic and tamper-evident. Re-run with `--force`
to refresh.

After that, Claude Code auto-discovers skills under `~/.claude/skills/`. The
skill triggers automatically when you work on `.pine` files or mention Pine
Script / TradingView indicators, and can also be invoked explicitly with
`/pine-script-v6`.

> Prefer a project-local install? Clone into `<your-project>/.claude/skills/`
> instead.

## Usage

The lookup script is the workhorse — use it directly or let the skill drive it:

```bash
# exact detail for one symbol
node ~/.claude/skills/pine-script-v6/scripts/pine-lookup.mjs ta.ema

# list every member of a namespace (note the trailing dot)
node ~/.claude/skills/pine-script-v6/scripts/pine-lookup.mjs "request."

# substring search across all names
node ~/.claude/skills/pine-script-v6/scripts/pine-lookup.mjs security

# include the official code example
node ~/.claude/skills/pine-script-v6/scripts/pine-lookup.mjs ta.crossover --examples
```

Flags: `--examples`, `--kind=functions|methods|variables|constants|types|operators|controls|annotations|fields`,
`--json` (machine-readable), `--names` (names only). Exit code `1` when nothing
matched, so callers can branch.

Example output:

```
━━ ta.ema  [Built-in Function]
SYNTAX:
  ta.ema(source, length) → series float
DESC:
  The ema function returns the exponentially weighted moving average...
ARGS:
  • source <series int|float> (required) — Series of values to process.
  • length <simple int> (required) — Number of bars (length).
RETURNS: float
SEE ALSO: ta.sma, ta.rma, ta.wma, ta.vwma, ta.swma, ta.alma
```

## How it fits a compile-verify loop

This skill makes the **first pass** correct (real signatures in, v6 rules
respected). It does **not** replace a real compiler. If you pair it with a
TradingView automation layer (e.g. an MCP server that exposes
`pine_smart_compile` / `pine_check`), the ideal loop is:

1. **Look up** unfamiliar built-ins → write code grounded in real signatures.
2. **Compile** for real → read errors.
3. **Fix** → repeat until clean.

The skill is the *upstream* knowledge; the compiler is the *downstream* source
of truth.

## The 6 deterministic rules (from `v6-gotchas.md`)

Ported verbatim from the upstream extension's static analyzer:

1. Array index out of bounds (literal index ≥ size) — **error**
2. Negative index out of bounds (`|index| > size`) — **error**
3. Off-by-one with `array.size()` used as an index — **error**
4. Unguarded `.first()` / `.last()` on a possibly-empty array — **warning**
5. Loop bound not derived from the indexed array's `size()` — **warning**
6. Implicit `int`/`float` → `bool` cast (v6 forbids it) — **warning**

## Attribution

`pineDocs.json` is **not redistributed in this repository**. It is fetched on
demand by `scripts/fetch-pine-docs.mjs`, directly from
[**tradesdontlie/pine-script-v6-extension**](https://github.com/tradesdontlie/pine-script-v6-extension)
(MIT — its license text is kept at `references/UPSTREAM-LICENSE.txt`), pinned to a
specific commit and integrity-checked (size + SHA-256). The 6 analyzer rules in
`v6-gotchas.md` are distilled from that project's static analyzer
(`src/PineStaticAnalyzer.ts`). The underlying built-in documentation originates
from TradingView's official
[Pine Script v6 reference](https://www.tradingview.com/pine-script-reference/v6/),
redistributed by the upstream project for offline/educational use.
**Pine Script® and TradingView® are trademarks of TradingView, Inc.** This skill
is unofficial and not affiliated with or endorsed by TradingView.

## License

MIT — see [LICENSE](LICENSE). The fetched `pineDocs.json` retains its original
MIT terms (`references/UPSTREAM-LICENSE.txt`).
