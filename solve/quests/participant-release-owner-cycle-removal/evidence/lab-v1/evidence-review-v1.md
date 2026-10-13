# Release owner cycle removal: independent lab evidence audit V1

Verdict: **APPROVE the bounded lab evidence for non-main WIP preservation**. The four existing-owner regression files passed on the exact mechanical-consolidation input. This does not approve Quest closure, strict metrics, startup/application-barrier behavior, a larger composition, corpus proof, landing or main publication. The static receipt remains false.

## Input and custody binding

Candidate `b1d7116c11102725ce34f4d18021f924851b9efe`, tree `96dd319f69fda9f7c62d42c30a315ecd73c3ba0f`, parent `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`.

Audited archive: `solve/quests/participant-release-owner-cycle-removal/evidence/lab-v1/lab-result-v1.json`, SHA256 `b8c8791c074a6aa8eacf184166711adea45d7c6ac2af1342f9a31e95c0de4a81`. All 17 listed artifacts exist; every byte count and SHA256 matches. I read the two inputs, discovery/placement logs, raw stdout/stderr, status/result records, both NDJSON ledgers and the archived controller script. This reviewer performed no lab, test, checker or producer run and changed no implementation or acceptance record.

The frozen source manifest SHA256 `91a528e3b68647f0b1bd6a810ecc72296af89b2be9fd1a4b864c37efed81074a` and full diff SHA256 `df25d75371a39d3783d6c564ef86dc69b4fbea33cd337f792796c19d44cee59a` remain exact. All 11 immutable input blobs independently match that manifest. The prior bounded content approval is incorporated by its preserved report SHA256 `f32b20f994984989109e5754d49731585200fbe6ea683c40a18af0c6067dc4c8`; it is not rewritten or widened.

## Independent run reconciliation

| Physical host | Exact files | Runner assertions | Durations | Result |
| --- | --- | --- | --- | --- |
| lenovo-laptop | release-recovery; participant-release-protocol | 15 + 10 = 25 | 4715ms; 5990ms | both attempt 1, green |
| tv-dator | build-provenance; release-admission | 3 + 4 = 7 | 2311ms; 2405ms | both attempt 1, green |

For each host, requested files equal the classifier plan and the distinct ledger files. Input SHA/tree/host match the manifest. Raw `placement-head` is the candidate SHA. Raw `placement-results` rows equal the archived NDJSON and manifest records exactly. Both runner status and controller result are zero, reasons null, stderr empty, and every row has `attempt:1`, `retriedOnce:false`, `firstFailureLine:null`. Independently recomputed totals are **4 files, 4 green, 0 red, 32 runner assertions, 0 retries**; no planned file is missing.

The fleet snapshots identify separate physical hosts and Node v22.23.2, current installed dependency graphs, ready capability and a free lock at discovery. Their initial repository HEAD (`83a81f49...`) is capability information, not the tested input: the successful placement subsequently names `b1d7116c...`. The canonical placement source at that immutable input requires machine-wide and checkout `flock` locks before running (`scripts/lab/probe.js:1798-1858`) and retains them in the placement shell. Discovery alone is not treated as proof of a held execution lock.

Raw environment lines preserve ordinary classified jobs=4 with host factors 2.6/1.9, local placement mode and lane caps 7/11. Retry and explicit TAP-timeout overrides are empty. These are the canonical host runner settings, not evidence of changed application budgets. The reviewed test/assertion/fault/cleanup bodies are unchanged by this mechanical input.

## What the raw evidence proves and does not retain

The retained raw log is canonical classified-runner stdout, including placement provenance, file verdicts and complete result rows. The archive does not contain individual child TAP streams or per-assertion diagnostic payloads. Thus this audit reconciles file/runner outcomes; it does not claim to have independently reread every named assertion from child TAP. The archived controller script is a preserved execution source, not directly runnable from its archival directory without restoring its original relative module layout.

The immutable runner parser rejects skipped/todo assertions, incomplete/zero-assertion TAP, dropped unanalyzed bytes, process signals/nonzero exits and runner timeouts (`scripts/run-test-files.js:220-269,530-579`). Its SHA256 is `e77329663655d9b11c1d5398c4e19f043d328811f51154337d4efcb781aa6cc7`. The placement source SHA256 is `493381e074c12987446a27f4feb7a0385f6afea46e97fa41f4c826464f7e8b70`. Both read source files match the immutable input. This supports the green ledger semantics; it does not replace retained child TAP with an invented transcript.

No predecessor behavior measurement or source-revert negative is claimed. The unit preserves behavior and removes structural cycles through byte-equivalent moves; its existing-owner regression proof is a positive control. These four files do not certify remote multi-host protocol behavior, full startup, the separate applied-position barrier, all-corpus behavior or final integration.

## Static ceiling retained

The preserved scoped strict metrics remain RED: eight cyclomatic and one cognitive finding, equal in functions and values to the parent. Root's candidate literal report has 13 findings, and the parent report has the same 13 after ignoring relocated line/column positions. I independently compared the normalized rows; they are equal. Candidate literal SHA256 is `334ea1d67f104f480545d7d0a4a2a0243dc1acd80c1ac64eede3162eb4f54e75`; parent literal SHA256 is `5fcd1c01f22b89a717e2ee19e2e65173659e9278f535c78a3a2778cae0b080c6`.

The decision/silent reports have zero scoped findings. The ambient-intrinsics report scanned zero files; it is not a positive hostile-input coverage claim. No inherited red is waived and no threshold is increased. The earlier structural logs report zero cycles/dependency violations, but a shared static gate is not green merely because this subtraction improves that part of the graph.

No evidence correction is requested. The exact existing-owner locked-lab regression receipt may be projected true within this bounded unit. Any static/closure receipt requiring the remaining red audits must stay false; Quest/main/landing remain HOLD.
