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

| Command                                          |   Mean [ms] | Min [ms] | Max [ms] | Relative |
| :----------------------------------------------- | ----------: | -------: | -------: | -------: |
| `bun bench/first-frame.tsx README.md`            | 198.1 ± 6.6 |    191.5 |    215.5 |     1.03 |
| `bun bench/first-frame.tsx test/exhaustive.md`   | 201.8 ± 4.9 |    197.6 |    214.9 |     1.05 |
| `bun bench/first-frame.tsx test/lang-parsers.md` | 191.7 ± 4.5 |    187.7 |    201.5 |     1.00 |
| `bun bench/first-frame.tsx bench/synthetic.md`   | 290.5 ± 5.2 |    285.2 |    304.0 |     1.52 |

**Kill-switch check:** synthetic (290.5ms) vs README (198.1ms) → **1.47×**; vs
test/lang-parsers.md (fastest baseline, 191.7ms) → **1.52×**. Both clear the ~1.3×
threshold — first-frame mount cost scales with doc size, so progressive/chunked
mounting is worth pursuing. Proceed with Task 2+.

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
