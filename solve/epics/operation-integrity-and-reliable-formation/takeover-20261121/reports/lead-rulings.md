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

## 2026-11-21 — external review of the pushes (owner's reviewer), applied
- W2 (d45486283): mutation-port construction invariant accepted as enforced; fixture repairs accepted. Status:
  "source and fixture repairs inspected; composed execution still needs its own evidence" for the exact head. CDC
  fixture defect to be attributed narrowly (reproduce on the integration base, apply the correction, reassess the
  rest). Sent to W2.
- W1b (38708b6fa): first stage coherent. Completion criterion: answering a replay AND deciding retained work is
  settled use the same owned receipt identity; open items: the 48-bit truncated fingerprint in last_insert_rowid,
  and attempt recovery settling on `SELECT 1 … WHERE entry_key = ?`. Sent to W1b.
- Dead arms (65ca4c2c3): necessity tests accepted; the message-group dependency is a real counterexample, the
  shared arm stays. Sent to S2 earlier.
- Placement owner: the cutover is not yet a universal construction invariant (optional factory binding; an
  existing rebalancer handled before the enabled-placement guard): a production-construction witness for seed and
  join ordering, then removal of the retired partition scheduler. The old policy is still computed in
  priority-recovery snapshots used by publication machinery: delete only the obsolete owner field. LEADER_UNKNOWN
  must be proven to resume. Sent to the placement proof-transfer design track.
- Owner-fact read: witness describes the snapshot actually read (four conditions); never described as
  linearizable; the gap stays open with a consumer table; effect-time conditions protect only if they revalidate
  the predicate; redirects carry no rows, stay inside the deadline, cannot cycle; local path same rules. Report
  rule: executed reproductions kept apart from committed specifications. Sent to S0.
- The lead's wording about witness 2 stands corrected in precision: the deposed replica returned rows and the
  strict caller rejected its follower witness; that is a receiver-contract defect and a routing dead end, not
  evidence that the caller accepted those rows.
- Formation: the 508 s run's evidence was not in the pushed material; pushed now as
  wip/takeover-coordination-20261121-1147 (lab/physical-baseline-f580579a5-run2-evidence.tar.zst, sha256
  1f990039…). No attribution and no formation fix before the first-causal-divergence comparison is finished.

## 2026-11-21 — formation run 2: first-causal-divergence comparison (reports/formation-run2-analysis.md) and a network measurement
Analysis (read-only, from the retained logs): first divergence on all three nodes is in the transport: delivery
ACKs between live peers missing their 500-999 ms bounds from 11:24:25Z, peers silent to each other for 5-25 s,
with no event-loop gap >= 1 s, CPU 17-64% of the 1-CPU limit and no quiet log on any node. Consequences: 19 ledger
leadership terms (previous run: 2), a SEED<->ADAM quarantine/reconnect duel, two priority ADDs parked in SENDING
until the 300 s operation budget expired, ready lease expired at CREATE. Read-lifetime repair: failed reads 88 -> 37,
seed SQL authority reads 58 -> 7, snapshot-lane failures unchanged at 30. Verdict of the analysis: same underlying
failure progressing differently (~65%), regression (~20%: "Named control-plane write wait expired" is new and fired
four times, not shown to cause d or g), host variance (~15%). Not determinable from the logs: sub-second loop delay
and network round-trip time.
Lead's direct measurement afterwards (11:50-11:53Z, hosts idle, load ~0): ICMP round trips on the lab LAN are far
outside what the delivery bounds assume: tv-dator -> adam-laptop avg 1907 ms (539-3276 ms); tv-dator -> adams-gamla
100% loss over 10 pings; adam-laptop -> adams-gamla avg 155 ms; adams-gamla -> tv-dator avg 93 ms, -> adam-laptop
avg 177 ms; controller (wired) -> tv-dator avg 198 ms with 12.5% loss. tv-dator is on 2.4 GHz Wi-Fi channel 11 at
-59 dBm. This was measured ~20 minutes AFTER the run, not during it: it makes the lab network a leading candidate
for the first divergence, it does not prove it for that run. A 600 s, 1 Hz host-to-host measurement is running
(lab/network-rtt-1153/).
No attribution and no formation fix yet. Two separate questions: (1) infrastructure: is the three-host Wi-Fi lab a
valid substrate for the 420 s acceptance; (2) product: does formation only slow down, and still converge, under such
latency and loss (R12)? Question 2 needs a controlled latency/loss experiment, not the household network.

## 2026-11-21 — OWNER: one formation run on GCP, then infer local-network allowances
Owner: "Do one run on GCP and then infer what allowance adjustments to use on the local network (if successful)."
Started: one diagnostic run of fresh-formation-user-table-routability on f580579a5, three e2-standard-4 VMs in one
zone (europe-north1-a), one node per VM, shipped configuration, same harness path as lab run 2, with a 1 Hz
inter-VM round-trip log. Guardrails: label/prefix on every resource, VM auto-delete after 3 h, no public image, no
local image build, spend stop at 10 USD, teardown proven by listing, lab inventory restored. Report:
reports/gcp-formation-run1.md; evidence: lab/gcp-formation-f580579a5-run1/. Allowances for the local network are
inferred only after a successful GCP run, from the two round-trip distributions; proposing them is the lead's job,
changing acceptance terms is the owner's.

## 2026-11-21 — placement owner proof transfer (reports/placement-owner-proof-transfer.md, read-only at 16300e756)
Findings (read from code, nothing executed): the production placement owner acts while a boolean isLeader is true;
no term/tenure is captured by a pass, carried in a proposal or checked at apply; move construction and capacity
checks are unfenced. The 60 s resync the sealed quest requires is not armed in production (the factory passes no
timer). A pass that throws loses its triggers (drainQueue has no catch). LEADER_UNKNOWN is discarded after
evaluation and its declared clearing trigger (SERVICES_CHANGED) is not the event that ends it (PARTITIONS_CHANGED).
The owner's fixtures write raft_role = leader rows. Factory binding is optional and the existing-rebalancer branch
precedes the placement guard. The provisioner can also propose a placement ADD. 16 witnesses proposed (P0-P15).
Rulings (lead):
1. Resync: production must match the sealed contract; wire it, after a red witness (a missed wake stalls today).
2. Tenure: a pass captures the ledger term at start, checks it before each step and carries it in each proposal;
   a new leader's first pass starts only after it has applied through its own term start. Stale work is fenced and
   stops at the next check; the residual (work between loss of leadership and the next check) is bounded and
   COUNTED by the witnesses. To be confirmed by the owner as the meaning of "no duplicated placement work".
3. Provisioner ADD path: to be established by witness: founding only; any placement beyond founding goes through
   the placement owner.
4. The owner's start path must not await its own publication/CDC drive; witness: CDC stalled, owner still starts
   from live leadership.
5. Order: write the witnesses now (tests only, through the production construction path, red where the gaps are);
   source repairs to the placement owner wait for the GCP formation baseline.
6. Five-node vehicle: not available on the lab (three reachable hosts, degraded Wi-Fi); proposal to the owner: five
   GCP VMs.
7. Supersession home: the placement owner's quest (replica-placement-admission-owner) log plus an epic summary row.
8. Stage B (construction invariant witness for seed and join ordering, then removal of the per-partition
   scheduler) before stage A (retire the old policy and its field).
9. Checking recorded positions at apply: later, recorded.

## 2026-11-21 — lab network, 600 s at 1 Hz (lab/network-rtt-1153/README.txt)
Median round trip 18-196 ms depending on the pair, p90 167-385 ms, p99 500-875 ms, maximum about 1.15 s, loss
0-3.3%. Between 1% and 4% of round trips exceed 500 ms on the pairs involving adams-gamla and tv-dator. The first
10-ping sample (1.9 s average, 100% loss on one pair) was a bad moment, not the steady state. Lab test runs by
other tracks may have been active during the window. Comparison with the GCP inter-VM distribution follows when
the GCP run reports.

## 2026-11-21 — OWNER DECISIONS (binding): transfer contract, five-node proof, evidence and repair sequence
1. Leadership transfer: bounded-and-counted residual work is acceptable. Required: no fresh placement decision
   authorized by an expired tenure; no duplicate admitted operation, capacity allocation or placement effect; a
   defined and tested bound on obsolete planning work and outstanding tasks; successor progress without waiting
   indefinitely for obsolete work. Mechanism: a token identifying the leadership TENURE, captured by each pass and
   kept by its asynchronous continuations; regaining leadership never revalidates an old pass. The new leader's
   first pass waits until its own term-start entry is committed AND locally applied, then verifies the tenure is
   still current; the barrier comes from the ledger's own consensus progress, not from SERVICES publication or
   formation readiness. The tenure is checked after asynchronous waits and before authoritative actions, and the
   fence is enforced at the actual admission boundary. "Bounded" is concrete: checkpoints, maximum work between
   them, how outstanding waits terminate or become harmless; repeated transfers do not accumulate obsolete tasks.
   Stale work and rejected attempts are counted separately from proposals and admitted operations. Legitimate
   inherited work is preserved: operations already admitted, and earlier proposals that commit before the
   successor's barrier, are recovered under their existing identities, not recreated, and are not violations;
   tenure identity is separate from durable operation identity. Schedules: delayed leadership notification;
   A->B->A with an old continuation held across both changes. Counts by node, tenure and operation identity.
2. Five-node proof: prepare one concrete proposal for five GCP VMs (machine sizes, region, topology, maximum
   runtime, estimated total cost including storage and network, spending cap, automatic teardown on success,
   failure or timeout, evidence retained before teardown). No existing approved allocation covers it (the standing
   approval is for comparative benchmarks): the concrete amount goes back to the owner before provisioning; once
   approved, proceed within scope and cap without further requests. State exactly what the topology proves: five
   Lagrange nodes on five VM instances, with the declared host and failure-domain arrangement.
3. Evidence and repair sequence: pin the baseline commit, image and harness configuration now. Run the
   construction and transfer witnesses while the baseline is prepared; keep repair work isolated from the
   baseline. A behavioural repair only where an executed witness demonstrates the specific defect; a passing
   witness is evidence and needs no invented repair. Separate retained results for the baseline, each demonstrated
   defect and its repair, and the final five-node run on the exact assembled candidate.
Applied: the tenure contract sent to the placement witness writer; the GCP run told to record baseline identity
(commit, tree, image id per VM, harness config hash, command, environment) and the five-VM delta without
provisioning.

## 2026-11-21 — GCP formation run 1 on f580579a5 = PINNED BASELINE (reports/gcp-formation-run1.md)
FAILED after 617.7 s on three e2-standard-4 VMs (inter-VM round trip ~0.25 ms, 0% loss), one node per VM, shipped
configuration (1.0 CPU, 1 GiB per node container). Met: a, b (priority spread 3/3 by 72.2 s), d, f, g, observation
integrity. Unmet: c-replica-operations-quiet (all 234 polls; at the end an ADD on wasm_operations-p1 pending and a
GROWTH_PROMOTE on storage_reservations-p1 syncing) and e-write-readback-every-node (public PG wire endpoint not
healthy in time). 0 failed reads in 234 polls; ledger 2 elections. Node containers ran at ~90-98% of their one CPU;
event-loop gaps >= 1 s: 11/5/4; "Wait bound spent" 83/218/261.
Baseline identity: lab/gcp-formation-f580579a5-run1/baseline-identity.json (commit, tree, per-VM image ids with
identical /app content hashes, harness config sha256, commands, environment). Teardown verified by the lead
(instances and disks: only lagrange-ci-runner, TERMINATED). Estimated spend 0.25 USD. Pushed as
wip/takeover-coordination-20261121-1236.
Reading: the lab network accounts for the failures that pass here (serve lane, spread, routability, projection
agreement, observation integrity, leadership churn). It does not account for c and e, which fail on a clean
network. The owner's condition for inferring local-network allowances ("if successful") is not met. No attribution
of c/e and no fix before the first-causal-divergence analysis of this run (in progress:
reports/gcp-formation-run1-analysis.md).
Deviation to note: the harness controller ran on the VM that also hosted node 2 (the lab adapter writes one address
for internal and external use), so that VM carried the driver's light load too.

## 2026-11-21 — OWNER: CPU allowance stays; slow, not choke
Asked whether the lab CPU allowance can be raised: technically yes (the 1.0 CPU / 1 GiB limit is the harness base
configuration test/distributed/config/local-three-node.json, selectable with --base), but the owner ruled: "The
system should run slower rather than choke at 90-98%". The 1-CPU limit stays as the acceptance configuration.
Sustained saturation with missed bounds on the clean-network baseline is a product behaviour to explain under R12
(load slows the system, never breaks it): the GCP analysis is centred on which deadlines expire because the node is
busy, how much extra work each expiry generates, which work is admitted without backpressure, and whether the run
would have converged given more time. The 2-CPU diagnostic run was offered and not requested; not run.

