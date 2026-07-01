# Solve report: rolling-restart-run4-passfail-discriminator-census

**Goal:** A bounded one-pass differential census over the EXISTING rolling-restart stat-gate report corpus (no new gates) decides whether any single structural feature separates PASS from FAIL runs at a pre-stated margin. Candidate features: which node becomes the CPU-pegged rejoiner, how many of the ~34 leaderships co-locate on that rejoiner, and whether the source-removal/REPLACE drain deadline (~120s) elapses. Terminal: EITHER a named discriminating feature with a pre-stated separation margin and its supporting run partition, OR an honest verdict that no single structural feature separates PASS from FAIL on the corpus, which escalates/abandons the run4 line rather than re-hunting.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: test-output/reports/passfail-discriminator-census.verdict.json

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-operation-drain
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-passfail-discriminator-census-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-passfail-discriminator-census-main
- No longer current: Kill-criterion fires: do NOT widen the feature list or resume per-witness patching. no-separator is a terminal verdict, not a trigger to re-hunt.

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 3
- Owner areas: scripts/census, test-output
- Categories: other
- Split plan:
  - scripts/census: 2 file(s)
  - test-output: 1 file(s)
- Signals: none

## Frontiers
- **rolling-restart-run4-passfail-discriminator-census-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **rolling-restart-run4-passfail-discriminator-census-main**: PRE-COMMIT (recorded BEFORE scoring any run, per constraint pre-commit-candidates-and-margin). Candidate structural features, exactly three, no additions allowed after scores are seen: (F1) rejoiner-node identity - the id of the node that rejoins as the CPU-pegged node in the run; (F2) leadership co-location count - how many partition leaderships pin on that rejoiner node at the drain window (of ~34 total); (F3) source-removal/REPLACE drain-deadline elapse - boolean, did the surplus-drain source-removal fail to complete within ~120s. SEPARATION MARGIN (pre-stated): a feature separates PASS from FAIL only if a single threshold/category split on it yields balanced accuracy >= 0.80 distinguishing FAIL from PASS across the corpus of runs where the feature is observable. Rationale: parent run4 CPU tail was chance-level (PASS 73.2 pct overlaps FAIL 74.9 pct, balanced accuracy ~0.5); 0.80 is strictly and materially better than that overlap. MINIMUM SAMPLE: report actual PASS-count and FAIL-count; if either observable class < 5 runs, the census outcome is 'insufficient-corpus' (still a terminal verdict, not a trigger to run new gates). One pass over the existing test-output/reports corpus only. (rules out: No feature may be added, swapped, or the 0.80 margin relaxed after scores are seen; no new gate/fast-local runs may be launched to enlarge the corpus.)
- **rolling-restart-run4-passfail-discriminator-census-main**: CENSUS RESULT (one pass over existing corpus, no new gates): verdict = no-separator. Corpus 133 reports -> 111 measured (46 PASS / 65 FAIL / 22 evidence-incomplete excluded); all 111 have observable playback snapshots. Scored the 3 pre-committed features from terminal playback snapshots (partitions[].leader_node_id over 34 partitions; replicaOperations residue). Results vs the pre-committed 0.80 balanced-accuracy margin: F2 leadership-concentration PASS mean 30.74/34 vs FAIL mean 30.89/34, best-split BA 0.551 (chance) -> DOES NOT separate; F3 drain-at-terminal degenerate (true both classes) BA 0.5; F1 rejoiner-identity best-node BA 0.508. KEY: the parent quest's assumed root cause (leaderships pin ~30/34 on one node) is REAL but occurs EQUALLY in PASS and FAIL, so it is a scenario property, not a failure predictor. run4 PASS/FAIL runs are structurally indistinguishable on the candidate features - corroborates the parent CPU-tail latency conclusion at the structural level. Artifact: test-output/reports/passfail-discriminator-census.verdict.json; scores: passfail-census-scores.json. (rules out: Kill-criterion fires: do NOT widen the feature list or resume per-witness patching. no-separator is a terminal verdict, not a trigger to re-hunt.)
- **rolling-restart-run4-passfail-discriminator-census-main**: VERDICT VERIFIED (constraint verdict-subagent-verification satisfied). Independent subagent ab293c630a2c6d8f1 re-derived all 111 rows from raw snapshots (not by re-running the producing script): reproduced F2 PASS mean 30.739 / FAIL mean 30.892 exactly, exhaustive threshold sweep in both directions max BA 0.551 (no split within 0.25 of the 0.80 margin), F3 fully degenerate (46/46 PASS and 65/65 FAIL drain>0), F1 dominated by node 7493b0ab (75/111) yet best-node BA 0.508. Partition honest: all 65 FAIL are real measured BLOCK_TOPOLOGY_CONVERGENCE(63)/FAIL_CORE_INVARIANT(2), zero INVALID-family leakage; 22 INVALID legitimately excluded as execution_incomplete/admission-infra. Scripts read-only, no new gates. Verdict no-separator is SOUND and safe to close on. [subagent:ab293c630a2c6d8f1; test-output/reports/passfail-discriminator-census.verdict.json; test-output/reports/passfail-census-scores.json]
- **rolling-restart-run4-passfail-discriminator-census-main**: Ingested evidence from passfail-discriminator-census.verdict.json. Metric: unknown -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/passfail-discriminator-census.verdict.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-01T06:33:31.991Z | rolling-restart-run4-passfail-discriminator-census-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/rolling-restart-run4-passfail-discriminator-census/census-analysis.diff |
