# Adversarial re-vet: REFINED plan (R1–R4) vs shipped demote-immediately constraints

Read-only correctness attack. Inputs: `REFINED-PLAN-post-raft-review.md`;
shipped `src/partition/partition-service-durability-fitness.js` (commit
`d0f7f776` / lineage `9234e904`); the companion heal
`src/partition/partition-service-transaction-base.js` (commit `d0f7f776`);
the heal design vet
`solve/changes/ledger-participant-transaction-zombie-lifecycle/vet-zombie-lifecycle-design.md`.

## The load-bearing fact the plan's owner-boundary note missed

The "never bare-rollback" constraint is NOT enforced by the demotion. It is
enforced by the heal's OWN role gate, which is independent of and redundant
with demotion:

- `isStuckTransactionHealPermitted()` — `partition-service-transaction-base.js:396-400`:
  returns `true` only when `role ∈ {FOLLOWER, LEARNER}` OR the group is solo.
  A multi-replica **LEADER or CANDIDATE returns false**.
- Both zombie-heal rollback sites consult it BEFORE `db.exec(ROLLBACK)`:
  the sweep at `:331` (rollback at `:344`, logs `STUCK_TRANSACTION_HEAL_DEFERRED`
  on a leader) and the `rollbackTransaction` catch at `:764` (rollback at `:766`).
- The heal-design vet (`vet-zombie-lifecycle-design.md`, findings Z2 and the
  "single-replica ruling") is explicit: the gate is `FOLLOWER/LEARNER-or-solo`,
  NOT "not-leader", precisely because a CANDIDATE rollback re-mints a phantom
  index it already advertised in `requestVote`. JS single-threadedness makes the
  per-tick `check → exec` atomic, so the gate is airtight against role churn.

The durability-fitness comment ("demotion is the heal's safety prerequisite",
durability-fitness.js:17-19) describes the shipped CHOREOGRAPHY (demote → role
becomes FOLLOWER → gate opens → heal runs), not the only safety mechanism. The
gate is belt; the demotion is suspenders. This distinction is what decides the
attack.

---

## Q1 — BARE-ROLLBACK HAZARD

**SAFE (could not reproduce a leader bare-rollback), but with a load-bearing
caveat that turns into Q2/Q4.**

Interleaving traced: under R1 the sick node STAYS LEADER while retrying the
transfer. During that window can the zombie heal into a divergence?

- The only paths that roll the zombie back are the sweep (`:344`) and the
  `rollbackTransaction` catch (`:766`). BOTH are gated by
  `isStuckTransactionHealPermitted()`. While the node is a multi-replica LEADER
  the gate is CLOSED — the sweep returns 0 and logs
  `STUCK_TRANSACTION_HEAL_DEFERRED` (`:331-341`). **No rollback fires while the
  node is leader.** So R1 does not re-open the re-mint / follower-truncation
  divergence.
- Role-churn variants during R1 are also safe because the gate keys on the
  live role, re-evaluated each tick:
  - transfer accepted → target campaigns → higher term reaches the sick node →
    it steps down to FOLLOWER → next sweep tick gate OPENS → rollback fires **as
    a follower = crash-equivalent** (identical to the shipped demote→heal path).
  - sick node's lease lapses mid-transfer → it becomes CANDIDATE → gate still
    CLOSED (Z2) → defers. Safe.
  So R1's role trajectory is LEADER → (FOLLOWER | CANDIDATE), and the heal only
  ever executes on FOLLOWER/LEARNER. No candidate/leader rollback is reachable.
- A "natural" heal (the participant tx COMMITs) is monotonic and safe on any
  role — but the orphaned zombie by construction is never committed (its
  coordinator committed against an empty set), so it only clears via the
  role-gated rollback. Under R1-hold it therefore **never clears while the node
  is leader**.

Consequence (the caveat that dominates Q2/Q4): R1 does not create a safety
divergence; it converts the problem into LIVENESS — the zombie is gated off from
healing for the entire (possibly unbounded) leader-hold window, and the partition
makes zero durable progress.

Two secondary, non-blocking observations:

- R1 WIDENS the dwell time in the "leader with frozen local durability" state
  from ~3 strike-ticks (shipped: detect→demote in a few seconds) to
  potentially many seconds / indefinitely. The pre-existing, out-of-scope
  legitimate-rollback leader paths that are NOT role-gated
  (`:682` commit-failure catch, `:732` main-path replicated rollback) get a
  larger exposure window. These are driven by a CLIENT commit/rollback of the
  session; the orphaned zombie has no such client, and the single-active-session
  invariant prevents a concurrent legit session on the wedged connection, so
  this is exposure-widening, not a new trigger. Record, not a blocker.
