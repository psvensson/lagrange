# Solve report: raft-candidacy-reluctance-drain-source

**Goal:** A raft replica that is deliberately stepped down for drain (requestTrackedPartitionLeaderHandoff) becomes candidacy-RELUCTANT for a bounded window: its randomized election timeout is inflated by a finite multiplier (unconditional, no env flag), so it stops re-winning the successor election ahead of caught-up peers — the 68%-undirected re-gain waste measured by leadership-flap-attribution-census — while (a) liveness is preserved unconditionally (finite inflation: if no peer can win, the reluctant node still campaigns within the window), (b) the deliberate R1/R3 replacement-election path is untouched (requestElectionNow passes an explicit 1ms duration that bypasses timeout()), and (c) raft safety is untouched (no vote/term/log logic changes). Proven deterministically on the DT6 real-liferaft substrate with seeded election RNG: red-on-revert seed sweep where the stepped-down leader re-wins WITHOUT the lever and never re-wins ahead of a live caught-up peer WITH it, plus a liveness case (no viable peer -> reluctant node still becomes leader), plus subagent verification. No Docker gates; value is settle-time tail-shortening per the attribution census.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/raft-candidacy-reluctance-drain-source.json

**Attempts:** 0

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- parent quest: rolling-restart-core-stability

## Current Blocker
- Frontier: raft-candidacy-reluctance-drain-source-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for raft-candidacy-reluctance-drain-source-main

## Continuation
- Status: allowed
- Next action: continue supervised step for raft-candidacy-reluctance-drain-source-main
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **raft-candidacy-reluctance-drain-source-main** [open] rung 0, attempts 0, metric ? -> ?

## Findings
- **raft-candidacy-reluctance-drain-source-main**: SHIPPED + verified: deferCandidacy() lever in src/raft/liferaft.js (4x election-delay inflation, 10s window, node-local clock) wired into the sole raft leader step-down path (requestTrackedPartitionLeaderHandoff). DT6 proof deterministic red-on-revert (dt:prove artifact 2026-07-03T07-59Z: GREEN/RED/GREEN; revert-red on seeds 1035/1105/1126/1133 of a 20-seed sweep — the drained leader re-wins without the lever, never with it). Liveness/bypass/window-lapse scenarios green; raft 707/707 + handoff 37/37 + convergence 683 green. Adversarial verifier FAITHFUL on all six areas (raft safety untouched, worst sole-successor latency bounded ~16s, reluctant node grants votes at normal speed, wiring complete — formation-time startElection sites correctly NOT deferred, requestElectionNow bypass proven). Design insight banked: the test's fresh peer re-arm at step-down is the adversarial-WORST race for the lever; production mid-flight peer timers win a fortiori. [subagent:a5622c206079c332f]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
