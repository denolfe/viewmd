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

## After (progressive rendering)

- Date: 2026-07-12
- Machine: Apple M2 Max, macOS 25.2.0 (Darwin), Bun 1.3.7 (same machine as baseline; idle)
- Commit: `5d7d867` (Task 6 complete — estimator, chunked Viewer mount, pending-jump
  completion, `--max-lines`/`FZF_PREVIEW_LINES` trigger, `renderAnsi` capRows slicing)

All Task-1 hyperfine commands re-run unmodified against `bench/synthetic.md` (regenerated
via `bun bench/gen-synthetic.ts`, unchanged content).

### first-frame (headless interactive mount)

| Command                                          |   Mean [ms] | Min [ms] | Max [ms] | Relative |  vs. baseline |
| :----------------------------------------------- | ----------: | -------: | -------: | -------: | ------------: |
| `bun bench/first-frame.tsx README.md`            | 210.8 ± 3.0 |    206.8 |    217.8 |     1.19 | −2.6% (noise) |
| `bun bench/first-frame.tsx test/exhaustive.md`   | 203.9 ± 5.0 |    200.0 |    217.3 |     1.15 |        −15.3% |
| `bun bench/first-frame.tsx test/lang-parsers.md` | 176.9 ± 3.1 |    174.3 |    184.5 |     1.00 |        −11.9% |
| `bun bench/first-frame.tsx bench/synthetic.md`   | 403.4 ± 3.4 |    399.1 |    409.1 |     2.28 |        −47.7% |

**Headline claim, partially met:** synthetic first-frame dropped 771.5ms → 403.4ms
(−47.7%), and the synthetic/README ratio flattened from **3.57×** to **1.91×**. That's a
real, large win, but the ratio does **not** collapse to ≈1× — synthetic is still ~2×
README, so first-frame mount cost still scales with doc size, just at roughly half the
baseline slope. `initialMountCount` mounts a fixed viewport-relative prefix (2× viewport
rows of low-biased estimates), so first-frame cost is bounded by viewport height, not doc
length, in principle — the residual scaling here is most likely paint/flushSync overhead
for the larger initial prefix itself (a 1638-line doc's low-biased 2×-viewport estimate
still selects more nodes than README's, since `sliceCountForRows` walks nodes until the
row estimate crosses the threshold, and denser docs pack more content into the same row
budget). exhaustive.md and lang-parsers.md, at README-ish scale, both got a real ~12–15%
(mount-graph-shape) speedup too — likely bench noise reduction from the removed React
reconciliation of the full unfiltered tree on first commit, since even they mount fewer
nodes than their earlier full-tree first paint.

### `--render` (one-shot ANSI dump, full process e2e) — uncapped, unchanged as expected

`renderAnsi`'s one-shot path doesn't go through the Viewer's chunked mount at all, so these
should be within noise of baseline:

| Command                                         |   Mean [ms] | Min [ms] | Max [ms] | Relative |  vs. baseline |
| :---------------------------------------------- | ----------: | -------: | -------: | -------: | ------------: |
| `./src/index.tsx --render test/exhaustive.md`   | 395.6 ± 4.3 |    389.8 |    400.8 |     1.00 | +1.1% (noise) |
| `./src/index.tsx --render test/lang-parsers.md` | 466.2 ± 5.1 |    459.8 |    477.2 |     1.18 | +0.8% (noise) |
| `./src/index.tsx --render bench/synthetic.md`   | 889.1 ± 7.7 |    879.8 |    900.4 |     2.25 | −0.3% (noise) |

Confirms the "uncapped `--render` unchanged" acceptance criterion — all three deltas are
inside baseline's own run-to-run variance.

### `--render` with `FZF_PREVIEW_LINES=40` (capRows trigger, Task 5/6)

| Command                                                              |   Mean [ms] | Min [ms] | Max [ms] | Relative | vs. baseline |
| :------------------------------------------------------------------- | ----------: | -------: | -------: | -------: | -----------: |
| `FZF_PREVIEW_LINES=40 ./src/index.tsx --render test/lang-parsers.md` | 351.8 ± 3.8 |    347.4 |    359.5 |     1.00 |       −24.3% |
| `FZF_PREVIEW_LINES=40 ./src/index.tsx --render bench/synthetic.md`   | 331.2 ± 4.6 |    326.4 |    340.5 |     1.06 |       −63.2% |

The pre-Task-6 note predicted the synthetic-doc runtime would collapse toward
lang-parsers.md's runtime once rendering stopped past ~40 rows — it did better than that:
capped synthetic (331.2ms) is now **faster** than capped lang-parsers (351.8ms), because
`capRows` bounds preload/highlight/slicing work by output rows rather than doc length, so
the larger doc no longer costs more once the cap is active. Both docs also dropped well
below their own uncapped numbers (466.2→351.8, 889.1→331.2), confirming the cap does
useful work beyond just skipping ANSI writes.

### CHUNK_SIZE tuning (16 vs 32 vs 64)

Method: a temporary `bench/total-mount.tsx` variant (removed before commit) looped
`renderOnce` on `bench/synthetic.md` until three consecutive captured char-frames were
identical, reporting elapsed time as a total-mount proxy — `bench/synthetic.md` has 859
top-level nodes and `initialMountCount` only mounts the first 45 at CHUNK_SIZE-independent
first paint, so full mount requires ⌈(859−45)/CHUNK_SIZE⌉ growth ticks (26 at 16, 13 at 32,
7 at 64), each a `setTimeout(0)`.

| CHUNK_SIZE | total-mount (3 runs)     | first-frame (3 runs, control) |
| ---------: | :----------------------- | :---------------------------- |
|         16 | 389.2 / 391.8 / 399.8 ms | 382.9 / 407.3 / 393.3 ms      |
|         32 | 396.3 / 398.7 / 404.3 ms | 397.3 / 393.6 / 390.3 ms      |
|         64 | 405.3 / 413.7 / 411.3 ms | 386.3 / 418.8 / 390.7 ms      |

No value produces a total-mount time meaningfully outside the ~390–415ms noise band —
`setTimeout(0)` ticks with no other event-loop work resolve fast enough (idle macrotask
turnaround, not the 0ms delay itself, dominates) that 7–26 extra ticks don't show up
against run-to-run jitter at this doc size. **Kept CHUNK_SIZE = 32** (no evidence to move
off it). Qualitatively: 16 yields ~2× more often during mount, so keyboard/scroll input
gets a scheduling opportunity roughly twice as often mid-mount (more responsive under
heavy input during the mount window); 64 yields half as often but finishes the same wall
time here since the JS scheduler isn't the bottleneck at these doc sizes. 32 is the
reasonable middle default; revisit with a doc an order of magnitude larger if
responsiveness during mount becomes a real complaint.

### Ship-gate assessment

- ✅ First-frame improved on exhaustive (−15.3%), lang-parsers (−11.9%), synthetic
  (−47.7%); README unchanged within noise (+2.6%, well under the 5% regression bar).
- ✅ `FZF_PREVIEW_LINES=40 --render` improved on lang-parsers (−24.3%) and synthetic
  (−63.2%).
- ✅ Uncapped `--render` unchanged (all three within ±1.1%, i.e. noise).
- ⚠️ **Headline claim not fully met:** synthetic first-frame is ~1.91× README, not ≈1×.
  Scaling flattened substantially (3.57× → 1.91×) but did not disappear. See the
  first-frame section above for the likely cause (initial-prefix size still scales with
  estimate density, not just viewport height).
