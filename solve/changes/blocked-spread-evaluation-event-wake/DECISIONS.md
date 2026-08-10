# Decisions: blocked-spread-evaluation-event-wake

Quest: `blocked-spread-evaluation-event-wake` (sealed at 24c0b1edc).
Change authored 2026-08-10 on top of 24c0b1edc.

## Which seam actually bound (log evidence, run ec-q6-20260810T092844Z)

Full-log analysis (playback bundle
`test-output/reports/.playback/ec-q6-20260810T092844Z/.full-logs/examples-catalog/`,
seed node log `7493b0ab-a054-5fad-a91b-5e331db29304.log.gz`, joiner log
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7.log.gz`) shows the pipeline was NOT
parked by the 70-80s blocked-branch timer in that run:

- Evaluations continued every 1-5s to the end (218 "Starting rebalancing"
  cycles, 267 priority-recovery planning-gate diagnostics through
  09:31:38.293Z).
- The binding seam was the **operation-ledger interlock admission hold**:
  216 of 218 planned spread-fixing ADDs were skipped with
  `admissionReason:"operation_ledger_self_move_in_flight"` (first
  09:29:22.684Z, last 09:31:40.323Z) because the two burst operations
  (`4d022a6c…` ADD on `control_plane_publications-p1` stuck at SYNCING,
  `replace-op-b0b98821…` REPLACE on `replica_operations-p1` stuck at
  STOPPING) never reached a terminal ledger state — their outcome writes
  failed with "Executor outcome operation visibility deferred"
  (09:29:32.943-34.319Z, backoff 250→500→1000ms, then silence).
- Because the spread blocker never cleared, the stability window never
  started: `WAIT_CONTROL_PLANE_PRIORITY_STABILITY` has **zero**
  occurrences; every one of the 6 blocked-branch defers (entities
  `nodes-p1`, `sys-postgres-wire`, `sys-admin-meta`, `mg-1`,
  `sys-wasm-meta`, `nodes-p1` again; delayMs 72085-79999; 09:30:21.129Z to
  09:31:35.007Z) re-armed the shared release tracker
  (`observeBackgroundPrioritySpreadBlocked` resets `clearObservedAtMs`).

The never-terminal-operation wedge is out of this quest's sealed scope; it
is the dominant blocker for the `latent-convergence-blocker-census` epic
to route next (executor-outcome visibility deferral never escalating —
same family as RESEARCH.md Link B in
`solve/changes/formation-barrier-spread-release-oscillation/RESEARCH.md`).
This quest's mechanism (the sealed statement's dead-window cure) is real
and latent: the six parked entities held flat 72-80s timers, and in any
run where the blocker DOES clear, release previously cost up to
~80s (first ordinary evaluation lazily observing the clear) + 70s window
+ up to ~80s (remaining parked timers) before background planning resumed.

## Wake design

Three pieces, all through existing owners; no new timer, queue, or
listener is minted:

1. **Tracker notifies its readiness-owner scope on stable release**
   (`src/rebalancer/background-priority-spread-release-tracker.js`). Each
   scope carries a wake registry (`wakeCallbacksByKey`, keyed by
   entityId; re-registration replaces, ownership transfer merges
   registries alongside trackers). When
   `resolveBackgroundPrioritySpreadStableRelease` flips
   `tracker.active -> false`, it drains the registry and invokes every
   callback once. A throwing listener is isolated; its entity still has
   its scheduled fallback timer.
2. **Parked entities register a typed wake before deferring**
   (`src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js`,
   both defer paths: the blocked branch and the stabilizing branch). The
   callback is `enqueueRebalanceCheck(RECONCILE_REASON.
   PRIORITY_SPREAD_RELEASE_WAKE)` — the owner reconcile-queue ingress,
   which already gates on leadership/shutdown and cancels the pending
   scheduled check when the reconcile runs.
3. **Priority partitions advance the shared fence** (same file). They
   still never defer on it, but their evaluations — already event-driven
   through the priority-recovery visibility cache
   (placement-eligibility/operation-terminal edges) and the priority
   retry cadence (1-5s, confirmed live) — now run the tracker-advance
   block (in-flight observation, drain observation, stable-release
   resolution) before returning not-applicable. This is how those edges
   reach parked entities: edge → priority evaluation → shared-fence
   advance → stable release → tracker wake → parked entity enqueued.
   It also symmetrizes the fence: priority partitions already ARM it
   (blocked observations ran before the priority early-return); only the
   clear/advance side was ordinary-only.

Post-release dead time becomes ~0 (synchronous enqueue at the release
flip), and the window starts at the first evaluation after the true
clear (priority cadence, seconds) instead of the first parked-timer
expiry (up to ~80s).

## Stability window: preserved, not weakened

- The window LAW is untouched: release still requires
  `getBackgroundPrioritySpreadStableWindowMs()` (ordinary interval +
  observation handoff) of continuous observed clear; any blocked or
  in-flight observation still resets `clearObservedAtMs`; a re-armed
  fence demands a full fresh window with zero residual credit.
- Priority partitions observing the fence *more often* strictly
  strengthens the cure (re-blocking is observed within seconds instead of
  at the next ordinary evaluation).
- Fallback timers remain scheduled on every defer decision regardless of
  wake registration (blocked branch: flat window+jitter; stabilizing
  branch: exact remaining deadline). Removing the wake leaves the
  pre-change timer behavior fully intact.
- Pinned by `test/rebalancer/blocked-spread-release-event-wake.test.js`
  (receipt `stability-window-and-fallback-preserved`) plus the untouched
  existing pins in
  `test/rebalancer/unified-rebalancer-planning-gate-decisions-test-cases.js`
  (delay law ~:492-517, shared-fence semantics :547-1098 — all green).

### Cohort stagger at the release flip (verifier finding, recorded decision)

The independent verifier flagged that the wake enqueues every registered
sharer in one tick at the release flip, while
`getBackgroundPrioritySpreadReleaseDelayMs`'s recorded rationale
(`unified-rebalancer-policy-scheduler-methods.js:200-217`) staggers the
deferred cohort with per-entity jitter. Decision: keep the synchronous
burst and record why, rather than staggering the wake:

- The jitter law prevents a *recurring* synchronized retry cadence; the
  wake is a one-shot edge, structurally bounded to at most one burst per
  full stability window per readiness owner (the registry drains at the
  flip and the next flip needs a fresh 70s continuous-clear window).
- The repo already wakes the whole entity cohort simultaneously on
  node-state edges (`onNodeStateChange` → `triggerImmediateCheck` for
  every entity); the wake burst is the same recorded shape.
- Downstream serialization holds: the owner reconcile queue drains
  per-entity single-flight, `checkRebalance` enforces its minimum
  inter-check interval, and admission serializes operation creation.
- Staggering the wake would mint a new timer (contrary to the quest's
  prior-art directive) and re-introduce per-entity dead time the sealed
  statement exists to remove. If post-landing evidence shows burst
  contention, add jitter inside the notify loop as a follow-up.

## Prior art (operator-mandated section)

- **Shared stability-window fence** — reused, not rebuilt:
  `background-priority-spread-release-tracker.js` is the repo's recorded
  oscillation cure for this class (hysteresis/stabilization window, the
  HPA-stabilization-window shape named in
  `docs/steering/operational-ground-truth.md`). This change only adds the
  notify-on-release edge to the same owner.
- **Owner reconcile-queue ingress** — reused: the wake enqueues through
  `enqueueRebalanceCheck` → `OwnerKeyReconcileQueue`
  (`src/workflow/reconcile-queue-constants.js` gains one typed reason,
  `priority_spread_release_wake`), the same single-flight ingress used by
  timers, node-state edges (`triggerImmediateCheck`), and
  priority-recovery progress events. `reconcileRebalanceCheck` already
  cancels the superseded scheduled check.
- **Priority-recovery visibility cache** — reused as the event source: no
  new per-entity cache listeners were added, respecting the CL-020 cost
  contract ("any other event must never pay the planning re-derive") in
  the gate file. The CL-021 exclusion-reason witness in the blocked log
  payload is untouched.
- **Ownership-transfer merge** — the wake registry merges through the
  existing `transferBackgroundPrioritySpreadReleaseOwnership` seam, the
  same path the tracker itself uses for A→B / C→B rebind convergence.

## Secondary item: admission feasibility vs placement eligibility

The sealed statement's secondary owner-disagreement
(`readPlacementEligibleNodeIds` counts only `connection_state==='ready'`
targets in `operation-ledger-quorum-concentration.js:80-107` while
placement eligibility accepts JOINING via
`startup-authority-placement-eligibility.js`;
`resolveEngagedLedgerQuorumSpreadHold` supplies no
`placementEligibleNodeIds`) is recorded as a **follow-up, not fixed
here**:

- Not cheap: the wiring needs an options bag plumbed through
  `evaluateOperationLedgerQuorumConcentration` and
  `resolveEngagedLedgerQuorumSpreadHold`, plus startup-authority context
  at the admission call site
  (`rebalance-coordinator-ledger-interlock-admission.js:389-419`).
- Behavior-changing on a hot admission failure path: counting JOINING
  nodes flips `spreadActionable` (and therefore hold engagement) during
  formation — per operational ground truth that class of change wants its
  own deterministic repro and aggregate validation.
- Non-binding in the live evidence: the run's admission defers were
  `operation_ledger_self_move_in_flight` (in-flight self-moves), not a
  feasibility-scan verdict; wiring eligibility through would not have
  changed the run.

## Verification-template pre-answers

Sweep/timer template:
1. Clock injection — the gate and tracker take `observedAt`/`nowFn`; the
   new tests drive a virtual clock; no new timer is created (the wake is
   a synchronous callback at the release flip; fallback timers are the
   pre-existing `scheduleNextCheck` machinery, unchanged).
2. Role/authority gating — the wake lands in `enqueueRebalanceCheck`,
   which gates on `isLeader`/`isShuttingDown`; no raft-affecting action.
3. JS-memory crash-equivalence — the registry is in-process, per
   readiness owner, drained at release; nothing durable depends on it; a
   restart rebuilds registrations on the next blocked evaluation.
4. Detection windows — the stability window is unchanged and test-pinned;
   the wake fires only at maturity, never inside the window.
5. Sweep starvation / circularity — the wake path performs no reads or
   writes through any moving subsystem (in-process callback); if the wake
   is lost (listener error, shutdown race), the registrant's scheduled
   timer still fires — the fallback does not depend on the wake.

Formation-circularity template:
1. Self-dependency inventory — no ledger/publication reads or writes were
   added; the fence-advance block reads only the local system-table cache
   (the same observation the non-priority branch already performed).
2. Re-drive starvation — the event-driven wake is an addition on top of
   retained level-triggered timers, not a replacement; the fallback path
   is exactly the pre-change behavior.
3. Formation-window clients — parked entities re-evaluate earlier, never
   later; no client budget is shortened or newly exercised.
4. Window arithmetic — worst-case background resume after a real clear
   drops from ~80s (lazy clear observation) + 70s (window) + ~80s
   (parked timers) ≈ 230s to ~1-5s (priority cadence observes clear) +
   70s + ~0 (wake) ≈ 75s, inside the 135s examples-catalog budget with
   ~60s margin — provided the blocker itself clears (see "which seam
   actually bound" for why it did not in ec-q6).
5. No bypass — the tracker remains the single release owner; no second
   source of truth; priority partitions advance the same owner rather
   than deciding release locally.
