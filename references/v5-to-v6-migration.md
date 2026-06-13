# Pine Script v5 → v6 migration

Grounded in the upstream extension's v6 surface (README + `test-v6-features.pine`)
and its static analyzer. **For the exhaustive official list, the live compiler
(`pine_smart_compile` via the TradingView MCP) is the source of truth** — these
are the high-frequency changes that matter when porting or writing fresh v6.

## 0. Declaration
```pine
//@version=6
indicator("My Script", overlay = true)   // or strategy(...)
```
The analyzer's v6-only rules key off `//@version=6` on the first non-comment line.

## 1. Implicit number→bool casts are gone (breaking)
v5 tolerated `if someInt`. **v6 requires an explicit comparison.**
```pine
int n = 5
if n          // ❌ v6 error / warning
if n != 0     // ✅
x ? a : b     // ❌ if x is int/float
x != 0 ? a : b // ✅
```

## 2. Dynamic requests (new capability)
`request.security()` (and siblings) now accept **series** symbol/timeframe
arguments and can run in **local scopes** (loops, ifs). v5 required const/simple.
```pine
symbols = array.from("AAPL", "GOOGL", "MSFT")
for sym in symbols
    price = request.security(sym, "1D", close)   // ✅ v6: series symbol in a loop
    log.info(sym + ": " + str.tostring(price))
```

## 3. Negative array indices (new)
```pine
last       = array.get(arr, -1)   // last element
secondLast = array.get(arr, -2)
```
Out of bounds only when `|index| > size`.

## 4. Short-circuit `and` / `or` (new)
The right operand is skipped when the left already decides the result — makes
the guard-then-access idiom safe and efficient:
```pine
if array.size(a) > 0 and array.first(a) > 0   // .first() not evaluated if empty
    ...
```

## 5. Enhanced text formatting (new)
- `text_size` accepts **exact point sizes** (e.g. `16`) instead of only
  `size.tiny/small/normal/large/huge`.
- `text_formatting = text.format_bold`, `text.format_italic`, combinable with `+`.
```pine
label.new(bar_index, high, "Bold & Italic",
          text_size = 18,
          text_formatting = text.format_bold + text.format_italic)
```

## 6. Logging functions (new)
`log.info(msg)`, `log.warning(msg)`, `log.error(msg)` — visible in the Pine Logs
pane. Great for debugging (`pine_get_console` reads them via MCP).

## 7. Enums (new)
```pine
enum Trend
    up
    down
    flat
Trend t = Trend.up
```
Enums get field completion and are usable in `switch`.

## 8. Strategy order trimming (behavior change)
v5 **errored** at 9000 trades. v6 **auto-trims the oldest orders** instead of
halting — long backtests no longer blow up, but be aware the oldest fills drop
out of `strategy.*` history.

## 9. Other v6 additions worth knowing
- Real-time **bid/ask** variables and **footprint** data access.
- Broadened text/table styling options.

---

## Porting checklist
1. Set `//@version=6`.
2. Grep for `if <number>` / `<number> ?` → add `!= 0`.
3. Confirm any `request.*` you *want* dynamic actually benefits; otherwise no change needed.
4. Replace manual "last element" math with `arr.get(-1)` / `arr.last()` where clearer.
5. Compile with `pine_smart_compile` and fix what the real compiler reports —
   it catches the long tail this doc doesn't enumerate.
