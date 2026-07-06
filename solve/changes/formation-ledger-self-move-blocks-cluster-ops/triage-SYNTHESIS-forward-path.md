# Triage synthesis — the vetted forward path

Inputs (all in this directory, all grounded in the same live artifact
`data/examples/service-data-affinity-demo/node-{0..4}.log`, 2026-07-06 15:22–15:30):

- `triage-lever-L1-interlock-conflict-predicate.md` — **DROP**
- `triage-lever-L2-selfmove-progress-writes.md` — **DROP**
- `triage-lever-L3-formation-sequencing.md` — L3a/L3b **NEEDS-PREREQ**
- `diagnose-post-spread-ledger-write-timeouts.md` — the diagnosed root
- `research-external-systems-selfmove-interlock.md` — external practice
- Prior vetting chain: `FINAL-vetted-verdict.md` (constraints C1–C4),
  `verify-direction-VERDICT.md`

## What the triage killed

| Lever | Verdict | One-line reason |
| --- | --- | --- |
| L1 narrow interlock predicate | DROP | The 318/68 counts are early (15:23–15:25), double-counted rebalancer MOVE_SKIPPED records; ratings CREATE (15:29:32) starts after ALL interlock records end, is ADMITTED, and dies on its own ledger-row INSERT. Narrowing admission fixes nothing here. |
| L2 self-move progress writes | DROP | All three ledger spread ops complete cleanly in 38s with ZERO own-row write failures. The failing writes belong to OTHER operations, after the spread. |
| L3a bootstrap pre-placement | NEEDS-PREREQ | No expected-cluster-size contract exists; single-node formation breaks; high blast radius. A strategic feature, not a tactical quest lever. |
| L3b spread-then-admit sequencing | NEEDS-PREREQ | Spread rows complete 15:23:59; ratings fails 5.5 min later. Sequencing alone moves nothing until the substrate is writable — valid only as the final wrapper. |

The quest statement's sealed ROOT (interlock rejection storm starves provisioning)
does not match this artifact; the doneWhen (formation settles + load completes)
still stands and is mechanism-agnostic.

## The diagnosed root (cited in diagnose-post-spread-ledger-write-timeouts.md)

**A self-sustaining unfit-leader deadlock on the post-spread ledger leader `r4`
(node-1):**

1. `r4` develops a stuck ACTIVE transaction (`expiredActiveSessionCount:1`,
   `heldMs:62036`; node-1.log:2770, node-1.log:4256-4257).
2. The stuck-transaction heal is role-gated — deferred while leader
   (`partition-service-transaction-base.js:317-341,388-401`); demotion is what
   opens the heal gate.
3. The durability-fitness demotion is successor-gated — `successorViable:false`
   returns before `performTrackedLeaderDemotion()`
   (`partition-service-durability-fitness.js:274-321`).
4. The default successor probe requires a follower ack within **10s**
   (`hasViableLeaderDurabilitySuccessor`,
   `partition-service-durability-fitness.js:89-103`) — but the wedged leader
   itself starves follower-ack evidence, so viability can never be proven
   **even though membership has two active voters (`r5` node-4, `r6` node-2)**.
   The sensor lies precisely when it matters (the "recent-ack viability is a
   lying sensor" hazard flagged in research-lever-synthesis.md).
5. → `r4` holds the seat unfit forever; every `replica_operations` write routes
   to the canonical leader and times out (`Pending response timeout`,
   `message-router-pending-response-ledger.js:270-291`); retry routing never
   quarantines it (temporary-unroutable is scoped to no-handler witnesses,
   `query-executor-temporary-unroutable-addresses.js:11-55`).
6. → downstream priority partitions can't record ledger rows → priority spread
   never completes → active-gate fence lacks snapshot coverage
   (`published_active_coverage_incomplete`, node-3.log:2579) → control plane
   never settles → ratings [2/4] admitted, INSERT times out, 30s DDL budget
   exhausted.

Amplifiers: the ledger stays over target (4/3, never drains —
`waiting_for_idle_ledger` skips at 15:24:00/15:25:11), falsifying the sibling
over-target quest's "self-clearing transient" premise.

**This is the exact R1-liveness-deadlock predicted by `FINAL-vetted-verdict.md`**
("the node holds the seat forever, acking nothing durable, blocking everyone"),
whose already-4×-vetted guard is **C3: bounded fallback to demote when no
genuinely-viable successor is found within a bound**. The live artifact is the
missing empirical proof that C3 is load-bearing.

## Recommended legs (priority order)

1. **Leg 1 — root: C3 bounded demotion fallback.** When durability-unfit
   persists with `successorViable:false` beyond a bound AND the group is not
   solo (membership shows ≥1 active voter follower — use membership, not
   ack-recency, when the leader itself is the unfit party), demote anyway. That
   opens the shipped follower heal gate → the zombie tx rolls back → writes
   recover. Preserve C1 (keep re-asserting deferCandidacy while unfit) and C4
   (heal role gate untouched). Reuse level: EXTENDED — detection, tracked
   demotion, follower heal all ship today; the change is the bound + viability
   evidence source. Owner: partition-service-durability-fitness.
   E-cheap guardrail for the DT: reproduce `successorViable:false` via the real
   mechanism (stuck tx starving follower acks with live voters in membership),
   NOT an injected probe; extend `dt6-ledger-leader-durability-fitness.test.js`
   (its subtest-2 already pins that a genuinely successor-less/solo group must
   keep serving — that contract must stay green).
2. **Leg 2 — feedback: route-health quarantine.** Repeated pending-response
   timeouts against a canonical leader should mark the candidate temporarily
   unroutable / widen to recovery candidates
   (`query-executor-write-retry-routing.js:486-545` machinery exists), so
   retries stop hammering an unhealthy leader. Defense-in-depth after Leg 1.
3. **Leg 3 — hygiene: ledger surplus drain.** The 4/3 over-target composition
   never self-clears; route this evidence to the sibling quest
   `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`
   (its "cleanliness-only, transient" framing needs a finding).
4. **Leg 4 — wrapper: L3b sequencing.** Once the substrate is writable, gate
   foreground provisioning on formation-settled (per external Principle C) so
   [2/4] never races the spread. Only after Legs 1–2 make "spread complete"
   mean "ledger writable".

## Falsifiers for Leg 1 before implementation

- If node-1 follower-ack traces show acks flowing within 10s while
  `successorViable:false` was logged, the starvation mechanism is wrong —
  re-diagnose the probe.
- If a DT with a wedged leader + two live voters shows demotion firing today,
  the deadlock reading of `resolveLeaderDurabilityUnfitConsequence` is wrong.
- Post-fix live validation 3× is mandatory before any SOLVED claim (standing
  lesson from wrong-legs fba0b477/96a0917f and a9344058/066bf78d).
