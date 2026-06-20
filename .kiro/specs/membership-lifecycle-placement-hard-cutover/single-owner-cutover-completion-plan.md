# Single-Owner Cutover — Completion Plan (lever #1)

Status: draft (2026-06-20). Graduates the `membership-single-owner-cutover` epic
into the existing `membership-lifecycle-placement-hard-cutover` spec. This plan
finishes the **authority half** of that spec, which the task list marks done but
which is not done in runtime.

## Verified ground truth (read the code, not the checklist)

1. **The controller is an intent recorder, not the writer.**
   `MembershipLifecycleController` (`src/control-plane/membership-lifecycle-controller.js`)
   builds join/drain/removal *intent objects*, pushes them to an in-memory
   `intentHistory` array, and calls optional delegates. It is instantiated at
   `src/index.js:224` and `src/bootstrap/node-joining-owner-construction.js:158`,
   and only `submitJoinIntent` (`node-joining-admission-readiness.js:415`) and
   `submitDrainIntent` (`entrypoint-runtime-shutdown-lifecycle.js:302`) are ever
   called. It never computes or writes the active-node set.

2. **No executable lifecycle machine consumes intents — but the transition
   scaffold already exists.** The design's `ABSENT → ADMITTED → PROVISIONING →
   CAUGHT_UP → PUBLISH_PENDING → PUBLISHED_ACTIVE → DRAINING → REMOVED` states
   are enums in `membership-lifecycle-constants.js:6`. There is no function that
   consumes intents to advance member state. HOWEVER (correction from
   verification) the file already provides a transition-validity table
   `MEMBERSHIP_LIFECYCLE_VALID_TRANSITIONS` (:197), a validator
   `isValidMembershipLifecycleTransition()` (:477), and a participation-state
   resolver `resolveNodeRuntimeParticipationState()` (:423). Phase 1 REUSES
   these; it does not build them from scratch. (Also: `submitRemovalIntent` is
   dead/test-only; only join + drain intents are submitted in production, and the
   `onDrainIntent` delegate at `src/index.js:224` only flips *local* readiness
   via `bootstrapAPI.markDraining` — not the active set.)

3. **The real active-set authority is the projection.**
   `resolveActiveNodeViews()` lives at `active-node-projection.js:634` (the
   *function* is ~113 LOC, 634–746; the *file* is ~775 LOC — earlier drafts
   conflated the two). It merges ~6–7 input vectors + 3 overlays
   (transport-retention grace `:316`, liveness fallback `:329`,
   recovery-eligible `:55/:252`) + a membership-freeze gate (`:675–692`). It is
   read by **11** files (not 13), of which only **3** call `resolveActiveNodeViews`
   directly (candidate-derivation, planning-evidence, admin snapshot); the other
   8 import helper exports (`buildReadinessByNodeId`,
   `resolvePriorityRecoveryActiveNodeCohort`, `buildActiveMembershipSnapshot`) or
   read the published row.

4. **Published membership is a projection of a projection.** The publication-row
   writers (`heartbeat-service-lifecycle-methods.js`,
   `membership-publication-coordinator-reconcile.js`,
   `membership-publication-active-gate-reconcile.js`) derive the published
   `cluster_membership` set from `resolveActiveNodeViews()` via
   `membership-publication-candidate-derivation.js`. So "cut consumers to
   published membership" (Task 3, marked done) is true at the read boundary but
   hollow at the source.

5. **Safety is the Raft term fence, not a new lease.** Per
   `owner-driven-membership-plan.md` (verified): the membership write is
   client → partition leader → Raft propose/commit. A stale leader cannot reach
   quorum under a superseded term, so two nodes that transiently try to drive
   cannot produce divergent committed membership. **The cutover does not need a
   new distributed lease** — it needs one node-local owner to *compute* the set
   from a minimal input set and write it on the existing leader→Raft path.

6. **Prerequisites are in code, but the authority behavior is default-OFF.**
   - B1 non-splittable membership table: `partition-split-merge-manager-core-methods.js:470`.
   - B4 single-partition assertion: `membership-publication-coordinator-reconcile.js:722`
     (`assertSingleMembershipPartition`, non-throwing tripwire).
   - Liveness driver: `startOwnerMembershipDriver()`
     (`membership-publication-coordinator-*`), started unconditionally in
     `control-plane-setup.js:370`.
   - B3 SQL/cache-fallback fence: `control-plane-system-table-gateway-query-execution.js:214`
     hard-returns `false` for `CONTROL_PLANE_PUBLICATIONS`, forcing the Raft
     path. **The term-fence safety claim (5) is contingent on this guard
     staying in place.**
   - **Critical nuance:** the *leader-driven write behavior* is gated by
     `LAGRANGE_MEMBERSHIP_LEADER_DRIVEN`, **default OFF**
     (`membership-publication-coordinator-reads.js:63`), failing open to legacy
     behavior. "Reuse the existing liveness driver" (Phase 2) therefore requires
     flipping this flag on — itself an untested-at-N≥8 path today.

## Objective

Make `MembershipLifecycleController` the **single author** of the active-node
set, produced by an **executable lifecycle state machine** over a **minimal
authoritative input set** (published baseline + readiness evidence + transport
health), written via the existing leader→Raft path. Then reduce
`active-node-projection.js` to a **pure reader** of that published output,
deleting the 7-source merge, the 3 overlays, and the freeze gate.

Why this and not another gate fix: `CoupledAdmission.tla`
(`models/readiness-starvation/CoupledAdmission.tla`) is a model-checked proof
that single-frontier patches on a shared knob bounce one invariant family green
and another red — only an atomic whole-system reconcile converges. **Correction
from verification:** the model's atomic primitive is a single-knob step; Phase 2
is broader than that, so the *atomicity that makes Phase 2 safe comes from the
Raft commit* (one committed membership row under a fenced term), NOT from the
model. The model is the argument for *why the structural cutover beats more gate
patches*, not a claim that Phase 2 is a single-knob change.

## Sequence (delegation-first, then deletion — the repo's own doctrine)

### Phase 0 — Divergence probe (cheap, reversible, falsifiable baseline)
- Add a shadow computation: alongside `resolveActiveNodeViews()`, compute the
  candidate active-set the controller *would* produce from the minimal input
  set, and emit a structured diff (`memberSet.controller` vs `memberSet.projection`)
  to diagnostics on every publication tick. Do **not** write it.
- Run the existing rolling-restart stat-gate (N≥8) and
  `npm run analyze:latent-blockers`. Output: where do the two sets diverge, and
  is divergence steady-state noise or a real frozen-follower signal?
- **Guardrail (from the leader-pin-catch-up lesson):** if they diverge because a
  follower is genuinely frozen, that is a bug to fix in the machine — NOT a
  reason to relax the controller toward the projection. Instrument before
  flipping; never ship a masking relaxation.
- Exit: a documented, reproducible divergence map. This is the evidence the rest
  of the plan is safe.

### Phase 1 — Make the lifecycle machine executable (construction, shadow only)
- Implement the 8-state transitions inside the controller, driven by the intents
  it already receives + authoritative row reads (node rows, durable rejoin
  checkpoints) + transport health. Model restart as the
  `PUBLISHED_ACTIVE → PROVISIONING → CAUGHT_UP → PUBLISH_PENDING →
  PUBLISHED_ACTIVE` re-entry the design specifies; member identity persists
  across restart.
- Expose `computeActiveMemberSet(epoch)` producing the same output shape as
  `resolveActiveNodeViews()` from the minimal input set.
- Keep it advisory: feed the Phase-0 probe. Tighten until controller-set ==
  projection-set in steady state and every divergence is an explained, intended
  difference (e.g. the projection over-retained a dead node a guard was masking).
- Exit: deterministic regressions for each transition; probe shows agreement
  modulo intended corrections.

### Phase 2 — Flip authority (the keystone, one atomic gated change)
- Route the publication write through `computeActiveMemberSet()` instead of
  `membership-publication-candidate-derivation.js`'s projection-derived
  candidate. Trigger via the existing unconditional liveness driver
  (workstream A); persist via the existing leader→Raft coordinator path
  (the Raft term fence remains the only safety guarantee).
- Flag-gated. Validate on the rolling-restart stat-gate at **N≥8**:
  STALLED→CONVERGED, `corruptCount == 0`, `publication_epochs_disagree == 0`,
  and the Phase-0 probe shows controller-authored == previously-projected set in
  steady state. Hold the flag off until green.
- Exit: published membership is authored by the controller; gate green at N≥8.

### Phase 3 — Collapse the projection to a reader
- Gut `resolveActiveNodeViews()`: delete the merge, the liveness-fallback and
  recovery-eligible overlays, and the transport-retention grace **only after
  their behavior is ported into the lifecycle machine** (these overlays are
  passed `true` on the live publication path at
  `candidate-derivation.js:228` — they actively shape today's published set, so
  they are not dead code).
- **DO NOT silently drop the membership-freeze gate (`:675–692`,
  `broad_suspicion`). It is a SAFETY invariant, not liveness** — it retains the
  published set instead of trimming when ≥N nodes go missing beyond a ratio
  threshold, preventing a false-suspicion storm from removing a quorum. Port
  this broad-suspicion retention into the machine as an explicit transition
  guard before deleting it from the projection. (See the corrected exit gate.)
- Migrate the 11 consumers (3 substantive direct readers + 8 helper-only) to
  read the published set / a thin published-set helper; for the helper-only
  consumers this is mostly re-pointing the export, not rewiring.
- `active-node-projection.js` becomes a thin read of the published row +
  freshness/disagreement diagnostics.
- Exit: no runtime path derives the active-set outside the published row; gate
  green at N≥8 **AND the broad-suspicion safety property holds under a
  mass-missing fault injection** (a missing==0/converge gate alone is necessary
  but NOT sufficient to prove the freeze safety survived).

### Phase 4 — Remove the now-dead readiness guards (lever #2 lands here)
- Delete the membership-aware guards that existed only to paper over racing
  projections (the "removable-if-single-owner: yes" rows from the readiness
  inventory): heartbeat grace, ready-lease grace, transport-retention grace,
  liveness-fallback projection, runtime-authority confirmed/establishing,
  recovery-eligible overlay, membership-freeze gate.
- One guard per change, each re-validated against the gate. A guard that cannot
  be removed without a gate regression is a real signal the machine is still
  missing a transition — fix the machine, do not re-add the guard.
- Exit: readiness is a thin function of the published set + bounded health.

### Phase 5 — Deletion closure & doc reconciliation
- Correct `deletion-inventory.md` (it currently claims the authority half is
  done — it is not) to reflect what actually shipped.
- Close spec Tasks 27 (distributed closure ladder) and 28 (final audit) with the
  gate evidence from Phases 2–4.
- Update `architecture/overview.md` (strip the accreted special-case guard prose
  whose guards were deleted) and `current-owner-maps.md`.

## Risks & guardrails
- **The safety guard hiding in the projection (highest risk).** The
  membership-freeze gate is a safety invariant; the convergence gate measures
  liveness (missing==0) and will stay green even if the freeze protection is
  silently lost. Port broad-suspicion retention into the machine and add a
  mass-missing fault-injection check to the gate before any Phase 3/4 deletion.
- **Phase 2 safety is the Raft commit, not the model** — keep all membership
  writes on the `proposeWrite` path; never the SQL/cache fallback. The B3 fence
  (`control-plane-system-table-gateway-query-execution.js:214`) must stay in
  place; treat its removal as a safety regression.
- **`LAGRANGE_MEMBERSHIP_LEADER_DRIVEN` is default-off** — Phase 2 requires
  enabling it; that leader-driven write path is itself untested at N≥8 today, so
  the Phase-2 gate run is also the first real validation of it. Sequence
  accordingly (do not assume the driver scaffold being "landed" means the write
  behavior is exercised).
- **No masking relaxations** — the Phase-0/1 probe must explain every divergence;
  a frozen-follower divergence is fixed in the machine, never relaxed away
  (the leader-pin-catch-up lesson: instrumentation proved a genuine frozen
  follower; relaxing the oracle would have masked it).
- **Backout** — every phase flag-gated; Phase 3/4 deletions only after Phase 2
  is gate-green at N≥8. Revert = disable `LAGRANGE_MEMBERSHIP_LEADER_DRIVEN` to
  fail back to the projection path.
- **Single-partition prerequisite** — confirm the B4 assertion
  (`membership-publication-coordinator-reconcile.js:722`) is active before
  Phase 2 (owner resolution depends on it).

## Verification status
Plan adversarially verified against code by subagent (2026-06-20). Core thesis
CONFIRMED (controller is a hollow intent recorder; published membership is a
projection-of-a-projection; Raft term fence is the safety story; prerequisites
are in code). Six corrections folded in above: lifecycle transition scaffold
already exists (reuse, don't rebuild); projection function is ~113 LOC not 775;
11 consumers not 13; Phase 2 atomicity comes from Raft not the model; the
freeze gate is safety not liveness; `LAGRANGE_MEMBERSHIP_LEADER_DRIVEN` is
default-off + the B3 fence is load-bearing. Verdict: **SOUND-WITH-CORRECTIONS**
(now applied).

## Rough effort
Phase 0: ~1 session. Phase 1: ~2–3 (the machine is the real new code).
Phase 2: ~1–2 + gate. Phase 3: ~2 (mechanical, 13 consumers). Phase 4: ~1–2.
Phase 5: ~1. This is the structural fix that ends the ~70-attempt whack-a-mole,
not another point-fix on its frontier.
