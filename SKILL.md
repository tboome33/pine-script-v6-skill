---
name: pine-script-v6
description: >-
  Author, debug, review, or migrate TradingView Pine Script v6 code —
  indicators, strategies, and libraries. Use whenever writing or fixing .pine
  code, when the user mentions Pine Script, TradingView indicators/strategies,
  `//@version=6`, or porting v5→v6. Provides an offline lookup of all 1100+
  built-ins (exact signatures, args, return types) so signatures are never
  guessed, a list of v6 gotchas, and a compile-verify loop against the
  TradingView MCP.
---

# Pine Script v6

Write correct Pine v6 **on the first pass** by grounding every built-in in real
signature data, then **verify against the live compiler**. The #1 cause of bad
LLM Pine code is hallucinated APIs (wrong function names, wrong arg order,
v5/v6 confusion) — this skill removes that failure mode.

Assets (read on demand, NOT all at once):
- `scripts/pine-lookup.mjs` — query the reference for any built-in.
- `scripts/fetch-pine-docs.mjs` — downloads `pineDocs.json` on demand.
- `references/pineDocs.json` — 1.8 MB; 1114 items (470 functions, 192 methods,
  196 constants, 146 variables, 56 types…). **Never read this file directly** —
  always go through the lookup script. **Fetched, not committed**: if the lookup
  script reports it's missing, run `node scripts/fetch-pine-docs.mjs` once.
- `references/v6-gotchas.md` — 6 deterministic analyzer rules + common pitfalls.
- `references/v5-to-v6-migration.md` — high-frequency v5→v6 changes.

## Workflow

### 1. Resolve APIs before writing (don't guess)
For any built-in you're not 100% sure of the signature for, look it up:
```bash
node ~/.claude/skills/pine-script-v6/scripts/pine-lookup.mjs ta.ema           # exact detail
node ~/.claude/skills/pine-script-v6/scripts/pine-lookup.mjs "request."        # list a namespace (trailing dot)
node ~/.claude/skills/pine-script-v6/scripts/pine-lookup.mjs security          # substring search
node ~/.claude/skills/pine-script-v6/scripts/pine-lookup.mjs ta.crossover --examples
```
It prints syntax, description, each arg (type / required / default), return
type, and see-also. Pay attention to arg **type qualifiers** (`simple int` vs
`series int`) — passing a `series` where `simple` is required won't compile.

### 2. Write, respecting v6 rules
Skim `references/v6-gotchas.md` once per session before writing non-trivial
code. The traps that bite most often:
- Logical ops are `and`/`or`/`not`, reassignment is `:=`, `var`/`varip` persist.
- Test na with `na(x)`, not `x == na`; fall back with `nz(x, d)`.
- **v6**: no implicit number→bool — write `count != 0`, not `if count`.
- Call `ta.*` every bar (not conditionally) to keep their history consistent.
- `plot*()`/`hline()`/`bgcolor()` are global-scope only.
- Array: guard `.first()/.last()` with a size check; `array.size(a)-1` is the
  last index; negative indices (`-1`) are valid in v6 within bounds.

### 3. Verify with the TradingView MCP (source of truth)
After writing, compile for real:
1. `pine_set_source` to load the code, then `pine_smart_compile`.
2. Read failures with `pine_get_errors`; read `log.*` output with `pine_get_console`.
3. Fix → recompile until clean.
4. Offline-only alternative when no chart/CDP is available: `pine_check`
   (lint) and `pine_analyze` (static) still work without a live connection.

### 4. Migration tasks
For v5→v6 ports, read `references/v5-to-v6-migration.md`, apply the checklist,
then lean on `pine_smart_compile` to surface the long tail.

## Safety (per global TradingView MCP rules)
- `pine_set_source` **overwrites** the current Pine Editor source. If the
  editor may hold unsaved work, `pine_save` first.
- Never call `tv_launch` reflexively: run `tv_health_check`; if CDP is down,
  check for a running TradingView process before launching (it kills + relaunches
  and loses unsaved layouts/replay/drafts). Ask before relaunching.

## Maintenance
`references/pineDocs.json` is fetched (not committed) from
`github.com/tradesdontlie/pine-script-v6-extension` (MIT, see
`references/UPSTREAM-LICENSE.txt`) by `scripts/fetch-pine-docs.mjs`, pinned to a
specific upstream commit and verified by size + SHA-256. To refresh from a newer
upstream revision: bump the `PIN` constant in that script, run it with `--force`,
and update the `EXPECTED_BYTES` / `EXPECTED_SHA256` constants from the mismatch
report it prints.
