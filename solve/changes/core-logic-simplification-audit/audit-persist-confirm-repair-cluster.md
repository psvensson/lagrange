# Audit — persist / confirm / divergence-repair cluster

Subsystem: `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`
and collaborators (gateway-methods, read-methods, visibility-methods,
reservation-lifecycle-methods, owner-execution-lane, terminal-transition-repair).

Scope rule: only **behavior-preserving** merges/removals count. This audit does
NOT edit source. The reverted arm-2 fix (`1ce80391` → `692c9dbb`) is treated as a
**cautionary boundary**, not a proposal.

Line anchors verified against HEAD (`3717c518`).

---

## Map of the cluster (verified anchors)

Persistence-methods (`replica-operation-repository-mutation-persistence-methods.js`):
- `persistNewOperationUnlocked` — 51-142 (OR-IGNORE idempotent reinsert; witness+confirm block 111-126; durable-changeCount arm 127-141)
- `persistOperationUpdate` — 151-226 (result arms: failed 208-210, recovered 211-214, zero-change 215-224, confirm 225)
- `confirmPersistedOperationUpdate` — 230-252 (witness+confirm block 236-250)
- `resolveFailedOperationUpdateResult` (arm 2) — 256-272 (local-only recover-or-throw; **post-revert shape**)
- `resolveZeroChangeOperationUpdate` (CL-017(b) create-on-missing) — 277-320
- `shouldRejectConflictingTerminalTransitionMutation` — 326-341
- `shouldRejectExpectedWorkflowStepMutation` — 343-374
- `queryReplicaOperationPersistenceAuthorityObservation` — 392-444 (single-shot local→owner-RPC ladder)
- `confirmReplicaOperationPersistence` — 446-466 (thin wrapper: throw-on-missing + emit-divergence)
- `recoverPersistedReplicaOperationMutation` — 468-496 (already-applied witness recovery; NO reinsert)
- `confirmReplicaOperationVisibility` — 498-592 (the polling escalation ENGINE)
- `isReplicaOperationVisibilitySatisfied` — 594-638 (**single definition**, shared everywhere)
- `emitReplicaOperationPersistenceDivergence` — 644-704

Collaborators:
- `extractMutationChangeCount` — **single owner** at `replica-operation-repository-mutation-gateway-methods.js:613-621`; reservation-lifecycle:111-113 delegates to `this.repository.extractMutationChangeCount`.
- Base read primitive `queryAuthoritativeOperationVisibilityObservation` — `replica-operation-repository-read-methods.js:284-414`.
- `partition-write-kernel.js:73,104` only *produces* `changes`; it does not interpret durability.
- External `confirmReplicaOperationPersistence` callers: `operation-workflow-owner-execution-lane.js:740`, `operation-workflow-terminal-transition-repair.js:191`.

---

## Q1 — Confirm-layer overlap: do the three confirm methods duplicate the same check?

**No — they are a 3-tier LAYERED stack, not three copies of one check.** Each tier
adds exactly one concern; the visibility-satisfied predicate and the owner-RPC
escalation are already centralized, not re-implemented per tier.

- **`confirmReplicaOperationVisibility` (498-592)** — the ONLY escalation engine.
  It is the poll loop: OWNER_LOCAL_ONLY read → `isReplicaOperationVisibilitySatisfied`?
  return CONFIRMED → OWNER_RPC_PREFERRED_SQL_FALLBACK read → satisfied? CONFIRMED →
  track deferred/mismatch → on deadline return DEFERRED or MISSING → wait & repeat.
  Returns `{confirmationState, operation, deferredOutcome}`.
- **`confirmReplicaOperationPersistence` (446-466)** — thin wrapper over the engine.
  Adds only: DEFERRED pass-through; **throw** when confirmed-but-no-operation;
  `emitReplicaOperationPersistenceDivergence` on success.
- **`confirmPersistedOperationUpdate` (230-252)** — update-path wrapper. Adds only:
  `confirmPersistence === false` short-circuit; the witness record/clear bookkeeping;
  `syncIncompleteOperationObservation`; always returns `true`.

The shared visibility logic lives in ONE place (`isReplicaOperationVisibilitySatisfied`,
594-638 — verified single definition across the whole `src/rebalancer` tree). The
owner-RPC escalation ladder lives in `confirmReplicaOperationVisibility` (and, in
single-shot form, in `queryReplicaOperationPersistenceAuthorityObservation`).

**Verdict:** cannot collapse the three to one — each tier is a distinct concern and
each has ≥1 external caller of the middle tier (`confirmReplicaOperationPersistence`
is called from owner-execution-lane:740 and terminal-transition-repair:191). **KEEP
SEPARATE.**

