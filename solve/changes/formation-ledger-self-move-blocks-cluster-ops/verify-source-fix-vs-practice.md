# Source-fix vs. production practice: term-fenced rollback-on-step-down + loud commit-miss

Verdict on the proposed fix for the stranded-2PC-participant bug in a Raft-based DB:

- **Bug**: a 2PC participant's open write-transaction is LEADER-LOCAL on a partition
  raft leader; the later COMMIT is routed to whoever is CURRENTLY leader and carries
  NO leadership/term fence. A leadership change between BEGIN and COMMIT strands the
  open (uncommitted, never-prepared) transaction on the ex-leader while COMMIT lands
  on the new leader, which has no such transaction and returns "no active transaction"
  — silently treated as idempotent success. The distributed txn terminalizes green
  while the ex-leader stays frozen.
- **Proposed fix**: (1) TERM-FENCED ROLLBACK-ON-STEP-DOWN — on losing partition
  leadership, roll back any open uncommitted/never-prepared local participant txn;
  (2) NARROW the "commit-miss = idempotent success" mask so a stranded commit-miss is
  surfaced as a LOUD failure, not silently greened.

Research date: 2026-07-06. Each section: established practice + citation, then a
SUPPORTS / REFINES / WARNS-AGAINST tag.

---

## 1. Fencing across leadership / lease change — do production systems discard uncommitted local state on lease loss?

**Established practice.** The dominant pattern is: **replicated/committed state survives a
lease change; unreplicated local-only state is thrown away when the lease/leadership
moves.** In CockroachDB the two are explicitly separated:

- **Latches** (the leaseholder-local, in-memory concurrency-control primitive) are held
  only for the duration of a single low-level request and provide uncontested access to
  keys; when a leaseholder loses its lease, in-flight latches terminate and **uncommitted
  local in-memory state on that node is discarded** — it was never authoritative.
- **Write intents**, by contrast, are *provisional/uncommitted writes that are replicated
  via Raft*, so they DO survive a leaseholder change; a new leaseholder resolves them by
  reading the **transaction record** (PENDING / STAGING / COMMITTED / ABORTED) which lives
  in the range of the transaction's first write, independent of any one node's lease.
  Source: CockroachDB Transaction Layer / Replication Layer docs.
  <https://www.cockroachlabs.com/docs/stable/architecture/transaction-layer>
  <https://www.cockroachlabs.com/docs/stable/architecture/replication-layer>
- CockroachDB's **epoch-based leases**: a node must keep heartbeating its liveness record;
  on disconnect the epoch changes and the node loses all leases when the record expires,
  and leadership/lease transfer is gated (only the Raft leader may propose lease transfers,
  only to replicas caught up in the log). The "leader-leaseholder split" hazard — a
  leaseholder whose Raft log fell behind and cannot take Raft leadership — is exactly the
  class of split-brain the newer **Leader leases** were built to remove.
  <https://www.cockroachlabs.com/blog/distributed-database-leader-leases/>
- Spanner/Paxos leases show the same discipline: a replica **relinquishes its entire read
  lease when it receives a proposal**, regaining it only once that proposal is committed
  and applied; a lease is nullified on any message from a higher-numbered leader. In-flight
  local guarantees are dropped the moment leadership can move. (Spanner leader leases +
  TrueTime; corroborated by the LeaseGuard analysis.)
  <https://arxiv.org/pdf/2512.15659> (LeaseGuard: Raft Leases Done Right)

The crucial contrast with the bug: in these systems the *authoritative* record of an open
transaction is either **replicated** (CockroachDB intents + txn record) or the local hold is
**dropped on demotion** (latches, read leases). Nothing survives as a silent, non-durable,
leader-local hold whose commit can be answered by a *different* node that never had it.

