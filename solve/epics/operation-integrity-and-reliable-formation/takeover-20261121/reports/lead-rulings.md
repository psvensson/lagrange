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
