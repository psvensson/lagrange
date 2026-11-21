# Lead rulings (Claude, takeover 2026-11-21)

## 2026-11-21 ~12:10 CET — on W4 (fallback-read closure), report w4-fallback-read-closure.md
- H1 Owner fact = the leader-qualified read (leader REQUIRED + receiver-verified witness, index/term floors,
  commit == applied). It may schedule or propose; it never authorises an effect. Every effect is granted by a
  conditional committed write (CAS / native admission). SF-1 and SF-2 are repaired by putting the effect behind
  the conditional write, not by adding ReadIndex. ReadIndex would change the guarantee level: not adopted now;
  recorded as a possible later owner decision. (Lead judgment within the existing authority-and-recovery contract.)
- H2 Approved: in-process leader arm and widened candidates with receiver-side witness verification. This is
  routing to the one authority, not a second algorithm; a non-leader refuses with a typed answer.
- H3 Open: budgets (maxConcurrentRemoves/Adds) safety bound vs throttle — the S6 writer establishes it from the
  owning docs before S6; default assumption (unverified): throttle, safety is the remove-safety owner's.
- H4 S2 follows the W2 composition landing on the integration branch. The primary checkout's uncommitted
  strict-operation-outcomes tree is a stale early state from 2026-11-20 (68 of its 92 files differ from the
  composed runtime, which has all of them); it is preserved at preserve/20261121/primary-checkout and is NOT an
  in-flight writer. S1 bases on the integration line.
- H5 authorizeLegacyRuntimeRemoval: prove no token-less row can exist and delete; else a one-time explicit
  transition. No hardened legacy path.
- H6 Extract the shared owner-fact read in S0 (new files); the retained-repair owner adopts it at merge.
- H7 Retire the 2026-11-10 label-based checker in S-P, replaced by the one-way ratchet; S-P starts after W2
  merges the proof-closure branch.
- Order: S-P and S0 first; S1, S3, S4, S5 after S0 (disjoint writers); S2 after W2; S6-S9 after physical
  acceptance unless H3 says the budgets are safety bounds.

## 2026-11-21 ~12:30 CET — owner instruction on fallbacks
Owner: "I am concerned with the existence of fallbacks. It smells of legacy a bit. Please test any multiple path
for the same logic to make sure they really, really need to be there."
Ruling: burden of proof is on keeping an alternate arm; evidence is execution measurement and a trap/deletion
experiment, never a label. Track N (necessity audit) started: worklist from the coverage census
(`data/fallback-census/census.json`), trap-mode design, deletion slices, one-way ratchet. Reports under
`reports/necessity/`.

