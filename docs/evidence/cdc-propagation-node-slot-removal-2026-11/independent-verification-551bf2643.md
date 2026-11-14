---
audience: evidence
recorded: 2026-11-14
quest: cdc-propagation-node-slot-removal
---

# Independent Verification of 551bf2643

VERDICT: REJECT 551bf2643964491b9c1c6364de82ab8504f731e6

Tip e40ee79d8 changes only `log.ndjson`. Reproducers and mutant patches: `/mnt/data/peter/projects/lagrange-foundation-coordination-20261114/slot-removal/verify-counterexamples/`; lab evidence: `verify-*` beside it.

## Blocking

**B1 (vii, viii; new mechanism).** `cdc-group-propagation-durable-delivery.js:171,177,110-119`: `refusals` keeps each leaf's last observation only. A leaf attempted with a genuine failure (unknown answer, timeout, closed connection: sent, effect possible) and refused by typed backpressure in a later foreground attempt of the same wave (`message-group-cdc-committed-acceptance.js:126,295`, queue rejection, governor defer) makes the wave answer BACKPRESSURE. The lane keeps its window and, with no coverage, re-captures the tail: a longer vector after an attempted range. Base: unknown, window halves. Every fixture pins `deliveryRetryMaxAttempts: 1` (harness:280; fixture:85,263); production runs 3. C1 (4 cases) and C1b (window 4 / 20 ms instead of 2 / 50 ms) red: e9772151, 84ad5148.

**B2 (iii, viii; new shape of the base guard).** `partition-cdc-obligation-range.js:236-238` via `-delivery.js:399` releases the tail while `scan.provisional`; the base kept it (`yielded/OnContention && !scan.provisional`). C2: base [B][A][C][D] green (a364e081); candidate [B][C][A][D] red. Bounded only by RETAINED_DELIVERED_MAX. Absent from the model; m10 is therefore not equivalent.

**B3 (ix side effect; new mechanism).** `cdc-group-propagation-service.js:296-301`: an equal-mode write no longer updates the reason. Readers: `control-plane-readiness-diagnostics-eligibility.js:443-452` (recovery eligibility decides on the reason inside conservative fan-out), `readiness-planning-publication-contract.js:89-92` (decision guard), admin snapshot. One lane, grouped mode: missing_local_group then missing_coordinator_address stays missing_local_group (C3: base green, candidate red). The base already recorded no transition on an equal mode; the R-2 witness passes on the base.

**B4 (vii; new shape of A1; read, not executed; A10 follower row).** A forwarded source leaf returns the leader's BACKPRESSURE as `{unknown, cause}` (acceptance:247-249): the lane halves. C-1 is not delivered where the source replica follows and forwards.

**B5.** Six surviving mutants.

## A1-A10
- A1 handled, defective (B1, B4).
- A2 routed: typed rejection carried; real bound not composed.
- A3 handled; `start()` unwitnessed (v06).
- A4 same mode handled; B3; differing modes beyond mismatch not constructible (agree, `cdc-group-propagation-routing.js:715-776`).
- A5 ignored, to measurement; `result()` adds plan captures per uncovered leaf.
- A6 spent report handled; warn holds to measurement.
- A7 routed (M-2).
- A8 C-3 handled; class starvation routed.
- A9 routed (M-3).
- A10 missing rows: attempts > 1, `scan.provisional` at release, reason change at equal mode, follower source.

## Rulings
- Flat commits accepted: `c239a407e^{tree}` = `551bf2643^{tree}` = 959c4081c; the runner checks it on the host.
- Census: a regex list, not closure (`isYieldHoldWindowActive` unmatched); my own search finds no survivor.
- Extra paths accepted.
- Router double proves the envelope only; real mapping read (`message-router-outbound-delivery-registry.js:455,511`, `message-router-delivery-behaviors.js:429-441`), not composed.
- Rotation holds: refresh is synchronous and idempotent inside `result()`.
- Hints: governor ≤ 250 ms equals the lane cap; the router's 1000 ms is cut to 250 ms.
- Tests: the seven deleted cases protected slot fairness only; rewrites keep ACK batch, order and once-each. The writer's list omitted `message-group-native-custody-handoff` and `cdc-source-occurrence-delivery.integration`, which compose the service: green, 5443193e.

## Mutants (T = 16 topology and lane files; X = the omitted files)
- v01 later genuine failure keeps an earlier backpressure label: SURVIVED T, X (ae1f8e7e, b8a50ef7)
- v02 message timeout counted as backpressure: SURVIVED T, X (76188602, bfff934b)
- v03 queue rejection or preemption treated as failure: killed (b1c55a95)
- v04 set not cleared on a throw before plan capture: SURVIVED 91 files, X (7e591311, ab70ad44)
- v05 mode written by a refused wave: killed (ec212402)
- v06 `start()` changes lifetime without retiring: SURVIVED T, X (2a1e5860, 75bd5644)
- v07 tail released after a genuine failure: SURVIVED 91 files bar the two host failures, X (4b3fa236, 5b125df1)
- v08 governor defer treated as failure: killed (edcff621)
- v09 wave continues after stop: killed (d1e6e78a)
- v10 retired wave writes stats and PROPAGATED: SURVIVED T, X (c3973984, ae60de13)
- "Tail released while the scan holds provisional rows" is the candidate itself (B2).

## Green run
e4466725, tv-dator: 39/39 files, 432 assertions, tree 959c4081c. adams-gamla fails `foreground-boundary` #1 and `native-provisional-route` on candidate (ff60fee4) and base (7b775c25): host speed.

## Records
Constants unchanged; baselines only tightened; receipt truthful. The attempt record's "m10 equivalent" over-claims (B2).

## Non-blocking
Duplicate-in-flight answered as BACKPRESSURE now paces lanes at ≤ 250 ms; stop halves N lanes' windows; in-wave retries ignore hints.
