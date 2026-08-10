# over-target-cap-spread-cure-wipe — decisions

## The bug and the sealed behavior

The over-creation cap at
`src/rebalancer/move-planner-move-calculation-methods.js` fired on
`control_plane_publications-p1` with `prioritySpreadGapOpen:true` in its own
diagnostic and still did an unconditional `addMoves.length = 0` (40 fires in
the archived run `ec-postfix-20260810T060111Z`: activeCount=4, target=3,
activeDistinctNodeCount=2, targetDistinctNodeCount=3, deferredAdds=1). Sealed
behavior: when the gap is open the cap retains exactly the ADD moves that
cure distinct-node spread (targets not already hosting a replica) and still
refuses everything else.

## Decision table (single canonical outcome)

The retention decision is owned by
`classifyPriorityOverTargetSpreadCureCondition` in
`src/rebalancer/replica-placement-cure-policy.js` — the cure-typing owner's
exact-state conjunct idiom (`[...].every(Boolean)`, condition -> declared
cure row), the same declarative style as the file's sibling classifiers and
the rule-table idiom recorded for the active-gate handoff contract
(`src/control-plane/publication-active-gate-handoff-contract-decision.js`).

| State (evidence) | Outcome |
| --- | --- |
| priority non-ledger AND voter surplus > target AND distinct-node floor unmet AND >=1 ADD candidate AND no in-flight REPLACE | `retain_spread_cure_adds`: keep at most `gap` ADDs, one per distinct NON-hosting node, re-typed to the declared row `PRIORITY_OVER_TARGET_SPREAD_CURE` = `{ADD, spread_replicas}` |
| every other state (already-spread, ledger partition, in-flight REPLACE, no ADD candidates, at/under target) | `refuse_all_adds`: the pre-existing fail-closed floor, unchanged |

Applied by `applyOverTargetCapAddRetention`
(`src/rebalancer/move-planner-priority-spread-cure.js`); the planner cap
block calls it instead of `addMoves.length = 0` and logs
`overTargetCapAddDecision` / `retainedSpreadCureAddCount` next to the
existing diagnostic fields.

## Why retention alone was not sufficient (in-envelope completion)

Code trace + archived run: with a clean tree, a retained ADD would have been
wiped again downstream —

1. `applyPrioritySpreadDrainCure` hijacks the batch whenever a
   monotonic-safe REMOVE exists (`[S,S,S,J]` always has one), and that drain
   is exactly what the remove-safety owner refuses while the floor is unmet
   (spread-gated source removal — the circle named in the sealed statement:
   "sources have not drained (blocked on voter-ready spread)").
2. The replace-pairing block would consume the retained ADD into a REPLACE
   leadership handoff, which the priority family deliberately avoids
   (`PRIORITY_EXPAND_FOR_SPREAD` design).
