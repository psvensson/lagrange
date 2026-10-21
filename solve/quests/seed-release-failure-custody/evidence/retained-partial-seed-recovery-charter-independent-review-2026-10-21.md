---
audience: development
documentClass: current
---

# Independent retained partial-seed charter review

Reviewer: subagent:/root/physical_custody_review, 2026-10-21. Reviewed charter
SHA256 `df6ce8656bc154b871acb4ef6a44002bdeae82a894cc08eb4f6de44d2e7f9863`.
This is a read-only contract review. Only this separate review was written;
no source, test, seal, receipt, staged path or historical record was changed,
and no tests or native runs were performed.

**Verdict: approve the next-frontier selection and its narrow source finding;
REVISE before treating it as an implementation-ready sealed contract.** The
charter itself correctly declares its unresolved prerequisites. The existing
creation refusal must remain until a real original-allocation handoff exists.
The operator's existing delegation permits the owner decisions below without
another user question. It does not permit silently reinterpreting old seals.

## Verified current frontier and evidence ceiling

The lower-seam custody witness positively retains the actual origin, reads
SERVICES admission as readable/nonempty with no rows, and observes a creation
refusal before replacement handler acquisition
(`test/bootstrap/seed-release-failure-custody.test.js:163-192`). Its restart
helper really calls the storage and membership readers, but constructs
BootstrapService directly, increments the boot incarnation itself and supplies
a new NodeService (`test/test-helpers/seed-release-failure-custody-fixture.js:222-245`).
It is neither a public-process restart nor evidence that public restart
necessarily reaches the identical first refusal.

The public path acquires exclusive directory custody
(`src/lagrange-runtime-startup.js:713-719`), resolves the public join decision
(`src/entrypoint-runtime-join-decision.js:386-408`), reserves the boot incarnation,
reads the cluster fence and storage admission (`lagrange-runtime-startup.js:389-434`),
and initializes BootstrapAPI/topology before calling bootstrap (`:437-465`).
These are material owners, not cosmetic harness setup.

Empty readable NODES rows do not set the membership reader's durable-node flag
(`src/bootstrap/rejoin-hints-durable-evidence.js:372-376`). The auto-rejoin
context and FRESH_SEED outcome therefore do not establish virgin physical
storage (`src/bootstrap/rejoin-hints.js:398-401,632-644`). The independent
SERVICES artifact reader treats non-SERVICES partition DB/sidecar presence as
unowned artifacts (`rejoin-hints-durable-evidence.js:162-179`); the partition
creation guard permits empty admission or a compatible existing row, and
otherwise refuses before construction (`src/bootstrap/phases/seed-partitions-phase.js:66-102,215-220`).
The charter correctly avoids turning the membership branch into permission.

Release precedes row registration in the actual startup plan
(`src/bootstrap/pipeline/seed-startup-plan.js:34-45`). The complete original
founder catalog is currently volatile Maps
(`src/bootstrap/phases/seed-infrastructure-phase.js:295-304`). Lifecycle/native
history, participant origin and workflow progress each prove narrower facts;
none of the inspected current records supplies the missing original seed
allocation grant.

## Concrete correction to the public witness

The proposed public witness must not promise an unchanged 3,000 ms production
budget. That number is the lower-seam fixture override
(`test/test-helpers/seed-release-failure-custody-fixture.js:42-49`). Public
startSeedNode passes no BootstrapService config override
(`src/lagrange-runtime-startup.js:422-434`); the constructor merges defaults
(`src/bootstrap/bootstrap-service.js:202`), whose leadershipWaitTimeoutMs is
30,000 (`src/bootstrap/bootstrap-constants.js:394-397`).

Use the actual request's original issued absolute deadline in the public
witness. Keep the real public default unchanged on old and repaired candidates;
move only the selected actual handler clock at the reviewed commit boundary.
Do not transplant the fixture's budget or silently inject a constructor
configuration. This correction needs no policy waiver or user attention.

## Decisions required before implementation sealing

### 1. Name the original issuer and the cohort completeness rule

Use the existing seed creation/catalog interaction as the original issuer,
with the existing physical lifecycle owner persisting its fact. Define the
exact source of fresh membership and storage admission, process ownership,
original node identity, cohort identity, replica identities and physical
incarnations. The phase-derived founder lists at
`seed-message-groups-phase.js:72-110` and `seed-partitions-phase.js:115-168`
currently populate volatile catalogs; recomputing today's constants after a
restart is not proof of the original admitted cohort.

Choose an immutable complete-cohort declaration and exact per-replica binding
within existing lifecycle storage. State its durable issuance ordering before
native participation and how partial writes across separate replica DBs are
classified. A per-row flag alone cannot establish that every member belongs
to the same complete original allocation. No global atomicity across those
DBs exists merely because each local write is synced. The first unit may
refuse incomplete cohorts, but must positively detect a missing declared
member and preserve the outstanding obligation. Recovery from partial loss
need not be implemented in this unit.

