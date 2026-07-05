# Adversarial design vet — legs A + C (READ-ONLY)

Reviewer stance: try to BREAK the design. Cited against source read this session.

## HEADLINE CRUX (spans all of Leg A) — `queryOperationById` is CACHE-FIRST, not authoritative

The entire Leg A rationale is "re-verify the blocker via an AUTHORITATIVE point read
(`queryOperationById`), the same pattern `tryClearHeldOperationLedgerSelfMove` uses"
(design-fix.md:54-60; research-lingering-row-pin.md:220-228 asserts this read
"terminalizes the hold correctly; the incomplete-read path does not, because it
cache-short-circuits").

**That premise is false.** `queryOperationById`
(`replica-operation-repository-read-methods.js:257-275`) is documented "cache-first,
SQL fallback" (:253) and its FIRST action is
`getReplicaOperationRowFromCache(operationId)` (:258); if a cached row exists it
returns it and NEVER issues the SQL read (:259-261).
`getReplicaOperationRowFromCache` (`replica-operation-repository-row-methods.js:312-324`)
reads `this.systemTableCache.get(REPLICA_OPERATIONS, operationId)` — the SAME
`systemTableCache` REPLICA_OPERATIONS store that `queryIncompleteOperations`
(`replica-operation-repository-incomplete-read-methods.js:279-295`) short-circuits on
via `filterReplicaOperationRowsFromCache` (`…row-methods.js:330-339`, same cache).

Consequence in the exact run-28 H1 pathology (research-lingering-row-pin.md:74-127,
246-251): node-3's cache holds op-1 frozen at `STOPPING` (non-terminal). Therefore:
- `queryIncompleteOperations` returns op-1 (cache non-empty) → `liveOperations[0]` =
  op-1 → block (status quo).
- Leg A's re-verify calls `queryOperationById(op-1)` → cache hit → returns the SAME
  `STOPPING` row → `isOperationTerminal` = false, `isLiveOperationLedgerInterlockOperation`
  = true → **KEEP BLOCKING**.

Leg A therefore drops the ghost **only when the row is ABSENT from cache** (SQL
fallback runs) — but if the row is absent from cache, `queryIncompleteOperations`
would not have returned it either, so there was no block to clear. **Under H1 (the
dominant, best-supported hypothesis) Leg A is inert: it neither fixes the wedge nor
changes any behavior.** Under H2 (terminal write unreplicated to node-3, research
:252-256) even a true cache-bypassing SQL read on node-3 shows non-terminal, so only an
owner-RPC read to op-1's coordinator could resolve it — which cache-first
`queryOperationById` also does not do.

This is decisive and it poisons the DT plan too (see DT note at the end): a DT that
injects the ghost only into an authoritative store while leaving the cache "terminal"
would false-GREEN while production (cache-first) stays RED.

---

## LEG A

### A1 — Can a genuine in-flight self-move slip through and co-admit a 2nd config change? — SOUND (safety), but see CRUX
The safety *logic* is correct: a genuinely in-progress source-removal reads NON-TERMINAL
(`isOperationTerminal` false at `ledger-interlock-admission.js:84`), so the branch keeps
blocking; only an authoritatively-terminal row is dropped. `isOperationTerminal` /
`isLiveOperationLedgerInterlockOperation` (:83-97) correctly distinguish terminal from
non-terminal. So Leg A cannot *wrongly co-admit* two config changes.
BUT because the read is cache-first (CRUX), the discriminator it actually consults is the
same stale cache — it can never DROP a genuinely-live op (non-terminal in cache) and can
never DROP the run-28 ghost (also non-terminal in cache). It is safe precisely because it
is inert. Verdict: SOUND on safety; the leg does not achieve its purpose.

### A2 — Genuine DEPENDENT (different partition) writing ledger progress must keep blocking — SOUND (with an ambiguity to pin)
The scoping is correct. `isDisruptiveOperationLedgerSelfMove(type, partitionId)`
(:64-69) requires `isOperationLedgerPartitionTable`, so a `control_plane_publications-p1`
dependent (or any non-`replica_operations` op) is NOT a self-move → Leg A does not
re-verify it → the disruptive branch keeps `liveOperations[0]` as the blocker and throws
(run-20 preserved). Note: even if the predicate were BROADENED to any op, safety would
still hold, because the (properly authoritative) read is the arbiter and a live dependent
reads non-terminal. AMBIGUITY: design says both "SAME ledger partition" and
"`replica_operations-*`" (design-fix.md:54,64). Pin to same raft group (`-pX`); a
different `replica_operations` partition is an independent raft group and re-verifying it
is unnecessary. MUST pin, but not blocking.

### A3 — Point read on every blocked attempt: new wedge / tight loop / throw behavior? — SOUND
On read throw, the design mirrors `tryClearHeldOperationLedgerSelfMove` (:516-520:
`catch { return false }`) → keep blocking. That equals status quo (no new wedge). Cost is
one extra cache-`get` per blocked same-partition candidate (cheap; cache-first means it
does NOT even hit SQL under the wedge). No tight loop introduced beyond the existing
planner retry cadence. (Ironically, once the read is amended to be truly authoritative /
cache-bypassing — required by the CRUX — the "mid-move ledger reads fail" concern becomes
real: an SQL/owner-RPC read that throws or hangs must still fall to keep-blocking, exactly
as `tryClear` does. Preserve that catch.)

### A4 — TOCTOU after the async read — SOUND
Leg A modifies only the async observation lane (`ensureOperationLedgerSelfMoveSerialized`).
The synchronous co-admission gate is untouched:
`runOperationLedgerInterlockAccountedCreate` (:355-401) still calls
`assertOperationLedgerSelfMoveGateOpen` on entry (:365) and re-asserts after every await
(:384-388), and `state.selfMoveCreateInFlight` / `otherCreatesInFlight` (:470-479) still
serialize concurrent LOCAL creates. So even if Leg A dropped a ghost, the sync gate blocks
a real concurrent local self-move. Residual (not introduced by Leg A): the sync gate only
tracks LOCALLY-held self-moves (`heldSelfMoveOperationId`, set at :394 when THIS
coordinator created the op); a CROSS-NODE inherited op (op-1 on node-3) is invisible to it,
so the async lane is the only guard for that class — which is safe here only because Leg A
cannot wrongly-drop a live op (it errs to block).

### A5 — Does dropping the ghost leak into the "every other op defers" branch (:188-219)? — SOUND
No. Leg A's drop is confined to the `isDisruptiveSelfMove` branch which `return`s at :186.
The other-op branch (:192-219) is only reached for NON-disruptive ops (a different
`context`/call) and recomputes `liveOperations` from scratch each call (:143-158), so a
drop in one call cannot release a dependent hold in another. A dependent coordinated on a
FRESH-view node still sees op-1 terminal and proceeds to the concentration gate
(:233-256), matching forensics. (Residual: Leg A's authoritative re-verify is NOT applied
in the other-op branch, so a ghost seen by a node COORDINATING a dependent would still
wrongly throw `operation_ledger_self_move_in_flight` at :212-219 — out of run-28 scope, but
the asymmetry means the ghost class is only half-fixed.)

**Leg A verdict: BROKEN as designed** (inert under H1 via cache-first read; ineffective
under H2 without an owner read). Safety attacks all hold; efficacy does not.

---

## LEG C

Setup confirmed against source: the second guard (`move-planner-move-calculation-methods.js:625-628`)
fires when `replaceMoves.length === 0`, which in the run-28/probe shape is reached because
the serialization cap forces `replaceCount = min(1, max(0, 1 - inFlightReplaceCount)) = 0`
(:535-540) when op-1's drain-phase REPLACE is counted in `inFlightReplaceCount` (:524-534,
drain-inclusive via `getEntityInFlightOperations`). With `deficitEffectiveCount = 2 <
target 3` (drain-phase REPLACE excluded from `computeInFlightAwareReplicaAccounting`'s
input `getEntityTopologyBlockingInFlightOperations`, :314, :613-624; replacement still a
learner) neither guard suppresses → spurious ADD (op-2). Adding `+ inFlightReplaceCount`
(=1) makes 3 ≥ 3 → suppress. Mechanism is real and correctly located.

