---
id: spread-satisfied-in-flight-staleness-unmask
roadmapRow: RM-0.1-fs-rolling-restart
status: discussing
graduatesTo: topology-convergence-hardening
links:
  quests: [rolling-restart-core-stability]
  censusSurvivor: pr-spread-satisfied-in-flight-masks-stuck-surplus
---

# Census #4 — un-mask `spread_satisfied_in_flight`, the consistent binding mask of the rolling-restart `convergence_timeout`

> **START-HERE handoff for a fresh agent.** Everything to begin is below; file:line verified
> at HEAD `99033274` (2026-06-23) but POSITIONAL — re-grep before trusting. Read
> [`.kiro/steering/operational-ground-truth.md`](../steering/operational-ground-truth.md) first
> (deterministic-first / gate-last / research-existing / subagent-verify / never-conclude-from-N=1).

## TL;DR (what to build, and the one hard rule)

1. **Build:** a staleness guard so `spread_satisfied_in_flight` stops being a "satisfied"
   completion/semantic state when its in-flight op has been stalled too long — promote it to
   `OPERATION_STALLED` (an honest blocker that does NOT sign off and DOES route to re-drive).
   Flag-gated, default-off. Multi-site (three classifiers — see below).
2. **THE HARD RULE:** **do NOT validate with the rolling-restart gate.** Two N=3 gates this
   session proved it is too noisy — the binding reason varies run-to-run
   (`convergence_timeout` / `nodeSlotUnavailable` / `admin_reachability_refused`) and narrow
   levers' preconditions weren't met in 6 runs. **Validate BELOW the gate with a directed
   deterministic repro** (DT substrate) that FORCES `spread_satisfied_in_flight` over a stalled
   in-flight op and asserts the guard promotes it + the op re-drives. The gate is the final
   integration check, run ONCE at the end — not the falsifier.

## Why this is the binding lever (evidence, 2 gates / 6 runs)

The dominant `convergence_timeout` witness in **every** failing run across both gates has
`semanticStateId: spread_satisfied_in_flight` over a WAITING op
(`nextRequiredAction: wait_for_operation_progress`, `waitMode: event_driven`). The specific
sub-state VARIES — gate-1 (`stat-gate-20260623T100334Z`): terminal phase + `write_backlog`
(stepAge 92–180s); gate-2 run1 (`stat-gate-20260623T111430Z`): `dispatch_pending` phase +
pressure `none`, stepAge 0. The **constant** factor is the mask.

`spread_satisfied_in_flight` is a **drain-completion state** that signs the op off as
"satisfied/in-flight" UPSTREAM of every re-drive path. Consequences, both confirmed:
- The closure treats recovery as satisfied while the surplus voter is still over-target →
  it never drains within `MAX_SUSTAINED_OVER_TARGET_MS = 120000`
  (`test/distributed/harness/constants.js:79`) → `convergence_timeout` (PASS requires the
  surplus to actually drain; it cannot be abandoned).
- It short-circuits the dispatch-pending reentry path, so the three default-off levers already
  built this session (below) **engaged 0× across 6 runs** — they never get the chance to fire.

Read a witness yourself: `node --max-old-space-size=4096 -e '...'` on
`test-output/reports/stat-gate-20260623T1{00334,11430}Z-run{1,2,3}.report.json` →
`scenarios[0].priorityRecoveryProgressSummary.dominantWitness` (reports ~130MB).

## The fix — multi-site staleness guard (exact seams, HEAD `99033274`, POSITIONAL)

`spread_satisfied_in_flight` is produced by THREE independent classifiers; the guard must thread
a single stall signal through all three (or a shared helper they each call):

1. **Semantic-state** — `resolvePriorityRecoverySemanticState`
   (`src/control-plane/priority-recovery-snapshot-ingress.js:309-337`): returns
   `SPREAD_SATISFIED_IN_FLIGHT` at `:326` (satisfied + `hasActiveOperationContexts`) and `:332`
   (satisfied). Guard: when satisfied-in-flight BUT the in-flight op is stale → return
   `PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED`
   (`priority-recovery-diagnostics-constants.js:111`).
2. **Completion-state** — `priority-recovery-completion.js:174-185`: returns
   `PRIORITY_RECOVERY_COMPLETION_STATE.SPREAD_SATISFIED_IN_FLIGHT` at `:177` when
   `spreadCompletion?.satisfied === true`. NB this block already carries
   `temporaryOverflowVoterBudget` / `allowTemporaryOverflowPromotion` — understand those before
   changing (they govern accepted over-provision). Same staleness promotion here.
3. **Drain-completion short-circuit set** —
   `PRIORITY_RECOVERY_DISPATCH_PENDING_DRAIN_COMPLETION_STATES`
   (`src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js:107-111`, consumed
   at `:635`): contains `SPREAD_SATISFIED_IN_FLIGHT`. This is why the reentry re-drive
   short-circuits. Once the op is promoted to `OPERATION_STALLED` upstream this set no longer
   matches it; verify the reentry path then routes to re-drive (where the built levers compose).

**Staleness signal:** `resolvePriorityRecoveryWorkflowStepAgeMs(operationContext, nowMs)`
(`src/control-plane/priority-recovery-snapshot-observation.js:149`, exported `:586`) gives the
in-flight op's step age (falls back to `operationContext.ageMs`). **`stepTimeoutMs=0` in the
witnesses ⇒ there is NO per-step deadline**, so gate on `stepAgeMs >= <fixed threshold>` (pick
below the 120s over-target budget but above normal in-flight latency — e.g. 30–60s; make it a
named constant). Caller sites that assemble the classifier `options` and have the operation
contexts in scope: `priority-recovery-snapshot-eligibility.js:60` & `:529`,
`priority-recovery-decision-snapshot-rebuild.js:145`, `priority-recovery-snapshot-closure.js:333`.

