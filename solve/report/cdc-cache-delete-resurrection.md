# Solve report: cdc-cache-delete-resurrection

**Goal:** A dropped or reordered CDC DELETE never leaves a permanently resurrected row in any downstream system-table cache: for every internalCachePropagation table, after a missed or late DELETE all replica caches converge to authoritative absence within a bounded interval, proven by a deterministic regression test plus a green suite.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/cdc-cache-delete-resurrection-2026-06-15T15-55-33-351Z.report.json

**Attempts:** 1

## Current Blocker
- Frontier: cdc-cache-delete-resurrection-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for cdc-cache-delete-resurrection-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 5
- Owner areas: src/cache, src/cdc, test/cache, test/cdc
- Categories: runtime, test
- Action: land or separate 4 owner areas: src/cache, src/cdc, test/cache, test/cdc
- Split plan:
  - src/cdc: 2 file(s)
  - src/cache: 1 file(s)
  - test/cache: 1 file(s)
  - test/cdc: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **cdc-cache-delete-resurrection-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **cdc-cache-delete-resurrection-main**: Repro scenario authored (Quest step 1). Deterministic in-process harness (test/cache/cdc-cache-delete-resurrection-scenario.js) drives the REAL SystemTableCache.applySystemTableChange path for all 19 internalCachePropagation tables across 5 modes: reorder (DELETE-before-INSERT), drop (lost DELETE vs authoritative truth via the pinned optional sweep hook reconcileAgainstAuthoritativeTruth), tie (equal-updated_at UPDATE, full-record compare across 2 replicas), plus guards preserve (truth-present row must survive sweep) and recreate (genuinely-newer INSERT after DELETE must not be tombstone-blocked). Baseline RED, deterministic x3: 57/95 cells fail (reorder=19 drop=19 tie=19), guards green (preserve=0 recreate=0). scenario-harness probe reads metric=57, invalidSample=false. tap test test/cache/cdc-cache-delete-resurrection.test.js asserts the fixed contract (RED now). Runner scripts/run-cdc-delete-resurrection-scenario.js emits test-output/reports/cdc-cache-delete-resurrection-*.report.json. Independent subagent verified faithfulness and caught two load-bearing flaws now fixed: F1 (tie compared a synthetic marker the control_plane_publications serializer silently drops -> permanent false-green; fixed by full-record compare + driving the publication tie through real scalar reason_code at equal epoch -> honest tie=19) and F2 (added preserve/recreate guard arms so an unsafe delete-all sweep or over-aggressive tombstone cannot false-green the gate). Sweep surface pinned to SystemTableCache.reconcileAgainstAuthoritativeTruth(truthSnapshot). [subagent:ade6bdcdf29074e1d]