### C1 — Genuine-deficit scenario wrongly suppressed (starve)? — MUST-AMEND
Construct: `active = 2` (target 3) with ONE in-flight REPLACE that will NOT net +1:
- The REPLACE is a **cache ghost** — authoritatively terminal/failed but frozen
  non-terminal in `systemTableCache` (exactly the run-28 op-1 pathology). `getEntityInFlightOperations`
  → `getInFlightOperations` → `isTrackedInFlightOperation`
  (`unified-rebalancer-replica-state.js:544-554`) is a non-terminal CACHE filter with NO
  authoritative re-verify and NO CL-043 staleness exclusion. So the ghost is counted:
  `inFlightReplaceCount = 1` → `deficit(2)+1 = 3 ≥ 3` → the compensating deficit-fill ADD
  is SUPPRESSED, but the count is genuinely 2 and the ghost's replacement will never
  promote. Starvation persists until `failOperation` drops the op (voter-ready timeout) or
  the row ages out — the same 60 s-class window this quest exists to avoid.
- Note the asymmetry: **Leg A distrusts the cache (authoritative re-verify); Leg C trusts
  the raw cache count.** A ghost that Leg A is meant to detect will, in Leg C, actively
  starve a genuine deficit. The design's "self-correcting … next tick" claim
  (design-fix.md:89-91) is NOT timely for a stuck/ghost REPLACE.