**Tag: SUPPORTS (leg 1) + REFINES.** Discarding uncommitted local-only state on leadership
loss is precisely standard — that is leg (1) of the fix. The REFINEMENT the comparison
exposes: the deeper defect is that the participant hold is *leader-local and unreplicated in
the first place*. Rolling it back on step-down is the correct minimal fix given that design,
but the idiomatic end-state is that a participant's provisional write is Raft-replicated so
the new leader can adjudicate it (CockroachDB's intent + transaction-record model), rather
than answering the commit from empty local state.

---

## 2. Fencing tokens — is the missing term/epoch on the COMMIT the textbook defect?

**Established practice.** Kleppmann, *How to do distributed locking* (the canonical fencing-
token argument, also in DDIA): a lock/lease holder that pauses (GC, stall, network delay)
past its lease can lose the lease **without knowing it** and later issue a write that must be
rejected. The remedy is a **monotonically increasing fencing token** issued on each lock
acquisition, carried on **every write**, with the **storage service taking an active role in
rejecting any write whose token has gone backwards**:

> "the storage server remembers that it has already processed a write with a higher token
> number (34), and so it rejects the request with token 33 … the storage server takes an
> active role in checking tokens, and rejecting any writes on which the token has gone
> backwards."
> <https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html>

Map to the bug: the raft **term/leadership-epoch is exactly a monotonic fencing token**. The
BEGIN happened under term *T*; the COMMIT is routed to the current leader under term *T' > T*
carrying **no token**. There is no arbiter rejecting the stale-context commit — worse, the
new leader *accepts* it as a no-op success. This is a textbook missing-fence defect: the
COMMIT path must carry the originating term/epoch, and the executing node must reject (not
green) a commit whose fencing context no longer matches an owned, live transaction.

**Tag: SUPPORTS (strongly).** The fix's framing — "the COMMIT carries no leadership fence" —
is the DDIA/Kleppmann defect verbatim. REFINEMENT: make the fence an explicit
**term/epoch token on the commit path** (and ideally checked at BEGIN too), so the mask-
narrowing in leg (2) is driven by a positive token mismatch, not by heuristically guessing
whether a commit-miss was "stranded."

---

## 3. "Commit arrives at a node with no record of the transaction" — success or abort/error?

**Established practice — presumed abort (PA), the R* protocol; ISO-OSI / X-Open standard.**
Under **presumed abort**, the *absence* of information about a transaction means **ABORT**,
not commit:

- On recovery/inquiry, "if the coordinator has no information about the transaction on its
  log, it presumes that the transaction aborted and tells the subordinate to abort." A
  participant that aborts "releases all of its locks, and forgets the transaction."
  (R* PA/PC — Mohan/Lindsay/Obermarck; summarized via the 2PC/presumed-abort literature.)
  <https://www.cs.cmu.edu/~15721-f24/notes/12_TM5.pdf>
  <https://patents.google.com/patent/EP0578406A1/en>
- After a crash with no commit protocol record written, recovery **undoes** the transaction,
  writes an abort record, and forgets it — the default is abort.

So "no active transaction here" is, in presumed-abort semantics, **evidence of an abort/
unknown outcome — NOT a license to report commit success.** Treating commit-miss as
idempotent success is only sound when you can *prove* the target already committed (e.g. a
retried commit against a participant that logged COMMIT then forgot, i.e. presumed-commit
territory, or an idempotency key that positively matches a completed commit). It is
**dangerous exactly in the bug's case**: the miss is because the hold was stranded elsewhere,
so "success" masks a lost participant and violates atomicity.

**Tag: SUPPORTS (leg 2).** Narrowing "commit-miss = success" and surfacing a stranded miss
loudly is aligned with presumed-abort. REFINEMENT: distinguish the two commit-miss causes —
(a) a genuinely-idempotent retry of an *already-completed* commit (safe to green, needs
positive proof), vs (b) a miss because no such live transaction exists under the fencing
context (must be LOUD failure / abort signal to the coordinator). The default when you cannot
prove (a) must be (b): fail loud, per presumed-abort.

---

## 4. Rollback-on-step-down safety — safe to unconditionally roll back UNCOMMITTED (never-voted) local txns on demotion?

**Established practice.** Yes for **never-voted** transactions; **NO** for **prepared/voted-
yes** ones — this boundary is the heart of 2PC:

- A participant that has **not yet voted** is free to abort unilaterally at any time
  (presumed-abort: it just undoes, releases locks, forgets). This is crash-equivalent: a
  demoted-to-follower node aborting an uncommitted local hold is indistinguishable from that
  node having crashed before voting, which 2PC already tolerates.
- A **"yes" vote puts the participant in an in-doubt (prepared) state, implying it cannot
  commit OR abort the transaction without an explicit order from the coordinator.** If it
  finds a prepared record after a crash it must run recovery with the coordinator, NOT
  unilaterally abort. (R* PA.)
  <https://www.cs.cmu.edu/~15721-f24/notes/12_TM5.pdf>
  <https://www.sciencedirect.com/topics/computer-science/two-phase-commit>

The bug description says the stranded hold is specifically **"open (uncommitted, never-
prepared/ACTIVE)"** — which is exactly the never-voted class that is safe to roll back.
CockroachDB's latch-drop and Spanner's read-lease-relinquish on leadership change are
concrete production instances of "discard uncommitted local state on demotion."

**Tag: SUPPORTS with a hard GUARD (WARNS-AGAINST if mis-scoped).** Leg (1) is safe *only if
it rigorously excludes PREPARED/STAGING/voted-yes transactions*. Unconditional rollback that
swept up a prepared participant would violate 2PC atomicity (it could roll back a branch the
coordinator is about to — or already did — commit). The fix's own scoping ("never-prepared/
ACTIVE") is correct; make that predicate explicit and defensive.

---

## 5. Anti-patterns / pitfalls the fix might hit

