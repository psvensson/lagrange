# Solve report: leadership-flap-attribution-census

**Goal:** Every leadership owner-map flip in the retained rolling-restart playback corpus (stat-gate runs with snapshots.ndjson sidecars, esp. 20260702T075154Z and 20260701T133937Z) is classified by a read-only analyzer (scripts/analyze-leadership-flap.js, wired as npm run analyze:leadership-flap) into DELIBERATE_REPLACEMENT (gaining node is the target of an active REPLACE/REMOVE on that partition — the R1/R3 successor-election path), DELIBERATE_STEPDOWN_SUCCESSION (losing node is the source of an active REPLACE/REMOVE — handoff fallout), SPONTANEOUS_LIKELY (no active operation on the partition in the join window — only a timer election explains it), or AMBIGUOUS, with per-flip CPU context from samples.ndjson; and the aggregated verdict artifact answers the vetted attribution question — what fraction of the restart-target node's leadership RE-GAINS are spontaneous timer elections vs deliberate successions — thereby deciding whether the candidacy-reluctance/pre-vote levers have a target or are no-ops. Honest limits (snapshot resolution ~3s, geometry-based inference) are stated in the artifact. No new gates are run.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: test-output/reports/leadership-flap-attribution.verdict.json

**Attempts:** 0

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- parent quest: rolling-restart-core-stability

## Current Blocker
- Frontier: leadership-flap-attribution-census-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for leadership-flap-attribution-census-main

## Continuation
- Status: allowed
- Next action: continue supervised step for leadership-flap-attribution-census-main
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **leadership-flap-attribution-census-main** [open] rung 0, attempts 0, metric ? -> ?

## Findings
- **leadership-flap-attribution-census-main**: ATTRIBUTION ANSWERED: mostly-undirected. Across all 36 retained playback runs (387 owner-map flips; 30 bootstrap vacancy fills excluded): 160 leadership gains landed on nodes the machinery was actively draining, of which 109 (68%) are UNDIRECTED — 76 COUNTER_DELIBERATE_REGAIN (leadership returned to the very node an active REPLACE/REMOVE was draining on that partition; e.g. 075154Z-run1 seed 19e67de7 re-won sql_write_operations/control_plane_publications/sql_transactions at 66-90% CPU against its own active drains, one driver op finishing status=failed), 27 SPONTANEOUS_LIKELY (no active op on the partition; only a timer election explains it), 6 AMBIGUOUS — vs 51 (32%) deliberate R1/R3 successions. Adversarial verifier: analyzer FAITHFUL (frame ordering, op windows, dedup, precedence, aggregate math all recomputed; 6 flips ground-truthed 1:1 against raw snapshots+ops; zero op rows ever trimmed in this corpus so the trim blind spot never bites); attribution is CAUSAL not correlational for DELIBERATE_REPLACEMENT (requestElectionNow fires on the target; a target loss lands elsewhere, so misattribution only UNDERCOUNTS undirected); NO code path deliberately elects the drain source, so COUNTER=undirected is right; answer stable across join windows 5s/10s/30s (73%/72%/65% undirected). Verifier's two fixes applied (after_ready restart-boundary phase; fromNull segregation) plus docstring. CONSEQUENCE: candidacy-reluctance and pre-vote HAVE a real target (the 68%). DESIGN CONSTRAINT for the reluctance lever: after a step-down a log-behind replacement CANNOT win (raft vote rejection), so source reluctance must be conditioned on a caught-up peer existing (the step-down initiator knows follower match state) or it trades flap for leaderless windows. PASS/FAIL drain-gain rates are indistinguishable (PASS n=2 avg 5.0 vs FAIL n=33 avg 5.2) — the lever value is SETTLE-TIME (tail-shortening), not PASS-rate, consistent with the census and the Phi proof. [subagent:acb06cd121145aae3]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
