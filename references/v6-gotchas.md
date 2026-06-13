# Pine Script v6 — gotchas & common mistakes

Two parts:
- **Part A** — the 6 static-analysis rules ported verbatim from the
  `pine-script-v6-extension` static analyzer (`src/PineStaticAnalyzer.ts`).
  These are *deterministic* checks the upstream tool runs on v6 code.
- **Part B** — broader Pine pitfalls that LLMs (and humans) hit constantly.

> The live compiler is the source of truth. After writing, always run
> `pine_smart_compile` (TradingView MCP) — these notes prevent the *common*
> errors so the first compile passes more often; they don't replace it.

---

## Part A — the 6 deterministic analyzer rules

All six only fire on `//@version=6` scripts.

### 1 & 2. Array index out of bounds (literal index) — **ERROR**

When the array size is known at declaration (`array.new<T>(N)` or
`array.from(a, b, c)`), a literal index `>= size` (or a negative index whose
absolute value `> size`) is out of bounds.

```pine
arr = array.new<float>(3)   // size 3 → valid indices 0,1,2 and -1,-2,-3
x = array.get(arr, 3)       // ❌ ERROR: index 3 out of bounds for size 3
y = array.get(arr, -4)      // ❌ ERROR: negative index -4 out of bounds for size 3
z = array.get(arr, -1)      // ✅ OK in v6: -1 is the last element
```

Note: **negative indices are a v6 feature** — `-1` = last, `-2` = second-to-last.
They're only an error when `|index| > size`.

### 3. Off-by-one with `array.size()` — **ERROR**

`array.size(a)` is the count, so it's never a valid index (valid range is
`0 .. size-1`). Using it directly indexes one past the end.

```pine
last = array.get(arr, array.size(arr))       // ❌ ERROR: off-by-one
last = array.get(arr, array.size(arr) - 1)   // ✅ correct
last = arr.get(arr.size() - 1)               // ✅ method syntax, correct
last = arr.last()                            // ✅ cleanest
```

### 4. Unguarded `.first()` / `.last()` — **WARNING**

Calling `array.first()` / `array.last()` (or `.first()`/`.last()` method form)
on an array that *may be empty* throws at runtime. Guard with a size check
within the preceding ~5 lines.

```pine
arr = array.new<float>()        // size 0 (unknown/empty)
v = array.last(arr)             // ⚠️ WARNING: array may be empty

if array.size(arr) > 0          // ✅ guard
    v := array.last(arr)
```

### 5. Loop-bound / array-size mismatch — **WARNING**

In `for i = 0 to N`, if `i` indexes an array but `N` is **not** derived from
that array's `size()`, you risk OOB.

```pine
for i = 0 to 10                 // ⚠️ bound 10 not tied to arr.size()
    x = array.get(arr, i)       //    flagged: possible OOB

for i = 0 to array.size(arr) - 1   // ✅ bound derived from the array
    x = array.get(arr, i)
```

(The analyzer also accepts a bound variable that was assigned from
`array.size(arr)` earlier.)

### 6. Implicit int/float → bool cast — **WARNING (v6-specific)**

**In Pine v6 you can no longer use a number directly where a bool is
expected.** Compare explicitly.

```pine
int count = 5
if count                        // ⚠️ WARNING: implicit bool cast
    ...
if count != 0                   // ✅ v6-correct
result = count ? a : b          // ⚠️ same issue in ternary
result = count != 0 ? a : b     // ✅
```

---

## Part B — broader Pine pitfalls LLMs hit

### Operators & syntax
- Logical operators are **`and` / `or` / `not`** — NOT `&&`, `||`, `!`.
- Declaration is `=`; **reassignment is `:=`**. `x = x + 1` on an existing
  var is wrong; use `x := x + 1`.
- `var x = 0` initializes **once** (persists across bars). `varip` persists
  across intrabar ticks too. Plain `x = 0` re-runs every bar.

### `na` handling
- Test for na with **`na(x)`**, never `x == na` (that's always `na`, not true/false).
- Use **`nz(x, default)`** to replace na with a fallback.

### Series / simple / const type qualifiers
- Many built-ins require a **`simple int`** (or const), not a `series`.
  E.g. `ta.ema(src, length)` — `length` must be simple. Passing a value that
  varies per bar fails to compile. Check the arg's `displayType` via the
  lookup script.

### `ta.*` consistency (a classic repaint/inconsistency bug)
- Call `ta.*` functions (e.g. `ta.rsi`, `ta.ema`, `ta.highest`) on **every
  bar**, in global/consistent scope — NOT conditionally inside an `if`.
  Calling them only on some bars corrupts their internal history.

```pine
// ❌ inconsistent history
if cond
    r = ta.rsi(close, 14)
// ✅ compute always, use conditionally
r = ta.rsi(close, 14)
if cond
    use(r)
```

### Plotting & global-scope-only calls
- `plot()`, `plotshape()`, `hline()`, `bgcolor()`, `barcolor()` can only be
  called from **global scope**, never inside `if`/`for`/functions. To
  conditionally plot, feed `na` or a condition into the value/color args.

### `request.security()` (repainting)
- Default behavior repaints. For non-repainting higher-timeframe data, the
  common idiom is `lookahead = barmerge.lookahead_off` plus indexing
  `[1]` on the expression, or `request.security(..., expression[barstate.isrealtime ? 1 : 0])`.
- **v6**: `request.*` now accepts **series** symbol/timeframe args and works in
  local scopes (dynamic requests).

### Strings & output
- Concatenate with `+`; convert with **`str.tostring(value, format)`**.
- `str.format("{0,number,#.##}", x)` for templated formatting.

### v6 feature surface (lean on these — they're new vs v5)
- **Enums** (`enum`) with field completion.
- **Negative array indices** (`array.get(a, -1)`).
- **Short-circuit** `and`/`or` (right side not evaluated if left decides).
- **Logging**: `log.info()`, `log.warning()`, `log.error()`.
- **Text formatting** options in labels/tables (bold/italic, sizes).
- Real-time **bid/ask** and footprint data variables.

### Limits worth remembering
- `max_bars_back`, `max_lines_count`, `max_labels_count`, `max_boxes_count`,
  `max_polylines_count` are set in the `indicator()`/`strategy()` declaration,
  not at use site. Default line/label/box budget is 50 — bump it if you draw
  many.