- Continued in-memory minting under R1 (see Q3) grows the local non-durable log
  suffix, but it is durably replicated to healthy followers, so it is not a
  divergence source.

**R2's role:** R2 (stop acking) is orthogonal to log-index minting — it does not
touch the rollback paths at all, so it neither causes nor prevents the
bare-rollback. It addresses "silently lying leader", a different axis. So R2 is
NOT what keeps Q1 safe; the heal's role gate is.

---

## Q2 — CL-033/034 CHURN

**SAFE ONLY UNDER AN EXPLICIT IMPLEMENTATION CONSTRAINT (C1); otherwise HAZARD.**

Under R1 the node never voluntarily loses leadership, so the "zombie re-WINS
after the deferral window" concern is moot for the steady hold. BUT R1 has role-
churn windows (transfer step-down to FOLLOWER; failed-transfer + lease-loss to
CANDIDATE) in which the fully-electable zombie (in-memory log matches followers'
— durability-fitness.js:36, :303-307) could campaign and re-win. The shipped
design defends this by re-asserting `deferCandidacy()` EVERY tick while unfit,
placed BEFORE the successor gate (durability-fitness.js:308-310, hardening G4).

HAZARD if R1's implementation removes the `resolveLeaderDurabilityUnfitConsequence`
demotion block wholesale ("we don't demote anymore") and drops the
`deferCandidacy` re-assertion with it: CL-033/034 churn returns in every R1
role-churn window. **C1: R1 MUST keep the every-tick `deferCandidacy` while
unfit even though it no longer calls `performTrackedLeaderDemotion`.** The heal's
CANDIDATE gate (Z2) is a second net that prevents an *unsafe* candidate rollback
even if C1 is violated, but it does not prevent the churn/liveness thrash.

**Liveness comparison (unfit-leader-holds-role vs demote→brief-void):**

- Group HAS a healthy successor: demote-immediately's "void" is short — an
  election resolves in one timeout and the healthy node takes over; meanwhile
  the demoted node heals (role=FOLLOWER → rollback → catch up). R1-hold is
  strictly BETTER here only if it actually transfers; if it dithers it is WORSE
  (holds the seat, no durable commits, blocks the ready successor). Net: R1 wins
  *iff* the transfer fires promptly — which is what R1 is designed to do. OK.
- Group has NO viable successor (whole-group-degraded / catching-up learner —
  the run-6 case): demote-immediately produces the 66s void the round-2 review
  hates, BUT it frees the seat and lets THIS node heal. R1-hold keeps a
  non-durable leader on the seat forever, gates the heal off (Q1), and blocks
  every other node — **strictly worse for liveness AND self-healing.** This is
  the case that forces C3 (Q4).

---

## Q3 — R2 SUFFICIENCY (ack vs mint vs commit-advance)

**SAFE as R2+R3 together; R2 alone is INSUFFICIENT.**

- Acking the CLIENT (2PC/query durability response) is a distinct seam from raft
  follower-ack accounting and log minting. R2 can suppress the client-facing
  durable ack (fail loudly) without stopping `proposeWrite`/replication. So R2 is
  implementable while the leader keeps minting to keep followers current for the
  eventual transfer.
- Does continued minting poison the successor? NO, in the healthy-successor
  case: the zombie is LOCAL to the sick leader's sqlite connection. Followers are
  not zombied — they persist replicated entries DURABLY before acking, and the
  leader's commit index advances on that real durable quorum. So entries 150..155
  are durably committed on the followers even though the leader's own copy sits
  non-durable inside the open tx. A transfer to a follower whose `Match ==
  committed` therefore hands leadership to a node that HAS the entries durably —
  no phantom inheritance.
- The round-2 Q1 caveat (successor inherits non-durable "committed" entries)
  only bites when the entries are non-durable EVERYWHERE — i.e. the commit index
  advanced on phantom acks across a whole-degraded group. That is exactly what
  R3's "not-itself-durability-unfit" + `Match == committed index` gate rejects,
  routing to R4. So the caveat is closed by R3, not by R2. **C2: R2 must be paired
  with R3 (not-unfit successor); R2's stop-acking alone does not protect the
  successor.**

## Q3b — TRANSFER FROM A SICK LEADER

**PHYSICALLY POSSIBLE; NOT circular.**