**Real duplication found is elsewhere (see Proposal 1):** the *witness+confirm+sync*
block is byte-for-byte duplicated between `persistNewOperationUnlocked` (111-126) and
`confirmPersistedOperationUpdate` (236-250).

**Second, lower-value duplication (Proposal 4):** the local→authority escalation
*shape* appears both in the loop `confirmReplicaOperationVisibility` (505-561) and in
the single-shot `queryReplicaOperationPersistenceAuthorityObservation` (403-443).
Same "local read; satisfied? return; else authority read; satisfied? return; else
keep local" ladder, different return contracts (poll+deferral vs single observation).

---

## Q2 — Repair-path overlap: is there one "reconcile against authority" primitive in three copies?

**No single safe primitive — and the reverted commit is the proof.** The three
repair paths are deliberately DIFFERENT in what they are allowed to do:

| Path | Read used | On divergence | Reinsert? |
| --- | --- | --- | --- |
| `recoverPersistedReplicaOperationMutation` (468-496) | OWNER_LOCAL_ONLY only | emit divergence, return true ONLY if already-applied | **never** |
| `resolveZeroChangeOperationUpdate` (277-320) | owner-RPC escalated (`queryReplicaOperationPersistenceAuthorityOperation`) | reinsert via `persistNewOperationUnlocked` **iff `!authoritativeOperation`** | yes, row-absent only |
| reverted arm-2 `1ce80391` | owner-RPC escalated | reinsert on retryable participant-failure divergence | yes — **this is what regressed** |

They already share their *sub-primitives*: `queryReplicaOperationPersistenceAuthorityOperation`
/ `...Observation` (owner-RPC ladder), `isReplicaOperationVisibilitySatisfied`,
`persistNewOperationUnlocked` (OR-IGNORE reinsert), `emitReplicaOperationPersistenceDivergence`,
`isRetryableOperationPersistError`. So the "authority-read + satisfied-check + emit"
core is NOT triplicated — it is factored.

What is NOT shared, and must not be unified, is the **reinsert trigger policy**:
`recoverPersistedReplicaOperationMutation` uses a *local-only* read precisely so it
never re-materialises on the hot failed-mutation path. Commit `1ce80391` unified arm-2
into the create-on-missing shape (owner-RPC escalate + reinsert on every retryable
participant failure); `692c9dbb` reverted it because 2-pre-vs-2-post live runs showed a
~14× participant-failure/persist-throw storm (`pf 0-4 → 55-57`, throws `0-2 → 27-28`,
6-7 reinserts) during cold formation — the escalate/reinsert-per-failure shape amplifies
control-plane load on the hottest path and defeats the defer-backoff that lets lagging
participants hydrate.

**Verdict:** the apparent "three copies of reconcile" is one shared authority-read core
plus three deliberately different reinsert policies. The unification is exactly the
reverted change. **DO NOT propose merging the repair triggers.** This is the primary
look-alike-but-keep-separate case, guarded by the revert.

---

## Q3 — Dead / vestigial branches after raft fix `3717c518` + arm-2 revert?

No newly *unreachable* code, but two documented **latent** (unexercised) branches
remain, and one near-redundant double-call:

- **Gap (i) branch — `persistOperationUpdate:216-224`** (non-terminal, non-expected-step
  zero-change → `return false`). Design doc `design-cdc-nontermination-fix.md:99-105`
  calls it "latent but not binding — not exercised by any of the four ops this run."
  It is still *reachable* in general (any plain UPDATE that matches 0 rows), so it is
  NOT dead — do not delete. It is simply the un-repaired path the reverted design
  wanted to route through `resolveZeroChangeOperationUpdate`. Leave as-is.
- **Gap (iii) branch — `resolveZeroChangeOperationUpdate:295`** (`if (!authoritativeOperation)`
  guards the reinsert; a truthy-but-stale non-terminal row falls through to `return
  visibilitySatisfied` = false). Latent; design doc `:117-125` flags it as the
  intended place to also repair "row present but stale." Reachable, not dead. Leave.
- **`recoverPersistedReplicaOperationMutation` is wired twice per call** — as the
  gateway `onRetryableFailure` callback (63-67 insert, 192-196 update) AND again
  post-failure inside `persistNewOperationUnlocked:92` / `resolveFailedOperationUpdateResult:258`.
  The gateway invokes it in-loop on each retryable failure (gateway-methods:118-124,
  returning `{success:true, recoveredAfterRetryableFailure:true}`); the post-failure
  call is a final re-check after retries/timeout exhaust. Because it is idempotent and
  cheap on the local-only read, this is defensible (in-loop recovery + post-exhaustion
  recovery), NOT dead — but it is a genuine "same function, two wiring sites" the audit
  flags for documentation. Not a safe silent removal (the post-loop call can catch a
  row that became visible during the final backoff wait).