## 2026-11-21 — S2 dead leader-role arms (branch work/leader-role-dead-arms-20261121, head e1e239d30), author's report
Deleted with executed necessity tests (tv-dator): the SERVICES raft_role arms of the priority REPLACE
leader-removal gate (S2a); the always-firing bootstrap warning, the SERVICES arm of announcesLeader and the row arm
of publishCanonicalLeaderNodeId (S2c). NOT deleted: the move planner's role arm (S2b), because a message-group
planner's only leader evidence is the row role its producer publishes (executed counterexample: the REPLACE source
changes from node-D to node-B). Owner rule applied: shared arm stays until producer and consumer migrate together.
Author's side finding (needs an owner decision before any deletion): the leader_node_id conjuncts of the same gate
do not change the decision either; the SAFE branch at priority-publication-handoff.js:114-119 is unreachable, and
the tenure-bound safety evidence of sealed quest local-leadership-tenure-bound-safety-evidence feeds only that dead
computation. Not touched: an unreachable path is not automatically unneeded.
Evidence about the integration base: the change cone at e1e239d30 against 316671f87 has 96 failing files of 1600,
and all 96 also fail at 316671f87 on tv-dator; 7 cases of replace-named-handoff-attempt.test.js are among them. So
the integration base is red in at least 96 files on two hosts; attribution (pre-existing on f580579a5 versus
introduced by a merge versus repaired by W2's fixture migration) is W2's open task.
Status: independent verification of the deletion started (reports/verify-s2-dead-arms.md); not merged.

## 2026-11-21 — OWNER (binding): three-node gate before the five-node run
The five-node GCP run waits until the three-node problems are understood, repaired and verified. Sequence:
1. Complete the causal analysis of the missed formation deadline and the PostgreSQL service-creation/readiness
   failure, from the retained evidence.
2. Reproduce the specific defects and repair their causes; verify the repairs with the relevant witnesses.
3. Run the exact assembled candidate on three GCP nodes with the ORIGINAL resource limits, timeouts and acceptance
   bounds; the full three-node journey must pass, including formation quiet and public PostgreSQL write/readback,
   with valid evidence.
4. Only after that passes: the five-node proof on that candidate with the agreed five-node configuration.
Not allowed to close the three-node failures: additional CPU, changed timeouts, or a five-node success.
Budget: the five-node approval (five e2-standard-4, europe-north1-a, 3 h auto-delete, ~0.83 USD/h, cap 10 USD) is
CONDITIONAL on the three-node gate. Preparation may continue; no five-node fleet is provisioned or left running
while the three-node case is being debugged. Three-node investigation and verification runs continue within the
approved budget. Once the three-node gate passes, proceed with the five-node work within the cap without asking
again.

## 2026-11-21 — GCP baseline: causal analysis (reports/gcp-formation-run1-analysis.md, read-only from retained evidence)
The premise changed. No operation was stuck and nothing was re-planned.
- Formation is a fixed queue of 138 operations (46 system partitions x 2 ADD + 1 GROWTH_PROMOTE). Each ran once and
  succeeded; the queue finished 427.2 s after seed start, 7 s after the 420 s bound. Backlog fell monotonically
  138 -> 0. The two "in-flight" operations at the bound were the tail of the queue.
- Pace: three ADDs in flight 81% of the time, 12.4-12.7 s per ADD (placement owner K_SRC = 3) gives ~390 s at best;
  the ledger-first serial phase cost ~13 s; a logs-p1 catch-up blocked each joiner 3.4-4.4 s at a time (203-242 s),
  stretching ADDs to 17-20 s. First divergence: pace, earliest unrecoverable point the logs-p1 catch-up (follower
  apply path).
- Predicate e failed for a separate, LOGICAL reason: for 123 s with zero operations in flight, one node's planner
  tried 25 times to place the single sys-postgres-wire replica on itself and the rebalance coordinator's topology
  guard refused each with replica_inventory_unusable (authoritative SERVICES read not usable, reason code null).
  The read's error is not logged.
- CPU: nodes stayed at 85-94% of their one CPU for the last two minutes with ZERO operations in flight. Load tracks
  the number of replicated groups: unawaited transport responses reach ~2,000/s (20 per remote replica per second,
  matching the 50 ms raft heartbeat), ~514,000 in the run against a few hundred retries (inferred, ~60%; tagged
  sections cover only 8-17% of a CPU). Bounds of 500 ms-5 s and raft election timeouts expire because nodes are
  busy: 44 leadership changes on a clean network. Retry amplification is real but small (3.1 CREATE_REPLICA
  deliveries per ADD). Nothing that admits work reads its own delay. No correctness breach visible.
- Harness contribution: playback snapshots grow to 1.5 MB and hit the seed ~2 per second in the tail.
Next steps (owner sequence step 1, analysis): (a) GCP run 2, identical but with the seed's existing attribution
profile switched on (keys already forwarded; no source change) plus per-thread CPU and idle-tail packet rates:
started, evidence to lab/gcp-formation-f580579a5-run2-profile/; (b) a read-only trace of the PG-wire placement
refusal with a specified reproducing witness: started, reports/pgwire-placement-refusal.md. No fix proposed yet.
Prior project finding that this matches (to be confirmed by the profile, not assumed): per-group raft tick timers
cost on a seed (memory: ~6,400 timer fires/s idle).

## 2026-11-21 — W1 stage 2 (retained repair owner), head 9d241bd89: partly green
Executed on tv-dator at bc20bb929: publication 6/6, leadership 5/5, real-publication cross-boundary witness 1/1,
continuation 18/21, row-repair 44/45, replace-real-group-native-ledger-recovery 1/3. Six cases red: two are
conflicts between stage-1 witnesses and the approved Q8 behaviour (re-staging allowed, weakening not); W7 ingress,
a tenure-end timer, and two S11 removal witnesses that were green before stage 2 (treated as a regression until
shown otherwise) are unattributed. Mutation table and change cone not done. Coupled pair registered
(leadership-publication-and-retained-placement-repair). Process defect found: writers shared one scratchpad for
commit-message files and bc20bb929 carries another writer's message (content is correct; not amended). Stage 2b
started on opus from briefs/w1-stage2b.md.

## 2026-11-21 — independent verification of the dead-arm deletion (reports/verify-s2-dead-arms.md): APPROVE-WITH-CONDITIONS
No reachable counterexample for any deleted arm; the kept message-group arm is correctly kept. One author claim
was FALSE: "necessity tests green on the pre-deletion commit": at 65ca4c2c3 the N2 witness in
partition-service-row-owner.test.js was red (wrong expectation, later corrected). Verified: the 512-combination
S2a witness at 65ca4c2c3; six of seven files pass at e1e239d30; the same 7 cases fail on the base; all 96 failing
cone files fail on the base.
Conditions and lead rulings:
1. The final N2 witness must be executed on the pre-deletion source (assigned back to the slice's writer).
2. #6 (bootstrap "no partition leaders" warning): deletion accepted. No replacement diagnostic is added now: it
   had no consumer, and an unconsumed diagnostic is unowned; if one is wanted later it is keyed on leader_node_id.
3. Proof commits 26012f39e and bb1c3b78e now have refs (probe/s2-proof-*) and are pushed.
4. ADDED BY THE LEAD, blocking the merge of S2a: the 7 red cases in
   test/rebalancer/replace-named-handoff-attempt.test.js on the integration base start at "one handoff was issued:
   expected 1, got 0". They are the full-path proof of the named handoff, which after this deletion is the ONLY
   mechanism protecting a leading source from removal. The deletion does not merge until those 7 cases are
   attributed (pre-existing on f580579a5 or introduced by a merge) and green.
Non-blocking flags: the decision table says message-group rows collapse leader while the row owner does not; the
diff has no quest record yet; the grammar pin is fragment-level. The side finding stands: the SAFE branch is
unreachable and the tenure-bound partition-row read informs no decision; nothing is deleted there without showing
what the verification file lists.

## 2026-11-21 — dead-arm deletion: verification condition 1 closed
The final N2 witness was executed on pre-deletion source: proof commit 119a6a2d9 (src identical to 65ca4c2c3, test
file from e1e239d30), pushed as probe/s2-n2-final-on-predeletion; tv-dator: 1 file, 212 assertions, exit 0
(lab/s2-n2-final-on-predeletion-119a6a2d9). The author's earlier false claim is corrected in its report. A census
of every in-tree writer of a partition SERVICES raft_role was added (read-only): all collapse leader or never carry
it, except /register-service (src/bootstrap/bootstrap-api-registration-methods.js:107,128), which writes the
payload role verbatim and whose only in-tree client sends message-group rows.
Remaining before merge: lead's condition 4 (the 7 red named-handoff cases on the integration base attributed and
green).

## 2026-11-21 — PostgreSQL readback failure traced (reports/pgwire-placement-refusal.md, read-only at f580579a5)
Path: the harness scales sys-postgres-wire to one replica; the planner is the RuntimeServiceRebalancerOwner hosted on
the service_definitions-p1 leader; it calls the local coordinator's createOperation with
enforceConcurrentOperationBudget; the topology guard
(rebalance-coordinator-topology-guard-methods.js:431-436, 546-553) reads SERVICES in the DEFAULT mode
OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK with leader mode ANY and accepts the inventory only if rowSetComplete is
true. Branch that fired (~90%, not directly logged): the planner's node held a services-p1 replica it did not
lead; a local non-leader replica answers success:true, rowSetComplete:false with no error, so the "fallback" owner
RPC is never tried; the guard refuses replica_inventory_unusable; no reason code is set by any read branch. All 25
refusals byte-identical; blind 5 s retry; no owned consequence; unavailability inferred from a false flag (R07,
R11). Older and latent (c1c57b1d9 2026-11-08, tightened 947fbe658 2026-11-09), not a regression of the integrated
work: in the 60fe32768 run one node led both partitions and the placement completed. Not specific to runtime
services: any unified-rebalancer ADD/REPLACE on a node holding a non-leader services-p1 replica. The 138 partition
placements go through ReplicaPlacementOwner and never run this guard.
This is an instance of the fallback-read family (W4): "local preferred with fallback" where the local arm answers
without authority and the fallback never runs. Its repair is a consumer migration onto the owner-fact read (S0),
with a typed unavailable outcome and an owned wake, once S0's refusal of insufficiently applied read points is
witnessed (owner's precondition for absence/inventory-dependent consumers).
Step now (owner sequence step 2): the reproducing witness through the real coordinator, gateway, CDC service and
cache (red today), on branch work/topology-guard-inventory-read-20261121. Repair after S0 reports.

## 2026-11-21 — OWNER (binding) on the deletion, the GCP profile, the formation bound and PostgreSQL
Dead-arm deletion:
- Verification condition 1 accepted as closed. Owning record keeps together: the corrected claim (the N2 necessity
  test was NOT green on the pre-deletion commit 65ca4c2c3; its first version was wrong), the proof commit
  119a6a2d9 (probe/s2-n2-final-on-predeletion: pre-deletion src + final test), and the executed result (tv-dator,
  1 file, 212 assertions, exit 0, lab/s2-n2-final-on-predeletion-119a6a2d9).
- Scope of that proof, stated precisely: it establishes the result for the canonical production construction and
  the current in-tree callers. The /register-service endpoint writes the caller's role verbatim, so no equivalence
  is claimed for every input the endpoint can accept. Live leadership remains the authority; no row-role fallback
  is retained for hypothetical older clients; any actual supported caller dependency is recorded separately (none
  known in-tree: the only in-tree client sends message-group rows).
- Named handoff: W2's df7be8270 persists the handoff fixture's ACTIVE phase through the repository (the owner
  decides from the durable row; the harness had set it only on its in-memory copy). Attribution by W2 (executed on
  adam-laptop): the 7 cases were red on the collected runtime f580579a5 itself, identically at 316671f87 and
  b29eed7fd. The change is four lines in the test harness; no production check or assertion was changed (lead read
  the diff). To close the blocker: the cases must pass on the assembled candidate with their existing safety and
  progress assertions intact. In progress: verification merge of df7be8270 + e1e239d30 on branch
  verify/integration-plus-dead-arms-20261121, lab run on tv-dator.
GCP profile run: the seed profile must cover the period after the operation queue drains. Confirmed by the run's
operator from source: keys LAGRANGE_FORMATION_ATTRIBUTION=1, LAGRANGE_FORMATION_ATTRIBUTION_DEADLINE_MS=640000
(default 300000), LAGRANGE_FORMATION_PROFILE_DIR; the window ends on SIGUSR2 or the deadline and nothing in this
route sends SIGUSR2; chunks are written every 60 s and copied out as they complete; the harness stops the seed
about 605-610 s after start, so coverage ends at the last 60 s flush (~600 s), which still covers the ~430-600 s
post-drain tail. Chunks retained unmerged; formation and post-drain samples reported separately.
Formation: the corrected finding is accepted (138 system operations completed at ~427 s). The 420 s acceptance
bound is UNCHANGED. The heartbeat/transport explanation of the CPU cost remains a HYPOTHESIS until the profile
attributes it; response and election counts alone do not establish it.
PostgreSQL: reproduce through production construction that a local follower returns successful but incomplete
SERVICES rows so the read returns before asking the reachable owner; capture completeness, witness, routing and the
guard's decision. If confirmed, resolve through the existing owner-fact read work while preserving the guard's
authoritative-read requirement. Witness writer started on work/topology-guard-inventory-read-20261121.
Sequence unchanged: understand and repair the three-node failures; the exact assembled candidate passes the
original three-node GCP configuration and bounds; only then the five-node proof.

## 2026-11-21 — named-handoff blocker CLOSED; dead-arm deletion cleared to merge
Assembled tree: verification merge d6959f00e = integration df7be8270 + dead leader-role arms e1e239d30 (clean merge,
committed through the hook, pushed as verify/integration-plus-dead-arms-20261121). Executed on tv-dator
(lab/verify-named-handoff-d6959f00e): 7 files, 7 pass, 613 assertions:
replace-named-handoff-attempt 52 assertions (all cases, including the 7 that were red), surplus-drain 33,
dt-ledger-completion-continuity-discriminator 64, check-runtime-grammar-contracts 70, partition-service-row-owner
212, group-retirement-redrive 117, bootstrap-topology-snapshot-owner 65.
Assertions intact: the diff of the named-handoff test from the integration base removes no line; it adds the
four-line durable persistence of the ACTIVE phase (W2) and the necessity case (deletion slice).
Attribution (W2, executed on adam-laptop): the 7 cases were red on the collected runtime f580579a5 itself: a
fixture defect (phase set only on the caller's in-memory copy while the owner decides from the durable row), not a
product regression.
Decision: the remaining blocker is closed. The deletion (e1e239d30) is cleared to merge into the integration
branch as a true merge by the integration writer. Scope of the claim stays as the owner set it (canonical
production construction and current in-tree callers).
Correction to the entry above: the diff of the named-handoff test from the integration base removes exactly ONE
line, the harness function's signature, which is replaced by a signature with additional options for the
necessity case; no assertion line is removed or changed.

## 2026-11-21 — GCP run 2 on f580579a5 with the seed profile (reports/gcp-formation-run2-profile.md)
FAIL 674.0 s. Identical to run 1 except the three attribution keys (config equal apart from the docker block; /app
content hash identical on all VMs). Formation: 138 operations all completed, last at 530.6 s (run 1: 427.2 s);
the profiler costs CPU on the seed, so absolute times are not comparable with run 1. PostgreSQL wire service again
NOT placed: 22 refusals replica_inventory_unusable on the planner node (a different node than in run 1), with
authoritativeAvailable:false and committedRowsState:"unavailable" in the skip record. So the placement refusal has
now occurred in 2 of 2 clean-network runs.
Seed profile (11 unmerged 60 s chunks, 640 s window, 621 s sampled; 46.4 s after the queue drained):
- formation window, inclusive: formation owner 22.7%, drainInbound 17.1%, drainReady 16.1%, CDC assertCurrent 15.8%;
  self: GC 8.2%, deepFreeze (raft-operation-port.js:30) 3.4%, fastJsonClone 2.5%.
- post-drain window (zero operations in flight), inclusive: processTimers 47%, drainReady 25.9%, drainInbound 25.2%,
  raft-rs operation port dispatch 21.3%, stepOneInbound 19%, raft protocol activity 17%, peer-delivery sendMessages
  13.4%, assertCurrent 7.5%. The module's own owner buckets: raft_protocol 33.5% before the drain, 49.8% after.
- idle tail network: ~5,080 TCP segments per second between the three nodes.
Reading (lead): the profile attributes about half of the seed's post-drain CPU to raft protocol activity driven
from timers, which supports the heartbeat/tick hypothesis for the idle saturation on the seed; limits: one run, the
seed only, 46 s of post-drain, profiler overhead present. Two costs seen in earlier project profiles recur: the
per-group tick/drain cost (2026-09-24, "one node-level tick driver" proposed, apparently never done) and the CDC
currentness check (2026-11-14, 13.8% then, 15.8% now). Teardown verified by the lead; spend ~0.22 USD.
Next (analysis, no fix): reports/idle-raft-cpu-cost.md (per-group idle cost model, profile breakdown by owner,
whether the earlier follow-ups were done, prior art, ordered options each with its red witness). Pushed:
wip/takeover-coordination-20261121-<this push>.

## 2026-11-21 — trap apparatus (branch work/fallback-trap-apparatus-20261121, head e39fe811c), author's report
Built outside src: a trap preload with observe and throw modes (plan with hash/drift refusal, per-arm recording
with first caller, merge), one ratchet checker (census cells by row x directory x bucket, semantic rows for
fallback read modes, non-required leader modes, role-derived leader reads and fixture leader rows, census
integrity, kept arms only with a red throw-mode trap run plus a classified witness, no prose), and the retirement
of the label-based checker. Executed on tv-dator at e39fe811c: 3 test files, 30 cases, pass. Plan: 2,621 sites in
875 files, 3,294 arms, none uninstrumentable. Ratchet first numbers recorded in the report. Findings by the author:
the census head 6a240d3de is on no ref (a gc would break the integrity check); an observe smoke showed middle terms
of a four-term chain answering at a site the census had put in N1, i.e. the census over-acquits multi-term chains.
Not yet possible: an observe lane on the lab (about 40 lines in scripts/lab/probe.js) and observe mode inside the
physical formation nodes (about 90-120 lines in the harness, no image change): sized, not built.
Status: independent verification started (reports/verify-trap-apparatus.md). No arm is deleted on this apparatus's
evidence before that verdict. Not wired into any gate.

## 2026-11-21 — local heavy-job wrapper: second defect fixed
A job paused by the thermal governor made the wrapper's `wait` return early; the wrapper exited, dropped the
published pgid, and the paused job was never resumed (seen on two commits; one writer recovered by hand). Fixed:
the wrapper now waits until the job has really exited (so wrapper, pgid and lock live exactly as long as the job),
and the governor resumes any stopped process in a lagrange worktree when the CPU is cool. Earlier fix the same
afternoon: the job itself holds the lock.

## 2026-11-21 — placement-owner witnesses EXECUTED (branch work/placement-owner-witnesses-20261121, head 974320ad3)
Tests only, through the production construction, run on tv-dator (lab/pow-run3-bf0c6310, lab/pow-run5-efd35b4b).
Fixture ceiling: transfers use a fixture-owned controllable log, not a real raft election.
Demonstrated defects (red, confirming the design unless noted):
- Tenure: a pass suspended across a transfer constructs and reads capacity after its tenure ended; in A->B->A an
  obsolete pass ADMITS under the later tenure; the current tenure is queued behind the obsolete pass; a decision
  taken under one tenure is admitted under another at the admission boundary; the new leader plans and proposes for
  a deficit already admitted by a committed entry it has not applied; a new term without a role edge is not
  noticed; (new finding) at an idle graceful demotion a pass starts on the deposed owner with no tenure.
- Wakes: the wait is not named in lastPassSnapshot and LEADER_UNKNOWN declares the wrong clearing trigger; the 60 s
  resync is not armed in production (a missed wake never admits); a pass that throws loses its triggers; the start
  path does not admit while the LEADERSHIP_START CDC drive is unanswered.
- Construction: with an existing coordinator, partitions initialized before the factory is bound keep
  per-partition UnifiedRebalancers; beyond prediction, with the ledger first the ledger partition itself builds a
  UnifiedRebalancer AND later gets a placement owner.
Passing (kept as evidence, no repair): delayed notifications, the graceful-transfer admission fence, lost response
A->B->A under its original identity, N transfers bounded, the ownerless priority partition resuming on the real
PARTITIONS leader publication alone, all negatives (target leader does not schedule, cache-named follower does
nothing, stale route refused), disruptions (newest published leader as copy source, restart replays the identical
entry, class-ordered admission), five nodes in process (owners only on the three ledger nodes, at most one leading
at every sample). In every schedule: never more than one admitted operation per deficit.
Not established: the provisioner's non-founding ADD path (fixture gap); a real multi-replica rs-raft ledger group
(no fixture); five hosts on the lab (no skip markers allowed, nothing written).
Registered: contract replica-placement-single-scheduler with three coupled pairs.
Decision: repairs authorized exactly for the red witnesses. Repair writer started (opus) on
work/placement-owner-repair-20261121, stage 1 = tenure (briefs/placement-owner-repair.md), then wakes, then the
construction invariant and removal of the per-partition scheduler. Independent verification after each stage.

## 2026-11-21 — independent verification of the trap apparatus (reports/verify-trap-apparatus.md)
(a) observe mode APPROVE-WITH-CONDITIONS: no construct found where the rewrite changes a program value (read, not
run); "arm ran" is sound, "arm never ran" is NOT yet sound. (b) throw mode REJECTED as deletion evidence until
fixed: a green run can be vacuous. (c) ratchet APPROVE-WITH-CONDITIONS, supplementary only. (d) retirement of the
label checker APPROVE-WITH-CONDITIONS (no history rewritten, src diff empty).
Blocking holes: the observation file is keyed by pid and thread and rewritten at process start, so a restarted
node erases earlier first hits; there is no roster, so an unarmed child leaves nothing and the merge cannot tell;
a throw selection that matches no arm is accepted (the documented lab recipe builds the plan without the census, so
a bucket selection arms nothing); swallowed throws are not classified; editing a site's text makes it uncensused
and the documented probe then prints 0; the checker depends on census head 6a240d3de which was on no ref; the kept
rule accepts any red run in which the arm threw once. Other: the role-derived leader row misses three named
readers; the fixture exemption is a substring test; a census edit passes if generatedAt is bumped; parallel
branches tightening the baseline may leave the checker permanently red; arm id #0 is ambiguous for N2 sites.
What "arm X is unnecessary" requires (verifier, accepted): complete-coverage observe and throw runs in every lane,
the producer-history check, then the deletion itself with its change cone and boundary witness green; never for
recovery schedules that no lane drives.
Lead: census head 6a240d3de now has a pushed ref (census/fallback-census-head-6a240d3de). Corrective round
assigned to the apparatus writer. No arm is deleted on trap evidence until throw mode is re-verified.

## 2026-11-21 — idle raft CPU cost (reports/idle-raft-cpu-cost.md, read-only; reconciles with the run 2 sample totals)
The September diagnosis named the wrong cost: the per-group tick path is at most 0.8-2% of the seed's samples. The
idle cost is the heartbeat MESSAGE path: tick 20 ms, heartbeat every 3 ticks; per raft message one frame plus an
ACK plus a SERVICE_RESPONSE nobody awaits (logged as orphaned: 575-834 per second per node), a per-message delivery
lifetime, a zero-delay drain timer, a SQLite transaction per Ready even when empty, two serialising status calls:
about 25-29 async callbacks per heartbeat exchange. The model reproduces the measurements (2,111 raft messages/s
cluster-wide predicts 6,333 frames/s against 5,082 measured TCP segments/s; raft + transport 48.7% of post-drain
samples with profiler frames removed).
Seed CPU owners (profiler frames and idle removed), post-drain / system formation: raft machinery + transport
48.7% / 28.4%; CDC currentness check 8.8% / 19.0%; readiness and planning 6.7% / 10.1%; GC 10.5% / 9.8%; apply
7.3% / 7.8%; synced commits 4.6% / 5.1%. During formation the largest single item is the CDC currentness check
(rebuilds the propagation plan and reads raft status on every budget read, three times per read), not raft.
Follow-ups: the September tick driver and batched drains were never done; of the November items db.prepare and
syncCompactedStorage were repaired on 2026-11-19 and CDC currentness was not (13.8% then, ~17% now).
Limits: the seed leads only ~4 of 47 groups (a follower profile); joiners unprofiled; one profiled run.
Estimate for the 138-operation queue (assumes pace proportional to seed CPU; large uncertainty): 427 s -> ~360 s
with the CDC repair alone or with the raft-frame repairs alone; ~300-340 s together.
Lead decision (owner sequence step 2: reproduce each defect, then repair): two repair lines started, each
witness-first with a stop for review before any source change:
 (f) CDC currentness against a change stamp — work/cdc-currentness-stamp-20261121 — a stale positive is the only
     unsafe outcome; the negative witness family must enumerate every input the predicate reads.
 (e)(h)(i)(b)(c1) raft frame delivery — work/raft-frame-delivery-20261121 — no ACK/response/delivery lifetime for
     raft frames (gated on a consumer census incl. the ACK-timeout quarantine guard), status only on change, no
     empty transaction, one node-level inbound drain, one frame per node pair per loop turn.
Excluded pending an OWNER decision: quiescing idle groups (contradicts the 2026-10-05 ruling that every opened
replica is ticked), heartbeat cadence, synthesised coalesced heartbeats, two learners per operation, replacing the
1 s learner re-ask cadence, batching log shipping, whether the harness observer's load on the seed belongs in the
acceptance. The node-level tick driver is not started: not confirmed as a main cost.
Integration: W2 merged the dead-arm deletion (23344cddc).

## 2026-11-21 — trap apparatus corrective round (head 29502803b), author's report
All seven blocking holes claimed closed, each with a known-bad test red at 4c4bf1cd1 (tv-dator, 15 new tests fail)
and green at 29502803b (adams-gamla, 2 files, 37 tests): one observation file per process start; roster reused from
the census preload with INCOMPLETE on a missing observation; throw mode refuses a selection that arms nothing;
SURFACED versus SWALLOWED classification with SWALLOWED/INCOMPLETE/UNBOUND exiting 1; the slice probe counts
uncensused sites; typed census-head-unavailable exit naming the pushed ref; a kept arm needs a SURFACED throw
report that armed only that site and whose failed tests include the named witness. Also: injected leader constants
counted (two cross-file readers remain a stated undercount), exemption by service type, census revisions need new
runs and digests, first-parent history with cell-wise-minimum composition. Unrequested: versioned semantic
detectors (a version change re-bases semantic cells only). Stated as not closed: role-row undercount for
cross-file helpers; pid reuse inside the roster; processes started outside wrapped launch APIs; trap reports are
hand-writable JSON (digests only); several of the verifier's lesser items; no lab route and no physical-formation
support yet (sized only); the checker is in no gate.
Status: sent back to the same independent verifier for round 2 (reports/verify-trap-apparatus-round2.md). No arm is
deleted on trap evidence before that verdict.

## 2026-11-21 ~15:50 CET — lab capacity is the bottleneck
Three reachable lab hosts (lenovo-laptop and carinas-windows unreachable all day); all three held by change-cone
runs (W2 on adam-laptop since 13:41Z, W1 on tv-dator, W1b on adams-gamla); five tracks queued for a host. Asked the
owner: bring back the two hosts, and/or approve a temporary GCP test runner (current GCP approval covers
three-node formation runs only). No answer yet; not used.

## 2026-11-21 — W2 composition FINAL (work/core-integration-20261121 head 23344cddc), author's report
Composed as true merges, no textual conflict: route (5edfe59e2), canonical mutation (b638284d1), closure evidence
(316671f87), dead leader-role arms (23344cddc). Mutation port required at every construction and dependency sync
(16300e756), no flag, red-first witness. Fixtures moved off the removed route and mutation paths through real
publishers and structured ports; no production alternate restored. No --no-verify anywhere.
Exact-head evidence (adam-laptop): full change cone vs f580579a5 complete with summary: 1660 planned = 1660
executed; 1566 pass / 94 fail; 71,538 assertions (lab/w2-cone-23344cddc.log). Focused list: 77 files, 60/17.
Attribution of the union of 110 files that failed in any cone of this line: 92 already red on the collected
runtime f580579a5 itself; 9 introduced by the mutation merge and repaired by the fixture migration; 2 from the
mutation merge still open; 2 in the excluded retained-repair files; 5 load/host sensitive (green on a second
host or outside the parallel cone). The interrupted 316671f87 cone is accounted: 1586 planned = 1112 pass + 84
fail + 390 not run. Named handoff: fixture defect present on f580579a5, repaired test-only (df7be8270).
Open, lead rulings:
- The 2 still-open files (cl-029 case 3; priority-recovery-dispatch-pending-timeout-reentry): the mutation merge
  removed the raw route's short-circuit of deferRetry failures; the structured path retries inside the
  repository's 15 s loop exactly as production already did. Ruling: re-stage the witnesses with failures that
  outlast the in-loop budget ON VIRTUAL TIME (no wall-clock cost); no product change to hand failures back early.
  To be assigned to the next integration writer.
- Step 3b STOPPED, accepted: the raw SQL route (executeOperationMutationWithRetry -> gateway.executeQuery) is the
  only route for the owner-lease touch, six message-group membership CAS writes and two storage-reservation writes
  (INSERT OR IGNORE is not expressible by the structured planner), and the mutation quest's sealed decision keeps
  those at their SQL owner. Reading: each WRITE CLASS has exactly one route; nothing selects between routes for the
  same write. Routing only the lease would create two routes. Recorded for the owner; no change.
- Finding routed: ReplicaCreateAdmissionOwner (src/node/replica-create-admission-owner.js:487,547,629) writes
  replica_operations through gateway.updateSystemTableRow: a second calling convention onto the same port.
- Three touched interactions have no coupled pair (leader publication -> placement ledger route; placement
  delivery consumers <-> transport semantic outcome; repository writer binding <-> gateway submitMutation).
MAJOR: 92 test files are red on the collected runtime f580579a5 itself. Triage started (reports/base-red-triage.md):
which are red on main (0dbed1718), which the previous agent's line introduced, grouped by root cause.
Later merges: the retained-repair and outcome-format branches lack all of these merges and will be merged as true
merges; their placement-retained fixtures must publish the leader canonically.

## 2026-11-21 — CDC currentness stage 1 (work/cdc-currentness-stamp-20261121, 29f2fab7f; record cdc-currentness-record.md)
Executed on adam-laptop (lab/cdcstamp-r2): one delivery of one range with nothing changing does 251 plan rebuilds
and 243 raft status reads for one target group; 697 and 685 for three. All 49 negative cases (one per input, from
one list) and both anchors are green today: the present check misses no input it reads. Corrections to the causal
report: the multiplier is 6 full checks per transport remaining(), the status read goes through
isCurrentRaftLeader(), and the check is not read-only (route refresh, branch tag reset, diagnostics, a topology
repair request on the non-core-leader path). The check exists because of quest retained-seed-original-handoff
(obsolete coverage must not release source debt; no global cache revision may restart stable progress).
Latent hole found: the cache's table mutation version resets to 0 on clear().
Rulings for stage 2: (2a) one evaluation per synchronous budget read, with a proof that the duplicates share one
turn; (2b) a stamp for the PLAN only, components exposed by their owners, one plan per stamp including the wave's
captures, the cache version made monotonic across clear() with a red-first witness. The selection (raft status
read) is not stamped in this stage: it needs generations from three owners and a port contract change, to be
decided with the measured remaining cost.

## 2026-11-21 — raft frame delivery stage 1 (work/raft-frame-delivery-20261121, f1265c5ca; record raft-frame-delivery-record.md)
Executed on adams-gamla (lab/raftframes-stage1-r2): every contract witness red with today's numbers, every anchor
green. (e) 50 raft envelopes one way: 150 frames (3N), 100 back (2N), 50 orphaned responses, 50 deadline timers.
(h)(i) 100 quiet heartbeats: 100 SQLite transactions, 100 status and 100 conf_state announces; term, leader and
commit did not move. (b) drain timers per virtual second 272/544/1088 for 8/16/32 groups. (c1) frames per node pair
per second 396/792/1584 for 4/8/16 groups.
Consumer census for (e): the quarantine guard, keepalive sever guard and pingNode use recent inbound traffic, which
the peer's own raft traffic still provides (residual: a peer answering no raft for 30 s and sharing no other
traffic); no decision in src reads the per-message delivery outcome; a raft frame on the fallback path holds its
group's turn up to 5 s today; one consumer blocks same-node delivery (witness W-HID-1: the sender sees FAILED on the
local path only). No reason was ever recorded for the receiver ACKing or answering raft frames (direct path since
8f284ad8a, 2026-04-13).
Rulings: stage 2 in three steps with a stop after each: (e) one explicit raft delivery class for remote AND
same-node delivery (W-HID-1's sender-side raft clause superseded explicitly in its own commit; receiver records
failures; lead reports the supersession to the owner), with witnesses for the liveness residual, reconnection
ownership and a slow peer not holding a group's turn; (h) a leader re-reads status after every step, a follower
announces only on change, no stale shaped status; (b) one node-level drain per turn with all invariants.
Held for the OWNER: (i) no transaction for an empty Ready, because it contradicts a witness of the sealed owner
decision 2026-10-05 (every send preceded by a persist; an empty Ready shape persisted); (c1) coalescing, pending
the policy for a slow peer (drop and tell the core the peer is unreachable, or block).
Quest bookkeeping: the lead owns the quest records for the lines started today (CDC currentness, raft frame
delivery, placement-owner repair, owner-fact read, topology-guard read) and opens them from the transition records
before anything lands; none is opened yet.

## 2026-11-21 — W1b stage 2 complete (work/placement-outcome-format-20261121, tip 054971a7d), author's report
Step 1 (38708b6fa): the NULL branch and OUTCOME_IDENTITY_UNAVAILABLE deleted; replay requires an exact identity
match; trigger rows added; the hard-coded F11 list replaced by enumeration; F5b deleted. Step 2 (6d3a0c4f6 and
fixture repairs to 080223004): the outcome owner's own identity (`committedCommandDigest`, full-width sha256 of
"<type>:<canonical text>", column command_digest with a CHECK, enforced by the recorder; the 48-bit fingerprint in
last_insert_rowid is gone); typed refusal at store open for a different table shape, no migration; exact
settlement through one owner function used by placement replay, formation replay, coordinator settlement and the
placement attempt store; one prelude (leadership -> admission -> exact settled replay -> pause -> pending join) for
placement and formation. Contract committed-outcome-command-identity with two coupled pairs (7652bb014).
Executed on adams-gamla: final witnesses 4/4 files at 080223004; both mutants killed (ordering 6a23e4abd, identity
daa0281a8); change cones versus 0993265e5 (819 and 1742 files): every red also red at the base, except
settled-replay-preserves-result W5, which step 2 broke and 054971a7d rewrote.
Reviewer's two completion items claimed closed: the full-width owned digest defined once; attempt recovery checks
identity through the same owner function (a different record under the key keeps the attempt).
"Fails closed at apply": the slice rolls back, the applied index does not advance, the group becomes
RECOVERY_REQUIRED and the leader steps down; recovery re-delivers the same entry and reaches the same verdict, so
the partition halts, deterministically on every replica; reachable only if a colliding command is committed.
Consequences to note: every development data directory written before 6d3a0c4f6 must be re-founded; released
stores are now also refused at partition open (they were already refused by the revision fence at join and seed
start). Kept and reported: OUTCOME_NOT_RETAINED; the generic SQL replay still settles on any row (proposed
witness); a kept attempt whose key holds another record re-requests and gets BYTES each pass with nothing retiring
it. Interaction for the retained-repair writer: BYTES as a definite refusal must not leave a retained attempt in
the map with no wake (sent to W1).
Lead: a key collision at request is a typed, visible, fail-closed condition; an attempt blocked on it stays as
explicit blocked work until an operator acts; no automatic retirement is added.
Status: independent verification started (reports/verify-w1b-outcome-identity.md); not merged. The whole-corpus
selection triggered by the pair commit is not run yet.