Raft replication and `TimeoutNow` run over the in-memory log + network; they are
not gated on the sick node's local durable fsync. The leader's committed index
advances from healthy followers' quorum acks, so it can bring a target to
`Match == committed` and issue the transfer even while its own apply/durability
is frozen. The transfer does NOT require the heal first — on the contrary it is
the mechanism that flips this.role to FOLLOWER and thereby OPENS the heal gate.
The one degenerate case: if the "committed index" the leader advertises is a
phantom not backed by ANY durable follower (whole-group-degraded), the target
cannot truly reach a durable `Match` and R3 finds no viable successor → R4. So
R1's transfer is sound wherever a genuinely-durable follower exists, and correctly
fails closed (into R4) where none does.

---

## Q4 — RECONCILIATION

**A needle-threading shape EXISTS, and it must include a bounded fallback to
demote-immediately.** The constraints do not fundamentally conflict *except* in
the no-successor case.

Reconciled shape:

1. On detection: HOLD the role, R2 stop-acking (kill the silent lie), and keep
   `deferCandidacy` every tick (C1).
2. Retry a DIRECTED, R3-gated transfer (voter, `Match == committed`, healthy,
   not-itself-unfit). Relinquish ONLY as the atomic result of an accepted
   transfer — which flips role to FOLLOWER and OPENS the heal gate, so the
   subsequent rollback is crash-equivalent (safe). This is the SAME safe
   role-flip the shipped demotion produced, reached via a confirmed handoff
   instead of a blind step-down.
3. If R3 yields no viable target within a bound: R4 escalate to the control
   plane (pre-ready a caught-up voter / member replace).
4. **C3 (mandatory): if R4 cannot produce a viable successor within a bound,
   FALL BACK to `performTrackedLeaderDemotion` (accept the void).** Without this,
   the whole-group-degraded case leaves a non-durable leader wedged on the seat
   with the heal gated off forever — strictly worse than the void it avoided.

This threads both shipped constraints: no bare-rollback (heal stays role-gated;
rollback fires only after the role flips to follower), no re-election churn
(deferCandidacy preserved; transfer is directed, not a scramble), while adding
the round-2 "never shed into a void" improvement for the common case where a
healthy successor exists.

---

## OVERALL VERDICT — SAFE-WITH-CONSTRAINTS

R1+R2 do **NOT** re-open the bare-rollback / committed-log-divergence the shipped
design closed. The owner-boundary note's premise ("R1 inverts the demote-
immediately safety mechanism") is partly mistaken: the real "never bare-rollback"
guard is the heal's own role gate `isStuckTransactionHealPermitted`
(transaction-base.js:396-400), which R1 does not touch. Demotion was the
*choreography* that opened that gate, not the guard itself. R1 reaches the same
safe FOLLOWER role-flip via an accepted transfer.

They are correct only under these binding constraints:

- **C1** — Re-assert `deferCandidacy()` every tick while unfit even after
  removing `performTrackedLeaderDemotion`; else CL-033/034 churn returns in R1's
  role-churn windows.
- **C2** — R2 suppresses only the client durable-ack, never raft minting/
  replication; pair it with R3's not-itself-unfit + `Match==committed` gate so a
  transfer successor is genuinely durable.
- **C3** — Bounded fallback to demote-immediately when R4 finds no viable
  successor within a bound. THIS IS THE ONE PLACE THE CONSTRAINTS GENUINELY BITE:
  without C3, R1 is unsafe-for-liveness in the whole-group-degraded case.
- **C4** — Preserve `isStuckTransactionHealPermitted` exactly; R1's longer
  leader-dwell relies on it to keep the heal gated off while leader and to fire
  crash-equivalently only after the role flips.

Verdict is **SAFE-WITH-CONSTRAINTS**, NOT "shipped demote-immediately must stay":
the demote is still needed, but only as the C3 bounded fallback rather than the
first-detection reflex.

### Single most dangerous interleaving
Whole-group-degraded / no-viable-successor (run-6 shape): the sick leader retains
the role under R1; R3 rejects every candidate (learners catching up, peers
durability-unfit); R4 escalation is slow or unavailable. Because role stays
LEADER, `isStuckTransactionHealPermitted` keeps the heal gated OFF — the zombie
never rolls back, the leader keeps minting non-durable in-memory entries while
acking nothing durable, and it blocks every other node from taking the seat. The
partition makes zero durable progress indefinitely — strictly worse than the
shipped demote-immediately, which at least frees the seat and lets this node heal.
C3 (bounded fallback to demotion) is the specific guard that neutralizes it.