**Verdict:** nothing to delete as dead. Gap (i)/(iii) are latent-by-design, not
vestigial; removing them would drop real (if rarely-hit) branches.

---

## Q4 — changeCount semantics: is "was this write durable?" duplicated?

**`extractMutationChangeCount` is already single-owned** (gateway-methods:613-621);
reservation-lifecycle:111-113 delegates, partition-write-kernel only emits the raw
`changes` field. That part is clean — do not add another copy.

**But the durability *predicate* built on it is triplicated** (same logic, one written
inverted):
- `persistNewOperationUnlocked:128` — `if (changeCount === null || changeCount > 0) return true;`
- `persistOperationUpdate:216` — `if (changeCount !== null && changeCount <= 0) {…}` (the logical complement)
- `rebalance-coordinator-reservation-lifecycle-methods.js:148` — `changed: changeCount === null || changeCount > 0`

All three encode "unknown-count OR positive-count ⇒ the write is durable." A single
helper (e.g. `isDurableMutationChangeCount(result)` next to `extractMutationChangeCount`
on the gateway mixin) could own it. See Proposal 3. Note the semantic nuance the helper
must preserve: `null` (count unavailable) is treated as durable — that is intentional
(the canonical-ingress path may not report `changes`), so the helper must keep the
`null ⇒ true` arm, not collapse to `> 0`.

---

## Ranked consolidation proposals (SAFE / behavior-preserving first)

### Proposal 1 — Extract the duplicated witness+confirm+sync block  ★ SAFEST, highest confidence
- **(a) Files/lines:** `replica-operation-repository-mutation-persistence-methods.js`
  — `persistNewOperationUnlocked:111-126` and `confirmPersistedOperationUpdate:236-250`.
  The two blocks are byte-identical:
  `recordOwnerPersistedTransitionVisibilityWitness` → `try { visibility =
  await confirmReplicaOperationPersistence(operation) } finally { if state !==
  DEFERRED clearOwnerPersistedTransitionVisibilityWitness(id) }` →
  `syncIncompleteOperationObservation`.
- **(b) Merge target:** new private method e.g.
  `confirmPersistedTransitionWithWitness(operation)` returning `visibility`. Both
  callers replace the block with a single call; `persistNewOperationUnlocked` keeps its
  post-block use of the returned `visibility` (128-141), `confirmPersistedOperationUpdate`
  ignores the return and returns `true`.
- **(c) Invariant preserved:** witness is cleared iff state ≠ DEFERRED, in a `finally`,
  before `sync`; identical ordering and exception propagation (confirm can throw via
  `confirmReplicaOperationPersistence`; the `finally` runs either way — preserved).
- **(d) Blast radius:** one file, two call sites; no external callers.
- **(e) Risk:** very low. Only subtlety: `confirmReplicaOperationPersistence` may throw
  (missing-operation) — the shared helper must let it propagate exactly as today
  (`persistNewOperationUnlocked` currently lets it throw out of the method; so does
  `confirmPersistedOperationUpdate`). Keep the `try/finally` (no `catch`) to preserve
  that.

### Proposal 2 — Fold `resolveFailedOperationUpdateResult` and the `persistNewOperationUnlocked` failure arm into one recover-or-throw helper  ★ SAFE
- **(a) Files/lines:** `persistNewOperationUnlocked:90-106` and
  `resolveFailedOperationUpdateResult:256-272`. Both are: `recovered =
  await recoverPersistedReplicaOperationMutation(op, result); if (!recovered) { build
  persistError; logger.error(PERSIST_FAILED, {...failurePayload}); throw }; sync; return true`.
  The insert arm additionally sets nothing extra (identical besides being inline).
- **(b) Merge target:** the update path already has `resolveFailedOperationUpdateResult`;
  route the insert failure arm through the same helper (or a shared
  `recoverOrThrowPersistFailure(operation, result)`).
- **(c) Invariant preserved:** same recover→sync→true / else log+throw semantics; same
  `buildControlPlaneFailurePayload(this.nodeId, result)` and `PERSIST_FAILED` log key.
- **(d) Blast radius:** one file. `persistNewOperationUnlocked` is called from 3 sites
  (self, `persistNewOperation`, `resolveZeroChangeOperationUpdate:306`) — behavior for
  all is unchanged since only the internal failure arm is refactored.
- **(e) Risk:** low. Watch: the insert arm currently throws the SAME `persistError`; keep
  the throw inside the helper so the reinsert-from-`resolveZeroChangeOperationUpdate`
  path (which wraps the call in try/catch at 305-317) still catches it identically.
