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