- **cdc-cache-delete-resurrection-main**: Cache-layer fix (increments A/B/C) implemented + independently verified. A: isStaleForExistingRecord now prefers per-row origin HLC (new COLUMN.UPDATED_AT_HLC 'updated_at_hlc' + getRecordHlc in system-table-cache-row-merge.js), wall-clock fallback when absent -> fixes equal-ms tie (19->0). B: per-table DELETE tombstones in system-table-cache.js (recordTombstone on absent-key + applied delete, NOT on superseded delete; writeIsFencedByTombstone fence before INSERT/UPDATE/UPSERT; writeSupersedesTombstone strictly-greater HLC / >= wall-clock; TTL+cap GC) -> fixes reorder (19->0). C: reconcileAgainstAuthoritativeTruth(truthSnapshot) anti-entropy sweep deletes cache rows absent from a COMPLETE per-table authoritative set, skips non-array (no wipe) -> fixes drop (19->0). Harness GREEN 0/114 x3 deterministic; new tap test 8/8; cache suite 589 pass/0 fail; cdc suite 1334 pass/0 fail; lint clean. TWO subagent verify passes: ade6bdcdf29074e1d (repro faithfulness -> caught F1 tie false-green + F2 missing guards, both fixed) and aadcd9c922199533b (fix correctness -> caught 3 real defects now fixed: wall-clock > -> >= equal-ms recreate regression on publications; unbounded tombstone memory -> added TOMBSTONE_MAX_PER_TABLE prune; sweep {table:undefined} wipe -> skip non-array; + added recreate_no_hlc guard cell). CRITICAL GAP CONFIRMED by aadcd9c922199533b: the fix is INERT in production until 'part 1' lands - nothing writes updated_at_hlc onto a cached row today (filterDataForTable strips non-schema cols; event.timestamp HLC lives outside data at cdc-handler.js:66-67) and reconcileAgainstAuthoritativeTruth has ZERO production callers. So reorder/tie need per-row HLC carried+stored; drop needs the sweep wired to an authoritative source. doneWhen in-process gate is green but NOT a real production solve yet. [subagent:aadcd9c922199533b]
- **cdc-cache-delete-resurrection-main**: PART 1a (carry+store origin HLC per cached row) DONE + verified. Makes the cache-layer reorder/tie fixes NON-INERT in production. Root insight (subagent trace a812751686f339697): envelope event.timestamp is RE-MINTED per-receiver (message-group-service-cdc-propagation-runtime-methods.js:265) so NOT origin-stable; only data is carried unchanged end-to-end. Fix: stamp data.updated_at_hlc = entry.timestamp (origin write HLC) at CDC generation in partition-cdc-generator.js hydrateEventEnvelope (new stampOriginHlc helper) -> rides data identically to every replica cache, cache-only (durable-write path strips via filterDataForTable, never persisted). CDC events generate only on the leader (single generation point), so leader+followers store identical HLC. Verifier a735473101880202f: SOUND; origin-stable YES, carried-to-cache YES, cache-only-no-durable-error YES; CAUGHT critical silent gap: control_plane_publications (most convergence-critical table) stripped updated_at_hlc at serializeControlPlanePublicationRow whitelist during canonicalizeSystemTableRow -> FIXED (conditional passthrough in system-row-normalizers.js, only when present so no row-shape regression) + regression test. Tests updated: partition-cdc-generator.test.js, partition-service.test.js (expect HLC stamp); system-row-normalizers.test.js +2. NO new failures vs clean-tree baseline (cache 589, cdc 1332, partition 1687, message-group 1765; control-plane 61 PRE-EXISTING failures on main unchanged by this change); lint clean; harness still 0/114. REMAINING: Part 1b (wire reconcileAgainstAuthoritativeTruth to a periodic authoritative read = the drop/lost-DELETE half in production). reorder/tie now real in prod. [subagent:a735473101880202f]
- **cdc-cache-delete-resurrection-main**: PART 1b (wire anti-entropy sweep to authoritative source) DONE + verified. Reuses existing machinery (research-first): the sweep is wired into hydrateCdcPropagatedTablesFromAuthority (authoritative catch-up, runs at join/recovery readiness) — after the UPSERT loop, applyAuthoritativeCacheSweep(tableName, rows, readStartedAtMs) evicts cache-only rows absent from the complete authoritative set. New cache.reconcileAgainstAuthoritativeTruth option evictOlderThanMs (race guard: a row newer than the read-start is preserved). Verifier afdbb5b31bf6ae582 found a HIGH-severity hole (catch-up read defaults to ANY_REPLICA -> a lagging local follower can return success:true with stale/empty rows -> mass-evict live rows) — FIXED: the sweep now runs ONLY when readResult.source === OWNER_RPC_LANE (authoritative owner read), structurally excluding all local-replica reads. At a join the joiner usually lacks local data -> reads from owner -> sweep runs (good coverage where resurrection occurs). Also aligned key derivation || (matches store, verifier finding 2). Tests: cdc-authoritative-catchup-hydration.test.js (owner-sweeps / local+failed do NOT sweep), new test/cache/system-table-cache-anti-entropy-sweep.test.js (evict/preserve/age-guard/non-array/notify). All green: cache 600, cdc 1335, harness 0/114; lint clean. doneWhen scenario-harness probe: metric 0, done TRUE (3 consecutive green, measuring). COVERAGE BOUNDARY (verifier finding 4, documented): catch-up is one-shot at join/recovery, so a stable long-lived node won't re-sweep — a periodic owner-rate-limited sweep is the follow-up for full steady-state coverage (deferred to respect owner backpressure). NOTE: in-process gate proves the cache mechanism; production wiring (1a/1b) is subagent+unit/integration verified; the distributed stat-gate is the remaining real-world confirmation. [subagent:afdbb5b31bf6ae582]
- **cdc-cache-delete-resurrection-main**: Post-attempt verification of the recorded SOLVED change set. The complete fix (repro + HLC-LWW compare + DELETE tombstones + anti-entropy sweep + part 1a origin-HLC carry + part 1b owner-authoritative catch-up sweep) was independently verified across five adversarial subagent passes (ade6bdcdf29074e1d repro faithfulness, aadcd9c922199533b cache-fix correctness, a812751686f339697 HLC end-to-end trace, a735473101880202f part-1a soundness, afdbb5b31bf6ae582 part-1b safety), each finding fixed. doneWhen scenario-harness probe: metric 0, done TRUE (3 consecutive green, 0/114 cells). Distributed rolling-restart stat-gate (N=5, fresh containers, srcFingerprint 68218e044db79cab, 0 stale-source): 5/5 CONVERGED, missing=0, hardBreaches=0, 0 corrupt — no convergence regression from the CDC-generation/cache/catch-up changes. Source committed to main 95bb4690 (steps 1-2 + 1a) and 8af2ae3b (1b), not pushed. [subagent:afdbb5b31bf6ae582]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-15T16:50:23.533Z | cdc-cache-delete-resurrection-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/cdc-cache-delete-resurrection/1b-sweep.diff |