**Flag:** default-off (e.g. `LAGRANGE_PR_SPREAD_STALL_GUARD`), env-read like the others
(`process.env[FLAG] === 'true'`). Flag-off MUST be byte-identical.

## Validate BELOW the gate (deterministic-first) — the actual plan

1. **Unit falsifier first** (mirror the two this session built — see "Building blocks"): feed the
   semantic-state + completion-state classifiers `options` with `spreadCompletion.satisfied=true`
   + an in-flight op context whose `stepAgeMs` exceeds the threshold; assert current = signed-off
   (`SPREAD_SATISFIED_IN_FLIGHT`) [RED for desired], and flag-on = `OPERATION_STALLED` [GREEN].
   Also assert a FRESH op (stepAge below threshold) stays satisfied (no premature un-mask), and
   flag-off byte-identical. Harness to model on: `test/control-plane/priority-recovery-completion.test.js`
   + `priority-recovery-snapshot-*-test-cases.js`.
2. **Directed deterministic repro** (the real efficacy proof): use the DT substrate
   (`test/distributed/harness/{deterministic-simulator,virtual-network,chaos}.js`,
   `docs/deterministic-directed-testing-plan.md`) to construct a surplus-over-target partition
   whose drain op stays in-flight past the threshold, assert: flag-off → closure signs off →
   non-quiescence; flag-on → promoted to stalled → re-drive fires → surplus drains. This is what
   the noisy gate CANNOT reliably show.
3. **Gate LAST, once:** `LAGRANGE_PR_SPREAD_STALL_GUARD=true npm run gate -- 3` (flags
   auto-forward to Docker nodes via `cluster-class-lifecycle-base.js:367-373`). Success = SAFE
   every run (0 corrupt/blind/exit — hard invariant) AND `convergence_timeout` materially down or
   replaced by an honest reason + the guard engaged (grep the witness/logs). Compose with the
   built flags if the un-masked op needs them.

## Building blocks already shipped this session (default-off; compose beneath #4)

All SAFE (subagent-verified), unit-falsifier-backed, flag-off byte-identical, but each engaged 0×
in the gates because #4 masks the op before they can fire — they become reachable once #4 un-masks:
- **rank-1 zombie-redrive** — `LAGRANGE_PR_ZOMBIE_REDRIVE` (commit `54843bb4`): re-drives a
  `persisted_not_dispatched` + `phase=terminal` op stranded by the DISPATCH_PENDING gate.
- **lever-(a) drain-extension** — `LAGRANGE_PR_DRAIN_LOCAL_PROGRESS` (commit `bb2a6ca2`):
  owner-local deferred-progress for the surplus-drain ACTIVE(+REPLACE)/REMOVED transitions under
  write-defer (the real REMOVE_REPLICA is dispatched off the local cache-resident ACTIVE op-row).
- **L-write membership deferred-seed** — `LAGRANGE_JOIN_DEFERRED_SEED` (commits `7ee7484f`/
  `e71385d8`): NODES/NODE_ENDPOINTS join-write deferred-seed. REFUTED as the mgmjf/rolling-restart
  lever this session — keep as a safe building block, not part of #4.

## Traps (paid for already — don't re-pay)

- **The gate is not the falsifier.** N=3 is within variance; the binding reason rotates. Do the
  directed DT repro. (This is the #1 lesson of the session.)
- **#4 is NOT a peel** (an earlier call this session got this wrong). It is the consistent mask;
  it must be fixed first. But it MAY expose a deeper layer (e.g. `write_backlog` when pressure is
  present) — when it does, that's progress (an honest reason), and the built levers compose.
- **`stepTimeoutMs=0`** — don't gate on `stepAgeMs >= stepTimeoutMs` (trivially true); use a fixed
  threshold.
- **Don't relax safety to chase PASS** — SAFE every run (0 corrupt/breach/exit/oracle-blind) is a
  hard, never-relaxed invariant; the over-target oracle (≤120s) is a real correctness bound.
- **Research existing first** — `OPERATION_STALLED`, the stale-operation blocker machinery, and
  `resolvePriorityRecoveryWorkflowStepAgeMs` already exist; extend, don't rebuild.

## Quick-start commands

- Re-read a witness: `node --max-old-space-size=4096 -e 'const j=require(process.argv[1]);console.log(JSON.stringify((j.scenarios?.[0]||j).priorityRecoveryProgressSummary?.dominantWitness,null,1))' "$PWD/test-output/reports/stat-gate-20260623T111430Z-run1.report.json"`
- Run a unit suite (from `/home/peter/projects/something`, NOT the /media path):
  `npx tap test/control-plane/priority-recovery-completion.test.js -- --no-coverage`
- Latent-blocker corpus: `npm run analyze:latent-blockers` (run before any gate).
- Full census frontier this descends from: `.kiro/epics/latent-convergence-blocker-census.md`
  (survivors run3 `test-output/latent-blocker-census-run3.json`); shared-root detail:
  `.kiro/epics/control-plane-write-wedge-leader-local-establishment.md` (RE-GROUNDING + CORRECTION blocks).