## 2026-11-21 — trap apparatus, verification round 2 (reports/verify-trap-apparatus-round2.md)
Observe APPROVE-WITH-CONDITIONS; throw APPROVE-WITH-CONDITIONS (was REJECT); ratchet APPROVE-WITH-CONDITIONS, not
to be wired yet; retirement unchanged. Closed: observation overwrite, vacuous throw, slice probe, census head.
Partly closed: roster (Node-to-Node launches only; the roster flag is self-declared, so with the census directory
variable set but the census preload absent a merge is "complete" with zero rostered); swallowed throws (green lanes
only: SURFACED is a substring match of the arm id anywhere in the lane log, so a swallowed-but-logged error in a
lane red for an unrelated reason counts as SURFACED: safe for deletions, wrong for keeps); the kept rule (reports
are hand-writable JSON and the checker tests no digest). New: passing verdicts COMPLETE and NOT-REACHED can hide a
red lane or files that never loaded; a detector version bump can raise semantic cells silently; a failed
observation write silently loses later hits.
Sound uses as of 29502803b (verifier, accepted): (i) observe on host lanes: HIT is always sound; NOT-REACHED is
sound only with verdict COMPLETE, the lane bound with exit 0, the arm in notReached (not notLoaded), and the plan
built in the lane's checkout; not for container lanes yet. (ii) a throw run in a deletion's evidence only as
"armed, NOT-REACHED, lane exit 0, digests recomputed from retained files"; SWALLOWED and SURFACED both block.
(iii) wiring the ratchet into a gate: not yet (needs a census refresh route, the census ref and full history in the
gate's clone, and a rule for detector version bumps).
Lead decision: a third corrective round (roster flag, failed observation write, passing verdicts, kept-report
provenance, version-bump rule) plus the lab route and container support are needed before the apparatus is used.
It is PARKED behind the critical-path lines (the three-node failures), because lab hosts and the local commit lock
are the bottleneck. No arm is deleted on trap evidence meanwhile; deletions continue only on their own necessity
tests and independent verification, as with the dead leader-role arms.

## 2026-11-21 — independent verification of W1b (reports/verify-w1b-outcome-identity.md): APPROVE-WITH-CONDITIONS
Core holds: digest from committed bytes (request and apply cannot differ), locale-independent canonical text,
deterministic fail-closed apply, both mutants real and killed, lab numbers confirmed, 14 cone reds spot-checked
per subtest against the base, formation prelude reorder sound, released-store exposure as stated.
Conditions:
1. Merge scope: the branch's merge base with integration is 812dd3a1b, so a true merge carries the 14 unreviewed
   draft commits 812dd3a1b..0993265e5. RULING: merge order is retained-repair (W1, which contains and corrects the
   draft) first, then W1b; the merged tree is executed before any claim.
2. Null trigger rows change retained-repair behaviour for uncommitted definite refusals (no wake, nothing deletes
   the attempt): with the retained-repair writer (ruling or witness).
3. F11 was weakened (pinned null-set assertion deleted): BLOCKING, sent back: definite codes declared once at the
   constants owner, the test asserts exact equality.
Lead additions sent back as blocking or corrective: isSettledInCensus still discharges on entry-id equality alone
(the owner's completion criterion holds for one of two deciders): BLOCKING; the kept colliding attempt must be
visible as explicit blocked work; the typed format refusal must be decided before the destructive snapshot install
and its code must survive; one format decider.
Recorded follow-ups: generic SQL replay settles on any record (reachable only by a proposer defect or forged
write); PLACEMENT_REPAIR body not key-order canonical (same repair, two digests, false BYTES; fails closed;
pre-existing); the coordinator keeps its own prelude; no document mentions the new store-open refusal; a mixed
cluster of the two revision-1 development builds halts non-uniformly (no corruption found).

## 2026-11-21 — PostgreSQL placement refusal REPRODUCED by execution (work/topology-guard-inventory-read-20261121, 65f53d701)
Witness through the real coordinator, gateway, CDC read flow, cache and query executor, with services-p1 as a real
three-replica raft group (lab/guard-witness-r7 on adam-laptop: 95 assertions, 85 pass, 10 fail; every diagnosis
subtest passes, the contract assertions are red by design). Executed observations:
1. Completeness: the guard's read answers success:true, rowSetComplete:false, rows [], source
   local_partition_replica, no error, no reason code; the read names no mode, so the gateway default applied.
2. Witness: none accompanies the answer; the serving replica is the planner node's follower.
3. Routing: owner-RPC calls 0, transport hops 0, although the answer's own diagnostics name the leader node,
   partitions.leader_node_id names it, and a leader-REQUIRED read through the owner RPC is complete and witnessed.
4. Guard decision: replica_inventory_unusable, authoritativeReasonCode null, no retry deadline or next action;
   the planner records a skipped move.
5. Retry: byte-identical refusal; cache watermarks unchanged.
With the leader's hop refused, the leader-required read returns available:false with reasonCode null and
retryAfterMs 0: the failure path carries no reason code either.
Sibling consumers of the same read that silently receive [] (read-only): the retired-REPLACE-source safety check
(an unavailable owner read as "no terminal row"), allocateCanonicalReplicaId (can mint a colliding replica id),
holdCriticalPartitionCreateLaneIfOverTarget (fails open: the over-target hold is silently off on such a node),
readBootstrapServiceRows (falls back to cache rows).
Repair path (not started): the guard and those siblings read the SERVICES inventory through the owner-fact read
(leader REQUIRED, witnessed, typed unavailable with a reconsideration), once the owner-fact slice reports and its
refusal of insufficiently applied read points is witnessed (owner's precondition). The guard's authoritative-read
requirement is preserved: anchor (c) fails any repair that accepts follower rows.
Open: anchor (a) fails after the guard with "Cannot read properties of undefined (reading 'partitionId')" at
"Failed to persist operation"; the same signature is group G2 of the line regressions. One diagnostic commit
authorized to capture the stack.

## 2026-11-21 — base-red triage (reports/base-red-triage.md): none is red on main
Executed on adam-laptop: at origin/main 0dbed1718, 79 of the files that exist there: 79 pass, 0 fail
(lab/triage-main-0dbed1718-1); at the true merge base 49495f7e4, 23 representative files: 23 pass
(lab/triage-mergebase-49495f7e4-1). Correction: 0dbed1718 is origin/main's tip, not the merge base and not an
ancestor of the line; the merge base is 49495f7e4 (2026-11-16).
Of the 92 files red on the collected runtime f580579a5: 79 are LINE REGRESSIONS (green on main), 13 are new on the
line and red, 0 are red on main. 52 of the 79 have a test file byte-identical to main's, so source changed the
outcome. 89 of the 93 (incl. the excluded retained-repair file) are still red at the integration head.
Groups: fixture (persisted history "not JSON text" 4; "Unsupported rebalancer entity type" 3; stale construction or
removed paths 7; most of "authoritative read incomplete" 8); likely product: TypeError reading 'partitionId' on
NODES/SERVICES/replica_operations writes (6, probably also the 4 wasm founders), candidates the named-write
commits; product behaviour change: heartbeat endpoint writes no longer coalesced (4); typed-outcome changes
("proposal accepted, outcome not known" 7, UNKNOWN 2); packaging (npm package over its 2,100-entry ratchet);
undetermined 34. Several are on production paths (node registration during joins, heartbeats and service
registration, extra heartbeat write load, a seed bootstrap 500 from a removed pre-CDC fallback, the PG-wire scale
route answering 500, CREATE TABLE below quorum losing its error), though none of these signatures appears in the
node logs of the two GCP formation runs.
Lead: the collected runtime carries 79 regressions against main that were never attributed. Two tracks being
started on branches from the integration head: root causes of the product-looking groups (TypeError, heartbeat
coalescing, typed outcomes, the 500s) and fixture migrations for the fixture groups. The full-corpus gate cannot
pass on this line until these are repaired or explicitly superseded.

## 2026-11-21 — placement owner repair, stage 1 tenure (work/placement-owner-repair-20261121, aae3106ad; record placement-owner-tenure-record.md)
Executed on tv-dator: tenure witnesses 3, 4, 5, 6, 8, 11, 12 red -> green; 1, 2, 7, 9, 10 stay green (9 now
non-vacuous); three new await-point witnesses (A2, A3 REMOVE, A4->A5) red-first then green; negatives, disruptions
and five-nodes green; wakes and construction reds unchanged (later stages). Design: the ledger replica's own
leadershipTenure by identity (no second tenure notion, no change under src/partition or src/raft); custody derived
from it; checks after every await and before every hold release; the fence in the same synchronous turn as the
propose; a term-start barrier from the raft core's currentTermApplied with wake on APPLIED_PROGRESS; one drain per
custody so the successor is not queued; per-pass and cumulative counters on lastPassSnapshot (never read by a
decision). After the repair: constructions and capacity reads after a tenure ended are 0 in every schedule; one
admitted operation per deficit everywhere.
Open and rulings: (1) witness 13 (bound) red on total timers only, traced to the admitted operation's own workflow:
re-stage to assert owner-attributed tasks flat across all transfers AND the total timer set constant after
admission; (2) seven test files outside the owner broke through stubs and the shared consensus double: scope
extended to exactly those edits, no assertion changes, each file back to its base verdict; (3) a kernel gap
(a deferred or parked write re-proposed after an await under a renewed tenure): witness first, no kernel edit by
this writer. Then stage 2 (wakes). Independent verification of stage 1 follows the follow-up report.

## 2026-11-21 — W1 stage 2b (retained repair owner), head 1ede7a19d; record section 16
Executed on tv-dator: all retained-owner witnesses green (publication 6/6, continuation 22/22, leadership 5/5,
row-repair 45/45, real-publication 1/1, post-copy 2/2, growth-dispatch-identity 13/13). The six red cases resolved:
the two S11 removal witnesses were NOT a stage-2 regression (they fail identically on 8eba5f745; the earlier green
was on a commit that is not an ancestor of this branch): owned-repair was a fixture publishing a raft_role leader
row instead of the canonical route, now green; raw-bypass-negative stays red and tests the REMOVE safety guard this
owner does not touch (reported, not owned). W7 ingress was a witness defect (it raised the ledger term without the
participant release, so the native submit was refused cutover-paused): re-staged, no assertion changed. W7
post-resolution re-staged under Q8. Row-repair 41 read a field the record no longer has. The tenure-end timer was a
real stage-2 defect, fixed by releasing tenures at the leadership loss itself. Residuals closed: the receiver
attests its own created_at with its boot incarnation (limit: read from its own cache row; boot incarnations are
null in the fixtures, so that member is not really tested). Stage-2 defects found and fixed: workflowOwner
dereferenced although optional in production; custody voided on every handoff; NOT_LEADER from a remote receiver
arming nothing. Interaction with W1b: a definite native refusal now retires the record with an ERROR record and the
origin's workflow owner keeps the obligation; its witness is red by design until W1b merges.
Mutation table: lost wake, blind handoff, reused unavailable, overwritten trigger, uncancelled timer killed; stale
custody was NOT killed at first, which exposed a real gap: witness added, product fixed, rebuilt mutant killed.
Change cone versus 0993265e5: 1419 files, 69 failures: 64 already failing on the base, 1 fixed, and FOUR
regressions introduced on this branch, open: rebalance-coordinator-outcome-routing, coordinator-dedup-gap,
operation-workflow-delivered-create-progress-retention, placement-create-dispatch-execution-mirror; common
symptom: a CREATE dispatch is not issued. CREATE dispatch is on the formation path, so this blocks the merge.
Stage 2c started (opus): attribute by first-bad commit, classify product versus fixture with a
production-construction witness, repair at the cause. Independent verification of W1 after that.

## 2026-11-21 — the 'partitionId' TypeError (line-regression group G2): frame captured by execution
From the placement-refusal witness's diagnostic run (lab/guard-witness-r8, sha cf36aeae3): TypeError at
belongsToNamedWrite (src/control-plane/control-plane-named-write-outcome.js:30) <- isCommittedPartitionSuccess (:38)
<- judgePartitionAnswer <- judgeNamedWriteOutcome <- settleInstance (control-plane-write-identity.js:250, :286),
surfaced as "Failed to persist operation". The undefined object is the answer's durableCommitWitness; the check in
front of the dereference, `witness?.partitionId === result.partitionId`, passes as undefined === undefined when the
answer has neither a witness nor a top-level partitionId. Introduced by 7d261f681 ("Recover named control-plane
writes through the current admitted gateway", 2026-11-21 07:56). Observed consequence in the test: the INSERT was
applied and the caller was told it failed (an acknowledged write reported as failed); no reservation created.
Read-only claims, not executed: production engine write answers carry no top-level partitionId and a witness only
sometimes, so production can reach the throw; and with a witness present the same check is false, giving UNKNOWN.
The second claim cannot hold on every path (two GCP formations completed 138 operations on this source), so the
answer shapes production actually feeds the judge are to be established with real producers.
The author of the witness withdrew its first attribution (its own fixture double). Forwarded to the line-regression
causes track as the G2 section's starting evidence; no repair yet.

## 2026-11-21 — CDC currentness stage 2 (work/cdc-currentness-stamp-20261121, 82295c47e; record sections 14-19)
2b DONE, executed on adam-laptop (lab/cdcstamp-2b-red at 8abec5e92: plan bounds and the cache witness red;
lab/cdcstamp-2b-fix at 82295c47e): plan rebuilds per delivery 251 -> 1 (one target group) and 697 -> 1 (three); all
49 negatives, the deadline and selection anchors, the unrelated-row witness (one re-observation, stable progress
untouched) and the cross-turn witness green; raft status reads by the check unchanged at 243 / 685 (the selection is
not stamped, by ruling). One plan per stamp shared by the wave's captures; stamp components exposed by their owners
(four cache table versions, config revision, the latency tree's routing generation, identities, plain values; a
progress revision); the cache version is monotonic across clear() (red-first witness). Deviations from the ruling,
accepted: the tree's routing generation is in the stamp; the negative fixture uses the real LatencyTreeService. One
timeout in cdc-group-propagation-foreground-boundary under the 24-file parallel run, green alone: classified
load-dependent by the author WITHOUT a paired base run (to be checked).
2a NOT implemented: its premise is false. The duplicated evaluations share one synchronous call, but each reaches
raft.readStatus(), and a status read DRIVES the group: with undrained inbound it runs the full ready cycle inside
the call (persist, send, apply committed entries into the system-table cache the plan reads, announce role events).
Collapsing the evaluations would therefore change answers.
Lead: (1) independent verification of 82295c47e started (reports/verify-cdc-plan-stamp.md): the only unsafe outcome
is a stale positive; (2) the versions are read through optional calls so a collaborator without versions silently
keeps the always-rebuild path: likely to be made a required port with a typed construction refusal and the test
doubles migrated, after the verifier's view; (3) a read that drives consensus is a systemic finding ("a probe
measures, it never acts"): read-only census and design started (reports/raft-status-read-drives.md): why
drive-on-read exists (the 2026-09 pre-drain-decision episode), every caller and whether it needs post-drain facts,
and the options for a pure observation read. Any change to the meaning of a read used for authority goes to the
owner.

## 2026-11-21 — independent verification of the CDC plan stamp (reports/verify-cdc-plan-stamp.md): APPROVE-WITH-CONDITIONS
No stale-positive hole found. Verified by the verifier's own derivation: the stamp covers exactly the plan
builder's inputs; every cache row-store write bumps a version; config has three writers; the tree's views are
written only in recompute; the builder never reaches the selection or raft, so stamp-after-build is sound today;
the plan is deep-frozen; every progress write advances the revision; readStatus does drive and apply
synchronously, and such a drive moves a table version so the next evaluation rebuilds. Lab numbers confirmed
(251 -> 1, 697 -> 1; 26 files, 24 pass).
Conditions, sent back to the writer as a corrective round (lead decisions):
1. Versions become REQUIRED collaborator capabilities validated at wiring with a typed refusal; the optional reads
   (a capability probe in another spelling, kept alive only for test doubles) are removed and the doubles migrated.
2. A production-composition witness that the stamp is known and the plan reused.
3. Each stamp component made load-bearing in the tests (removing the tree generation, config identity,
   router.deliver, the identities or propagationMode currently leaves every test green); two mutants shown killed.
4. The plan builder and the stamp iterate ONE declared table list; the structural test fails when the build reads a
   table outside it (the record's claim that an added input fails a test was false).
5. Stamp before/after comparison inside the build so "no drive during a build" is self-enforcing.
6. The foreground-boundary timeout gets a paired base run before it is classified.
7. Record corrected: cache readers get the stored row frozen in place, not clones.
Not merged until the corrective round reports.

## 2026-11-21 — raft status reads that drive (reports/raft-status-read-drives.md, read-only at 23344cddc)
Mechanism: readStatus -> readStatusObserved (src/raft/raft-rs-runtime-owner.js:1542-1578). With inbound pending and
an idle queue it runs perform(READ_STATUS), draining the whole inbound queue (uncapped) through the full Ready
cycle; it also reconstructs a failed group, replaces the shared runtime, syncs compacted storage and announces, and
during a busy turn queues one discarded read turn per call. Correction to the CDC writer's reading: production
sendToPeer is async, so the drain goes pending at the first outbound message and the caller then gets the
PRE-drain observation; step, persist and the socket write are in-stack; apply and role events are in-stack only
when no send is awaited.
History: drive-on-read dates from the first runtime commit (f4f5b5a6e, 2026-09-22), when commands were the only
inbound drain; it is NOT the repair of the September pre-drain-decision episode (F1), whose frozen claim is owned by
the command turn and protects six in-turn decisions; F1 called the status read's pre-drain answer "by design" and
the owner excluded the pre-turn status readers on 2026-09-25. This is the fourth recorded defect from it
(2026-09-23 persistence inside a user session; 2026-09-25 nested drain in announce; 2026-10-05 a
split-merge-hysteresis blocker; today).
Callers: 49 sites in src. Must-be-post-drain: 0 (the read already answers pre-drain when busy, pending, under a
user transaction or in recovery). Authority not fenced by a later core command: 11 (including the read-authority
witness). Authority fenced by a later command turn: 11. Observation only: 27. Hot paths: the CDC currentness
selection (243 per delivery), the partition write pre-check (one per write or transaction step), the
read-authority witness (one per remote or system-table read), CDC subscriber readiness, readiness quorum authority.
CPU: of the 8.8% of seed formation samples under readStatus, 7.7% is the NON-driving path (a fresh uncached core
read, reshape and deep freeze per call); the drive itself is at most 1.1 points.
Recommended option (b): readStatus becomes the owner's last settled observation for everyone, O(1); driving has
one named entry owned by the inbound drain; no production call site changes; to land together with "status
announced only on change" (one end-of-turn settle point). Decisive witnesses: an idle read makes zero core entries
(today two) and a read with pending inbound steps, persists and applies nothing; the F1 differential oracle's
processed-first leg is built with a status read today and must move to the named settle in the same change or it
goes vacuously green.
OWNER DECISIONS required before any change: the meaning of a status read used for authority; the 11 callers whose
authority is not fenced by a later core command (especially the read-authority witness, which the owner-fact read
slice is redefining); who repairs a failed group once reads do not; whether a settle operation is exposed on the
port. Nothing implemented.

## 2026-11-21 — placement owner repair: stage-1 follow-ups and stage 2 wakes (b92a5d6ce; record sections 15-17)
Executed on tv-dator. Stage 2: the four red wake witnesses and a new resync-and-custody witness are green
(lab/por-wakes-red-9687e4d1 -> lab/por-stage2-b92a5d6c): the resync the sealed contract requires ("arms exactly one
timer, the resync") is armed from the production factory over the ledger's time source at custody start and
cleared at custody end; a pass that throws is recorded ABORTED with its failure and retained triggers, the drain
ends, the next wake reruns with those triggers (at most one throwing pass per wake); LEADER_UNKNOWN is named in the
snapshot and its clearing trigger is now PARTITIONS_CHANGED; the start path requests the CDC drive without waiting.
Stage-1 follow-ups: witness 13 re-staged and green (owner-attributed timers flat across all transfers and the
total live timer set constant after admission); the seven files broken through stubs and the shared consensus
double are back to their base verdicts with no assertion changed; the kernel witness is RED as predicted: an entry
deferred under term 2 is re-proposed by the write kernel under term 3 and ADMITTED although nothing wants it.
Rulings: tenure witnesses 3, 4, 5 are re-staged at an await that still exists (their properties do not depend on
A1), plus a witness that a late drive answer acts on nothing after custody ended; the LEADER_UNKNOWN row change is
confirmed (the executed witness demands it; merge note for the table that W1b also edits); the kernel gap goes to a
fresh writer together with stage 3 (construction invariant and removal of the per-partition scheduler), from the
record. Independent verification of stages 1 and 2 started (reports/verify-placement-owner-tenure-wakes.md).
Open finding for that verifier and the next writer: the fence "at the actual admission boundary" does not cover a
write the kernel deferred or parked and proposes later.

## 2026-11-21 — line-regression causes, stage 1 (reports/line-regression-causes.md; probe ref probe/line-regression-groups 939b8c7b4)
Executed on adam-laptop with captures in test files only (lab/lr-probe-b07094a76-1, lab/lr-verdict-939b8c7b4-1;
lr-verdict-28d3ff7bc-1 recorded nothing and is not a result).
G2/G13/G18 and the PG-wire part of G12: TypeError in belongsToNamedWrite (control-plane-named-write-outcome.js:30
via :38): a comparison of two undefined values passes and the next call dereferences undefined. Introduced by
7d261f681, which deliberately changed the rule to "only the producer's durable commit receipt for that exact entry
proves a write applied". With the REAL producers every path settles APPLIED (SQL engine insert/update, same-key
replay, CDC through the engine, CDC on the local leader); only hand-built fake shapes throw; zero occurrences of
the signature in both GCP runs. Class: intended contract change with ~23 unmigrated test fakes, PLUS product
defects: the judge can throw instead of answering UNKNOWN; the UNKNOWN answer still carries outcome 'applied',
completionState 'applied' and nextAction 'proceed'; the CDC bootstrap-direct path drops the write's idempotency
key and answers UNKNOWN for an applied row (whether a named write runs in that window in production: undetermined).
G1 (registration), G3 (heartbeat endpoint writes): fixture debt from the same contract change (fakes answer a bare
success and offer no read-back); no owner defect; coalescing owner unchanged.
G12: CREATE TABLE below quorum reports an EMPTY error (QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT
does not exist): product defect on a real cluster; the seed register-service 500 stands on the removed pre-CDC SQL
fallback (stays removed), with a gap: a retryable refusal is answered as HTTP 500.
G19: a partition ADD naming a replicaId is refused with the corrupt-bytes code: intended check (268d439b2),
misleading code, test not migrated.
Lead correction: an earlier read-only claim from another track, that real producers could hit the TypeError, is
REFUTED by this execution.
Rulings: stage 2 for the same writer = the product repairs only, each red-first (total judge and the
double-undefined comparison as a class; UNKNOWN never says applied, with a consumer census; bootstrap-direct key
carried or the path shown dead; the missing error member and a mechanical pass for other missing members; retryable
refusals mapped by the existing route mapping; a typed code for the replicaId refusal as a witness plus an exact
edit for the merger, because two other writers hold that vocabulary). The fixture writer takes the receipt-fake
groups after its current four, through one shared helper that calls the production answer builders.

## 2026-11-21 — W1b corrective round (work/placement-outcome-format-20261121, tip aa0f6f1cc; record section 19)
Executed on adams-gamla. F4: the census-based settlement (isSettledInCensus) is DELETED; attempts settle only
through readSettledOwnerCommandIn, the function replay uses (near-miss witness red in lab/w1b-corr-red-a1, green in
lab/w1b-corr-green-a1). F6: a colliding attempt is typed BLOCKED_ON_KEY_COLLISION with its record class, visible in
both pass-snapshot shapes, warned once. F9: one format decider, run once at store open, typed refusal. F3: the
definite/waiting classification is declared by the owner and the test imports it (mutant killed in
lab/w1b-mutant-definite-a1). F7 (author's side): the format refusal carries code and partition; the snapshot
catch-up owner performs its destructive swap BEFORE that refusal can fire and then drops error.code: reported with
an exact two-line edit, not made. Tip run lab/w1b-corr-tip-a1: 17 files, 15 green; the two reds
(replica-placement-owner-core #20, growth-promote #7 subtests 40/42) are claimed red at the base too.
Reported only: F5, F8 (the PLACEMENT_REPAIR body text depends on key order while ingress compares
order-insensitively; safe only while no producer rebuilds a body under a kept entry id: checked at the author's
head only), F10. Not rerun: the change cone and the pair's whole-corpus selection.
Lead: independent re-verification started (reports/verify-w1b-corrective.md), including F8 against the
retained-repair branch's current tip, the snapshot-swap severity, and what "resolve to ours" in
proposePlacementCommand would drop from the integration side. Merge note recorded: the clearing-trigger table is
edited by two branches (this one restructures it into two maps; the placement-owner repair changes the
LEADER_UNKNOWN row to PARTITIONS_CHANGED).
Reports requested again from the retained-repair fix (stage 2c) and the owner-fact read (stage 2): both stopped
without a report reaching the lead.

## 2026-11-21 — owner-fact read stage 2 (work/owner-fact-read-20261121, tip ee58d307f; record section 16)
Executed on adams-gamla: witnesses 1-4, hosted-replica, redirect/deadline and the pinned lifetime test green
(lab/s0-witnesses-9a6d3da52-try4; red before in lab/s0-witnesses-red-8d4fd93d7). Implemented: the receiver decides
every leader-REQUIRED read (typed owner_fact_not_leader, no rows, names the leader it knows); one predicate for the
read point (commit == applied, index/term floors, election log applied); the in-process arm calls the same handler
as the remote arm; witness taken in the same synchronous step as the statement with a post-read re-check
(owner_fact_read_point_moved); redirects inside the original budget (A->B->A ends typed at the deadline);
readHint separate from owner facts; contract paragraph "Owner fact and hint".
Finding (executed, lab/s0-witnesses-fc37b8d1a-try2): the raft status field currentTermApplied
(applied > pendingConfIndex) STAYS FALSE after every configuration change the leader applies; the read uses
!confChangePending (applied >= pendingConfIndex, the raft owner's own form) instead. The placement owner's
term-start barrier uses currentTermApplied: forwarded to that slice's verifier as a self-deadlock candidate on the
ledger group during formation.
NOT done: Q6 mutation runs (eight mutants sealed, none run), the change cone, a re-run at the tip.
Rulings: Q4 (identity pair in the witness) stays open and does not block (no first consumer pins a replica; the
retained-repair owner built its own custody attestation; no coined identity); the two CDC wiring files for the
accessor are in scope; finish the proof (re-run, eleven mutants, cone); record the currentTermApplied schedule and
the starvation question for the read-point-moved refusal.
Independent verification started (reports/verify-owner-fact-read.md), with separate verdicts for merging and for
migrating the absence-dependent topology guard.
Guard migration (the PostgreSQL placement failure's repair) started on work/topology-guard-owner-fact-20261121 from
23344cddc + the owner-fact read + the guard witness branch: topology guard and the siblings on the same inventory
read move to readOwnerFact; unavailable = no decision, turn stays scheduled on an existing owned wake; typed refusal
codes; per consumer: absence dependence, floors, wake, and what fences the effect against a deposed-unaware leader.
Not merged until the owner-fact verification approves.
Tooling: the thermal governor matched every command line mentioning heavy.sh, including agents' wrapper shells, and
paused their children (commit attempts returned 147). It now targets only the published heavy job; restarted.

## 2026-11-21 — independent verification of placement owner stages 1-2 (reports/verify-placement-owner-tenure-wakes.md): APPROVE-WITH-CONDITIONS, both stages
Read at b92a5d6ce plus retained lab logs; nothing executed by the verifier.
Confirmed: token identity and single notion; listener order; no await between the owner's check and raft.propose
(role-edge schedules fenced); the census is a local ledger read; counters unread by decisions; no assertion changed
in the caller files; stage-1 red/green per case; wakes 2-6 red before stage 2.
Findings:
1. Barrier: currentTermApplied is read only while the custody is PENDING and latches on the first true read, so a
   mid-tenure ledger membership change does not block placement (verified). Before the latch, a first read landing
   while applied == pendingConfIndex waits with only APPLIED_PROGRESS as wake: self-deadlock candidate on a quiet
   ledger (attach/re-attach to an already-leading ledger; inherited membership change inside the activation
   holdoff). The exact fact (applied term == current term) is not in the status; the fixture models the ideal fact.
2. Fence NOT enforced under a tenure renewal without a role edge for deferred, parked and port-queued proposals
   (violates "no decision by an expired tenure", not "no duplicate"); kernel witness red.
3. A status read can run a full consensus turn between fence and propose (partition-placement-admission.js:222)
   and inside the barrier before custody.running is assigned (:300): possible second drain of one custody.
4. No checkpoint after await readPassCensus (:735-744); two record claims false at head.
5. Throw path correct in code but P3(i) passes through the resync alone; a deterministic throw for one partition
   starves all placement.
6. Witness 3 red; 4, 5 and 13's obsolete-work half vacuous; no witness for the barrier wake, throw retention or
   the later REMOVE checkpoints.
Rulings: one corrective round for the placement writer (re-staging rules with asserted premises; the census
checkpoint and a corrected await table; running-state assigned before any foreign call; discriminating throw
retention; per-candidate failure isolation after a red witness; barrier-wake witness; the acceptance witness for
the barrier fact). The barrier FACT is repaired at its owner: the raft runtime writer was given a red-first item to
make currentTermApplied mean exactly "the leader has applied an entry of its own term" (one field, no fallback),
with a consumer census. The fence gap for deferred/parked/port-queued proposals stays with the kernel's writer
(not yet started; goes with stage 3). Not merged until the corrective round reports and is re-checked.

## 2026-11-21 — re-verification of the W1b corrective round (reports/verify-w1b-corrective.md): APPROVE-WITH-CONDITIONS
No state-corrupting defect found (reading plus retained lab outputs). Every claimed red/green confirmed by sha,
file and case; both tip reds fail identically at base 0993265e5; F4 deletion sound (one apply transaction, no
outcome retention, images carry both tables; no existence-only settlement remains); F8 not a merge blocker (on
the retained-repair tip 1ede7a19d the entry id and body are one frozen pair; nothing rebuilds a body under a kept
id); "resolve to ours" in proposePlacementCommand drops nothing from integration (its only change there, the pause
moved after settled replay, is kept by ownerCommandPrelude); one format decider confirmed.
Conditions and lead rulings (second corrective round sent to the writer):
N1: a blocked RELEASE attempt can never be released (its intent key is the operationId) and stops every pass for
    every partition for ever. Ruling: red witness, then re-drive under a fresh entry id IF release is shown
    idempotent at apply by operation identity; otherwise scope the stop to the affected partition. Blocked attempts
    stay visible; a test must read lastPassSnapshot.blockedAttempts for ADMIT and RELEASE. (Reachable only through
    corruption or a foreign entry id: inferred. Flagged to the owner as a lead ruling.)
F4 residue: a never-committed release whose hold another leader released is kept for ever, unlisted. Ruling: a
    named retirement "superseded by ledger state" for RELEASE only, on absence of the hold in the same local read
    transaction; never counted as the command having applied.
N4: the DEFINITE set is pinned literally in the test (independent second statement).
The blocked-attempt red at d9289d64d was an import SyntaxError: a real mutant kill is required.
Hand-offs to record: snapshot owner (validate outcome format on the staging db before the destructive swap, carry
error.code; declared format identity instead of the CREATE_TABLE text; cross-build only); merger (owner hunks
listed one by one because the placement-owner repair rewrites replica-placement-owner.js; LEADER_UNKNOWN belongs
in the waiting map with PARTITIONS_CHANGED).
Merge order stands: retained-repair, then this branch, then the placement-owner repair; no merged tree has run yet.

## 2026-11-21 — independent verification of the owner-fact read (reports/verify-owner-fact-read.md)
(i) merge ee58d307f: APPROVE-WITH-CONDITIONS (the slice only adds refusals; depends on the change cone).
(ii) migrate the absence-dependent topology guard: REJECT as it stands.
Findings (read at ee58d307f plus retained lab outputs):
1. "Still leader" is decided on a cached status: readStatus returns the last announced observation whenever a core
   turn is pending (raft-rs-runtime-owner.js:1560-1578; pending during every peer send and during persistence
   admission). A deposed leader that already knows its successor answers READY.
2. The witness is a lower bound, not the snapshot position: entries applied inside a pending turn are in SQLite but
   not in the cached status; "unchanged applied index" compares an object with itself.
3. The gateway single-flight key omits the owner-fact floor and the deadline: an owner fact can join a plain
   leader-REQUIRED read whose receiver never made the owner-fact decision.
4. Read point sound (inferred): applied >= pendingConfIndex is sufficient and is what closes the fresh-leader case;
   commit === applied has no test and no mutant.
5. Mutant m01 survived its declared killers (the receiver repeats the role check); m02, m04, m06 killed; the rest
   not yet run.
6. The red-by-design test is an ordinary corpus test (would turn the corpus red at merge).
7. Contract overstates the step-down bound (one to two election timeouts, about 2 s at defaults).
8. Unverified risk: a read inside a foreign open transaction would see uncommitted rows.
9. Floors are bare integers: the guard reads SERVICES but writes the ledger, so "its last write" is a position in
   the wrong raft group.
Before (ii): receiver decides on a current core status or refuses; refuses inside a foreign transaction; answer
echoes the decided request; floors typed by partition; executed kills; and the EFFECT fenced: the ledger admission
conditional on "no other open operation, same last terminal operation", whose record supplies the SERVICES
(index, term) used as the read floor; floors of 0 leave a stale but complete inventory able to authorize a
placement.
Rulings:
- Owner-fact writer, corrective round: applied position read from the store in ONE read transaction with the
  statement (scope extended to the statement owner; replaces the read-point-moved heuristic); role/term from a
  current core observation (red witness now; typed refusal when the status is not current, or stop with the exact
  raft-owner need); single-flight key includes kind and floors, answer echoes the decided request; floors typed
  {partitionId, index, term}; foreign-transaction reachability and refusal; one role decision (m01); full mutant
  table; the red-by-design test becomes a green property plus a one-way counted census of the 37 remaining
  leader-REQUIRED consumers; contract text corrected.
- Raft runtime writer, highest-priority item: ONE current, non-driving, uncached core observation for receivers
  deciding authority, with per-field honesty about what is settled mid-turn; history of why the read is cached
  during a pending turn first; readStatus itself NOT changed (its general meaning is a pending owner decision).
- Guard writer: stage 1 only (merges, census, per-consumer table, red witnesses), plus the facts for the effect
  fence: what the ledger admission checks at apply today, every SERVICES inventory writer not driven by a ledger
  operation, whether a terminal operation record can carry the SERVICES commit position.
Consequence: the PostgreSQL placement repair now depends on (a) the read's corrective round, (b) the raft owner's
current observation, (c) an effect fence for the guard. An interim option exists (move the guard to the strict
leader-qualified read as merged, which is strictly safer than today's fallback read but short of an owner fact for
an absence-dependent consumer); NOT taken, because the owner's instruction gates that migration on the read
refusing unsafe read points. To be put to the owner.
This also amends the status-read recommendation: receivers deciding authority need a CURRENT core observation, not
the last settled one; option (b) alone would have made finding 1 permanent.

## 2026-11-21 — W1 stage 2c (work/retained-ledger-observation-repair-20261121, tip f9d847b1d)
Executed (lab/w1-s2c-attr-95ee6ee4a, lab/w1-s2c-probe-bf8a1f022): all four CREATE-dispatch cone regressions have
one first-bad commit, 95ee6ee4a, and one cause: retryRetainedRepairDecision owed ROUTE before reading whenever the
binding was unavailable, and witnessRefusal refused a read served by any replica other than the binding even when
the row was present; the dispatch reservation gate asks this owner about every ADD/REPLACE dispatch. Class: product
regression of this branch (a coordinator whose cached ledger route is unpublished or names a previous leader
withheld the CREATE dispatch of a present, exact row). Repair f9d847b1d: a present row (EXACT or CHANGED) is
settled by any qualified ledger-leader read; absence and contention still judged only against the binding; with no
binding the decision reads its own row once, anything else stays owed to the next route publication (no timer).
Green-after NOT yet run (the writer stopped on the lead's status request).
Rulings: run the green evidence and the 97-file cone; replace the getAll capability probes with a required port
inside the owner (report those outside); justify, or restrict, the presence-from-any-leader rule against a
deposed-unaware leader (negative witness: present on the deposed leader, retired on the current one); the withheld
dispatch gets an owned re-drive through the workflow owner's existing per-operation retry entry (red witness first;
stop if it needs a new mechanism); record section 17. Independent verification follows that report.

## 2026-11-21 — fixture migration, first writer's end report (work/line-regression-fixtures-20261121, tip 50cc71c3c)
Executed on the lab (lrfix-g5-1, lrfix-g6-1, lrfix-g4-2, lrfix-g7-1): 12 of 22 assigned files green with no
assertion changed and no src change; records and rows now come from the production producers through
buildCreatedOperationFixture / advanceOperationFixture. Stopped or not done: three files pin the wake-row shape
from before 4f347ca3f (22 added null columns); insert-retry; duplicate-operation-prevention and storage-reservation
(need the SQLite store); entity-interaction-contract cases 2, 3, 6; durable-voter; bootstrap-api (removed pre-CDC
fallback); placement-create-bootstrap-binding (another writer's area). Finding beyond the fixture seam:
initialization-shutdown case 6: createReplicaAsync resolves although the runtime's shutdown() rejects (candidate
cause b0dd82398). The receipt-fake groups were not started (writer out of context; successor plan in its report).
Rulings and successors (both Opus, own worktrees):
- work/line-regression-fixtures-b-20261121: the remaining files. Wake-row pins: read 4f347ca3f; if the full
  canonical row is the intended contract, the expected shape comes from the production row builder while every
  field the test is about stays asserted literally; if intent is not shown, stop. The shutdown-rejection finding
  is investigated only (a swallowed production error would be a defect). Removed fallback stays removed.
- work/line-regression-receipt-fakes-20261121 (fixtures tip + true merge of the judge repair ab3e4b9af): the
  receipt-fake groups G2, G18, G13, G1, G3 and the two G12 files through ONE shared helper that calls the
  production answer builders, pinned by a test against the real judge; a file still red after its fake answers
  like the real producer is a finding.

## 2026-11-21 — line-regression causes, stage 2 product repairs (work/line-regression-causes-20261121, tip ab3e4b9af)
Executed on adam-laptop (lab/lr-s2-red-0ddf7b00f-1, lab/lr-s2-guards-before-0ddf7b00f-1, lab/lr-s2-after-ab3e4b9af-1).
1. Named-write judge is total: presence checked before every comparison; three sibling sites fixed (nested-failure
   selection, the distributed key check that passed with both keys missing, non-object participants); witness table
   of 31 answer shapes (before: 5 threw, 1 wrongly APPLIED); real paths still APPLIED.
2. UNKNOWN no longer says applied: success false, outcome-unknown code, contractState pending, nextAction retry.
   Stale-field readers found: join-admission withdrawal, authoritative-row helper (mapped to REJECTED), admin body,
   gateway telemetry. Author: no consumer treated an unknown write as acknowledged.
3. No named write runs in the seed's bootstrap window (by reading only); the key-dropping lane carries every write
   in that window and loses idempotence for keyed retries (recommendation, not made).
4. Empty CREATE TABLE deadline error fixed; two more missing message members found and defined.
5. register-service answers a retryable refusal 503 with a typed body (deferRetry was dropped by the error
   builder); the PG-wire scale 500 came from the judge's TypeError, now 503.
6. Witness only (red) for the misleading replicaId refusal code; exact edit handed to the merger (new
   REPLICA_IDENTITY_NOT_ADMITTED in PLACEMENT_ADMISSION_ERROR; used at
   rebalance-coordinator-operation-creation-support.js:528). No production caller sends replicaId on an ADD.
After-run: 13 of 23 green; the 10 red are unmigrated fakes, now SLOW (each unproven write re-sent under its key for
30 s / 34 attempts before the typed unknown; files run to the 600 s limit).
Open: write-exactly-once-property red before and after (not examined); mutation-outcome vocabulary has no UNKNOWN
member; classifier flags not gated by failed.
Lead: independent verification started (reports/verify-named-write-judge.md), including whether one witnessed
participant can make a multi-participant write APPLIED, the REJECTED mapping of unknown outcomes, the retry cost per
unknown outcome on a real cluster (the GCP runs logged 283 and 659 outcome-unknown lines on CPU-saturated nodes:
candidate contributor to formation pace, to be established), and the attribution of write-exactly-once-property.

## 2026-11-21 — W1 stage 2c interim (tip a10a9cae3)
Executed on tv-dator at a10a9cae3: the four regressed files green; the 97-file cone 67 pass, all 30 reds failing
identically on 0993265e5 (pre-existing); the mirror file has one red by design (the re-drive witness). The writer
RESTRICTED the presence rule after the deposed-leader challenge: presence settles from a read by the bound
replica, and from any qualified leader only when no route binding exists; a read from any other replica is
refused. Still to come: red-before probe, one mutant, the re-drive, record section 17, final report.

## 2026-11-21 — topology guard migration, stage 1 (work/topology-guard-owner-fact-20261121, 625381bd6; reports/topology-guard-owner-fact-record.md)
Executed on tv-dator (lab/guard-stage1-red-625381bd6); both merges (owner-fact read, guard witness branch) clean.
Red witnesses, each for the consumer's own reason: W1 the planner reads its own follower once, zero hops to the
leader, untyped refusal, no proposal; W2 the production planner turn came back 5 times in 20 s, each refused
blocked/replica_inventory_unusable with a null code, and still proposed nothing 60 s after the leader was
reachable; W3 same with a deposed published leader. Siblings: the allocator on a follower host hands out
sys-postgres-wire-r1, colliding with the leader's row (reference gives -r2); the bootstrap address book drops the
leader-only row; the over-target hold is released on the follower host while the reference holds it.
Census: five fallback-mode consumers (guard, retired-source check, allocator, over-target hold, bootstrap rows);
once they move, getAuthoritativeEntityServiceRows and the fallback arm have no caller. Three strict readers stay.
Fence facts (read only): the ledger admission already refuses another incomplete operation of the same entity
(PARTITION_BUSY) but checks no last terminal operation, SERVICES position or epoch; its `positions` record is
carried and never checked; SERVICES changes the ledger never sees: failure-detector FAILED marks, restart
re-insertion, group retirement, bootstrap/admin handoffs, join upserts, runtime state projections; no SERVICES
position on the terminal record today (the registration write's commit witness is dropped; the completion read
drops its witness and does not require a leader).
Findings for other owners: completion reads with leader ANY are absence-dependent; message-group source retirement
treats an unavailable read as "no live row" behind a capability probe; the retired-source check releases its lease
on a cache hint.
Rulings (stage 2 = migrate now against the merged read, adapt when the read's corrective round lands; not merged
until the read's re-verification approves): the guard's two cache-based "allowed" escapes are DELETED; the
over-target hold DEFERS instead of failing open (documented fail-open to be quoted for a supersession record;
flagged to the owner); partition bootstrap rows are an explicit HINT; allocator callers outside the planner use
their existing attempt loop / the workflow's per-operation retry, else stop; typed refusal codes; fallback arm and
helper deleted when callerless; coupled pair registered with the green commit. The ledger fence is NOT in this
stage: a residual witness (deposed-unaware SERVICES leader + an operation completed through the new leader) is
written and run after the migration to show whether anything remains once the read decides on a current core
observation; the carrier design (completion read's witness recorded on the terminal transition, used as a typed
floor) is recorded as a candidate only.
Owner-fact writer: deadline becomes a required parameter; the routing dimension is carried explicitly.

## 2026-11-21 — placement owner corrective round (work/placement-owner-repair-20261121, head 8e84e2801; record 18-25)
Executed on tv-dator (lab/por-corrective-red-87a34cb4 -> lab/por-corrective-8e84e280): red-first and now green: the
census-read checkpoint (construction after the tenure ended), the drain-start mark (two passes of one custody in
flight), the poisoned candidate (another deficit starved). Re-staged with asserted premises and green: tenure 3,
4, 5 at the admissibility read, 13 with a real suspension at all six transfers; P3(i) retention observable; the
barrier wake and its negative; the REMOVE-path await witness. Source: check after readPassCensus; re-check after
the barrier latch; drain marked before any foreign call; per-candidate isolation (typed CANDIDATE_FAILED, recorded
under failedCandidates, triggers retained, pass continues; a failure outside the loop still aborts). Red on
purpose: the barrier "production definition" witness (raft owner) and the write-kernel probe. Unchanged: construction
4-5 red (stage 3); core [18] and drain [4, 10, 11] red as at base 974320ad3. Witness 13's bound restated: no
obsolete pass remains after a role-edge transfer; no constant bound for a renewal without a role edge (kernel gap)
or a suspended REMOVE read (inferred).
Started: re-verification of the corrective round (reports/verify-placement-owner-corrective.md), with per-candidate
isolation examined as new behaviour; stage 3 writer (construction invariant, stop before the removal of the
per-partition scheduler) on the same worktree; a kernel writer on work/write-kernel-tenure-fence-20261121 (tenure
captured at submission and compared at every hand-off to consensus; all six kernel callers censused; stop if a
non-authority caller would lose work).

## 2026-11-21 — verification of the named-write repairs (reports/verify-named-write-judge.md): APPROVE-WITH-CONDITIONS
No safety defect introduced; the judge is strictly tighter than at base. Verified: one witnessed participant cannot
make a multi-participant write APPLIED; no remaining comparison passes on two absent values; no non-retryable
failure became retryable; write-exactly-once-property is an intended contract of d471620a9 (not a regression); lab
claims confirmed. Retry cost in one GCP node log: 48 unknown lines, 38 named writes (all logs-p1 INSERTs), 2 of 36
keys repeat about 8 s later, no 30 s bound spent: a plausible MINOR contributor to formation pace (inferred).
Conditions: (1) managed-split-workflow-state-methods.js:86 still reads the undefined message member; (2) four
unmigrated files went from 8.3 s to 1565 s: do not merge ahead of the fixture migration; (3) the item-6 hand-off is
incomplete (the new code must join PLACEMENT_DEFINITE_ANSWER_CODES on the outcome-format branch); (4) UNKNOWN is
still not a named outcome (consumers infer owner_not_ready / REJECTED from the missing field; thrown transport
unknowns keep a different shape); (5) pre-existing: a zero-participant distributed success with affectedRows 0 is
APPLIED without a witness. Not confirmed: FAILED / NOT_PROPOSED on real producers. New: the bootstrap-direct lane
re-executes the same SQL outside raft when the raft lane fails (cdc-bootstrap-direct-sql.js:139-178): a fallback.
Ruling: a successor writer on the same branch takes (1), (4), (5), the real-producer guard for definite failures,
and a report-only necessity analysis of the bootstrap-direct fallback; (2) and (3) are merge notes.

## 2026-11-21 — re-verification of the placement owner corrective round (reports/verify-placement-owner-corrective.md): APPROVE-WITH-CONDITIONS for 8e84e2801
Closed: drain mark; AFTER_CENSUS checkpoint; re-staged witnesses 3/4/5/13. Confirmed: the await table (one
omission: the CDC drive's synchronous prefix); the barrier latch belongs to the custody; no double drain and no
stuck mark; red-first in commit and execution order; isolation is safe against duplicates (the applier refuses a
busy partition, an unresolved ledger transition and copy capacity at commit). Open for other writers: the barrier
fact (raft owner) and the kernel fence.
New findings (by reading): (1) trigger retention after a candidate failure does nothing for planning and makes the
retained set grow so resyncOnly is never true; (2) CANDIDATE_FAILED is classified by position and can name an
admitted operation (local attempt delete throwing after a committed admission; pass continues on stale accounting);
(3) isolation does not cover a bad PARTITIONS row or a failing capacity read outside the loop; (4) the A4' row has
a schedule and its checkpoint discards its result; (5) two more cases without a constant bound; (6) no witness for
the barrier re-check. Six files of the stage-2 selection were not re-run at head.
Rulings (sent to the stage-3 writer, who holds the worktree, as a separate red-first round): retention only for an
aborted pass, a failed candidate is re-derived by planning; classification by what is known about the proposal
(not handed / definite refusal = CANDIDATE_FAILED and continue; admitted then local failure = admitted + abort;
handed with no answer = uncertain attempt + abort); per-partition evaluation failures are typed per partition while
a failed global-authority read still aborts the pass; A4' witnessed and its check made to decide; barrier re-check
witnessed; record corrected; the six files re-run.
Merge condition recorded: the barrier witness must be green (raft owner's field) before any "stage 1 complete"
claim; the kernel probe stays open against the kernel's writer.

## 2026-11-21 — fixture migration successor B (work/line-regression-fixtures-b-20261121, b2a4d8796)
Executed on adams-gamla (lab/lrfixb-g1-1, lab/lrfixb-g2-1): green with assertion counts matching main:
remote-direct-wakeup 38, ready-node-retry-cache-priority 37, ready-node-retry-dispatch 54, insert-retry 10,
duplicate-operation-prevention 45, storage-reservation 100; entity-interaction-contract case 3 green (cases 2, 6
open). Wake-row question answered: 4f347ca3f deliberately replaced the dispatch service's local 17-column wake row
with the canonical row builder (e8f4bdb84 routed all three wake producers through it): the full row is the
intended contract; the expected rows take their column set from the production builder with the 17 formerly pinned
columns kept as literals. Shutdown finding investigated: production does NOT swallow the rejection
(replica-runtime-cleanup-custody.js:73-95 rethrows and keeps the service in pendingRuntimeShutdowns); the test
resolves because its factory never calls onPartitionConstructed (required since 7ccb67f35): fixture debt.
Rulings: bootstrap-api and durable-voter reassigned to the receipt-fakes writer (restatement confirmed: exactly one
services INSERT reaches the CDC owner, no raw SQL write); the shutdownCalls >= 2 assertion states a property (a
failed shutdown is attempted again) and is not lowered: the test must drive the owner of the retained service's
retry, and if none exists that is a product finding; the one placement-create-bootstrap-binding file may be
migrated if the outcome-format branch does not change it; entity-interaction cases 2 and 6 continue; one
consolidated run at the end.

## 2026-11-21 — fixture successor B, end report (work/line-regression-fixtures-b-20261121, 8e1571c6a)
Executed on tv-dator (lab/lrfixb-all-2): consolidated 20 files, 18 pass, 588 assertions; every file turned green by
the two writers stays green. initialization-shutdown case 6 green: the retry of a retained runtime is owned by the
node's shutdown (replica-runtime-cleanup-custody.js:140-157, rejects with an AggregateError and stays retained
while it fails) and by a later CREATE of the same replica (settlePendingReplicaRuntimeCleanup); the test drives the
node's shutdown and keeps shutdownCalls >= 2 unchanged: no product finding. Open: entity-interaction-contract cases
2 and 6; placement-create-bootstrap-binding 11/14 (cases 12/13 fail later because the durable in-flight REMOVE
correctly blocks the self-move gate; case 14 has three removals durable at once on one entity).
Ruling for the last file: per case, decide which production caller it models: an existing operation (evaluate each
subject alone and bring it terminal through the producer before a gate the case expects free) or a preflight (the
production prospective evaluator); a case that can only pass by asserting something different is stopped and
reported. Successor C started for these two files.

## 2026-11-21 — CDC plan stamp corrective round (work/cdc-currentness-stamp-20261121, 873570c54; record section 20)
Executed on adam-laptop (lab/cdcstamp-c1-red -> lab/cdcstamp-c2: 28 files, 26 pass; the two reds by ruling are the
selection bounds, still 243 / 685 raft status reads; plus the foreground-boundary first-case timeout).
1. Versions REQUIRED: new wiring validation (cdc-group-propagation-collaborators.js) refuses a collaborator without
   its capability, typed, before anything is assigned; no optional read remains in the stamp; no "unknown stamp";
   fixtures moved to the real cache/tree (cache and tree refusals red at C1).
2. Production composition pinned: stamp known, second identical delivery adds no rebuild.
3. Stamp components made load-bearing; FOUR REMOVED as not independently movable (configuration identity,
   router.deliver, propagationMode, source.groupId); stamp is now cache/tree/router identities, nodeId, replica
   suffix, configuration revision, tree generation, four table versions. Mutants killed on the lab: tree
   generation, router identity (lab/cdcstamp-mutant-*).
4. One declared table list used by the routing and iterated by the stamp; structural test records real reads in
   both modes (its red mutant not yet run: runner failure).
5. Stamp taken before and after the build; a plan built across a move is returned but not held (red at C1).
6. Paired runs: the foreground-boundary first case times out at BOTH base (6454 ms) and head (6981 ms) against a
   6 s budget: pre-existing, load-dependent.
7. Record corrected.
Lead: short independent re-check started (reports/verify-cdc-plan-stamp-corrective.md), centred on the four
removed components (each removal is a safety claim). Closing items to the writer: run the third mutant; delete the
now-dead optional cache calls in the routing file; diagnose the first-case timeout (virtual time if it is test
waiting; a cost finding if it is product work; the budget is not raised).

## 2026-11-21 — re-check of the CDC plan stamp corrective round (reports/verify-cdc-plan-stamp-corrective.md): APPROVE-WITH-CONDITIONS, none blocking
No stale-positive hole. The four removed stamp components verified immovable at 873570c54 (config identity
assigned only at construction and initialize accepts no other config; router.deliver only type-checked and never
reassigned; propagationMode overwritten from config on entry to the build with the stamp taken before and compared
after; source.groupId assigned only in the constructor). Wiring validation, the before/after comparison, the table
list and all lab claims confirmed by sha, file and case.
Conditions: K1 version methods are checked for presence, not value (a constant or undefined would compare equal
for ever; production owners return integers); K2 the structural case has no red run yet (mutant not executed); K3
the foreground-boundary timeout is pre-existing and a standing red needing an owner. Gap: stop() then start() on a
never-initialized service ends in a TypeError.
Ruling: K1 and the gap added to the writer's closing items (integer answers validated at wiring; a non-integer at
read time means the plan is not held; unwired start is a typed refusal). The writer's final sha after the closing
items is the merge candidate for this line; it is independent of the placement/retained merge order.

## 2026-11-21 — W1 stage 2c final (work/retained-ledger-observation-repair-20261121, head f42102c84; record section 17)
Executed (tv-dator, adam-laptop): the four regressed files green (lab/w1-s2c-run3-a10a9cae3); retained/placement
set green except three known reds (the W1b-dependent continuation witness, S11 raw-bypass-negative,
placement-owner-core test 20); the 97-file cone 67 pass and all 30 reds identical at 0993265e5; mirror 9/10, the
one red being the re-drive witness by design. Rule in force: a read served by the bound replica decides; with no
binding at all any qualified ledger read may settle a PRESENT row, never an absence; a read from a replica other
than a resolvable binding settles nothing (UNQUALIFIED_BINDING), owed to the route publication. Mutants: presence
from a non-binding replica killed; absence from a non-binding leader first SURVIVED, a witness was added
(f42102c84) and it is now killed. Negative witness: a row present on a deposed leader and retired on the current
one is not confirmed.
Author's stated residual (pre-existing): with no binding, a deposed leader's presence can still become REINSERTED
through the zero-row update arm (replica-operation-repository-mutation-update-methods.js:593-600), which has no
downstream fence; the dispatch gate IS fenced by the target's create admission CAS.
Capability probes outside the owner listed with exact edits (notably: a cache without onCacheChange silently loses
the owner's ROUTE and own-row wakes; createMockCache has none).
Re-drive stopped on a design question. RULING: the withheld dispatch is re-driven by a signal from the retained
owner (an event per operation identity when a withheld row becomes confirmed or definitively absent) into the
workflow owner's per-operation fenced retry entry (953d705f8), which this older branch does not have; so it is
implemented on the INTEGRATION line after this branch is merged, not by polling and not on this branch. The
zero-row-arm fence and the probe edits go to the same post-merge work list.
Started: independent verification (reports/verify-w1-retained-repair-owner.md).

## 2026-11-21 — independent verification of the retained-repair owner (reports/verify-w1-retained-repair-owner.md)
APPROVE-WITH-CONDITIONS for the merge; NOT ready for the three-node acceptance run. Why merge: the integration
line carries an older sibling draft of this owner (e9de22eb1) with the role-keyed notified-row wake and any-leader
read acceptance; the branch removes both (verified).
Defects, inferred by reading, no witness covers them: F1 a timer wake that owes only ROUTE with an unchanged
binding returns before any read (route change -> one transient read failure -> record stuck); F2 the retry window
is cleared by every qualified read, so a presentation that keeps failing retries every 100 ms for ever, never
SPENT, never reported; F3 joinRetainedRepairDecision presents unfenced with no read (a delegated sender that
becomes ledger leader proposes once with unchanged BUSY); F4 a stale open window gives a later transient failure
zero retries; F5 with no binding INVALID_ROW and READ_FAILED are relabelled route_unavailable, unlogged, no timer
(verified). Table: "timer fires while delegated: impossible" is possible (duplicate continuation on sender and
receiver). Custody uses existing identities; the term is never compared at the sender (term-only tenure end leaves
it DELEGATED until a caller arrives). Presence/absence: the dispatch gate is fenced (verified); the zero-row arm is
unfenced, head narrower than base 0993265e5; UNQUALIFIED_BINDING neither bounded nor visible; no binding can
persist indefinitely.
Evidence: nine witnesses and eight mutants confirmed in lab outputs; five of six mechanism mutants not re-run at
head; FIVE of the "30 pre-existing reds" are GREEN on the integration line (lab/w2-final-23344cddc-focused), so the
attribution against the old draft tip was not sufficient.
Rulings: a fresh corrective writer on the branch: each of F1-F5, the duplicate continuation, visibility of the
route-owed wait, and the term-only tenure end gets an executed witness FIRST and a repair only if red (one window
model for F2/F4; no timers added; visibility through the owner's existing state surface). Post-merge work on the
integration line (not on this branch): the re-drive (one edge-triggered event at retireRetainedRepair with
operation identity and CONFIRMED / UNCONFIRMED(reason), only for records that refused a caller), the zero-row-arm
fence, the outside capability probes. The merger was given the resolution facts (owner files: branch logic;
replica-operation-repository.js: integration file plus the branch's nine lines) and must attribute the five files
explicitly on the merged head against the integration baseline.

## 2026-11-21 — placement stage 3 census and corrective round 2, first writer's end report (head 3b182f42f; record 26-28)
Executed on tv-dator (lab/por-s3-witnesses-500a9851, lab/por-cr2-item1-red-a5aacf97 -> lab/por-cr2-item1-3b182f42).
Census: seven construction sites; the only production `new RebalanceCoordinator` is inside ControlPlaneSetup.create
and binds the factory with no await in between, so an unbound coordinator arises only when tests or simulation
build one outside setup. Hazards: the flag guard read after the existing-rebalancer branch; the attach silently
returns null while the lazily created eligibility owner does not exist; the binding never attaches a ledger that
met the coordinator before it; a capability probe and a skip when another leadership sink is set; the factory-less
fallback arms no timer; seed-cleanup-handler quiesces without isShutdown (owner re-attachable during teardown; no
witness). Witnesses: 1 seed, 2 join, 3 late ledger, 7 leadership lost/regained, 8 ledger replica restart, 9 join
during formation green; 4, 5 and new 6 (late binding with no rebind: the ledger itself holds a UnifiedRebalancer
and no owner is ever attached) red. 3a designed, not implemented. 3b: of 14 flag read sites only R1 and R2 select
the retired mechanism; R3-R13 select placement-admission/learner-first behaviour and R4-R10 run their false branch
in production before bindControlPlaneServices.
Corrective item 1 done (only a pass that throws keeps its triggers); items 6, 7 done; items 2-5 not done; item 3:
no cache row found that makes the evaluation throw.
Rulings (successor started on the same worktree): implement 3a as designed plus a teardown witness; 3b deletes
exactly R1, R2, the partition-side UnifiedRebalancer construction with its branches, the fallback constructor and
what becomes unreachable; R3-R14 are NOT touched, each documented with what its false branch does pre-bind (a
later decision); corrective items 2, 4, 5 red-first; item 3 gets a bounded search and is closed as not reproducible
if no production-holdable input throws.

## 2026-11-21 — write kernel tenure fence (work/write-kernel-tenure-fence-20261121, head a5bf01004; reports/write-kernel-tenure-fence-record.md)
Executed on adam-laptop (lab/kernel-red-0bb5c473, lab/kernel-red-g-c9d8896f -> lab/kernel-green-a5bf0100).
Caller census: SEVEN callers of the kernel (placement; ordinary SQL writes; CDC acknowledgements; coordinator
settlement; participant PREPARE/DECISION; generation origin; formation latch/declare); the author judges each
already handles the role-edge answer, so the rule applies to every write and no new retry is needed. Repair
(candidate B): each write records its tenure at registration; proposeUnlessDeferred compares it by identity with
the current tenure in the same synchronous step as the propose; a mismatch is released through the queue's existing
release with LEADERSHIP_LOST; partitionWriteLeadershipRefusalOf refuses NOT_LEADER if the tenure changes during its
own status read. Witnesses red -> green: deferred placement (a), parked write (b), ordinary deferred write (e),
leak counts (f: queued/pending/timers 1 -> 0), renewal inside the kernel's read (g); inherited work (d) green
before and after.
STILL RED, executed on three real rs-raft ports (witness c): a proposal queued INSIDE the port on a deposed leader
is FORWARDED by raft-rs to the successor (raft.rs ~:2312-2322; the binding has no switch for forwarding) and
commits under the next term, after the successor's term-start entry. Exact edit handed to the raft owner (record
the submitted term per proposal; at the propose step after drainInbound refuse when the core is not leader or the
term differs, with the core's dropped-proposal refusal).
Unattributed: partition-runtime-reconstruction-leadership test 5 failed once, passed five other runs.
Rulings: the join gap is closed through the SAME release step (a current-tenure caller never joins an
earlier-tenure pending write); the read check stays conservative; the participant staging-session asymmetry (role
edge discards, renewal keeps) is recorded for the participant owner; the architecture doc gets the fence. The raft
runtime writer received the forwarding item as its third raft-owner item (with the question whether anything
relies on follower forwarding) and a status/budget check. Independent verification started
(reports/verify-write-kernel-tenure-fence.md), centred on: is the comparison at every hand-over; per-caller loss or
double apply; and whether a write answered "not proposed" can still be forwarded and committed from the port
(double apply on retry).

## 2026-11-21 — raft-owner items, status from the raft runtime writer (work/raft-frame-delivery-20261121)
A (currentTermApplied = the leader applied an entry of its own term): DONE, executed: red 1d4125c7b
(lab/raftframes-cta-red), fix bc949308f (lab/raftframes-cta-green, 12/12). B (one current, non-driving, uncached
core observation for receivers deciding authority): implemented and pushed: red 90021de24 (lab/raftframes-cao-red,
4/4 red), operation 97ba4431b; green lab run pending (host busy). C (refuse a proposal the core would forward
after losing leadership): started. The writer has about half its budget left.
Rulings: the raft-owner items are EXTRACTED onto their own branch work/raft-owner-authority-20261121 from
23344cddc (cherry-pick through the hook, red-first order kept, lab run at head and base), so the owner-fact read
and the placement owner depend on them without depending on the transport work, which still has owner decisions
pending. The raft writer finishes C as two raft-only commits, writes a handover section, and stops; a successor
takes the remaining frame steps. Independent verification of the extracted branch follows.

## 2026-11-21 — fixture successor C (work/line-regression-fixtures-b-20261121, 92a441229)
Executed on tv-dator (lab/lrfixc-entity-1, lab/lrfixc-all-1): 20 files, 18 pass, 590 assertions; entity case 2 and
placement cases 12/13 green; no assertion changed. Basis: every partition and runtime-service operation is created
through placement admission, which refuses a new admission on an entity with an incomplete operation
(PARTITION_BUSY, partition-placement-admission-decision.js:202-229), so two in-flight operations on one partition
cannot exist in production. Stopped: entity case 6 message-group half (production answers FAIL "group-safety would
drop active replicas below minimum (2/3)", the test expected DEFER from a hand-built context; the deferral logic
was the same when the case was added); placement case 14 round 2 (needs a durable removal beside an in-flight
native placement: refused by admission in both orders).
Rulings: cases 12/13 as preflight confirmed (the only production caller is getMoveSafetyError ->
evaluateProspectiveRemoveSafety). Entity case 6: expected value restated DEFER -> FAIL with its reason, recorded as
a changed expected value; contract as executed, to be put to the owner: a message-group REMOVE that would drop
active replicas below the minimum FAILS the operation, it is not deferred and retried. Case 14 round 2: no
fixture state production cannot produce; the REMOVE at PENDING as a preflight through the production evaluator,
the REPLACE phases restated as the admission's PARTITION_BUSY refusal in both orders; count change recorded.

## 2026-11-21 — FIRST MERGE into the integration candidate: retained-repair owner (work/integration-candidate-20261121, 78c40b57b; reports/integration-merge-record.md)
True merge of f42102c84 into 23344cddc (merge base 812dd3a1b), committed through the hook. 43 files changed on both
sides; 17 conflicted. The integration side's retained-owner files were an older sibling draft (e9de22eb1): every
symbol it added exists in the branch, nothing there had changed for the mutation port or the dead-arm deletion, so
those files equal the branch; replica-operation-repository.js = integration file + the branch's nine lines.
Semantic resolutions: a stale arm in settleRetainedRepairDecision that git merged WITHOUT conflict (rewrote the
clearing trigger on a failed read) removed; the real-group ledger fixture keeps integration's signature with the
branch's ledgerRouteRows (the other row builder mints a new created_at, so the custody birth check could never
match); the S11 recovery test translated field by field to the new named-state record (no assertion dropped).
Preserved: required mutation port everywhere; no raft_role = leader reader or publication; named-handoff fix.
Executed on the merge sha, no red new in the merge: (a) witness and retained/placement set 10 pass / 3 fail (two
red by design on the branch, one identical on 23344cddc; three files red on 23344cddc now pass); (b) the 97-file
cone 73 pass / 24 fail (the branch alone 67 / 30; the merge cures 10 files incl. the five the verifier named; 21 of
24 are integration-line reds); (c) integration controls 14 pass / 1 fail (identical on both parents).
FINDING: three files pass on 23344cddc and fail on the merge with the branch's first failure
(replica-dispatch-reservation-identity case 7, reservation-fail-closed-dispatch-gate case 5,
reservation-file-backed-restart case 25): the dispatch is held at the gate because the retained owner does not
confirm the row and nothing re-drives it.
Rulings: the merger probes the three files (classify: fixture debt / owner withholds wrongly / missing re-drive),
then implements the re-drive on this line (one edge-triggered event at retireRetainedRepair through a required
port into the workflow owner's per-operation fenced retry entry; no polling; negatives counted), then re-stages
cl-029 case 3 and priority-recovery-dispatch-pending-timeout-reentry on virtual time.
Next merges, in order: the retained branch's corrective commits; the outcome-format branch (three-way in
partition-placement-admission.js; LEADER_UNKNOWN in the waiting map); the placement-owner repair (this merge
changed replica-placement-owner.js: the retained-repair collaborator and both leadership edges in setLeader).

## 2026-11-21 — verification of the write kernel tenure fence (reports/verify-write-kernel-tenure-fence.md): APPROVE-WITH-CONDITIONS for a5bf01004
Central question answered NO (verified by reading): a write answered "not proposed" cannot still be forwarded and
committed from the port: the fence answers NOT_LEADER only in state QUEUED; PROPOSED is marked synchronously before
raft.propose and returns to QUEUED only after a typed port deferral where nothing reached the core; a port-held or
forwarded write is always PROPOSED and is answered OUTCOME_UNKNOWN or its commit.
Findings: (1) releasedOnEndedTenure releases by entryId with no state or ownership check: a stale hand-off can
release a write re-registered under the same entryId in the new tenure (safe direction, OUTCOME_UNKNOWN; the lead's
join closure would make it happen every time); (2) contract gap: the fence sits above the port queue and inbound
drain; every readmitted parked write takes the unfenced port-queued path (witness c); (3) null === null passes:
"parked and readmitted while not leading" is not closed; (4) PREPARE: no DECISION over unprepared state, but a kept
sealed session re-proposes T1-sealed bytes under T2 (participant owner); (5) one author claim wrong but harmless;
(6) no livelock; leak accounting confirmed; the join yields only a retryable NOT_LEADER.
Evidence confirmed by sha and file for a, b, e, f, g, d, c. None of the participant-transaction, epoch-fencing,
settled-replay, CDC delivery-progress, proposal-queue property, transfer-leadership suites ran after the repair.
Rulings (to the kernel writer): bind the release to the owning registration (identity, not entryId) with a
witness, together with the join closure; a null tenure never proposes (witness first); record the contract gap and
the PREPARE finding; run the missing suites at head and at 8e84e2801 and the reconstruction suite five times. The
owner's tenure contract is NOT reported closed while witness c (raft owner's forwarding refusal) is red.

## 2026-11-21 — owner-fact read: proof runs and end report of the first writer (work/owner-fact-read-20261121, tip fb1d4c11b; record 17-18)
Executed on adams-gamla. (a) All S0 files at ee58d307f: 8 of 9 green, the one red being the recorded finding.
(b) Mutant table, every mutant executed: m02, m03, m04, m05b, m06, m07, m08, m09, m10, m11 killed by named cases;
m01 survives witnesses 2+3 and is killed on the caller-side case; m05 survives (equivalent: both role checks refuse
a follower with the same answer; removing both is killed). The two role checks are distinct decisions (execute at
all / leadership lost during the read) but both rest on the cached status. commit === applied: no mutant, no
witness. (c) Change cone at fb1d4c11b versus b638284d1: 2171 files, 2057 pass, 114 fail: 76 red at base with the
same first failure, 33 red at base with a different first failure (not attributed further), 1 the recorded
finding, and FOUR REGRESSIONS of this branch: three fakes ("this.readOwnRaftStatus is not a function") and
readiness-owner-authority-contract ("leader-required routing never sends the owner read to the follower": the
published leader names a node with no service, the Q1(B) widening asks every routable replica, the follower stub
answered success): possibly a safety issue, unresolved.
Corrective round: only the contract text and record corrections done; 1(b) stopped on the raft owner (the cached
status is indistinguishable from a fresh one); 1(a), 2, 3, 4, 6, deadline/routing not done (plans in record 18.4).
Recorded: read-point-moved is not time-based and no starvation schedule was found; retries bounded (3 attempts,
50 ms apart, inside the caller's deadline); the currentTermApplied definition with raft.rs lines.
Rulings (successor started on the same worktree): order of importance: probe the readiness-contract regression
first (classify: caller accepted an unqualified answer = defect in this slice; stub refused by the caller = the
test's routing-level assertion restated as the acceptance-level safety property, widening allowed only for
requests carrying the leader-qualified decision; forged leader witness = outside the fault model, stop for a
ruling); "published but unusable" becomes a named unavailable reason; then applied position from the store in the
statement's transaction (read-point-moved deleted), role/term from the raft owner's current observation (merge
work/raft-owner-authority-20261121), required deadline and routing class in the final signature, typed floors,
single-flight key with kind and floor plus echoed request, fake migrations, the census ratchet for the 37
remaining consumers, the foreign-transaction refusal, and commit === applied kept only if a witness can
distinguish it.

## 2026-11-21 — W1b round 3 (work/placement-outcome-format-20261121, tip ec1b2f77c; record section 20)
Executed on adams-gamla (lab/w1b-r3-red-a1 -> lab/w1b-r3-green-a1; mutants lab/w1b-mutant-definite-moved-a43,
lab/w1b-mutant-blocked-invisible-a1). N1: branch (i) taken: release shown idempotent at apply by operation
identity on the real partition (second release under another entry id commits REFUSED HOLD_NOT_HELD, row
byte-identical, definite), so a blocked RELEASE is re-driven under a fresh entry id (durable attempt row replaced
before submission; visible as REDRIVEN_UNDER_FRESH_ENTRY; bounded history); a blocked ADMIT still stops only its
own partition; the witness reads lastPassSnapshot.blockedAttempts for both. F4 residue: an uncertain RELEASE whose
hold is no longer engaged retires as SUPERSEDED_BY_LEDGER (receipt and hold read in one transaction; never counted
as applied; listed once). N4: the DEFINITE set pinned literally (13 codes with reasons); the mutant moving
BACKPRESSURE is killed only by the pin. The blocked-attempt mechanism now has a real mutant kill. Tip run: 12
files, 9 green; the 3 reds identical at base 0993265e5. Hand-offs written: snapshot owner (staging-db format check,
error.code, a declared format revision); merger (eight owner hunks listed for re-application on the placement-owner
repair branch; LEADER_UNKNOWN stays in the waiting map). Open from the verifier: N3 (BYTES without a colliding
record is not listed), N6 minor. Not run: the change cone, the pair's whole-corpus selection, any merged tree.
Lead: short re-check started (reports/verify-w1b-round3.md) on the two new behaviours (re-drive under a fresh
entry; retirement on hold absence, in particular whether "hold not engaged" can be read before the leader applied
its predecessor's entries).

## 2026-11-21 — named-write outcome, stage 3 corrective (work/line-regression-causes-20261121, baa2a2580 / 5392380ae)
Executed on the lab (lab/nw2-red-70dfcdba8-1: 7 of 8 red as intended; lab/nw2-after-baa2a2580-1, 21 files;
lab/nw2-after-5392380ae-1 green). UNKNOWN is a named outcome (CONTROL_PLANE_MUTATION_OUTCOME.UNKNOWN with its
classifier row); returned and thrown unknowns arrive as one answer (outcome unknown, PENDING/RETRY, typed code,
cause carried); APPLIED on a failed answer and UNKNOWN on a successful one fail closed as invalid. Consumers:
gateway telemetry, outcome snapshot/owner contract, system-metadata owner error, admin route (was 503
owner_not_ready for a returned unknown and 500 failed for a thrown one; now 503 with outcome unknown and
ADMIN_OWNER_OUTCOME_UNKNOWN: the split-brain verifier had been reading an unknown write as refused).
Zero-participant success: no real producer returns it for a named write (the engine refuses a plan with no
partition; an UPDATE/DELETE matching no row is answered by its one partition with a receipt and 0 rows); such an
answer is now UNKNOWN; judge table 52 rows. Reproduced and repaired: a constraint violation and a NOT_LEADER
refusal through CDC routed via the engine were judged UNKNOWN (the thrown error dropped the participant set), so a
definite failure was re-sent to the bound; now FAILED / NOT_PROPOSED, sent once. Managed-split message fixed;
census over all of src found 6 undefined members (5 outside scope, one makes a port clash throw a TypeError).
Bootstrap-direct fallback (report): reachable only on the seed in its bootstrap window when the raft lane fails
for any reason; can apply a write twice or diverge between replicas; two real fresh-seed starts never took it.
Rulings: scope extended for the vocabulary reason and the five message members (if no other active branch touches
the files). The bootstrap-direct fallback is DELETED under the owner's standing rule, as its own red-first commit
pair, after counting its log line in both retained GCP runs (non-zero = stop and report), with a witness that a
raft-lane failure in the window executes nothing outside raft and ends in an owned outcome (wait for the leaders
inside the existing bootstrap deadline, or typed failure), and a before/after timing of a normal fresh-seed start;
if deletion breaks or slows a normal start, that is the necessity proof and the writer stops. To be reported to
the owner.

## 2026-11-21 — re-check of W1b round 3 (reports/verify-w1b-round3.md): APPROVE-WITH-CONDITIONS for ec1b2f77c
No interleaving found that duplicates, loses or permanently blocks a placement or a hold release. Both new
behaviours are safe because the apply re-validates every release (engaged -> RELEASED or COPY_PHASE_NOT_IDLE;
lifted, never engaged, absent, terminal -> HOLD_NOT_HELD with no rows) and the owner re-derives the release from
the census on every pass; safety does not rest on "never re-engaged". Trigger pair BYTES + OTHER_RECORD arises only
from a committed record of another digest. Lab claims and both mutant kills confirmed; the three remaining reds
match base 0993265e5. Hand-off list complete (nine textual hunks, eight items).
Conditions: R1 the per-pass reconcileReleaseAttempts call has no witness; R2 at this tip the re-drive has no
owner-side fence (the tenure guard must precede redrivenReleaseAttempt on the repair branch); R3 the
leadership-start retirement runs before any term-start barrier (on the repair branch the per-pass reconciliation
goes behind passTermStartBarrier); follow-ups R4-R7.
Ruling: the writer adds the R1 witness with a mutant kill and records R2, R3, R6 in the merger hand-off and R4, R5,
R7 as follow-ups. ec1b2f77c plus that closing commit is the merge candidate for this line, after the
retained-repair branch.

## 2026-11-21 — fixture migration line complete for its assigned files (work/line-regression-fixtures-b-20261121, cfd056019)
Executed on tv-dator (lab/lrfixc-all-2): 20 of 20 files green, 591 assertions, every file on its first attempt.
Changed expected values, each recorded old -> new with its reason: entity-interaction-contract case 6
message-group half DEFER -> FAIL with the exact group-safety reason asserted (the DEFER came only from a
hand-built context; production logic unchanged since the case was added); placement-create-bootstrap-binding case
14 round 2: the REMOVE at PENDING evaluated by the production prospective evaluator; REPLACE at ACTIVE and STOPPING
restated as the real admission applier's PARTITION_BUSY refusal in both orders, writing no row; voter-floor counts
unchanged at 3. No fixture state that production cannot produce remains in those files. This branch is the fixture
merge candidate (it contains the first writer's branch); the receipt-fake groups are on their own branch.
Owner confirmation still owed: the executed contract "a message-group REMOVE that would drop active replicas below
the minimum FAILS the operation; it is not deferred and retried".

## 2026-11-21 — integration candidate: gate-decision probe (lab/merger-w1/probe-gate-51b48657c; record section 6)
Executed on tv-dator (probe ref probe/merge-w1-gate-decision 51b48657c, tests only, behaviour unchanged). All three
files that pass on 23344cddc and fail on the merge are FIXTURE DEBT: in all six gate calls the retained owner sees
a plain object cache double with no change feed and no ledger route (binding UNAVAILABLE), and the fixture answers
the replica_operations owner read with the row present but readAuthorityWitness null; the owner refuses the
unqualified read (unqualified_shape), owes CLEARING and ROUTE, arms nothing, and the gate withholds. Not an owner
defect (the rule lets only a QUALIFIED read settle a present row; the integration line's older draft accepted
unqualified reads) and not a missing re-drive (nothing transient). The first merger stopped there (context).
Rulings (second merger started on the candidate worktree): A true merge of the fixture branch
work/line-regression-fixtures-b-20261121 (cfd056019, tests only); B migrate the three files' harness to production
behaviour (leader read-authority witness from the production builder; ledger route through the real publishers into
a real SystemTableCache with its change feed; no assertion change); C the re-drive as ruled, red-first, with two
counted negatives; D the two timing tests on virtual time.

## 2026-11-21 — receipt-fake migration (work/line-regression-receipt-fakes-20261121, tip 48a44d167; reports/line-regression-receipt-fakes.md)
Executed on adam-laptop (lab/lrfake-final-3): 26 of 28 files green, 883 assertions; no src change; the judge repair
and its corrective round merged in without conflict. One shared helper (test/test-helpers/committed-write-answer.js)
builds a double's answers with production code at three levels (partition leader commit identity / settled replay;
the real distributed write coordinator over the real executor rendering; a real CDC service method) and is pinned
by a test against the real judge. Groups: G2 6/6, G18 2/2, G13 4/4, G3 4/4, G12 2/2, G1 5/7, durable-voter green
(its real cause: the hand-built partition service had no nodeId). Two files had a second fixture gap hidden behind
the missing receipt. No file slowed by more than about 2 s; nothing hit the 30 s re-send bound.
Changed pins already made: heartbeat-storage-budget-preservation expects confirmWriteEffect in the write options;
the CREATE-TABLE-below-quorum budget 10 ms -> 2000 ms with its assertion unchanged; bootstrap-api's fallback
assertions restated as "exactly one services INSERT reaches the CDC owner, no raw SQL write".
Rulings for the two open pins: register-node-in-cluster #9 (phaseScope 'join' expected at the engine): restated to
the same property at its current owner, the gateway's phase gate; node-storage-budget-service #17 (a bare failure
surfacing as 'write failed'): the definite failure is built through the helper's producer failure mode and the
producer's own text is asserted. Closing writer started for: #13 (producer failure mode in the helper), the two
pins, move-replica-assignment-token (unassigned G12 file), a re-merge of the causes branch, a final 29-file run.

## 2026-11-21 — topology guard migration, stage 2 (work/topology-guard-owner-fact-20261121, tip d6fa64092; record 9-9.11)
Executed on the lab, each witness red on its predecessor first (lab/guard-stage1-red-625381bd6,
lab/guard-stage2-red-582d197bc -> lab/guard-stage2-green-807652bae, lab/guard-stage2-final-6d1237341,
lab/guard-stage2-final2-4da9da27a, lab/guard-stage2-harness-d6fa64092): the reproduction, W1 (asks only the
leader, admits once), W2 (the planner's own turn defers 5 times with owner_fact_read_failed, then exactly one
proposal), W3 (stale published leader), election-log-not-applied (5 deferrals then one proposal minting -r2),
read-point-moved, the retired-source check (the cache hint no longer releases the lease), the bootstrap address
book as a hint, siblings. One owner-fact adapter and one hint adapter; the guard's refusals are now distinct
(replica_inventory_unavailable DEFERRED with the read's reason; replica_inventory_unusable BLOCKED); the two
cache-based escapes and getAuthoritativeEntityServiceRows are deleted; coupled pair registered. Residual witness
(deposed services leader + operation completed elsewhere): NOT demonstrated: the old leader had stepped down and
its receiver refused owner_fact_not_leader; the pending-turn window is not exercised.
LEAD RULING WITHDRAWN: the over-target create-lane hold was told to DEFER on an unavailable read. That contradicts
the SEALED invariant failed-authoritative-read-admission-verdict (architecture/contracts/invariants.json), which
names this hold as a deliberate fail-OPEN hold with a deadlock witness (fail-closing it would strand the surplus
drain it exists to release) and a red-on-revert test. The executed defect was a follower's INCOMPLETE rows used
as data, not the fail-open on a read gap. Corrected ruling: READY owner fact decides; typed UNAVAILABLE fails open
as sealed; the evidence test is restored; invariants.json is not edited; no supersession is made (there is no
stronger proof). The successor also checks every migrated consumer's failed-read verdict against that invariant.
Other closing items (successor started): witness and routing of the allocator's typed deferral in the workflow's
REPLACE target binding (through the existing per-operation retry); delete the message-group bootstrap branch if no
production caller exists; the W2 fixture waits in real time because the address quarantine uses a 30 s host-clock
window (one-clock finding to establish; production consequence for how fast the PostgreSQL service is placed after
one failed delivery); audit:impact-contracts; cone attribution at head; adaptation list for the read's final
signature. Independent verification of this branch follows the read's re-verification.

## 2026-11-21 — raft frame line, first writer's final report (work/raft-frame-delivery-20261121, head d3edaa08c; record 13-18)
All executed on the lab.
STEP 1 (e), raft envelopes as one consensus delivery class (5e5f5ffa8, follow-ups 393ece640; W-HID-1 supersession
in its own commit 8a8b08f79): one CONSENSUS_ENVELOPE frame, no ACK, no SERVICE_RESPONSE, no delivery lifetime, no
queue, no fallback reconnect; DELIVERED once written to the peer or handed to this router's own dispatch; one send
closure and one receiver branch for partition, message-group and WASM groups; receiver-side refusals counted at the
receiver. For N=50: 150 frames / 100 back / 50 orphaned / 50 timers before; 0 back / 0 orphaned / 0 timers after;
slow peer holding a turn 4003 ms -> under 2000 ms; frames per node pair 396/792/1584 -> 132/264/528 (still red as
kept: coalescing waits on the owner). Findings routed: F-2 an adopted inbound connection's reconnectAttempts
becomes NaN (re-dial about every 1 ms for ever); F-3 an inbound queue overflow holds the group instead of dropping
the envelope; F-6 after a persistence deferral mid-drain the remaining inbound is still stepped into the core.
ITEM A (1d4125c7b red, bc949308f fix): currentTermApplied = this replica leads and its last applied entry's term is
its current term; 12/12 green with consumer tests.
ITEM B (90021de24 red, 97ba4431b): port.observeCurrentAuthority() in src/raft/raft-rs-current-authority.js: two
core reads, never a turn, never steps/drains/persists/applies/announces/caches; role and leader NOT_SETTLED while
a turn is pending, a Ready is held, or a leader has not applied an own-term entry; readStatus unchanged; 18/18
green incl. "a deposed leader is observed as a follower at the newer term while readStatus still says leader".
ITEM C (adfbbed6a red, f94291812 fix, d3edaa08c witness updates): a proposal enters the core only under the
leadership it was submitted under (src/raft/raft-rs-proposal-term.js); a non-leader or other-term core answers the
core's own proposal-dropped refusal; no production caller relies on follower forwarding; witness c (copied from the
kernel branch) red -> green; three tests that used forwarding to stage schedules were updated.
Open with the owner: the empty-Ready transaction (i); the slow-peer policy for coalescing (c1); acknowledgement of
the W-HID-1 supersession.
Started: extraction of item C onto work/raft-owner-authority-20261121 (with A and B); independent verification of
the raft-owner items (reports/verify-raft-owner-authority.md) and of the transport change
(reports/verify-consensus-delivery-class.md); a successor on the frame worktree for F-2 (red-first, with a count
from the retained GCP logs), F-3, and step (h) "status announced only on change" with a census of every
announcement consumer first.

## 2026-11-21 — verification of the consensus delivery class (reports/verify-consensus-delivery-class.md): APPROVE-WITH-CONDITIONS through 393ece640
No safety defect. Verified by reading: same-node delivery is queued, never stepped inline; liveness guards read
any parsed frame incl. the new class; half-open sockets are severed by the application keepalive after about 61 s
(unchanged); no non-raft message lost its ACK; lab counts confirmed ((e) 150/100/50/50 -> green; (c1) 396/792/1584
-> 132/264/528; C7 4003 ms -> green).
Findings: (1) RAFT TRAFFIC NO LONGER DIALS: the old fallback dialed for a raft envelope without an open connection;
the class fails at once. Before (e) the dialing end made 118 dials in a 20-minute outage; after (e) it is bounded
at 10 attempts and the adopted end keeps dialing only because of F-2. If F-2 is merely bounded, two live members
whose link was down longer than the schedule never reconnect while only raft flows. The C13 long-outage clause was
WEAKENED inside the repair commit. (2) F-2 is pre-existing and severe (attempts null, 240001 refused dials at a
commit whose src equals base). (3) The W-HID-1 supersession is weaker for the SENDER: a retiring incarnation's
dropped raft envelope used to show FAILED at the sender; now the sender records DELIVERED on the same-node path
and the receiver counts the refusal; the remote path never had it; no src decision reads the observation.
(4) Evidence gap: formation-sim-production-partitions is red before and after (46 !== 138); no corpus, cone,
matrix or real formation run exists for this change. (5) F-3 pre-existing, low severity.
Estimate (not measured): (e) alone is worth roughly 2 to 5 points of seed CPU during formation, about 406-418 s
against the 420 s bound: inside run-to-run noise; (e) alone should not be expected to pass the gate reliably.
Rulings: the frame successor's F-2 repair must bring an OWNED UNENDING reconnect (capped backoff, as long as the
peer is a member, stops on membership loss or shutdown), restore the original C13 clause, and witness the
permanent-disconnect hazard on a probe; 5e5f5ffa8 + 8a8b08f79 + 393ece640 + that repair merge as one unit; the
suites the verifier lists run on the merged tree with consensusDelivery stats per node. For the OWNER to
acknowledge: the W-HID-1 supersession (what is given up: the sender-side FAILED observation for a same-node
envelope dropped by a retiring incarnation) and that raft traffic no longer establishes connections (the
connection owner does).

## 2026-11-21 — W1b closing round (work/placement-outcome-format-20261121, tip dc7f80b7f): MERGE CANDIDATE for this line
Executed on adams-gamla (lab/w1b-r4-green-a1: 4/4 files, blocked-release 5/5; mutant
lab/w1b-mutant-no-per-pass-release-a1 killed only by the new witness #4, confirming R1). New witnesses: #4 an
uncertain release whose hold is lifted under another entry during the same tenure retires on the next pass with no
leadership change; #5 crash between the re-drive's durable row replacement and its proposal: a second owner on the
same store proposes only the fresh entry (green; no mutant of its own; a crash before the upsert is by reading
only). Record: merger facts R2 (tenure guard before redrivenReleaseAttempt), R3 (per-pass call inside
readPassCensus behind passTermStartBarrier), R6 (no cap needed; bound stated); R4 sentence corrected; R5 unchanged
(current versus history told apart by state). Not run: the change cone, the pair's whole-corpus selection, any
merged tree.
Incident (no effect on results): another agent overwrote a shared scratchpad helper; two launches of this writer
then wrote an untracked directory and two console files into the PRIMARY checkout and removed exactly those. Lead
check: the primary checkout still shows the same 92 entries and its tracked content equals the preservation
snapshot (the only difference is the four untracked source files, which the snapshot also holds).

## 2026-11-21 — verification of the raft-owner authority items (reports/verify-raft-owner-authority.md)
A currentTermApplied: APPROVE (applied term is the runtime owner's group.appliedTerm, restored on restart; cannot
be wrongly true in any constructed state; served from the cached observation by readStatus, so stale mid-turn
there; of four readers only message-group removal became more permissive and the native admission still refuses).
B observeCurrentAuthority: APPROVE-WITH-CONDITIONS. Non-driving and uncached verified (exactly status and
has_ready); a busy leader is not starved (NOT_SETTLED only before the first own-term apply). B-1: a leader with
its term applied is reported LEADER mid-turn while the successor's higher-term envelopes sit unstepped in its own
inbound queue; ticks queue behind a pending turn so check-quorum cannot fire; a turn can pend up to 120 s on
persistence admission; the record's advice that a consumer need not use `settled` yields a stale leader-qualified
read. Closure: unsettled when a queued envelope's term exceeds the status term. appliedIndex is the runtime's
mirror, not a store read.
C proposal fence: APPROVE-WITH-CONDITIONS (strictly safer than base). C-1: the term-mismatch arm is reclassified by
droppedByLeadershipTransfer as HOST_FAILURE / leadership-transfer-in-progress / retryable true, so the write
kernel re-proposes the same entry; only the kernel's own release protects the invariant. C-2: conf-change
proposals carry no submitted term. C-3: a proposal submitted while an announced candidate is proposed if that
term is won. C-4: ingress still admits a peer's MsgPropose. C-5: retryable false on the refusal is a contradiction
(kernel ignores it; message groups rely on cached readStatus to call it a routing miss; WASM writers answer
UNKNOWN). Unwitnessed: the term comparison itself, the fence on further batch members, readyHeld, the
ownTermApplied arm, every typed hold, A's snapshot and hard-state restore fallbacks. Evidence gaps: only six files
at head; no test/partition in any C run; no corpus.
Rulings: a corrective writer on the extraction branch (after the extraction reports): B-1 closure plus a clock-lag
signal when ticks are queued behind a pending turn; C-1 a named, un-reclassified answer for a proposal whose
submitting leadership ended, with one consistent classification for every proposer (not proposed, definite,
re-decide), C-2 submitted term on conf changes, C-3 refuse a proposal submitted under no leadership, C-4 ingress
refuses a peer's MsgPropose; witnesses for every unwitnessed mechanism; partition suites run. The owner-fact
successor was told: refuse unless the observation is the settled leader answer; two red witnesses (stepped;
delivered-but-queued, which stays red until B-1 lands); the applied position stays the store read; the contract's
step-down bound corrected again.

## 2026-11-21 — CDC plan stamp closing items (work/cdc-currentness-stamp-20261121, final sha 5c412e839; record section 21)
Executed on the lab (lab/cdcstamp-c3a-red on tv-dator: the six new witnesses red; lab/cdcstamp-c3b, c3c, final:
stage file 73 of 75, the two reds being the ruled selection bounds, still 243 / 685 raft status reads). Third
mutant (routing reads a table outside the declared list) killed by the structural case. Dead probes deleted in the
routing file and the latency transfer (list in record 21.2); the router is now validated to deliver at wiring; K1:
version answers validated as non-negative integers at wiring, a non-integer at read time means the plan is not
held; unwired start and propagate refuse typed, stop does nothing. Two tests outside the CDC area passed an empty
router object into real bootstrap/joining phases and now pass a router double. Declared behaviour change: wiring a
router that cannot deliver is refused at initialize (before: MESSAGE_ROUTER_UNAVAILABLE at use). Router-double
census: 22 files, none refused at wiring; two fail identically at 23344cddc.
Foreground-boundary first case: NOT test waiting but product work paid once per process: the first call of
runtimeBuildProvenance() (measureBoot) verifies the raft-rs binding, fingerprints all of src and every production
dependency file and hashes the SQLite addon and the ~125 MB node executable: 3.1 s wall / 4.4 s CPU cold, 14 ms
warm (probes lab/cdcstamp-first-case-probe, lab/cdcstamp-first-case-phases). The budget is not raised.
Lead: a short read-only check started (reports/verify-cdc-closing-and-boot-provenance.md): (1) the closing
commits, centred on whether any production construction order wires a not-yet-deliverable router (the new refusal
would break startup) and whether any deleted guard protected row data or an optional structure; (2) where the boot
provenance cost falls on a real node's formation timeline (first caller, main loop or threads, once or repeated,
any trace in the retained seed profile): on a 1-CPU node 4.4 CPU-seconds is the same order as the margin by which
formation missed its bound. 5c412e839 is the merge candidate for this line once check (1) approves.

## 2026-11-21 — check of the CDC closing commits and the boot provenance cost (reports/verify-cdc-closing-and-boot-provenance.md)
CDC 5c412e839: APPROVE-WITH-CONDITIONS for merge. Verified: the router refusal cannot fire in production (the
service is constructed and initialized only in latency-topology-setup.js, which already asserted a router; seed
and joiner pass a real MessageRouter whose deliver is on the prototype); every deleted guard protected a wired
collaborator method, row guards kept; lab files confirmed (six witnesses red then green; third mutant killed).
Condition: the navigability ratchet baselines still list the routing file: run the static ratchet at head and
tighten. Non-blocking observations recorded.
Boot provenance: on a real node the first call is at the ENTRYPOINT (acquireLagrangeRuntime awaits
logBootProvenance before the node starts), not lazily; the lazy path exists only in processes that skip the
entrypoint (tests). Hashing is synchronous on the main thread (one 125 MB block), src is walked twice; once per
process. The seed profile's chunk 0 contains it; chunk 1 does not. Estimate: 5 to 12 s per node boot at 1 CPU;
its share of the 420 s formation bound in the retained run is about zero (containers were up 27 to 65 s before the
formation clock started); it would count only for a process restart inside the window. No action for the gate;
recorded as a boot-cost item with options in the report.
Ruling: the second merger received TASK E: true merge of 5c412e839 into the integration candidate, its file set
executed, the ratchet tightened one-way.

## 2026-11-21 — bootstrap-direct fallback DELETED (work/line-regression-causes-20261121, head 097888f1a; report section "Stage 3 follow-up")
Executed. Real-cluster evidence: ZERO occurrences of the fallback's log line in both retained GCP seed logs (run 1
node 751f5575, run 2 node 95ce5141) and in the other four node logs; positive control: both seed logs start at
process start and contain warnings inside the bootstrap window, so a fallback would have been logged. Witness
through the real seed startup child (lab/nw2-red-a203b2c36-1 -> lab/nw2-after-097888f1a-1): when the raft lane
answers the first window write with NOT_LEADER, the fallback re-executed the INSERT outside raft AND that seed
still failed to start (original-allocation-observation-unavailable, 11.3 s): the fallback ran and did not save the
start; after the deletion nothing runs outside raft and the outcome is owned. A normal start never took the
fallback (0 direct writes), so no extra wait was added; the existing wait is waitForRequiredPartitionLeadership().
Normal-start time 26.0 / 27.8 / 27.0 s before, 30.3 s after (ONE sample on an unchanged path). No named write runs
in the bootstrap window (table with file:line in the report). Hand-over edits made: the UNKNOWN reason in the
authoritative-row vocabulary; two message members at their owners. Left: three router message members (the
transport constants file is owned by the raft frame branch; passed to its writer).
Stopped: five unit files red because their fakes model the deleted lane or assert the direct fan-out.
Rulings: a fixture writer migrates the five files (the fake's write lane answers through the raft lane; a direct
fan-out assertion becomes "exactly one write through raft, nothing outside raft"; a file that shows the deletion
broke a reachable state stops the work) and repeats the start-time measurement three times before and after on one
host (consistently slower = stop). Independent re-check started (reports/verify-named-write-stage3.md) with
separate verdicts for the named-outcome commits and for the deletion, including whether any refusal existed that
the fallback did rescue and how the very first seed writes are made before a raft leader exists.

## 2026-11-21 — receipt-fake migration COMPLETE (work/line-regression-receipt-fakes-20261121, 9e534235f)
Executed on adams-gamla (lab/lrfake2-final-2): 29 of 29 files green, 912 assertions; no file slower than 20 s. The
branch carries a true merge of the named-write branch at a203b2c36 (judge repairs, UNKNOWN as a named outcome,
hand-over edits, the fallback's red witnesses; NOT the fallback deletion 097888f1a).
Helper: two producer-built failure modes (not-leader refusal before proposal; committed statement failure), pinned
as FAILED / NOT_PROPOSED, never UNKNOWN, at the engine, through the real CDC and through a named gateway write.
Changed expectations (recorded old -> new): register-node-in-cluster #9 (join scope asserted at the join-admission
gateway: every write carries it, the startup SQL phase is 'join', as many writes as the engine receives);
node-storage-budget-service #17 (text 'write failed' -> the producer's 'Distributed operation failed due to
participant failures'); move-replica-assignment-token (fixture debt: the test's fast Date.now made the named
write's own wait expire; the fast clock is now installed only after the write is accepted; no assertion changed).
Finding and ruling on register-node-in-cluster #13: since 160bf0e6c a named write hands each caller a NEW Error
whose cause is the producer's error, so asserting that error.cause IS the CDC's thrown object cannot hold. LEAD
RULING: confirmed as implemented: the participant failure is the error the registration's gateway write threw, all
seven assertions unchanged, plus one assertion that the producer's error is in the cause chain (chain membership
is the property; the depth is an implementation detail).
Remaining fixture debt noted: subtests 11 and 12 still throw a hand-built participant failure (they pass).
Merge plan: this branch brings the named-write commits and their fixtures together (the named-write branch must
not merge without them); it merges into the candidate after the re-check of the stage-3 named-outcome commits; the
fallback deletion follows separately after its own re-check, fixture migration and timing runs.

## 2026-11-21 — re-check of the named-write stage 3 and the fallback deletion (reports/verify-named-write-stage3.md)
(i) Named-outcome commits through e5cdc7770: REJECTED as they stand. (ii) Fallback deletion 097888f1a:
APPROVE-WITH-CONDITIONS.
Finding 1, NEW DEFECT from baa2a2580 (by reading; no witness): a first attempt can be judged NOT_PROPOSED while its
entry may still commit: the CDC loop re-sends a typed unknown under the same key and throws only the last answer;
"unresolved" is sticky only within one delivery; the thrown error now carries participants and settleInstance
releases on NOT_PROPOSED. Schedule: attempt 1 unknown (leader lost after proposal), attempts 2..n NOT_LEADER,
instance released as definitively unapplied, attempt 1's entry commits later.
Finding 2, undeclared change from baa2a2580: the CDC's terminal SHUT_DOWN answer links a typed unknown through
cause and becomes the returned unknown answer; cdc-shutdown-terminal-owner-write cases (i), (ii-a), (iv) are red at
head for this reason (not deletion debt).
Confirmed: the UNKNOWN classifier and its consumers; conversion by code, never by text; the judge (mixed or
multi-partition answers are UNKNOWN; partial application is never FAILED); the hand-over edits; lab files.
Deletion: 0 fallback lines in both GCP seed logs (verifier's own count); no direct lane is needed for the first
rows; BUT one transient refusal now fails the start (window callers single-shot; no CDC retry in bootstrap mode);
service_definitions, service_endpoints and config are written with no leadership wait; a failed attempt with rows
written cannot continue (re-founding); "failed even with the fallback" was shown only for the first services
INSERT; the author's window times were misstated. Pre-existing: both GCP seeds log config seeded 0, skipped 72 and
that caller cannot tell applied from refused.
Rulings (to the writer on the branch, scope extended to src): A unresolved is sticky for the whole write
instance: the loop's answer is the most uncertain observed; only a commit receipt (or the owner's authoritative
resolution) makes it definite; witnesses for [unknown, NOT_LEADER, NOT_LEADER] and the definite mirror. B a
shut-down owner's answer stays terminal and is never converted into pending/retry; the three red cases go green
unchanged. C the bootstrap window waits for the leader of every partition it writes through the existing owned
wait, inside the existing deadline; witness through the real seed startup; timing repeated. D the config seeding
summary investigated and reported.
Consequence for merging: the receipt-fake branch (9e534235f) contains baa2a2580 and is NOT merged into the
candidate until A and B land and the named-write branch is merged into it again.

## 2026-11-21 — topology guard closing items (work/topology-guard-owner-fact-20261121, 017921e17; record section 10)
Executed on the lab (lab/guard2-final-017921e17 with attribution.txt): 139 files, 112 pass, 27 fail; no red from
this branch (26 identical at base; one identical on the integration line; one earlier hidden red is green again).
Over-target hold: restored to the sealed fail-open; READY decides from the leader's rows; UNAVAILABLE gives no rows
and no cache count and fails open with one log line naming the reason and G1; invariants.json untouched; the
sealed evidence test restored (only the call-shape adaptation kept) plus two rows for the guard's typed DEFER and
typed DENY. Writer's correction to the lead's brief: before this branch a follower's incomplete answer was turned
into [] and the hold failed open on EVERY read from a follower host; the read mode made a gap that never closed.
Per consumer against the sealed sentence: guard, retired-source check and allocator fail closed; the address book
is a hint; REMOVE fence and spread confirmation untouched.
REPLACE target binding: green on first run, no product change (a thrown deferRetry reaches runOperationOwnerAction,
whose catch arms the operation's own retry; exactly one allocation, one binding write, one CREATE after READY).
SQL provisioning never reaches the allocator in production. The message-group bootstrap branch deleted (two
production callers of createOperation, neither reaches it). audit:impact-contracts passes.
One-clock finding (not changed): the temporarily-unroutable-address quarantine reads Date.now()
(query-executor-temporary-unroutable-addresses.js:29, :132) while the executor has the node clock; in production
ONE NO_HANDLER answer from the services-p1 leader keeps owner-fact reads unavailable for 30 s: about six planner
turns spent, the PG-wire service placed up to about 35 s late.
rebalance-coordinator-topology-guard.test.js: red before and after because its double answers the entity read
without rowSetComplete (fixture gap since 11384acd1), so the guard's own unit file asserts nothing today.
Started: independent verification of the consumer migration (reports/verify-topology-guard-migration.md), with the
earliest-formation liveness question (can the guard get a READY owner fact while the first partitions are placed,
now that the cache-based escapes are gone); a writer on work/query-executor-quarantine-20261121 for the one-clock
repair (red-first) and a witnessed proposal for the NO_HANDLER penalty (no duration change without a ruling).

## 2026-11-21 — write kernel tenure fence, follow-up (work/write-kernel-tenure-fence-20261121, head eb281f314; record 14-15)
Executed (lab/kernel-join-red-0572e9e0 -> lab/kernel-final-eb281f31-set; base lab/kernel-base-8e84e280-d).
Ownership: each write records its own registration; a release acts only on the registration it owns and only
before hand-over (the verifier's schedule red -> green). Join gap closed on the ordinary-write path: every caller
joins through getPendingCommittedWriteOutcome, which first runs the same release step. The lead's PLACEMENT join
witness cannot be built: after a renewal the participant cutover pause is raised and placement checks the pause
before its join, so a new-tenure admission never reaches the join (withdrawn; the gap is real for ordinary writes,
which join before the pause). Docs updated. Suites the verifier listed: green at head and at base
(participant-transaction apply/topology, epoch fencing, settled replay, CDC delivery progress, proposal-queue
properties, transfer-leadership, 13 participant-release files); placement-retained-leadership fails cases 1, 2, 4
identically at base.
Open: (1) reconstruction test 5 fails 2 of 10 runs with the fence and 0 of 4 without: not separable from chance;
(2) null tenure not repaired (the witness could not park a write without a tenure; 61 test files fake leadership
with isLeader = true); (3) side finding: a parked write from an ended tenure keeps its whole partition paused until
readmission or its 30 s deadline; (4) the pending-fingerprint cleanup in placement admission and formation
compares by value (other owners). The tenure contract is NOT closed while witness c is red.
Rulings (successor on the same worktree): an interleaved 10-versus-10 A/B batch for the flake on one host plus a
trace of the wait it times out on; the parked-write pause gets a red witness and the repair is the SAME release
step called a third time, from the tenure-change event (hand-over, join, tenure end: one function, no timer),
never touching a write already handed to consensus; report on the fingerprint cleanup and on whether the raft
owner's "a non-leader core refuses" rule closes the null-tenure case at the port.

## 2026-11-21 — verification of the topology guard migration (reports/verify-topology-guard-migration.md): APPROVE-WITH-CONDITIONS for 017921e17
Holds: the repair (reproduction, W1-W3, siblings, election log, read point, retired source, address book: red then
green, confirmed per file and assertion count); the cone (139 files, 112 pass, 27 fail, none from the branch); no
follower, cache or default-[] rows reach the guard, the allocator, the recent-target lease or the hold's count;
every deferral has a wake (the planner's scheduled turn or the workflow's per-operation retry) and none spins; the
hold matches the sealed sentence; partition placement during formation never runs the guard (only the unified
rebalancer sets the flag); deleted pieces have no caller.
Findings: (1) the hold's fail-open is NEUTRALISED in effect: the guard runs right behind the hold and defers the
same cure ADD that the deleted escape used to admit; (2) NO SUPERSESSION EXISTS: commit 494c71ec1 (2026-07-18,
quest spread-cure-union-escape-and-monotone-gate) SEALS "an UNAVAILABLE authoritative services read -> an admitted
spread-restoring operation within one evaluation cycle" through the conservative-union escape; the branch reverses
it and changed the sealed test; the sealed invariant still names replica_inventory_unusable as the guard's verdict
on a failed read; (3) the guard's decision table is mostly unasserted (its unit file never reaches the guard);
(4) pre-existing cache-derived grants remain; (5) the hint adapter is not the production path; (6) the deferral
reason is dropped from the planner's log; (7) stale-complete inventory at floor 0: bounded by the deposed-leader
window; (8) quarantine: host clock, 30 s, NO_HANDLER only, about 35 s worst case.
LEAD: the ruling "delete the guard's two cache-based escapes" was MADE WITHOUT CHECKING FOR A SEAL and reversed a
sealed result; it is suspended, not confirmed. Hypothesis to settle by execution: in July the services read was
unavailable for minutes because of the read-mode defect this branch repairs; with the owner-fact read the same
situation gives a READY fact; with services-p1 truly leaderless the escape cannot help because the admitted cure
cannot complete. A writer produces the evidence (the original sealed test byte-identical at head; the July
situation at base and head; a genuinely leaderless services-p1; the circular schedules incl. services-p1 itself and
the concentrated ledger; the hold composed with the guard) and recommends RESTORE (as sealed or narrowed) or
SUPERSEDE (stronger sentence, witnesses, a draft supersession record). Until the ruling the sealed test is restored
to its 23344cddc content on the branch and the guard's source is not changed further. Also: the guard unit fixture
repaired so the decision table runs; the deferral reason kept in the planner log.
Conditions recorded for the three-node run: every deferral logs its cause on the planner node; any
replica_inventory_unavailable run longer than about 35 s is explained.
Process correction for the lead: before ruling a deletion of any arm, grep the quest logs and the invariant
registry for a seal on it.

## 2026-11-21 — raft-owner authority branch extracted (work/raft-owner-authority-20261121, head 692336b45; reports/raft-owner-authority-extraction.md)
Seven commits on 23344cddc, red-first per item, each through the hook: A 03d235ef5 / 3de457241; B e15e12b14 /
ea85ea499; C a0617f2e0 / 83622061e / 692336b45. Every source and test file byte-identical to its source commit; no
pick conflicted; the six transport commits are left out. Executed on tv-dator: base 21/21 green; head 22/25: all A,
B, C witnesses green; three files red (runtime-captured-inbound-service-native,
runtime-captured-inbound-boundary-native, runtime-turn-integrity CA1 and CA1/M9: eight subtests): each failing
subtest's SETUP has a follower propose and forward, which item C removes; they fail identically at the source head
and pass at ea85ea499 (before C); none of C's own lab runs had included them.
Started: the corrective writer on this branch (reports/raft-owner-authority-corrective.md): restage those three
files without follower forwarding with every assertion kept (runtime-turn-integrity is the sealed pre-drain
differential oracle: its claim text is read first; a case whose premise was "a follower forwards" stops the item);
B-1 (unsettled on a queued higher-term envelope and on a tick backlog; the observation stays non-driving); C-1 a
named, un-reclassified refusal for a proposal whose submitting leadership ended; C-5 one classification for every
proposer (nothing proposed = definite; re-decide; not a host failure); C-2 conf changes carry the submitted term;
C-3 a submission under no leadership is refused; C-4 the ingress refuses a peer's forwarded proposal; a mutant
kill for every unwitnessed mechanism; raft and partition proposal suites at head and base. The owner-fact
successor was told it may merge the branch now and must refuse on any unsettled answer.

## 2026-11-21 — placement stage 3 (work/placement-owner-repair-20261121, head 376592b8b; record 29-32)
Executed on the lab. STAGE 3a (5a1f66105), lab/por-s3a-5a1f6610: construction orders 1-9 and the teardown witness
green (4, 5, 6 red before). No per-partition scheduler is constructed; the capability probe and the
skip-on-any-sink branch are gone; attach preconditions (ledger replica open, cache set, coordinator set) are each
retried by the event that makes them true (initialize, cache setter, coordinator setter/rebind, factory binding);
one coordinator attach path with typed refusals; the fallback constructor removed; ControlPlaneSetup.create always
binds the factory, which takes the node authority at attach time and requires the timer pair; an occupied
leadership sink at attach is a typed refusal. Teardown witness green without repair (quiesceRebalancing nulls the
coordinator synchronously).
Corrective round 2: item 2 red -> green (lab/por-cr2-witnesses-c9ff75c7 -> lab/por-cr2-item2-536d024a): a failure is
classified by what is known of the proposal (not handed over / definite refusal: failed candidate, pass continues;
admitted then local failure: admitted + abort; handed over with no answer: attempt retained + abort). Item 4: the
verifier's schedule witnessed green with no change; item 5: witness green (mutation not run); item 3: not
reproducible (the evaluation type-checks every field).
STAGE 3b (376592b8b): deleted R2's flag check (in rebalance-coordinator-operation-creation.js),
initializeRebalancer, the existing-rebalancer branch, applyRebalancerDependencies; the partition's rebalancer field
is now always null (dead reads in five partition files, out of the writer's scope). 144 files: 22 red before, 70
red after: 42 files turned red, all through R2: unbound TEST coordinators now create operations through placement
admission and fail. Tests not migrated (36 migrate, 6 decide per test, a delete group).
Rulings: R2's deletion stays; a test-migration writer (same worktree) merges the fixture branch for its helpers,
binds test coordinators like production through ONE shared harness whose admission answers come from the
production admission code (or builds operations through the producers when the test is about what follows
creation), decides the 6 per property, deletes only cases that pin the retired mechanism (never one about a
preserved requirement), removes the dead rebalancer reads, attributes the 19 unattributed reds. Item 4: no source
change. Independent verification started (reports/verify-placement-stage3.md), with a SEAL CHECK on everything 3b
deleted and the formation question: how are the very first operations created on a fresh seed now that creation
always goes through placement admission.

## 2026-11-22 — verification of placement stage 3 (reports/verify-placement-stage3.md): APPROVE-WITH-CONDITIONS for 3a, corrective items 1-2, and 3b
Formation question answered (verified): 3b changes nothing on a production node: the flag is false only inside the
coordinator's constructor and is bound in the same synchronous run of ControlPlaneSetup.create; the only
new RebalanceCoordinator in src is that one; R2's false arm has not run on a node since 2026-11-19; the seed's
first operations are the placement owner's own admissions and never pass through createOperation.
Seal check: nothing in invariants.json or the decision tables names a deleted symbol; no sealed PRODUCTION
behaviour is removed. BUT F5: R2's false arm was the last source path on which SEALED WITNESSES ran (e.g.
dt6-priority-recovery-add-dispatch-cadence, the named cure proof of its quest), now red; the open quest
replica-placement-admission-owner requires supersession records before any source change
(supersessions-recorded-first) and has none.
F6: partition-service-leader-activation-methods.js:39-46 is NOT a dead read: with rebalancer always null every
readiness dip demotes and re-promotes the runtime-service owner and the service-installation reconciler; in
production since ab901b40f (inferred); its witness partition-rebalancer-leadership-readiness-hysteresis.test.js is
red by reading and was in no lab selection.
Other findings: F1 re-entry during the attach's synchronous prefix runs the factory again and throws typed into
that event; F2 the typed refusal has no handler; F3 the timer-pair check cannot fail through the production
factory; F4 a binder sweep after quiesce is not excluded by the teardown witness; F8 3b changed 49 files, not 42;
F9 placementResyncAdmissions not incremented in one case; F10 a deterministically throwing submission is head of
line for the tenure; a third new UnifiedRebalancer exists (runtime-service setup).
Rulings (to the writer holding the worktree): F6 first, red-first, as a product defect (the hysteresis moves to
the owner that drives the sink; witness that a dip shorter than the window causes zero demotions); the red files
are classified SEALED versus ordinary: sealed witnesses are NOT migrated, restated or deleted: for each a
proof-transfer plan onto the placement-owner path is written for the lead's ruling and the supersession records;
ordinary files are migrated; F1, F4, F9 witnessed and fixed, F2 and F10 witnessed and reported; the remaining
reads re-examined before deletion. The branch carries 49 red files from 3b until then: not merged.

## 2026-11-22 — write kernel tenure fence, closing (work/write-kernel-tenure-fence-20261121, head 0a88745f6; src identical to eb281f314; record section 16)
Executed on adam-laptop. Flake: interleaved A/B, no runner failures: head 1 failure in 10
(lab/kernelab-head-06), base 8e84e2801 2 in 10 (lab/kernelab-base-04, -05), every failure the same 10 s wait at
:696: PRE-EXISTING, not caused by the fence. Mechanism (inferred, timings fit): only node-1 can resume in the
fixture (the control partition lives only on node-1's handler); the old leader must win the election after the
heal; election timeouts are offset per replica and randomized; with check-quorum the others ignore its pre-votes
until their lease expires; if r2's timeout fires first, r2 leads, can never resume, and the wait expires. Goes to
the fixture/test owner with its trace.
Parked-write pause: the lead's premise does NOT hold (lab/kernel2-pause-0a88745f, 9/9 green witnesses on the real
kernel and release contract): the pause lasts exactly the reservation's remaining life (5000 ms with and without
the parked write; 0 ms beyond it); the 30 s deadline is never the limit; a deferred write adds at most 100 ms.
LEAD RULING WITHDRAWN: "release at tenure end through the same release step": no failing test demonstrates a
defect, so no change (it would only answer a parked write's caller earlier); the exact change is recorded in
section 16.2 should a witness ever need it.
Fingerprint cleanup by value in placement admission and formation: not reachable today (both check the cutover
pause before the join); owners' fix recorded (clean up by registration identity). Null tenure: closed at the port
by the raft owner's rule (a non-leading or other-term core refuses instead of forwarding); narrow inferred
remainder: a write handed over in the very turn in which the core wins, at the term its candidate announcement
already carried (the raft corrective writer has C-3 for exactly this).
STATE: this branch is a merge candidate for the kernel fence (approved with conditions; conditions answered);
the owner's tenure contract is closed only when the raft-owner branch with the proposal fence is merged with it
(witness c green on the merged tree).

## 2026-11-22 — integration candidate at 487d12c91 (second merger; reports/integration-merge-record.md sections 7-12; lab/merger-2/)
A fixture-migration merge 7a9f52e64: no textual conflict; 48 files, 44 pass; all 20 fixture files green with
their original counts; the 4 reds identical to 78c40b57b.
B dispatch-gate harness ee42a0618: the replica_operations owner read carries a witness from the production
builder; the coordinator uses a real SystemTableCache and the ledger route is published through the real
publishers (incl. PARTITIONS leader_node_id); the three files that passed on 23344cddc and failed on the merge are
green with unchanged assertion counts.
C re-drive: red dadbc11f0 (mirror case 8 and two negatives) -> green cd177cba8 (mirror 12/12; dispatches 1 / 0 / 0).
Port reportRetainedRepairVerdict({operationId, createdAt, verdict}) as the fourth required port; emission only in
retireRetainedRepair when the record refused its last caller and none is waiting; the gate records the withheld
attempt (createdAt, ownership fence epoch, budget deadline) in a map owned by the workflow owner, cleared on
terminal state and shutdown; confirmed re-enters dispatchOperation once; unconfirmed ends the wait with
OPERATION_NOT_DISPATCHABLE; no timer, no polling. DEVIATION from the ruling: not the 953d705f8 retry entry (every
arm of it sets a timer). RESIDUAL stated by the author: if the decision that answers a caller also retires the
record, the gate's wait gets no verdict and stays until terminal state or shutdown.
E CDC plan stamp merge 8d897772b: no conflict; 57 files, 53 pass; the stamp witness fails only its two ruled
selection-bound cases. Ratchet tightening 487d12c91: to min(committed, current) per key, no entry added
(owner_port 2008 -> 1969, identity_keyed 82 -> 81, row_field 682 -> 680, two_source 1686 -> 1658, typeof 594 ->
586, legacy 2835 -> 2760, catch_returns_default 374 -> 367). FINDING: the full-repo navigability audit shows 12
sites above their baseline allowance in 10 files unchanged since 23344cddc (the hook checks only staged files):
pre-existing ratchet debt needing an owner (fix the sites; never raise the baseline).
Head: 132 files, 114 pass, 18 fail, each with the same first failing line as before; the 97-file cone went from 24
to 16 reds.
Not done: D (two timing tests on virtual time).
Started: independent verification of the re-drive (reports/verify-withheld-dispatch-redrive.md), centred on lost
wakes (incl. the stated residual), double dispatch, the fence, and whether the new map is a second mechanism; a
third merger: D; F merge of the outcome-format branch dc7f80b7f; G merge of the placement-owner repair at
8e84e2801 with the outcome-format and retained-repair hunks re-applied by hand in replica-placement-owner.js; H
merge of the write-kernel fence 0a88745f6 (witness c stays red until the raft-owner branch merges).

## 2026-11-22 — verification of the withheld-dispatch re-drive (reports/verify-withheld-dispatch-redrive.md): APPROVE-WITH-CONDITIONS for cd177cba8
Safe to keep, not yet a reliable cure. Findings (by reading at cd177cba8 plus lab files): (1) LOST WAKE ON A HELD
LANE: the re-drive deletes the wait and calls plain dispatchOperation, which returns the lane holder's promise and
never runs the new factory; when the verdict arrives while the withheld turn still holds the lane (it does a
leader-required read there) the re-drive is lost; the codebase names this class BR2a; the witness cannot see it.
(2) the wait is registered after the answer (a verdict in the microtask gap is never served; low). (3) the stated
residual is benign (same-step retirements; the lost verdict would be UNCONFIRMED; a leaked entry until terminal or
shutdown; no timer enforces the recorded deadline). (4) a stale wait is not cleared when the gate later passes
(one spurious dispatch wake possible). (5) UNCONFIRMED only logs and ends the wait: the outcome object is discarded
and the operation is neither failed nor retried; row_changed leaves a possibly dispatchable row withheld. (6) the
createdAt fence protects against an old incarnation; an ownership move is fenced by isOperationLocallyOwned in the
dispatch entry; "exactly once" is the fixture plus the dispatch machine's claim. (7) the deviation is correct
(every arm of the 953d705f8 entry sets a timer and its runner never dispatches; the new map is a different
concern). (8) port: one construction site, validated, no probe. Surviving mutants: createdAt, epoch and deadline
comparisons, clear-on-shutdown, both emission conditions, the missing-port throw. No run of the three gate files at
head 487d12c91.
Rulings (task I for the candidate's writer, after its merges): the re-drive uses the existing re-arm mechanism for
a wake that arrives while the lane is held (held-lane witness first); the wait is registered before asking and
cleared when the gate passes; a verdict is handled by the same code path the gate uses at ask time: row_changed
re-evaluates once; a definite refusal ends the wait with the typed non-dispatchable outcome handed to the
workflow's existing handling (no limbo); witnesses for the surviving mutants; the mirror and gate files run at the
actual head. These are conditions for the three-node run.

## 2026-11-22 — query executor quarantine (work/query-executor-quarantine-20261121; reports/query-executor-quarantine-record.md)
Executed on tv-dator. MAIN RESULT: ZERO NO_HANDLER answers on all six node logs of the two retained GCP formations
(the executor's warn channel was working there): the 30 s penalty did NOT contribute to the missed 420 s bound or
to the PostgreSQL failure in those runs.
Contract established: the only cause is NO_HANDLER (node alive, no handler for that replica's address);
connection failures and timeouts never mark; 30 s for system tables, 5 s for user tables (the 5 s is a log-throttle
constant reused); released early by a successful delivery or a change in that replica's SERVICES row where the
caller passes the row; keyed by partition plus address (one replica's refusal does not block other partitions);
leader-required reads fail typed with no hop ("Partition service not found" although the row exists); NO SAFETY
FINDING: a leader-required read never goes to another replica. History: 28f413983 (2026-03-30) with NO_HANDLER as
the only cause; 8f284ad8a (2026-04-13) added the 30 s control-plane window and the fingerprint release (reason:
rows lingering after a replica is removed; no quest names it). On a fresh formation "handler not started yet"
should not occur (a row becomes ACTIVE only after its handler is registered).
One-clock repair: red d5698f225 -> green 504e2c989 (the executor resolves one clock for its HLC and the
quarantine); head 12/12 files, base 11/11. Penalty witness b76d50c68 (handler serves 200 ms after the refusal,
planner reads every 5 s: 5 wasted turns, first success at 30,000 ms): red, proposal not implemented.
Rulings: the clock repair 504e2c989 is a merge candidate after a short verification (started:
reports/verify-query-executor-one-clock.md). NO change to durations or causes: no real occurrence was found, so
there is no demonstrated defect; the penalty witness and the backoff proposal stay on the branch as a recorded
option and are NOT merged; marks per formation are to be counted on the three-node acceptance run (zero expected).
Recorded for later: the misleading error text on a refused leader-required read; other host-clock reads in the
executor, the SQL engine and one transport call. The guard fixture W2 models an unreachable node as NO_HANDLER,
which production does not do: its writer was told to model unreachability as a transport failure.

## 2026-11-22 — verification of the query executor one-clock repair (reports/verify-query-executor-one-clock.md): APPROVE-WITH-CONDITIONS for 504e2c989
Verified: the quarantine's only two time reads go through the resolved clock; one clock object for the HLC and
the quarantine; the executor's host-clock default is not reached in production (its one construction always passes
engine.nowFn; all three production engines are on wall time in a real node); marks are per instance, in memory,
never persisted or shared, and are not compared with any host-clock value; production behaviour unchanged; lab red
at d5698f225 and green at head (12/12, 406; base 11/11, 396). Conditions: generated seals regenerated at the merge
result; the candidate's gate runs the impact cone incl. multi-node harnesses that supply a node clock.
Ruling: the candidate's merger received TASK J (merge exactly 504e2c989; the red penalty witness stays out).

## 2026-11-22 — owner-fact read corrective round (work/owner-fact-read-20261121, head d358ab712; record section 19)
Executed (lab/s0c-red-4a22aa6b4 -> lab/s0c-green-3d017a2b5 -> lab/s0c-final-d358ab712: 14 of 16 files green; the
two reds are the B-1 acceptance witness, red until the raft owner's correction, and the 8(ii) file).
Done: 1(a) the applied position is read from the store in the statement's transaction (read-point-moved deleted);
1(b) the receiver decides on observeCurrentAuthority() before and after the read: role LEADER only (NOT_SETTLED,
anything else or a missing role refuses) and currentTermApplied true (replaces !confChangePending); merge of the
raft-owner branch 692336b45 without conflicts; 2 single-flight key with kind and floor, echoed request verified
for owner facts; 3 floors typed {partitionId, index, term}; 4 synchronous foreign-transaction refusal (unreachable
today); 5 final signature with required deadline and routing dimension; 6 the red finding converted to a green
property plus a census ratchet (37); 8(i) three fakes migrated. Mutants killed: 1(a), key, floor, echo, role on
the cached status at both checks; one survives (only the pre-read check on the cached status). Cone at 3d017a2b5:
2175 files, 113 red, all attributed (103 identical at base, 6 different first failure at base, the expected ones,
one intermittent pre-existing).
8(ii) probe (lab/s0c-probe-8ii-capture): class C: under widening the stub answered success with a role-leader,
term-1 witness naming itself and the caller accepted it through isValidLeaderReadAuthorityWitness.
LEAD RULING on 8(ii): the test is not changed. An honest deposed leader answers like that stub, and widening newly
exposes the caller to it. Rule from raft (at most one leader per term): an answer from replica R at witness term t
is acceptable only if consistent with the published leadership (P at T): (R is P and t >= T) or (t > T); anything
else is refused, typed. If the PARTITIONS leadership publication carries a term or ordering epoch, implement it in
the one acceptance predicate (owner facts and plain leader-required reads), red-first with the existing two
assertions plus deposed-at-T-1 refused, newer-at-T+1 accepted, P-at-T accepted; if it carries none, widening
accepts nothing from a non-published replica and the read is typed unavailable ("published leader unusable")
until publication changes. Also: item 7 witness or removal; a witness that makes the pre-read check load-bearing;
the census ratchet wired into the static target; the cone at the final head. Re-verification follows.

## 2026-11-22 — named-write branch: A and B repaired, fixtures, timing (work/line-regression-causes-20261121, head 5dd32deb3)
Executed on adam-laptop. A (sticky unresolved): red lab/nw3-red-b3c84c85a (after an unknown attempt the caller
got NOT_PROPOSED and "definitively unapplied") -> green from 90e88cb16 (new src/cdc/cdc-routed-write-uncertainty.js):
the caller gets the named UNKNOWN, the instance stays held, a re-send after the entry commits settles APPLIED with
one row; the refusals-only mirror stays definite. The real CDC loop's schedule is [unknown, NOT_LEADER] (it stops
at the first NOT_LEADER). B (terminal shutdown answer): at 5dd32deb3 a shut-down answer stays thrown and terminal
with the outcome "unknown" carried beside it; shutdown cases (i) and (iv) pass unchanged; (ii-a) still fails
because the file's fake answers success without a commit receipt (fixture debt).
Fixtures: four files migrated and green (lab/nw3-after-48a1254a3-fixtures); expectations restated to "raft lane
exactly once, nothing executed outside raft"; cdc-shutdown-terminal-owner-write confirmed NOT deletion debt (it
already fails at the parent; bisect: (ii-a) from ab3e4b9af, (i)/(iv) from baa2a2580).
Timing, interleaved: before the deletion 26.7 / 28.8 / 28.1 s; after 27.0 / 28.1 / 26.4 s: no slowdown (the
earlier 30.3 s was noise).
Seal check on the fallback: none. Introduced by ccbbf586b (a checkpoint of quest
lone-seed-formation-admission-livelock-closure), which put the raft lane in front of the old always-direct loop and
kept the loop "for the leaderless window": an asserted reason, never executed; the quest's sealed doneWhen and
constraints cover other suites; nothing in invariants.json or the decision tables.
D (config seeding "seeded 0, skipped 72"): the 72 rows ARE written; the CDC copies a missing affectedRows from the
partition's answer, which carries `changes`; the classifier treats the count as invalid and the write as not
applied. Two names for one fact.
Final run lab/nw3-final-5dd32deb3: 31 files, 26 green; the 5 reds each have their known first failure.
Not started: C (the window writes service_definitions, service_endpoints, config, control_plane_publications
without a leadership wait).
Rulings (successor on the same worktree): C as ruled (wait for the leader of every partition the window writes,
through the existing owned wait, witness through the real seed startup, timing repeated); D: a census of every
count field by producer and consumer, witnesses for each wrong decision, ONE canonical count field with a single
conversion point (no either-name reads), and whether "PG-wire row counts always 0" is the same defect; E: the
shutdown fake answers with a real receipt; F: final run. Re-verification of this branch follows that report.
