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