3. The spread-vs-count reconcile guard wipes `increase_replica_count`
   ADDs at/over target — solved by re-typing the retained cure to
   `spread_replicas` through the cure row (also what lets it pass the
   replaceSerializationCap's existing reason-based retention).

So the fix has three small, owner-local parts, all inside the existing
priority-spread-cure family:

- the cap retention itself (new classifier + apply function);
- the priority drain classifier
  (`classifyPrioritySpreadSurplusDrainCureCondition`) gains the
  distinct-node-floor yield conjunct **its ledger sibling already has**
  (`classifyLedgerSpreadSurplusDrainCureCondition` requires
  `activeDistinctNodeCount >= requiredDistinctNodeCount`): the drain yields
  only when an ACTIONABLE spread-cure ADD is present and the floor is unmet
  (`actionableSpreadCureAddCount === 0 || floor met`). Spread-typed ADDs
  cannot exist at that call site on pre-quest source, so every pre-existing
  shape classifies identically (provably non-regressive at the classifier).
  Missing evidence defaults to 0 = drain proceeds as before.
- `applyPrioritySpreadExpandCure`'s classifier chain gains the over-target
  row so the retained ADD stays a serial standalone ADD (no REPLACE
  handoff, no same-batch surplus REMOVE) — the same expand-before-drain
  semantics the at-target row already encodes.

Resulting serial ladder for a concentrated over-target priority partition:
expand one node per tick until the floor is met, then drain one surplus per
tick (each drain now spread-safe, so enforcement admits it):
`[S,S,S,J] -> +K -> [S,S,S,J,K] -> -S -> [S,S,J,K] -> -S -> [S,J,K]`.

## Prior art (operator-required)

Mechanisms this fix REUSES or aligns with:

- **CL-036 (guarded, placement-priority-spread)** — the recorded class
  `circular-dependency-class-formation-vs-steady-state`: publications spread
  recovery must not be gated on a readiness that is itself gated on
  publications recovery. This quest is the same class one layer down: the
  surplus drain is gated on spread, and the spread ADD was gated (wiped) on
  the surplus. The cure follows CL-036's idiom — a narrow, evidence-scoped
  de-circularizing escape, not a new mechanism.
- **Cure-typing single-owner table**
  (`src/rebalancer/replica-placement-cure-policy.js`, quest
  cure-typing-single-owner-table) — the new condition/row/classifier live in
  the owner; the planner resolves rows and never re-derives type or lane.
  `npm run audit:cure-typing-owner` counts no new sites (the 2 counted
  sites are pre-existing `runtime-service-legacy-target-reconciler.js`
  debt, untouched here; that checker is a census metric, not a push gate).
- **Ledger drain floor conjunct**
  (`classifyLedgerSpreadSurplusDrainCureCondition`) — the priority drain
  classifier now carries the same floor semantics; this FINISHES an
  asymmetry rather than inventing a parallel drain policy.
- **PRIORITY_EXPAND_FOR_SPREAD serial expand/drain design** — the
  over-target row is the same cure `{ADD, spread_replicas}` one state
  earlier; the expand-cure hook (`replaceCount=0`, clear candidateRemoves,
  "physical spread must settle before its surplus source can drain") is
  reused verbatim.
- **Decision rule-table idiom** (active-gate handoff contract,
  theory-ledger bounded-re-entry lineage) — expressed here in this module
  family's native form: exact-state conjunct classifiers + a frozen
  two-outcome decision constant; first classifier match wins, refuse-all is
  the floor.
- **Admission-gating template item 1 (precheck-predicts-enforcement)** —
  the drain-yield conjunct makes the planner consult the same spread state
  the remove-safety enforcer refuses on, instead of admitting a drain that
  enforcement must reject.
- **No new timer/window mechanism** — the fix is a per-evaluation
  structural decision. The background-priority-spread-release stable-window
  tracker (`src/rebalancer/background-priority-spread-release-tracker.js`)
  owns release hysteresis for the background rebalance hold and is not
  touched or duplicated; no interaction (verified: no shared state, my
  change emits planner moves only).

Model invariants checked (operator-required):

- **models/incremental-replace-spread — SpreadNeverRegresses**: the change
  only ever ADDs onto a node not already hosting the partition (spread
  strictly increases when it lands) and DEFERS drains until the floor is
  met; the remove-safety owner and final-target gates are untouched. Inside
  the proven envelope; the model's regression-mutant case (blanket allow on
  removals) is not what this change does.
- **models/priority-spread-coverage — count-aware distinct coverage**: the
  retention consumes the numeric gap as data (`gap = required - active
  distinct`, cap at `gap`, one ADD per distinct eligible target) — exactly
  the `CountAwareClosure = TRUE` discipline; a single ADD can never be
  collapsed into closing a gap of two.
- **models/formation-schedule-feasibility**: no schedule/window arithmetic
  is changed; the fix removes wasted wipe-ticks from the formation window.

## Revised test pins (recorded, not silently changed)

Sealed behavior changes two existing pins (both are the gap-open over-target
state the quest re-legislates):