Do not backfill the fact into an established historical store merely because
it has native history, a GENESIS descriptor or an empty SERVICES projection.
Absent grant, unknown legacy state and read failure remain distinct refusals.
The issue point, schema/version treatment, immutable anchors and replay rules
are owner design decisions to make now, not implementation details to invent
while writing the witness.

### 2. Reuse the read-only lifecycle reader; do not classify by constructing

The exact local lifecycle row is a plausible existing storage surface, not a
new metadata database. There is already a read-only owner operation:
`readDurableReplicaLifecycle` (`src/raft/raft-rs-replica-lifecycle-owner.js:545-585`).
It reads without opening a runtime or creating a row and distinguishes ABSENT
from UNREADABLE. Extend this owner's result if it must expose the new fact;
keep one interpretation of it at the seed storage/create boundary.

Do not invoke the lifecycle constructor merely to inspect authority. It may
create/migrate the table, insert an active NEVER_OPENED row and stamp an older
row (`raft-rs-replica-lifecycle-owner.js:109-166`). Such effects before admission
would corrupt the proposed proof. A reader must not turn missing fields into
new permission. Preserve the independent prior-existence and native-history
fences: current seed constructors derive identityExisted only from SERVICES
(`seed-startup-storage-admission.js:33-40`; `seed-partitions-phase.js:265-270`;
`seed-message-groups-phase.js:162-166`). The design must explain the exact
retained-allocation contribution to that existing fact without weakening it.

### 3. Settle public recovery mode and the literal serving seal

The seed-restart-v2 seal at
`23ca84017cfd906269bb81cbf217e791a2785ec5` requires cluster-ID match and quorum
or current-peer proof before a durable seed serves. The current proof owner
requires MATCH plus live-peer/durable evidence
(`src/bootstrap/seed-recovery-proof.js:36-48`). A new local allocation fact is
neither cluster identity nor peer proof.

Define the public startup outcome separately from serving permission. An
unfinished-allocation recovery mode can be a bounded operating mode of the
existing startup owner, but its allowed effects, external/bootstrap admission
state and transition to serving must be explicit. In particular, BootstrapAPI
is initialized before bootstrap; do not assume returning no runtime handle
means no outward endpoint can act. Inventory and witness its actual admission
while recovery is incomplete.

The phrase 'v2 applies whenever established-cluster evidence applies' must not
become an implicit exception to the seal's durable-seed statement. Establish
literal non-conflict with that seal, or record an explicit narrowly bounded
owner supersession before implementation. Do not silently classify retained
native founders as virgin because NODES rows are empty. Old mismatch and
isolated-stale-seed negatives must remain unchanged.

CONFIG cluster_id is currently minted only after registration
(`seed-registration-phase.js:121-128,646-678`). Decide whether a distinct
pre-cluster original-allocation identity suffices for nonserving continuation,
or whether the existing cluster-identity owner must own an earlier stable mint
and identical later publication. Either decision must have a lost-response
rule. A second minted ID or treating missing identity as MATCH is forbidden.
This is a delegated owner judgment, not an unavoidable request to the user.

### 4. Bind SERVICES handoff to exact original creation, then discharge it

The charter correctly calls out STOPPED: seed registration inserts that state
before activation (`seed-registration-phase.js:247-281,296-317`), while ordinary
seed restoration excludes it (`seed-partitions-phase.js:66-71`). Do not fix this
by globally admitting STOPPED.

There is an additional concrete identity gap. PartitionServiceRowOwner mints
created_at and writes create_attempt_token:null (`partition-service-row-owner.js:204-221`).
Its conflict-resolution correspondence checks logical IDs/address/status but
only requires the observed created_at to be a safe integer (`:127-138`). That
alone does not attest this original allocation's creation generation after a
lost INSERT response. The process-local registration evidence WeakSet (`:61-71`)
also cannot be a cold-restart witness.

Choose the existing row owner's exact durable correlation, for example a
reviewed use of its existing attempt/generation representation, rather than
another placement table. Define the relation between physical incarnation,
original allocation, canonical SERVICES row identity and current lifecycle
state. Resolve a lost INSERT answer through that owner and preserve its
INSERT-only/conflict/cleanup protections.

Specify the intermediate state when the replicated row committed but local
handoff discharge did not. The local fact cannot continue authorizing CREATE
merely until an acknowledgement arrives; a row may become retired or foreign
in that interval. Conversely, discarding the fact before any durable transfer
cannot abandon the original obligation. Give the exact allowed effects and
re-read/continuation owner for this uncertain state. Prove that later row
absence, cleanup or placement change cannot revive discharged permission.

### 5. Reauthorize remaining pre-origin work through the existing owner

Some original cohorts lack origin at the selected cut. Existing-origin
recovery cannot supply their original release authorization. The current
fresh-seed authorization validates specifically FRESH_SEED with
`durableStateDetected === false` (`participant-release-authorization-owner.js:16-38`),
and control derivation accepts only its current named kinds (`:54-59`).

