# S0 stage 2 — lead rulings (2026-11-21) on the stage-1 questions

Stage 1 is complete: branch `work/owner-fact-read-20261121`, head 8d4fd93d7 (pushed, worktree clean, no `src`
change). Transition record: `/mnt/data/peter/projects/lagrange-takeover-20261121/reports/s0-transition-record.md`
(section 14 = file-by-file stage-2 edit set and "what turns each witness green"; section 10 = cold-formation
callers; section 11 = adoption diff for the retained-repair owner; section 12 = owed mutation runs). Lab outputs:
`/mnt/data/peter/projects/lagrange-takeover-20261121/lab/s0-w1w2-red-ccac40a77`, `s0-witnesses-red-8d4fd93d7`,
`s0-base-routing-b638284d1`.

Executed findings from stage 1 that define the work:
- Witness 1: a node that hosts the leader replica gets "unavailable" when the projection names no canonical leader
  ("Partition service not found") or when the seed has no query engine yet ("authoritative_row_source_unavailable").
- Witness 2: after a real leadership transfer with a stale publication, the only replica asked is the deposed one;
  it answers success:true WITH ROWS and a witness of role follower, no failureCode; the caller then rejects
  ("authoritative_owner_leader_witness_required"); the real leader is never asked.

Writable set, extended (approved): the stage-1 set plus `src/partition/partition-service-remote-query-methods.js`
(receiver refusal), `src/query/query-executor-partition-request-builders.js` (the request carries the leader
requirement and floors), `src/control-plane/control-plane-system-table-gateway-options.js` (the option allow-list),
`src/cdc/**/cdc-integration-service-owner-rpc-read-execution.js` (caller check becomes the shared predicate, typed
reason surfaced), `architecture/contracts/authority-and-recovery.md` (the honest-guarantee paragraph), and one
owner-defined accessor for "replicas this node hosts" if Q3 needs it. Anything else: stop and report.

Q1 discovery rule: (B) redirect-first. Candidates stay the published leader's replicas when a leader is published
and usable; a replica that is not the leader answers a typed refusal carrying its known leader, and the delivery
owner's existing redirect follows it (`query-executor-recovery-read-delivery.js:131-149`); widen to other hosted
replicas only when no leader is published or usable. The pinned behaviour at
`test/query/query-executor-recovery-read-lifetime.test.js:436-457` (a former leader's held answer is dropped once
the publication moves) must keep passing unchanged. If, in the fixture, the deposed core's leader hint does not
resolve to a committed address so witness 2 cannot go green under B, STOP on witness 2 and report what resolves
and what does not; do not switch to flat widening on your own.

Q2 scope of the receiver refusal: two parts.
 (a) "I am not the leader" is refused at the RECEIVER, typed, with the redirect, for EVERY leader-REQUIRED read
     (all existing sites): today the receiver sends follower rows over the wire and the caller rejects afterwards;
     the outcome for those consumers stays "unavailable/redirected", only now it is decided once, at the receiver,
     by the shared predicate. The caller-side check uses the same predicate (one version) and remains as the
     verification of what was received.
 (b) `commitIndex === appliedIndex` and the caller's index/term floors apply ONLY to `readOwnerFact` requests in
     this slice. The gap for the other leader-REQUIRED consumers (a fresh leader that has not applied its log
     answers an empty set that a consumer reads as absence; `enforceRequiredLeaderReadAuthority` checks neither)
     is a recorded SAFETY FINDING: write its red witness in this slice (real group, fresh leader with unapplied
     committed entries, a leader-REQUIRED read returns empty), leave it red and clearly named, and do not repair
     the other consumers here; they are repaired when they migrate to `readOwnerFact` in the following slices.
 Witness construction (applies to readOwnerFact at the receiver): the role and the indices must come from ONE
 source, the raft core's current state, not the service's event-derived role field. Capture (term, appliedIndex)
 BEFORE executing the query and re-check "still leader in the same term" AFTER it; the witness reports the
 pre-read applied index, so returned rows are at least as new as the witness. A check that builds the witness after
 an awaited read (as `cdc-integration-service-authoritative-read-flow.js:316-334` does today) can be passed by rows
 older than the floor: do not copy that shape. Add a witness for it (a leadership change during the awaited read).

Q3 in-process arm source: the in-process arm must find EVERY replica this node hosts, including those the
ReplicaHandler creates after bootstrap/join (a joiner that receives the ledger replica by ADD and later leads it
is the common case). Read the one owner of hosted replicas (the replica handler's registry) through an
owner-defined accessor; do not add a copy-back into the CDC provider map and do not create a third registry. If
the CDC provider map is a second registry with other consumers, list those consumers in your report as a
duplicate-authority finding; rewiring them is not in this slice. Witness: a replica created by the handler after
join, then elected leader, is found by the in-process arm.

Q4: yes, the witness carries the serving replica's identity so a caller can pin it, using the identity existing
owners already attest for a running replica: the pair (node boot incarnation, replica created_at) (see
`src/node/replica-handler-learner-retirement-authority.js:95-111`, `src/node/service-row-incarnation.js`,
`src/bootstrap/boot-incarnation-owner.js`). If `lifecycleIncarnation` from `readStatus()` is one of those, forward
it under its owner's name; do not coin a new identity. The retained-repair owner will use term + this pair as its
custody tenure.

Q5: hint source = projection only. The hint result type must not be passable where an owner fact is required.

Q6: witnesses 3 and 4 are accepted as acceptance witnesses for the new function (a missing-module red is not
product evidence); the stage-2 mutation runs in record section 12 are REQUIRED before they count: for each, a
mutant of the implemented function that the witness kills.

Also approved: repair the existing first test in `test/cdc/cdc-owner-required-authoritative-routing.test.js`
(red at base b638284d1: its transit stub hands the caller router's delivery lifetime to the owner router and it
asserts a `budget.timeoutMs` field that no longer exists) with the two-line transit change your fixture uses,
correcting the stale assertion to the field the lifetime owner now defines; state in the report that this red
pre-existed on the integration base.

Out of scope, recorded for other owners (do not touch): the bootstrap topology owner deriving the canonical leader
from any-role local replicas (`bootstrap-topology-snapshot-owner-authoritative-rows.js:119-200, 446-490`).

Deliver: pushed shas; witnesses 1-4 green on the lab with output dirs; the new red safety witness (named, left
red); the mutation table; the pinned lifetime test still green; the change cone versus b638284d1 on the lab; the
contract paragraph; the adoption diff for the retained-repair owner updated to the final function signature; the
duplicate-registry finding. Executed versus read-only labelled. No land, publish or evidence recording.