- `test/rebalancer/move-planner-over-creation-cap.test.js` — "over target =>
  no add-like, only drain" and the promotion-window case now expect exactly
  the bounded spread-cure ADD; the fail-closed floor keeps its own cases
  (already-spread => zero ADDs; gap-capped + hosting-node refusal added).
- `test/rebalancer/move-planner-critical-replace-serialization.test.js` and
  `test/rebalancer/surplus-drain-prefers-non-leader-source.test.js` — the
  serial ladder pins move the drain step to the floor-met state; the
  leader-vs-follower source-selection assertions (the files' real concern)
  are preserved unchanged on that state.

## Scope decisions

- **replaceSerializationCap (the :671-690 wipe, 58 fires on
  replica_operations-p1) did NOT get a copied escape.** Its semantics
  differ: it fires only while a serialized REPLACE is in flight (or freshly
  minted in the same batch) — i.e. a count-neutral cure is already carrying
  the spread work, and standalone count-increasing ADDs would re-create the
  surplus the serialized REPLACE resolves (the recorded mutual-defer
  standoff). It also ALREADY retains spread-typed ADDs
  (`reason !== increase_replica_count`), so a cap-retained cure ADD flows
  through it untouched by construction. For the ledger partition
  specifically, spread ownership is the serialized self-move lane +
  LEDGER_* rows; the new escape excludes the ledger for the same reason.
- **Ledger partitions keep pre-quest cap behavior** (refuse all): their
  expand/drain rows are separately guarded and serialized; widening the
  escape there has no live evidence and would blur row ownership.
- **The evidence field name is `actionableSpreadCureAddCount`**, defaulting
  absent -> 0 (drain proceeds), so pre-existing callers/tests classify
  identically.
- **Baseline tightened, not raised**: the test-corpus duplication baseline
  moved 833/31738 -> 832/31718 after extracting the shared stall-repro
  stack builder (one-way-baseline rule; the new integration tests added no
  net duplication).

## Independent verification (sealed constraint)

Two independent verifier subagent passes (admission-gating +
formation-circularity templates, plus adversarial checks a-h) ran over the
change on 2026-08-10: ZERO must-fix findings. Confirmed with code evidence:
no surplus-growth path on already-spread partitions; no infinite expand loop
(three independent bounds: strict distinct-count increase per landed ADD,
serial goal-state planner one-in-flight, hasPendingAddForNode/transitional
guards); drain-yield conjunct vacuously true on every pre-quest-reachable
shape; drainPhaseReplacementCredit and its consumers byte-identical; hoisted
inFlightReplaceCount identical to the old in-block computation; ledger
partition emitted-move behavior byte-identical. Applied advisory fixes:
drain-yield docstring tightened (the remove-safety hard refusal is the
degraded-read window's fail-closed fallback; with authoritative rows the
yield is still the converging choice), current-plan-only counting comment at
the yield filter, and the retain decision label is now emitted only when a
cure ADD actually survived. Remaining advisories (accepted, not code
changes): `deferredAdds` log field now means refused-count (differs from the
old all-adds value only in retention states — log tooling note);
gap-capped multi-ADD retention (>1) is reachable only through serial-lane
callers that dispatch one per cycle; end-to-end learner-promotion of the
retained voter rides the pre-existing priority-recovery overflow budget
(temporaryOverflowVoterBudget granted on hasPriorityRecoverySpreadGap —
unmodified machinery; see residual risk below).

## Known residual risk (out of sealed scope)

In the archived run, a wedged non-terminal ADD operation row (SYNCING for
~2 minutes, its target replica already committed) ALSO idled the serial
priority planner (`PROGRESS_EXISTING_TRANSITION`) for much of the window;
on ticks where such an op row is in flight, no new move is emitted
regardless of the cap. The cap wipe fixed here is the blocker on the
op-free ticks (and the one named by the sealed statement); the wedged-op
lifecycle belongs to the operation-workflow lineage (parent quest /
latent-convergence-blocker-census epic), not this quest.