Extend that owner with a precise continuation contract that consumes the
validated original-allocation obligation. Do not forge the existing fresh
membership shape, borrow an operator token or treat a wake as authorization.
Explicitly decide original versus current build/census requirements and the
exact nested-control derivation; a changed boot incarnation is provenance,
not a new cluster grant. Reuse the one release algorithm, current control,
generation, membership, drain and final OPEN owners.

## Binary proof required for the next bounded unit

Before source repair, freeze a cold-process witness through startLagrangeRuntime
that positively reaches the actual non-control ENABLE commit. Its old run must
retain the exact origin and actual first refusal, process-lock lifecycle and
owner-reserved boot incarnations. If public startup encounters an earlier
failure, that becomes the measured prerequisite; the lower seam cannot stand
in for it. Keep shutdown retry/resource custody and primary-plus-cleanup
failure preservation from the existing work.

On the same locked host and repaired exact candidate, require the complete
operation: original cohort and physical identities retained, committed origin
unchanged, remaining pre-origin work genuinely authorized and ENABLEd, exact
SERVICES registration/activation reconciled, and actual public serving gate
satisfied. A later refusal is a new frontier, not a passing end-to-end result.

Required paired negatives include absent historical grant, wrong
node/cohort/incarnation, missing declared member, retired lifecycle, native
history loss after ESTABLISHED, unreadable/conflicting state, real cluster-ID
mismatch and stale isolated seed. Add cold cuts before native participation,
after allocation durability, after real SERVICES INSERT before discharge,
after discharge and after cluster-ID publication; include lost response and
repeated restart. The STOPPED reconciliation must progress only the exact
original row, while stale/foreign/cleanup rows refuse in the same witness.

Require an engaged native authorization-removal negative to fail at the
widened-permission assertion and a continuation-suppression negative to fail
at the named progress assertion. Setup failure, guard refusal or generic
process timeout is not a native semantic kill. Before checkpointing any
source diagnostic, use the normal guard owner; never weaken a checked-body
or authority gate to get that diagnostic committed.

Keep safety, recovery progress and performance verdicts separate. These local
cold-process proofs cannot certify cross-host RF3, snapshot/CDC lineage,
partial-cohort recovery, U1, TX1, FreshMG or release acceptance.

## Review categories and readiness

Consumed surfaces: current producer/reader/public-entry paths are identified;
new original-allocation APIs and typed startup mode are not yet designed.
Typed edges: missing, unreadable, conflict, incomplete cohort, retired,
publication-uncertain and transferred states need an explicit decision table,
including who retries and under which existing budget. No retry queue or new
controller follows from this requirement.

Cached views: startup admission snapshots, bootstrap Maps, membership hints,
workflow checkpoints and registration evidence are not interchangeable with
current authority. State their invalidation/re-read rules, particularly across
SERVICES publication and cleanup. Identity anchoring: full cohort, original
allocation, host, physical incarnation, canonical row generation, build and
cluster identity need separately sourced anchors.

Formation/recovery interaction: list reads through the SERVICES partition
whose opening is itself blocked. A recovery-only physical opening must not
be silently elevated to row creation or serving. Pair that liveness path with
current row retirement/cleanup refusal. Process custody and one existing
continuation owner must prevent overlapping attempts. These obligations cover
admission, recovery/replay, formation circularity, owner interaction and
harness fidelity at design level; they are not an implementation verdict.

Recommended next action under existing delegation: correct the public deadline
statement; author the five owner decisions and typed transition table above;
independently vet them; then seal the narrow original-allocation handoff unit
red and freeze its public-entry baseline. Partial allocation/loss recovery can
remain a separately routed extent with explicit refusal. Do not start a broad
startup redesign or grant implementation approval to the unresolved semantics.

## Exact source binding

Working HEAD inspected was `619c670e1f9d9cd36d44d97c3b2949329389fe09`; root
composition had foreign staged paths, all preserved. Of the charter's 30
hashed inputs, 28 still matched its manifest. Two differed due to the separately
reviewed completion-owner composition: bootstrap-service-seed-workflow.js was
`b1c59e19d615ea176e76a65cd42dff5355e5b44265da78ae73c4c4fa9af4b507`, and
replica-handler-release-recovery.js was
`9b1051f820e4a2ffbe55a123b8d01e28fe05a9ff9a85ed5eecacd4cf284e0937`.
The charter's two original hashes match its declared 5af0cc7f6d7ddd81bb10e9b590f02cc13e70ddad
source. Their reviewed consolidation does not change the frontier described
here. This review does not approve the moving combined candidate.

Opening-history seal `316e5fcdab102ddc562433139d73b3df62748590` remains literal:
intact records restore; established/unknown history never permits empty native
genesis; original bootstrap and establishment stay atomic. The migrated
cluster-identity Quest still has sealedAt:null; this review invents no seal.
All current cleanup/composition/change-proof work and the separately requested
existing-origin retry-suppression diagnostic remain separate, pending owners.