1. **Rolling back a txn that actually committed (or prepared) elsewhere.** Covered by §4 —
   the never-prepared guard is load-bearing. A prepared branch must go through coordinator-
   driven recovery, never step-down rollback. **WARNS-AGAINST** any broadening of the
   rollback predicate.
2. **Spurious loud-failure on a legitimately-completed commit.** If leg (2) fires a loud
   failure for a commit-miss that was actually a safe idempotent retry, you convert a benign
   retry into a false abort. Mitigate by making the loud path fire on **positive fence/term
   mismatch or absence-of-any-record**, and keeping a positive idempotency proof path for
   genuine retries (§3). **REFINES.**
3. **Leadership flapping → repeated rollbacks / churn.** Given this codebase's known
   leadership-flap and self-move limit-cycle history, step-down rollback that triggers on
   every transient demotion could thrash open transactions. Gate the rollback on a *stable*
   step-down (term actually advanced / new leader established), analogous to
   CockroachDB/Spanner gating lease actions on epoch/term monotonicity, not on every
   heartbeat wobble. **REFINES (important here).**
4. **Fence needed on BOTH begin and commit.** Kleppmann's token must ride *every* write; a
   fence only on commit still lets a begin land under a stale context. Capture the
   originating term at BEGIN and re-check it (or re-anchor the hold) so the commit's fence
   check has a truthful baseline. **REFINES.**
5. **Absence-proves-nothing / stale-read on the commit path.** "No active transaction" read
   from a cache or a not-yet-caught-up new leader could be a false miss (the very stale-read
   class this repo has fought). The loud-failure decision must be made against an
   authoritative, term-current view, or it will manufacture false aborts. **WARNS-AGAINST**
   deciding commit-miss from a possibly-stale local view.

---

## OVERALL VERDICT

**Term-fenced rollback-on-step-down + surface commit-miss loudly is IDIOMATIC and CORRECT in
direction.** Both legs map cleanly onto established practice:

- Leg (1) = the standard "discard uncommitted local-only state on lease/leadership loss"
  (CockroachDB latches; Spanner read-lease relinquish), and is crash-equivalent-safe for
  never-voted transactions.
- Leg (2) = presumed-abort semantics (R*/ISO/X-Open): "no record of the transaction" defaults
  to abort/unknown, so silently greening a commit-miss is the actual bug; surfacing it is the
  correct behavior.
- The root cause is a **missing monotonic fence (raft term/epoch) on the COMMIT path** — the
  textbook Kleppmann fencing-token defect.

**Required refinements before shipping:**
1. Make the fence an **explicit term/epoch token carried on the commit path (and captured at
   BEGIN)**, and drive the loud-failure decision off a *positive* token/owner mismatch rather
   than a heuristic "was it stranded?" guess.
2. **Exempt PREPARED / STAGING / voted-yes transactions** from step-down rollback — those are
   in-doubt and must go through coordinator recovery, never unilateral abort.
3. **Gate rollback on a stable term advance** (not transient flap) to avoid thrash, and make
   the commit-miss verdict against an **authoritative, term-current** view (not a cache/stale
   read).

**Single biggest risk:** the never-prepared guard failing open — i.e., step-down rollback (or
the loud-fail path) mis-classifying a **prepared/committed branch** as never-voted and rolling
it back / falsely aborting it. That would trade a silent-stranding atomicity bug for a
silent-divergence atomicity bug (rolling back one side of a decision the coordinator has
already committed), which is strictly worse. The prepared-state exemption and an
authoritative (non-stale) commit-miss read are the two non-negotiables.

---

### Sources

- Martin Kleppmann, *How to do distributed locking* (fencing tokens; DDIA) —
  <https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html>
- CockroachDB Transaction Layer (latches, write intents, transaction records) —
  <https://www.cockroachlabs.com/docs/stable/architecture/transaction-layer>
- CockroachDB Replication Layer (leases, leaseholder/Raft-leader split) —
  <https://www.cockroachlabs.com/docs/stable/architecture/replication-layer>
- CockroachDB, *Distributed Database Leader Leases* (epoch vs leader leases; leader-
  leaseholder split) — <https://www.cockroachlabs.com/blog/distributed-database-leader-leases/>
- CMU 15-721, *Consensus on Transaction Commit* lecture notes (presumed abort; in-doubt/
  prepared participant recovery) — <https://www.cs.cmu.edu/~15721-f24/notes/12_TM5.pdf>
- *Two-Phase Commit — overview* (ScienceDirect; prepared/in-doubt state) —
  <https://www.sciencedirect.com/topics/computer-science/two-phase-commit>
- EP0578406A1 / R* presumed-commit & presumed-abort background —
  <https://patents.google.com/patent/EP0578406A1/en>
- LeaseGuard: *Raft Leases Done Right* (arXiv 2512.15659; lease nullified on higher term,
  Spanner lease discipline) — <https://arxiv.org/pdf/2512.15659>
