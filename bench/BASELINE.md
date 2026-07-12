# Baseline benchmarks

- Date: 2026-07-12
- Machine: Apple M2 Max, macOS 25.2.0 (Darwin), Bun 1.3.7
- Commit: `b30ffe69fa24b72b8222cc31e420c19900a99ad3`

Generated via:

```bash
bun bench/gen-synthetic.ts   # bench/synthetic.md, 10 copies of test/exhaustive.md, ~25.6KB
```

## first-frame (headless interactive mount)

`bun bench/first-frame.tsx <doc>` — time from process start to first non-blank frame.

```bash
hyperfine -w 2 -r 10 \
  'bun bench/first-frame.tsx README.md' \
  'bun bench/first-frame.tsx test/exhaustive.md' \
  'bun bench/first-frame.tsx test/lang-parsers.md' \
  'bun bench/first-frame.tsx bench/synthetic.md'
```

| Command                                          |    Mean [ms] | Min [ms] | Max [ms] | Relative |
| :----------------------------------------------- | -----------: | -------: | -------: | -------: |
| `bun bench/first-frame.tsx README.md`            |  216.4 ± 8.4 |    209.4 |    234.2 |     1.08 |
| `bun bench/first-frame.tsx test/exhaustive.md`   | 240.8 ± 13.3 |    226.5 |    263.3 |     1.20 |
| `bun bench/first-frame.tsx test/lang-parsers.md` | 200.8 ± 24.9 |    182.7 |    266.1 |     1.00 |
| `bun bench/first-frame.tsx bench/synthetic.md`   | 771.5 ± 12.4 |    757.0 |    789.1 |     3.84 |

**Kill-switch check:** synthetic (771.5ms) vs README (216.4ms) → **3.57×**; vs
test/lang-parsers.md (fastest baseline, 200.8ms) → **3.84×**. Both clear the ~1.3×
threshold decisively — first-frame mount cost scales with doc size, so
progressive/chunked mounting is worth pursuing. Proceed with Task 2+.

## `--render` (one-shot ANSI dump, full process e2e)

```bash
hyperfine -w 2 -r 10 \
  './src/index.tsx --render test/exhaustive.md' \
  './src/index.tsx --render test/lang-parsers.md' \
  './src/index.tsx --render bench/synthetic.md'
```

| Command                                         |    Mean [ms] | Min [ms] | Max [ms] | Relative |
| :---------------------------------------------- | -----------: | -------: | -------: | -------: |
| `./src/index.tsx --render test/exhaustive.md`   |  391.4 ± 8.6 |    384.1 |    410.1 |     1.00 |
| `./src/index.tsx --render test/lang-parsers.md` |  462.5 ± 8.7 |    452.8 |    482.8 |     1.18 |
| `./src/index.tsx --render bench/synthetic.md`   | 892.2 ± 10.3 |    876.5 |    914.4 |     2.28 |

## `--render` with `FZF_PREVIEW_LINES=40` (fzf preview scenario)

Cap is **not implemented yet** (Task 6) — these numbers are pre-change and serve as the
comparison target once `capRows` lands: expect the synthetic-doc runtime to collapse
toward the lang-parsers.md runtime once rendering stops past ~40 rows.

```bash
hyperfine -w 2 -r 10 \
  'FZF_PREVIEW_LINES=40 ./src/index.tsx --render test/lang-parsers.md' \
  'FZF_PREVIEW_LINES=40 ./src/index.tsx --render bench/synthetic.md'
```

| Command                                                              |    Mean [ms] | Min [ms] | Max [ms] | Relative |
| :------------------------------------------------------------------- | -----------: | -------: | -------: | -------: |
| `FZF_PREVIEW_LINES=40 ./src/index.tsx --render test/lang-parsers.md` |  464.6 ± 8.6 |    451.0 |    481.9 |     1.00 |
| `FZF_PREVIEW_LINES=40 ./src/index.tsx --render bench/synthetic.md`   | 900.2 ± 18.8 |    879.3 |    926.4 |     1.94 |
