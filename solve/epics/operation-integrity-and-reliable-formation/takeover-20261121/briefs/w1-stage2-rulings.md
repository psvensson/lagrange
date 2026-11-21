# W1 stage 2 — lead rulings (2026-11-21) on the stage-1 questions

Stage 1 (by the previous implementer) is complete and pushed: branch tip 8eba5f745. Its transition record is
`/mnt/data/peter/projects/lagrange-takeover-20261121/reports/w1-transition-record.md` (8-item checklist, B1
decision, full state × event table, finding verification, witness map, questions Q1-Q9). 23 new witnesses ran on
tv-dator: 16 red on the draft tip for the intended reason, 7 guards green. Lab outputs:
`/mnt/data/peter/projects/lagrange-takeover-20261121/lab/w1-baseline-tip-0993265e5`, `w1-witness-run1-7b0b427b2`,
`w1-witness-run2-8eba5f745`. No `src/` file has been changed yet. Stage 2 = implement to green.

Accepted: the stage-1 record; the B1 decision (the repository owns one continuation per retained record). Note:
953d705f8 IS an ancestor of the collected runtime f580579a5 and of the integration branch, just not of this
branch's older base, so the workflow-owner retry entry will coexist with this one after the merge. State in the
transition record why they are two owners of two different obligations (row-visible progress versus absent-row
repair) so nobody merges them later by mistake. Accepted too: the refutations/narrowings of A1, B5 and B2.

Q1 bound: APPROVED with one condition. Re-arm until first unavailable read + REBALANCE_OPERATION_BUDGET_MS, then
exactly one wait_bound_spent report, then event-driven. Condition: a spent bound never disables the obligation.
Any later legitimate trigger (commit, publication change, route change, leadership start, caller) starts a fresh
decision and, if that read is unavailable again, a fresh bounded window with its own single report. INVALID_ROW /
shape failures: typed, visible, arm no timer, keep the obligation, zero proposals; their wake is a change of the
offending row or of the binding. Name these reasons; no reasonless UNAVAILABLE.

Q2 tenure identity: custody is volatile receiver memory, so its lifetime is (receiver process lifetime) ∩ (ledger
leadership tenure). Attest BOTH in the custody: the receiver's ledger term (ingressTerm) and the receiver's
boot/service incarnation AS THE EXISTING OWNERS ALREADY CARRY IT. Do not invent an identity: find what the
canonical route / endpoint row / router already expose as the incarnation of that service (the coordinator
already carries `membershipOwnerBootIncarnation`, "the one the router carries and the nodes row publishes"; check
whether the SERVICES row's birth identity or the NODES boot incarnation is the owner-defined one for a partition
service) and use that. Use `created_at` only if that IS the owner-defined incarnation; record which and why. The
sender detects tenure end through: a disclaim reply, a route change, or a published incarnation change for the
bound endpoint.

Q3: YES. A receiver retires ingress-only records when its ledger tenure ends (their release condition, R13); a
later contact from the sender gets a typed disclaim. Witness: leadership loss WITHOUT restart ⇒ the sender resumes
and completes once; the receiver's record map is empty afterwards.

Q4: NOT approved as proposed. No sender-side pre-read, no change to the remote path's custody model (that would
create a second wake path, sender-owned publication wake versus receiver-owned commit wake, for one condition).
One rule: the decision that may propose always evaluates contention first, wherever it runs. Implement it in the
single decision used by RETRY and HANDOFF at the node that would propose (the ledger leader, native or via
ingress). The remote sender keeps sending the repair to the current receiver; the receiver answers CONTENDED from
its own qualified read, holds custody, and owns the blocker wake through its commit listener. Keep the
expectations of the existing test `A-origin BUSY routes to B…` (repair sent to B, custody on B) and ADD a counted
assertion there: zero native proposals at B while the blocker is unchanged, exactly one after it clears. Witness
W3 (origin becomes leader with unchanged BUSY ⇒ zero proposals) stays as written.

Q5: YES. All three ports required at construction (typed construction refusal, no default, no probe). Remove the
probes at `src/rebalancer/operation-workflow-gate-operation-row-repair.js:16` and
`src/rebalancer/replica-placement-owner.js:292` and migrate fixtures that relied on the missing methods to the
real construction; those two files are in scope for exactly that edit. The probe in
`src/partition/partition-placement-admission.js:191-193` belongs to the W1b writer: do not touch it.

Q6: the stage-2 "lost wake" mutant (reintroduce a role-keyed, notified-row wake predicate ⇒ W2 red) is accepted
in place of a throwaway predecessor ref.

Q7: stage 2, and it GATES green for the decisive ones: at least one A→B→A publication witness and one
remote-sender witness must be driven by the real publishers (`applyReplicaLeadership` → `queueRoleUpdate` /
`queueLeaderNodeUpdate`) into the coordinator's cache and by real CDC delivery to the sender. The remaining
witnesses may keep production-shaped rows through real cache admission, plus one conformance assertion: for the
same raft transition, the rows the fixture primitives admit are deep-equal to what the real publishers emit.
Replace the `raft_role: 'leader'` partition row in `test/partition/placement-retained-row-repair-fixture.js:82`.

Q8: APPROVED, as one decision with two inputs, event before timer: (a) the own-entry commit, when observed at the
node holding the record, settles the entry from the committed result (examine why `repair.js:43` excludes the
own-entry commit from the wake; if the exclusion exists only because the reply normally arrives first, remove it:
a visible committed winner needs no new proposal); (b) when no commit of the entry is observed, the bounded
continuation re-presents the EXACT entry (same entry id, same bytes) so native replay returns the original result
or admits it once. Witnesses: lost reply after commit on an idle ledger ⇒ settles with zero further proposals;
BACKPRESSURE/RESERVED never admitted on an idle ledger ⇒ exactly one committed effect, no other event needed.

Q9: APPROVED: an event decides immediately; backoff paces only timer-driven retries. Coalesce with the
processing/dirty distinction (one decision in flight, at most one reconsideration owed; an event arriving during a
decision marks it owed and is consumed after the decision settles, never dropped, never spun). Witness an event
storm during an outage: reads are bounded by one in flight plus one owed, not by the number of events.

Coordination with W1b (placement admission writer, another worktree): W1b owns the `PLACEMENT_CLEARING_TRIGGER`
table rows in `src/rebalancer/replica-placement-owner-constants.js` and the test
`test/rebalancer/replica-placement-owner-clearing-triggers.test.js` (F11, currently red because the three
`retained_*` rows were added without updating its hard-coded list). Do not edit the table's rows or F11. The
record-shape work replaces the record's own `clearingTrigger: null` deletion sentinel with a named record state;
leave the table's value convention as it is.

Practical: the pre-commit hook regenerates the inventory and takes ~10 minutes per commit and contends with other
writers: prefer fewer, coherent commits (still push after each). Lab hosts are shared (a physical formation run
and other tracks hold machine locks at times): host-busy means wait and retry on tv-dator.

Deliver at the end of stage 2: pushed shas; lab runs with output dirs and counts (the 16 red witnesses green, the
7 guards still green, the four-file selection plus `test/rebalancer/replace-real-group-native-ledger-recovery.test.js`
and the change cone versus 0993265e5); the two C4 witnesses, deletion-with-armed-continuation, and the
six-mechanism mutation table (each mutant's patch/sha and the witness that kills it); the updated transition
record; anything not green and why. Label executed versus read-only. Do not land, publish or record evidence.
