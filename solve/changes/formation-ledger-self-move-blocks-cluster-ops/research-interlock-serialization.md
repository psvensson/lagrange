# Rung-0 research — formation-ledger-self-move-blocks-cluster-ops

Repo: `/media/.../projects/something`. Run-4 logs: `data/examples/service-data-affinity-demo/node-{0..4}.log`
(span 2026-07-05T20:19:10 → 20:27:55). Adversarial forensics; be precise, cite file:line.

## TL;DR VERDICT

The hypothesis ("the interlock is over-broad and blocks all ledger writes, a retry-storm
that never drains") is **PARTIALLY TRUE but NOT the binding root**. The interlock's
`self_move_in_flight` direction *is* broad by design (run-20), but it is **not what keeps
the cluster from settling** — the **`operation_ledger_quorum_concentrated` hold** is, and
that hold persists because **the ledger's own quorum spread never CONVERGES to a
de-concentrated ≤target voter placement during formation**. It fails to converge because a
spurious count-increasing ADD (the sibling over-target quest) drives replica_operations-p1
to 4 voters / 2-on-seed permanently. This is a **LIVELOCK**, not a frozen deadlock.

Narrowing the interlock (fix direction a) is **unsafe (touches run-20/22) AND ineffective**
(the concentration hold would still block everything). The safe root fix is to make the
**ledger spread converge fast/correctly** — the sibling quest
`formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`.

---

## 1. The interlock admission logic — what it blocks and when

`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js`, method
`ensureOperationLedgerSelfMoveSerialized` (:129). Two directions:

**Direction A — a disruptive ledger self-move (REPLACE/REMOVE of a replica_operations
partition):** admits ONLY into an idle ledger. If any other live operation exists it throws
`operation_ledger_self_move_waiting_for_idle_ledger` (:160-174, via
`resolveDisruptiveSelfMoveConflict` :248). ADD is exempt (ledger spread recovery must stay
admissible, :114-116).

**Direction B — every OTHER operation (any partition) while a live ledger self-move
exists:** deferred with `operation_ledger_self_move_in_flight` (:195-222). This is the
330×-emitted signature. **This is the over-broad block: ALL other-partition operations
defer — control_plane_publications spread REPLACE, sql_transactions spread, the client's
CREATE TABLE / ratings-load ops — not just genuinely-conflicting ones.** Only exemption:
emergency quorum-restore ADDs for control_plane_publications / replica_operations
(`isEmergencyPriorityControlPlanePartition`, :136-141, :485-487).

**Direction B, no live self-move → still blocked by concentration:** when NO self-move is
live, `ensureOperationLedgerQuorumSpreadFirst` (:315-338, called at :209) throws
`operation_ledger_quorum_concentrated` (288×) for every non-exempt op while ANY ledger
partition's voter quorum is concentrated and its spread is actionable
(`evaluateOperationLedgerQuorumConcentration`, `operation-ledger-quorum-concentration.js:170`).

**Net gate on the whole control plane:** while replica_operations-p1 is concentrated,
EVERY other-partition op is deferred — either by `self_move_in_flight` (during each spread
attempt) or by `quorum_concentrated` (between attempts). The two signatures are the two
faces of the *same* gate: "nothing proceeds until the ledger de-concentrates."

### Is the block over-broad or a genuine unavailability window?

Direction B (`self_move_in_flight`) is **broad by intent**, protecting run-20: every
operation persists workflow progress INTO replica_operations, so a mid-reconfiguration
ledger raft group (esp. when its quorum was *concentrated* on a slow seed — run-22)
disrupts all progress writes. The block spans the *entire* self-move operation
(learner catch-up → promote → source drain, many seconds), which is broader than the true
raft-availability gap (a sub-second election / commit-index catch-up). So it is
**conservative relative to the physical unavailability window** — BUT the run-20/22 harm
was driven by *quorum concentration* (commits needing the slow seed's ack), which the
spread-first invariant addresses, not by the reconfiguration per se. **Narrowing B is
therefore theoretically defensible but does not help here (see §4/§5).**

## 2. What a "ledger self-move" is, and does it complete? (run-4 forensics)

Chronology (all nodes):
- `20:19:31` node-0 (seed, 595f2dd9) becomes raft leader for all bootstrap-concentrated
  system partitions.
- `20:19:34` node-0 executes replica_operations-p1 REPLACE (spread the ledger off seed).
- `20:19:36`–`51` node-0 storms `self_move_in_flight`, blocking all other partitions.
- `20:19:51` node-0 **loses** control-plane leadership (ledger leadership relocated as part
  of its own spread); node-1 becomes rebalancer leader `20:19:51.6`.
- `20:19:52`–`20:20:31` node-1 re-plans the ledger spread and **re-executes** REPLACEs at
  `20:19:55, 20:20:02, 20:20:05, 20:20:11, 20:20:16, 20:20:27` — each hitting
  `waiting_for_idle_ledger` (12×, its own self-move can't admit into a non-idle ledger) and
  `self_move_in_flight` (blocks others) and `quorum_concentrated`. It **also mints a
  count-increasing ADD for replica_operations at `20:19:52` / `20:19:55`.**
- After `20:20:31` interlock rejections STOP, but `"Deferring spread-driven
  count-increasing ADD while already at/over target replica count"` fires 31× post-storm
  (the over-target symptom). The cluster **never settles**; node-1 stays leader until the
  demo teardown at `20:27:54` (nodes 3/4 also shut down `20:27:54`).

**Verdict: LIVELOCK, not deadlock.** Distinct self-move REPLACEs are dispatched *repeatedly*
across a seed→node-1 leadership handoff; each attempt storms the interlock. The spread
**never converges** to ≤1 voter/node because the spurious ADD pushes the ledger to 4 voters
/ 2-on-seed (permanently over-target + concentrated). The 330 `self_move_in_flight` + 288
`quorum_concentrated` rejections are a retry-storm that burns the entire 120s formation
budget without draining. The interlock behaves *correctly* given the operations presented
to it — the operations presented (a spurious over-target ADD) are what's wrong.

## 3. Why quorum_concentrated (288)?

`operation-ledger-quorum-concentration.js`: a ledger partition is concentrated when voters
outside its hottest node cannot form a majority (:130); the hold engages when spread is
actionable (a ready empty node exists OR overTarget, :145-154). replica_operations-p1
stays concentrated because the count-neutral spread REPLACE that would cure it either
(a) can't admit (`waiting_for_idle_ledger` — a genuine in-flight ADD/REPLACE row keeps the
ledger non-idle), or (b) is undone by the count-increasing ADD that re-adds a voter to the
seed side (→ 4 voters, `overTarget` true forever). It is **not** a simple circular block of
the cure by the interlock — the disruptive-self-move branch is ADD-exempt and the spread
REPLACE is the cure — it is a **non-convergence**: the spread and the spurious ADD fight,
net voter placement never reaches ≤target de-concentrated.

## 4. Is the interlock over-broad — the fix-relevant question

Yes for `self_move_in_flight` (blocks all other ops during a self-move), but **narrowing it
cannot settle formation**: the SAME ops are ALSO blocked by `quorum_concentrated`
(:209/:315), and that hold persists for the whole window because the ledger never
de-concentrates. **The binding blocker is the persistent concentration, not the self-move
block.** Even a no-op Direction B would leave `quorum_concentrated` gating the control
plane. Decisively: the interlock is not the root; the incomplete spread is.

## 5. Fix directions — evaluation

- **(a) Narrow the interlock (block only genuinely-conflicting ops).** REJECT. (i) Directly
  weakens run-20/22 serialization the interlock exists to protect; (ii) ineffective — the
  `quorum_concentrated` hold dominates and would still block everything. Does not address
  root.
- **(b) Pipeline/buffer other-partition ledger writes.** REJECT (same as a) — still gated
  by concentration; adds a new buffering path (violates "avoid secondary caches" /
  "fix the gap in the existing mechanism"). Root untouched.
- **(c) Make the ledger spread complete FAST/correctly during formation.** ACCEPT — this is
  the root. The spread must converge to ≤1 voter/node (de-concentrated, ≤target) so BOTH
  holds release. That requires eliminating the spurious count-increasing ADD so the spread
  is a clean sequence of count-neutral REPLACEs. This is the sibling quest
  `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot` (voter-visibility
  read-path class: op-2 reads the ledger under-target because op-1's replacement is still a
  LEARNER at planning time — `move-planner-move-calculation-methods.js:312-316/:563`).
  Memory warns: 3 adversarial verifies refuted all *count-based* move-planner fixes; the fix
  must be **row-op-linked (voter-visibility read-path)**, like `136aebbc`, NOT a count
  heuristic.
- **(d) Bootstrap the ledger quorum spread-out so it needn't self-move.** REJECT —
  architecturally infeasible for a cold single-seed start: at system-table creation the seed
  is the only node up (joiners arrive later), so bootstrap MUST concentrate on the seed and
  the ledger MUST self-move to spread. `src/bootstrap/` confirms seed-only system-table
  seeding. The self-move IS the mechanism; the task is to make it converge (= c).

**Safest root fix: (c).** It does not weaken run-20/22 (the interlock keeps serializing
genuine reconfigurations; the DT scope-tests at
`dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js:158/174/190`
already pin that a genuine non-terminal same-partition, a different-partition, and a
dependent blocker all still block). It removes the spurious ADD so the spread reaches
≤target and both admission holds release.

**Honest note for the Solver:** this quest's "interlock serialization stalls cold
formation" framing resolves to the SAME root as the sibling over-target quest. The interlock
is not independently fixable here without either weakening safety or leaving the
concentration hold in place. Recommend the Solver treat this quest as **downstream of /
duplicated by** `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`, or
re-scope it to "make the ledger spread converge" (= that quest's work) rather than
"narrow the interlock."

## 6. DT substrate + binding observable

- **Composition bases** (test/convergence/):
  - `dt6-rebalancer-formation-self-move-interlock.test.js` — the run-20 co-scheduling storm;
    proves serialized dispatch completes while co-scheduling freezes. Real
    RebalanceCoordinator + real admission chain; ledger-write availability fault-injected.
  - `dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js` — the
    closest base for THIS class; exercises the REAL `ensureOperationLedgerSelfMoveSerialized`
    with cache-first observation seams. Scope-tests (:158/:174/:190) lock run-20 preservation.
  - `dt6-formation-ledger-quorum-spread-first.test.js` — the concentration/spread-first
    ordering invariant.
- **Binding observable a fix must move (deterministically, red-on-revert):** the ledger
  (replica_operations-p1) spread **CONVERGES to ≤target voters, de-concentrated (≤1
  voter/node, no node holds a majority)** within N formation ticks → the
  `operation_ledger_quorum_concentrated` hold RELEASES → a dependent other-partition
  operation (control-plane spread REPLACE / CREATE TABLE) **ADMITS and completes** while/after
  the ledger settles. On HEAD the spread mints a count-increasing ADD → 4 voters /
  2-on-seed → hold never releases → dependent op stays deferred (`quorum_concentrated` /
  `self_move_in_flight`). The live-demo binding observable: cold-formation control plane
  settles (no 120s no-completion stall) and the ratings load completes — scenario-harness
  3× consecutive per the quest `doneWhen`.

## Key file:line index
- Over-broad Direction-B block: `rebalance-coordinator-ledger-interlock-admission.js:195-222`
  (`operation_ledger_self_move_in_flight`).
- Concentration hold: same file `:209` → `ensureOperationLedgerQuorumSpreadFirst` `:315-338`
  (`operation_ledger_quorum_concentrated`).
- Disruptive-self-move idle-ledger gate: `:160-174` (`waiting_for_idle_ledger`), conflict
  resolution `:248-270`, ghost re-verify `:283-302` (the c7a3bf19 fix).
- Concentration predicate: `operation-ledger-quorum-concentration.js:117-155` (overTarget
  :145-146; spreadActionable :154), engaged `:170-209`.
- Over-target accounting root (sibling quest): `move-planner-move-calculation-methods.js:312-316/:563`.