## 2026-11-21 ~12:00 CET — on W3 (leader identity has one authority), report w3-leader-authority-migration.md
Finding that corrects an earlier lead statement: the broken role readers #2-#5 are NOT shown to delay the
three-host formation or admit an unsafe removal (formation is ADD-only; #2 is neutral in all 38 recorded
decisions; #3/#4 are decision-dead; #5 has a live arm that answers first). Formation evidence instead shows
serialisation behind the ledger partition (~43 s), ~27 s without row change, and failed control-snapshot reads.
- D0 (b): run the checker/ratchet and the deletions of decision-dead arms now (S2a-c). Behaviour-changing
  slices (S1, S3, S4a, S4d, S5) wait for a formation baseline on the collected runtime and each gets a
  formation comparison; they are not dropped.
- D1 (a): owner row stays node-level; replica identity only from local or fresh-witness reads.
- D2: OWNER DECISION PENDING (re-key #2 = surrogate scheduling live for the first time, versus delete the lane
  and supersede quest movielens-priority-surrogate-single-owner-arbitration).
- D3: delete the guess tiers with the role arm for #8, #13, #14 (leader unknown = typed deferral + wake).
  #15's "any observable replica" first hop is subject to the necessity test before it is kept or renamed.
- D4: RETAINED_RUNTIME tier stays for now, bound recorded in the contract, subject to the necessity test.
- D5: message-group producer flip and its readers in one slice.
- D6: split-brain scenario cannot observe a leader: recorded as a finding, repair in S6.
- One ratchet, not three: the leader-authority rows, the fallback-read rows and the census buckets go into a
  single checker; its writer starts when the necessity audit reports.

## 2026-11-21 ~12:15 CET — W1 stage 1 (retained repair owner), record w1-transition-record.md
Stage 1: 23 new witnesses on tv-dator; 16 red on the draft tip for the intended reason, 7 guards green.
Rulings: B1 accepted (repository owns one continuation per retained record); Q1 bounded window of
REBALANCE_OPERATION_BUDGET_MS, one report, later triggers open a fresh window; Q2 custody attests ledger term and
the owner-defined service/boot incarnation; Q3 receiver retires ingress-only records at tenure end; Q4 NOT the
sender pre-read: contention is evaluated by the one decision at the node that would propose, remote custody model
unchanged; Q5 all ports required, two probes removed; Q6 lost-wake mutant accepted in place of a predecessor ref;
Q7 real publishers and real CDC gate green for the decisive witnesses, conformance assertion for the rest;
Q8 own-entry commit settles, else the continuation re-presents the exact entry; Q9 events decide immediately,
coalesced as one in flight plus one owed.

## 2026-11-21 ~12:15 CET — W1b stage 1 (placement outcome format), record w1b-transition-record.md
Facts: the placement owner is unreleased (no tag, not on main); fingerprint-less rows were written only by five
development commits on 2026-11-19; the fingerprint squats in the generic `last_insert_rowid` column; the WIP
silently consumed a committed placement entry that met another owner's record (W2 red, executed on adams-gamla).
Rulings: option (i) delete the NULL branch and OUTCOME_IDENTITY_UNAVAILABLE, exact identity or BYTES; scope widened
to the outcome owner for an owner-defined identity column with typed refusal at store open (no migration);
development data directories from before that change must be re-founded; trigger rows for the five unmapped
definite codes; W1b owns the trigger table rows and F11; one ordering (leadership, settled replay, pause, pending)
shared by placement and formation; BYTES at apply stays fail-closed, its partition effect to be stated.

## 2026-11-21 — OWNER DECISION on D2 (surrogate scheduling lane), verbatim sense
- The five-node milestone, recovery of a temporarily ownerless priority partition, and single-owner scheduling
  remain REQUIRED.
- Do not delete the surrogate lane merely because the current leader-role reader makes it unreachable.
- Correct the historical claim first: the July quest log records live surrogate scheduling, including 13 nonlocal
  moves through one declared owner; the October producer change then collapsed published partition leader roles to
  follower while this consumer still expects leader. (The lead's statement "never reachable in production" was
  wrong and is withdrawn pending the evidence-backed correction.)
- Order: finish the formation baseline, THEN a bounded repair of the existing scheduling-owner policy to consume
  canonical leader authority: one decision algorithm, explicit unavailability, an owned wake/reconsideration path,
  no legacy role-reader fallback.
- Removing the separate surrogate mechanism is supported ONLY if the necessity audit demonstrates the existing
  canonical recovery path gives the same required behaviour without it. The proof must cover: temporary loss of the
  target's scheduling owner, delayed publication, missed wakes, ownership changes, useful progress after the
  disruption clears; and that multiple rebalancers do not duplicate move construction, capacity checks or admission
  work (final operation deduplication alone is insufficient).
- If redundancy is established: delete the mechanism and explicitly supersede its quest, carrying forward the
  recovery and five-node requirements. If a stalled recovery case is exposed: repair the existing single-owner
  policy, do not add another scheduling path.
- Keep this separate from the formation diagnosis: the three ADD-only runs neither show this reader caused their
  delays nor show ownerless recovery is unnecessary.

## 2026-11-21 — OWNER: models and work order
- "please use lesser models for all implementation from now on": every writer runs on opus. The fable W1 writer
  was stopped at the start of its stage 2 (worktree clean at 8eba5f745) and relaunched on opus from the durable
  record (briefs/w1-stage2-rulings.md). The fable S0 writer finishes its design + red-witness stage; its
  implementation stage goes to opus.
- Owner's work order (binding sequence):
  1. Correct the historical claim; record the producer/consumer mismatch; keep the narrower conclusion about the
     three formation runs.
  2. Finish and retain the pinned formation diagnostic; report what the repaired read lifetime changes, including
     observation coverage.
  3. Complete W1 and W1b within their owners: exact settlement consumers, real publication/CDC witnesses, custody
     loss, finite read failure, shutdown.
  4. Finish W2's mandatory construction contract; keep the strengthened negative witness; complete fixture
     migration; execute the candidate.
  5. Integrate the owner deltas onto the collected runtime as true merges: W1/W1b branch from an older common
     ancestor and must not replace newer collected fixes wholesale.
  6. Bounded surrogate repair or deletion comparison after the baseline.
  7. Certify the composed candidate through the required physical and user-journey gates. The retained W2 run
     contains failures and ends without a final summary: attribute them; they are neither W2 regressions nor
     successful coverage until attributed.
- Owner's lesson: a shared producer changed meaning while a consumer and its fixtures kept the old meaning. The
  prevention is a witness spanning the real producer, the publication boundary and the consumer, registered with
  that interaction's affected proof (coupledPairs). A source-count ratchet can stop old readers returning but
  cannot establish that recovery still works. Applied: W1 and W1b each must register such a witness; the ratchet
  is supplementary, never the proof.

## 2026-11-21 — finding for W1 Q2 (tenure identity), from a read-only helper of the stopped W1 writer
The repository has no single "partition service incarnation". Existing owners attest a running replica with the
PAIR (nodes.boot_incarnation, services.created_at): the coordinator reads both
(rebalance-coordinator-operation-creation-support.js:174-194) and the receiving handler checks both against itself
(src/node/replica-handler-learner-retirement-authority.js:95-111; scope fields
src/node/replica-handler-membership-methods.js:82-104). boot_incarnation (boot-incarnation-owner.js:13-27, carried
by MessageRouter.bootIncarnation, published in nodes.boot_incarnation and on endpoint rows) changes on every
process start; services.created_at (service-row-incarnation.js:24-67) is the replica's birth and survives restart;
leadershipTenure ({term}, replica-leadership-state.js:38-69) is process-local and unpublished.
Consequence for Q2 (not yet ruled, work is stopped): custody tenure = receiver boot_incarnation + replica
created_at + ledger term; the sender can observe the first two through its cache, the term only through the
receiver's reply. Read-only finding, not executed.

## 2026-11-21 — necessity audit (reports/necessity/README.md), read-only at b638284d1
Census of 2026-11-10 re-validated: 2,596 usable sites. Alternate arm never ran: N1 1,105; neither side ran: N0 141;
only the alternate ran: N2 33 (20 dead primary, 13 inverted); alternate only in unit tests: N3 589; bootstrap lane
N4b 85; integration/packaging N4c 228; formation lane N5 415. Sample of 40: 30% silent default, 30% probe/seam kept
for fixtures, 13% competing source, 13% legitimate, 10% second shape, 5% false positive. One census record had been
hand-edited after the join. No N0-N2 site reads SERVICES raft_role (role readers are invisible to the census).
Rulings:
1. Apparatus approved, outside src, kept minimal: a trap preload (observe mode and throw mode, per-file plan with
   hash check), per-term counts, host-side merge for lab collection, and ONE checker/ratchet (census cells by
   row x directory x bucket + the semantic identifiers of W4 D.2 + the leader-role reader rows of W3 + fixture
   leader rows), replacing the label-based checker. The ratchet is supplementary, never the proof (owner).
2. Physical three-host formation: an observe-mode counter run first (smallest change that gets the preload into
   the nodes); a full census lane only if observe mode proves insufficient.
3. No blanket conversion of the 219 never-fired catch sites before evidence: an untested swallowed error turned
   into a refusal can change formation. Convert per owner directory after an observe-mode formation run shows the
   catch does not fire there, with witnesses.
4. `resolveExtraFields` (producer removed in c93265e10): the first deletion slice that contains it does the
   producer-change check and reports before deleting. History checks for the W3 role readers are done by each
   leader-authority slice (the surrogate track does #2).
5. N3 fixture migrations and W4 S8 (capability probes) are one worklist; the N3 slices subsume S8.
Deletion slices (54, formation tier first) start only when observe-mode evidence exists; N0 first. Before deleting
any never-run arm: the producer-change check (never produced / producer changed or removed / produced but
unreached) from README section 6.

## 2026-11-21 — surrogate scheduling lane: corrected history (reports/surrogate-scheduling-owner.md, read-only at 316671f87)
Corrected historical claim (commits spot-checked by the lead for existence and date; causal step b68b0e19a is from
the recorded bisect, not re-run):
- The lane was LIVE: quest log entry 26 (2026-07-16, d021073e2) records a five-node production-path run in which
  all 13 nonlocal priority-surrogate moves were emitted by the single declared replica_operations-p1 owner; entry 29
  confirms a second run.
- The consumer read services.raft_role = leader. The role-update lane had collapsed leader to follower since
  46b65f8ab (2026-03-18); the value reached the consumer only through the row owner's registration/activation stamp.
  b68b0e19a (2026-07-22) let the collapsed update overwrite the stamp; d1a099aaf (2026-10-27) removed the stamp.
  d5e18ea3f (2026-08-23) is the decision record (no src change) and already calls the lane dormant.
- Nothing went red: one witness writes its own leader rows, six tests hand-declare surrogate_owner, and the
  five-node acceptance was never green.
The lead's earlier statement "never reachable in production" is withdrawn.
Two findings that change the plan (owner decision needed, see message to owner):
- On this line (not on main), since the 2026-11-19 placement cutover (ab901b40f / 4ef9423c0), partition services
  build no UnifiedRebalancer when placement admission is enabled, and production wiring enables it: one
  ReplicaPlacementOwner on the replica_operations-p1 leader places every partition. The scheduling-owner policy
  feeds only admin diagnostics and tests here.
- The scheduling-owner decision is recomputed per node from local cache, not published once: it is not single
  across nodes.
History correction's home: the quest is terminal (R21), so the correction is appended in the open owning record
(the epic's current summary / the open quest that takes the leader-authority work) at the next integration commit.

## 2026-11-21 — formation diagnostic run 2 on the collected runtime f580579a5
FAILED after 508.5 s (diagnostic, not acceptance). Unmet: a-serve-lane-open (control_snapshot_read_failed,
serve_ineligible), b-priority-spread, c-replica-operations-quiet, d-user-table-routable (never),
g-projection-agrees-with-authority, observation-integrity. Previous run 3ed87e16 (60fe32768): d/e/f/g passed.
Console and evidence retained: lab/physical-baseline-f580579a5-run2.log and
lab/physical-baseline-f580579a5-run2-evidence/. Analysis in progress (reports/formation-run2-analysis.md).
One run: neither a rate nor yet an attribution.

## 2026-11-21 — S0 stage 1 (owner-fact read), record s0-transition-record.md; rulings in briefs/s0-stage2-rulings.md
Executed on adams-gamla: (1) a node hosting the leader replica gets "unavailable" when the projection names no
leader or the seed has no query engine yet; (2) after a real leadership transfer with a stale publication the
deposed replica answers success WITH ROWS and a follower witness, the caller rejects afterwards, the real leader is
never asked. Recorded safety findings (read-only): the strict read's role and indices come from different sources;
the local read path builds its witness after the awaited read; enforceRequiredLeaderReadAuthority checks neither
commit==applied nor a floor, so a fresh leader with unapplied log answers an empty set read as absence.
Rulings: redirect-first discovery (B); non-leader refusal at the receiver for every leader-REQUIRED read, commit ==
applied and floors only for readOwnerFact in this slice with a named red witness for the remaining consumers;
witness from one source, captured before the query and re-checked after; in-process arm reads the one owner of
hosted replicas; witness carries the existing identity pair; hint = projection only; witnesses 3-4 accepted with
mutation runs owed. Scope extended by four src files and the contract paragraph. Stage 2 runs on opus.
Pre-existing red on the integration base b638284d1: the first test of
test/cdc/cdc-owner-required-authoritative-routing.test.js (fixture defect), repaired in S0.

## 2026-11-21 — OWNER DECISIONS (binding): placement owner as end state; owner-fact contract; deletion rule; formation
Surrogate / scheduling authority:
- Target the takeover/integration line with the 19 November placement owner as the END STATE. Preserve the
  requirements: ownerless recovery, five-node operation, single-owner scheduling, no duplicated placement work.
  Transfer their proofs to the actual production placement owner, then retire the old surrogate scheduling policy
  and record the supersession in the open owning record. Do NOT reactivate the per-partition scheduler.
- The scheduling authority must be single for its scope and leadership tenure. Nodes may project it locally;
  independently recomputed declarations from local caches must not grant scheduling authority. Use the ledger's
  existing consensus authority; no new owner-election table or service.
- With no published owner, the designated placement owner on the ledger leader may act from its live consensus
  authority, subject to the canonical admission checks and fencing of stale work. An arbitrary target partition
  leader may not appoint itself placement scheduler; it keeps its own consensus and publication duties; missing
  evidence stays explicit pending work with an owned wake.
- Proof through the production construction path: delayed publication, leadership transfer with an old pass in
  flight, lost responses, retained work across restart, the five-node requirements. Count proposals, admitted
  operations and actual work, so duplicate work cannot hide behind a deduplicated final row.
Owner-fact read:
- Proceed with the rulings. Additionally REQUIRED: the same receiver contract for local and remote reads; a witness
  tied to the database snapshot actually read; redirects within the original request deadline. Keep the
  fresh-leader gap explicitly open: an absence-dependent consumer must not migrate onto the new read until that
  path refuses an unsafe or insufficiently applied read point.
Deletion:
- Continue deleting only arms whose necessity proof succeeds. The message-group counterexample means its shared
  leader-role arm stays until its authority source and consumer are migrated together.
Formation:
- Finish the first-causal-divergence comparison of the formation runs before attributing the failure or proposing
  a formation fix. Include the completed diagnostic evidence and updated reports in the next push; tie subsequent
  passing results to the exact assembled candidate.