REQUIRED AMENDMENT: bound the suppression — count only in-flight REPLACEs that pass the
same liveness discipline (exclude stale-past-step-timeout via the CL-043 predicate, and/or
apply an authoritative re-verify) before crediting them as "+1 that will restore count."
At minimum add a DT: `active < target` + a stale/ghost in-flight REPLACE must NOT
indefinitely suppress the deficit ADD.

### C2 — Direction: can it mint extra moves / hide a deficit that never self-heals? — SOUND (mint) / folds into C1 (hide)
The guards only execute `addMoves.length = 0` (:643) — they can only SUPPRESS ADDs, never
mint moves. So "extra moves" is impossible; direction is always suppress. The only
"hide a deficit that never self-heals" path is the ghost/failed-REPLACE case, already
raised in C1. No independent new failure here.

### C3 — Second guard is NOT priority-scoped; hoist must preserve the gate — MUST-AMEND
`inFlightReplaceCount` at :524-534 is `serializeCriticalReplace ? <count> : 0`, i.e. gated
on `isControlPlanePriorityPartition()`. The SECOND guard at :625-628 is **not** gated on
priority at all (it applies to every partition). The design says to "hoist … the same
`getEntityInFlightOperations().filter(REPLACE).length` the serialization cap already
computes" (design-fix.md:78-80) — but that phrase names the RAW filter inside the ternary.
If an implementer hoists the raw count (dropping the `serializeCriticalReplace` gate),
every non-priority user partition (movies-p1, etc.) silently gains `+inFlightReplaceCount`
in its deficit comparison — a fleet-wide behavior change the design neither intends nor
tests. REQUIRED AMENDMENT: the hoisted value MUST retain the
`serializeCriticalReplace`/`isControlPlanePriorityPartition()` gate (i.e. hoist
`serializeCriticalReplace ? count : 0`, not the bare filter), and add a non-priority
regression assertion that a non-priority partition's deficit ADD is unchanged.