- **CAUTION:** this consolidation must stay *local-only recover* — do NOT let the merged
  helper add owner-RPC escalation or reinsert. That is the reverted `1ce80391`. Keep the
  merge purely structural.

### Proposal 3 — Single `isDurableMutationChangeCount(result)` helper  ★ SAFE
- **(a) Files/lines:** predicate at `persistNewOperationUnlocked:128`,
  `persistOperationUpdate:216` (inverted), and
  `rebalance-coordinator-reservation-lifecycle-methods.js:148`.
- **(b) Merge target:** add `isDurableMutationChangeCount(result)` beside
  `extractMutationChangeCount` on the gateway mixin (gateway-methods:613); each site
  calls it (update site negates it).
- **(c) Invariant preserved:** `null ⇒ durable (true)` MUST be retained (count-unavailable
  is intentionally treated as durable). `> 0 ⇒ true`, `<= 0 ⇒ false`.
- **(d) Blast radius:** 3 call sites across 2 files (persistence-methods, reservation-lifecycle);
  reservation-lifecycle already delegates `extractMutationChangeCount` to the repository,
  so the pattern is established.
- **(e) Risk:** low. Only care: `persistOperationUpdate:216` also gates on
  `expectedWorkflowStep || terminalTransition` — that CONTROL stays inline; only the
  count predicate moves. Do not fold the guard.

### Proposal 4 — Factor the local→authority read ladder shared by the confirm-loop and the single-shot observation  ★ MODERATE, lower priority
- **(a) Files/lines:** `queryReplicaOperationPersistenceAuthorityObservation:403-443`
  (single-shot) and the loop body of `confirmReplicaOperationVisibility:505-561` (per
  iteration). Both do: local OWNER_LOCAL_ONLY read → satisfied? use it → owner-RPC read →
  satisfied? use it → else keep local.
- **(b) Merge target:** a private `readLocalThenAuthorityObservation(operation, {allow…})`
  returning `{localObservation, authorityObservation}` (or the first satisfied one). The
  loop wraps it with deferral/deadline bookkeeping; the single-shot wraps it with the
  keep-local fallback.
- **(c) Invariant preserved:** the two callers have DIFFERENT return contracts (poll
  loop yields CONFIRMED/DEFERRED/MISSING + deferredOutcome tracking; single-shot yields
  one observation with keep-local-on-unreachable). Only the two read calls + the two
  satisfied-checks are common; the deferred/mismatch tracking (531-535, 562-568) and the
  keep-local branch (440-442) must remain in their respective callers.
- **(d) Blast radius:** one file; `confirmReplicaOperationVisibility` feeds every confirm
  tier, so a regression here touches all persistence confirmation — highest-consequence
  surface in the cluster.
- **(e) Risk:** MODERATE. The escalated read options differ subtly between the two
  (`confirmReplicaOperationVisibility` passes `allowPriorityRecoveryDeferredVisibility:true`
  + `allowOwnerPersistedTransitionDeferredVisibility:true` on BOTH reads;
  `queryReplicaOperationPersistenceAuthorityObservation` passes them from caller options
  and adds `preferOwnerRpcReadLeader` only on the authority read). A shared helper must
  parameterize these exactly or it changes deferral behavior. **Recommend only after
  Proposals 1-3, with a red-on-revert DT that exercises the poll deferral path.**

### Keep-separate (look-alike, guarded) — do NOT merge
- **The three repair reinsert policies** (`recoverPersistedReplicaOperationMutation`
  local-only-no-reinsert vs `resolveZeroChangeOperationUpdate` owner-RPC-reinsert-on-absent).
  Guarded by the `692c9dbb` revert: unifying the reinsert trigger = the live-regressing
  `1ce80391`. Guarding reason is documented in the revert message and
  `live-regression-gapII-reverted.md`.
- **The three confirm tiers** (`confirmReplicaOperationVisibility` /
  `confirmReplicaOperationPersistence` / `confirmPersistedOperationUpdate`). Layered,
  each with distinct concern and external callers; already share the one visibility
  predicate.
- **Gap (i)/(iii) latent branches.** Reachable, not dead; leave in place.

---

## Bottom line
Three genuinely SAFE, behavior-preserving wins (Proposals 1-3) — all within
`replica-operation-persistence-methods.js` (+ one predicate move to gateway/reservation).
The tempting "unify the three reconcile paths" is exactly the reverted `1ce80391` and
must stay three deliberately-different reinsert policies. The `extractMutationChangeCount`
owner and the `isReplicaOperationVisibilitySatisfied` predicate are ALREADY singletons —
no action, just confirm no new copies are added.