### C4 — Do existing tests encode a semantics this breaks? — SOUND
- `test/rebalancer/in-flight-aware-replica-count.test.js` exercises
  `computeInFlightAwareReplicaAccounting`, which Leg C does NOT modify (it adds a separate
  `getEntityInFlightOperations` REPLACE count to the guard comparison, not to
  `deficitEffectiveCount`). Unaffected.
- `test/rebalancer/move-planner-spread-vs-count-reconciliation.test.js:142-170` ("still
  emits a legitimate ADD when genuinely under target", active 2 < target 3) is the
  starvation control — it PASSES because that fixture has NO in-flight REPLACE
  (`inFlightReplaceCount = 0`, so `2 + 0 = 2 < 3` → ADD still fires). Leg C does not break
  it. The `:172-205` "replaceMoves>0 leak" case has `replaceMoves.length > 0` so the
  second guard never fires. No existing assertion is violated.
REQUIRED (not a break, a gap): the C-DT must ADD the missing control — genuine deficit
WITH a live in-flight REPLACE (suppress) vs WITH a ghost/failed REPLACE (must NOT suppress,
per C1).

**Leg C verdict: AMEND-THEN-GO.** Mechanism correct and correctly located; two mandatory
amendments (C1 ghost-liveness bound, C3 priority-scope preservation).

---

## OVERALL VERDICT: REDESIGN

Leg A as specified is **inert against its own target scenario** because the "authoritative
point read" it reuses (`queryOperationById`) is cache-first over the very cache that
produced the stale ghost. Since the design bills Leg A as "necessary + sufficient for the
admission hold to release" (design-fix.md:44-45), the quest's binding observable will not
move on head with this leg. It must be redesigned to use a cache-bypassing read path.
Leg C is salvageable with amendments.

### MANDATORY AMENDMENTS
1. **(Leg A, blocking) Replace the cache-first read with a genuinely cache-bypassing
   authoritative read.** `queryOperationById` returns the cached STOPPING ghost and makes
   Leg A a no-op under H1. Use an authoritative/owner path that bypasses the operation
   cache — e.g. `queryAuthoritativeOperationVisibilityObservation`
   (`replica-operation-repository-read-methods.js:284`, the "authoritative owner path
   only", with `requireOwnerRpcRead` for the H2 unreplicated-terminal case) or a direct
   `SELECT_OPERATION_BY_ID` that skips `getReplicaOperationRowFromCache`. Preserve the
   throw→keep-blocking fallback.
2. **(Leg A, blocking) State which hypothesis the fix closes and prove it.** A local
   cache-bypassing SQL read fixes H1 only; H2 (terminal write not replicated to node-3)
   needs an owner-RPC read. The design must commit to a read that is correct under BOTH, or
   explicitly scope to H1 and show (scenario-harness x3) that run-28 is H1. Absent-proof is
   not proof.
3. **(Leg A, DT fidelity) The Leg-A DT must inject the ghost into the SAME `systemTableCache`
   that `queryOperationById`/`queryIncompleteOperations` read**, so it faithfully exercises
   the cache-first short-circuit and would catch a read surface that returns the stale row.
   A DT that seeds only an authoritative store will false-GREEN.
4. **(Leg C, blocking) Bound the in-flight-REPLACE credit by liveness.** Exclude
   stale-past-step-timeout REPLACEs (CL-043 predicate) and/or authoritatively re-verify
   before crediting `+inFlightReplaceCount`, so a ghost/failed REPLACE cannot starve a
   genuine deficit-fill ADD. Add a DT for `active < target` + stale/ghost REPLACE → ADD
   must still fire.
5. **(Leg C, blocking) Preserve the priority scope on the hoisted count.** Hoist
   `serializeCriticalReplace ? count : 0`, not the bare filter, so non-priority partitions
   are unaffected. Add a non-priority regression assertion.
6. **(Leg A, non-blocking) Pin the blocker predicate to the same raft group (`-pX`)**, not
   the ambiguous `replica_operations-*`.
