---
audience: development
documentClass: proposal
---

# Participant release activation authority correction

Status: **round-seven proposed for independent design re-review; no authority
source change or proof**.
Subject: the accepted TX1 v10 release interaction plus the C56 review. This
note supersedes only the claim that the membership owner's `FRESH_SEED`
outcome proves fresh storage. That outcome remains a topology/startup routing
decision and cannot authorize a first participant origin.

## Counterexample and current owners

The retained diagnostic
`activation-fresh-storage-owner-observation.mjs` (SHA256
`d7b6e23dd7bd47824870c8b0c94d1b7b5b5c7e4e69c501edff0238e47e8f3937`)
created an application row in `users-p0/retained-replica.db` with no rejoin
hints or NODES rows. `resolveAutoRejoinStartupDecision` returned
`FRESH_SEED,durableStateDetected:false`, and the current release authorization
owner accepted it. The log SHA256 is
`d02d62264e8cf2449730f40e06e5de4b78eae3f3fa77fd05516ef03f7e42e38c`.

`rejoin-hints.js` owns membership recovery. Its NODES and hint census is not a
data-directory census. `seed-startup-storage-admission.js` owns retained
SERVICES identity conflict checks. An absent SERVICES row explicitly proves
nothing. `data-directory-process-owner.js` excludes concurrent processes but
does not prove storage birth. The seed `SeedStartupSessionStore` is the
existing durable fresh-start job and checkpoint owner. These concerns must
remain separate.

## Storage birth interaction

1. Before `DataDirectoryManager.initialize()` creates the configured data
   directory, the storage owner observes whether the directory itself is
   absent. Only successful creation of that absent directory during this
   initialization can issue an opaque in-process `storageBirth` capability.
   An existing directory is unproved even when empty. Missing metadata,
   missing expected subdirectories, an empty SERVICES/NODES result, and an
   unreadable entry never issue the capability.
2. The capability is useful only after the same process acquires the existing
   data-directory process owner. Losing that acquisition discards it. The
   normal `.write-test` and process-owner database are later storage-owner
   actions; callers never infer freshness by enumerating around them.
3. On a seed path, `SeedStartupSessionStore.createOrLoadSession` consumes the
   opaque capability only while atomically creating a new nonterminal seed
   startup record, before the infrastructure phase creates any group. It
   records one immutable birth identity bound to canonical data-directory
   identity, node ID, seed session ID and the first reserved boot incarnation.
   A caller cannot supply these fields as authority. Existing record update,
   checkpoint advance and failure recording preserve their exact bytes.
4. On ordinary process restart, the session store may reissue an in-process
   release capability only from that exact nonterminal record in the same
   canonical data directory for the same node. This preserves the initial
   authorization across a crash after partition creation but before origin.
   Malformed, conflicting, missing, foreign-node or terminal records refuse.
   A crash before the new seed record is durably created loses automatic
   authorization and requires the operator path. That is the safe side of the
   commit boundary.
5. The existing seed checkpoint remains the durable startup phase. The
   release algorithm reconstructs each partition phase from current cohort,
   origin, admission and drain facts. No second release phase, global ledger,
   or caller-held boolean is stored. Once an origin exists, normal
   existing-origin recovery no longer needs the birth capability.

## Release authorization owner

`ParticipantReleaseAuthorizationOwner` consumes exactly one of three owner
capabilities for a no-origin group:

- the seed session store's storage-birth capability;
- the current `ReplicaCreateAdmissionOwner` capability for the exact durable
  fresh CREATE operation, partition and materialized replica; or
- the explicit operator command owner's capability.

The release trigger string is diagnostic. Authorization binds partition ID,
measured target build digest and source owner identity. A dependent partition
may derive a control-partition child capability only from the same seed or
operator root capability. Restart-create, membership labels, GENESIS stamps,
SERVICES projections and existing-table lookups cannot mint one.

The startup one-shot operation and the runtime admin operation must call one
`ParticipantReleaseCommandOwner` method. That owner validates the concrete
partition set and measured build, mints the operator capability inside the
lifecycle owner, invokes the same release algorithm, and returns the typed
per-partition outcomes. It is available before normal admin readiness for a
blocked legacy seed and later through the admin surface. Neither consumer may
call `authorizeOperator` or the release transport directly.

## Remote control fact and deadline

For a dependent partition, the early SQL runtime's existing
`BootstrapTopologySnapshotOwner` supplies only the current control leader
route hint. The handler sends `PARTICIPANT_RELEASE` to that node, follows the
one canonical NOT_LEADER redirect, and accepts success only from the remote
control release answer whose full census binds the exact
`sql_transactions-p1` partition, cohort generation, origin, build, clean
connection, schema enforcer and query drain proof. A stale route cannot become
authority. Missing population or a stale answer leaves the dependent closed.

Seed release receives one `deadlineAtMs` derived once from the existing seed
leadership/startup bound and uses it for the entire ordered control-first
partition set. CREATE release receives the existing operation start plus
`syncTimeoutMs`. Operator release receives its command's existing operation
deadline. Every transport request and sleep is capped to the same remaining
budget and uses the lifecycle owner's injected time source. NOT_LEADER,
unavailable and pending facts retry only within that window. Existing-origin
background reconsideration remains level-triggered, four-way bounded and
diagnostic-coalesced; it grants no no-origin permission.

## Required witnesses

- A newly created data directory persists the birth fact before any group,
  crashes after system-group creation but before origin, and resumes the same
  nonterminal seed job and authorization. One origin per partition results.
- An existing empty directory, retained application DB with missing
  hints/NODES, unreadable artifact, terminal or foreign seed job, and a
  `FRESH_SEED` label alone all remain closed with the exact blocking fact.
- A real durable fresh CREATE job authorizes only its partition and current
  materialized identity; restart-create and a copied token refuse.
- Early startup and runtime admin consumers both traverse the same operator
  command owner. Omitted authorization and a raw trigger label refuse.
- A data partition on a node without a local control replica reaches the
  actual remote control leader, consumes a full current control release fact,
  and opens. Stale control generation/build/schema/drain replies refuse.
- One injected clock proves a seed-wide deadline across control plus all
  dependents, CREATE retains the original operation deadline, request timeout
  never exceeds remaining time, and no budget is reset after redirect/retry.
- The successful path retains pause, settlement, drain, origin, final census
  and resume ordering. Every negative leaves admission closed and records no
  origin.

No production implementation, independent approval or readiness claim follows
from this proposal.

## Round-two source-bound correction

The immutable round-one subject is retained at
`evidence/design-participant-release-activation-authority-round1-f6fc15a4.md`,
SHA-256
`f6fc15a426bc01fff1137ee379bb699ca437837a4cc9e64e9e9b01c1963dfd1e`.
The first round-two draft is retained at
`evidence/design-participant-release-activation-authority-round2-c50aceed.md`,
SHA-256
`c50aceed0d914f674db93e59dd3c0c35d0c72cf647dbb7c38c8cfac6745a51e5`;
it incorrectly gave participant activation and retained learner recovery one
NODES-registration prerequisite. The corrected shared interaction below keeps
one HOLD mechanism while preserving their different semantic prerequisites.
The next draft is retained at
`evidence/design-participant-release-activation-authority-round2b-1459f41a.md`,
SHA-256
`1459f41ae68e973f636453987167e55cb7ba617f54298073a7e40fc5fda80e6c`;
its existing-leaf fast path could bypass an in-progress creator's parent claim.
The corrected handoff below preserves the checkpoint correction while closing
both that race and the unwritable-parent deployment case.
This section supersedes the storage birth, durable session, operator command,
remote authorization, deadline and release-schedule contracts above. It answers
the seven findings in independent report
`test-output/continuation-20261011/review-activation-authority-design.md`,
SHA-256
`66caedf23ee11bc179a0fd1dba6868789da46e26e55af62426dbe296574f136a`.
Source remains held.

### A. One storage creation and process-claim linearization

`acquireDataDirectoryProcessOwner` becomes the sole owner of initial leaf
creation and process exclusion. `DataDirectoryManager.initialize` no longer
does an `existsSync`/recursive-create decision and never mints freshness.

The current internal SQLite claim is acquired only after opening
`.lagrange-data-directory-owner.sqlite` in the leaf. Creation followed later by
that claim has an interposition window: another process can claim, write and
release the leaf before the creator obtains the internal claim. `CREATED` plus
a later internal claim is therefore not birth evidence.

The corrected process owner uses one live parent-scoped handoff claim. This is
an extension of process exclusion, not a durable semantic record:

1. Resolve the existing parent through `realpath`, validate the requested leaf
   is one ordinary path component, and construct the canonical leaf identity
   from the real parent plus leaf. A missing/unreadable parent, non-directory
   entry or changed parent identity refuses before authority exists.
2. Derive a per-leaf parent rendezvous path from the type-pinned canonical leaf
   digest. Its SQLite record also stores the exact canonical leaf; a digest/name
   collision is a conflict. The rendezvous file and its contents are not birth
   authority. Only its live `BEGIN EXCLUSIVE` transaction serializes an absent
   leaf's publication into the internal process claim.
3. If the leaf is absent, open or exclusively create that rendezvous and acquire
   its transaction before `mkdir`. Reinspect the leaf while holding it. If still
   absent, call one non-recursive exclusive `mkdir` and record `CREATED`; if a
   directory now exists, record `EXISTING`. This branch already requires parent
   permission to create the leaf. A crash releases the live transaction; the
   persistent file alone grants nothing.
4. If the leaf already exists, first inspect the rendezvous path. When it
   exists, join its live transaction before opening the leaf. When it is absent,
   acquire the internal leaf claim directly, then recheck both rendezvous
   absence and the captured leaf identity before returning. If a rendezvous
   appeared, release the internal claim and retry through it. A supported
   creator publishes the rendezvous before the leaf and retains it until its
   internal claim is live, so an existing-path process can neither pass an
   in-progress creator nor manufacture birth.
5. For either branch, while still holding any joined rendezvous, open the internal
   `.lagrange-data-directory-owner.sqlite`, acquire its existing `BEGIN
   EXCLUSIVE` process claim, and revalidate the canonical parent/leaf identity.
   Release the rendezvous only after the internal claim is live. There is no
   interval in which another supported process can claim or write the new leaf
   between its creation and the creator's internal claim.
6. Birth becomes usable only when the same uninterrupted handoff invocation
   both created the leaf and still holds the internal claim. If the process
   crashes after `mkdir` but before acquiring the internal claim or durably
   committing the seed birth record, the next process observes `EXISTING` and
   gets no automatic birth authority; explicit operator authority is required.
   Release, acquisition failure or startup unwind invalidates the process-local
   capability.
   After releasing the rendezvous transaction, the owner removes its files when
   safe; an inert crash remnant is joined and cleaned by a later owner and is
   never interpreted as creation.
7. A stable precreated directory with no rendezvous takes only its internal
   claim, always returns `EXISTING_AND_OWNED`, and requires no parent write. This
   preserves a writable data directory under an unwritable volume parent. An
   in-progress or crash-remnant rendezvous must be joinable; inability to read
   or lock it returns `OWNERSHIP_UNAVAILABLE`, never freshness.
8. Return the canonical path to `DataDirectoryManager`, which performs its
   `.write-test` only while the internal claim is held. The runtime binds the
   returned owner before boot reservation, hints, startup workflow, group or
   partition work. Alias spellings resolve to the same parent claim and owner
   identity.

The capability is an opaque process-local object held in a private owner map.
It contains no caller-supplied freshness fields. Its only consumer is the seed
session store's conditional initial commit below, which also receives the
actual live process-owner object and rejects a released or different owner.
Two normal initializers contending for the same absent leaf can therefore
produce at most one uninterrupted `CREATED` to internal-claim handoff. A later
owner of an existing, even empty, leaf cannot turn it into first-origin
authority. Absence of a lock file, an unlocked parent database and process
claim metadata are never durable facts.

Typed outcomes are `CREATED_AND_OWNED`, `EXISTING_AND_OWNED`,
`ALREADY_OWNED`, `PARENT_UNAVAILABLE`, `ENTRY_CONFLICT`, and
`OWNERSHIP_UNAVAILABLE`. Only the first can create a seed birth record.

### B. Existing startup store as the durable authority owner

No second release ledger is added. `StartupWorkflowStore` and its production
`FileStartupWorkflowStorage` gain one exact authority-bearing record contract.
Memory/custom adapters remain useful test stores but are never production
birth or operator authority.

The production storage owner serializes every operation by canonical record
path inside the already held data-directory process claim. Each mutation:

- reads and strictly validates one complete versioned own-data record;
- checks expected `recordRevision` and the digest of the prior canonical bytes;
- writes to a collision-free exclusive temporary file;
- fsyncs the complete temporary file, renames it over the record, and fsyncs
  the containing `startup-workflows` directory; and
- returns only the bytes reread after that durable commit.

Conditional create succeeds only for an absent record. Existing different
session, malformed bytes, wrong workflow kind/node/directory, stale revision,
terminal replacement or concurrent update returns a typed conflict. The seed
store no longer uses `restartTerminalSession:true` to replace an authority
record. A terminal seed record in an existing directory can never mint another
birth; a no-origin remainder requires the explicit operator path.

The exact authority subrecord is:

```text
{
  kind: "seed_storage_birth_v1",
  authorityId,
  canonicalDataDir,
  nodeId,
  sessionId,
  firstBootIncarnation,
  createdAt,
  activationScope: "participant_release"
}
```

Every field is primitive, own, exact-key and type-pinned before encoding.
`authorityId` is generated once by the storage owner after exclusive creation;
it is nonempty random identity, not a freshness proof by itself. The initial
conditional commit requires the live birth/process capability, exact canonical
directory, seed node/session and the already durably reserved first boot.
Loaded `workflowKind`, node, session, plan version and authority bytes must all
match the requested owner. `cloneWorkflowRecord`, load, checkpoint advance,
failure, retry and completion preserve the canonical authority bytes exactly.

`firstBootIncarnation` never changes. Each boot adds a separate exact
`startupInvocation` by revision CAS:

```text
{
  invocationId,
  currentBootIncarnation,
  targetBuildDigest,
  seedStartupHoldStartedAtMs,
  deadlineAtMs,
  state: "pending" | "expired" | "completed"
}
```

`targetBuildDigest` is the exact actual installed-body digest measured by the
runtime provenance owner for this invocation; the birth record itself is
build-neutral so a later supported build does not rewrite birth history. The
store validates that digest, the current durable boot reservation and held
process owner before issuing an in-process seed authorization. A
same-directory, same-node restart may CAS a new invocation only after the prior
boot is no longer live and its invocation is expired or abandoned. It retains
the same immutable birth authority. A copied, unflushed, malformed, foreign,
terminal, stale-revision or wrong-directory record refuses. The opaque runtime
capability is newly issued from the durable record; it is never serialized into
JSON.

### C. One shared startup HOLD interaction

Participant activation and C3 retained learner install use the same existing
startup checkpoint machinery. Each keeps its own semantic authority; the
shared interaction only prevents checkpoint advancement while durable work is
owed.

The exact error is `STARTUP_CHECKPOINT_HELD`, with strict own fields:

```text
{
  code,
  workflowKind,
  checkpoint,
  obligationKind,
  obligationId,
  nodeId,
  bootIncarnation,
  deadlineAtMs,
  retryAfterMs,
  missingFact
}
```

It is a typed retryable control-plane error, never authority. A fulfilled
`HELD` value is forbidden because `StartupPipelineRunner` advances fulfilled
steps. The runner records the retryable failure and leaves the checkpoint
unchanged.

For join/C3, the existing `NodeJoiningService.join()` outer loop consumes this
error through `isRetryableControlPlaneError`, preserves registered resources,
and retains its original `startTime`. The checkpoint `shouldRerun` predicate
reads authoritative retained CREATE/artifact debt. Its absolute bound remains
the existing `startTime + retryableJoinResumePolicy.maxElapsedMs`; no ACK,
retry or cache event resets it.

For seed, `BootstrapService.bootstrap()` owns the analogous retry around its
existing workflow runner. It preserves the resources already established for
the held checkpoint and uses the durable startup invocation's single absolute
deadline. It does not run failure cleanup on a retryable HOLD. Abort, shutdown,
hard conflict or elapsed invocation retires volatile work and runs normal
cleanup, but the durable birth/release or CREATE obligation remains
nonterminal. Expiry ends that invocation loudly; it does not classify origin or
artifact debt as absent or completed. A later boot may create a new bounded
invocation under the same immutable birth authority.

The HOLD producer is shared, but its consumers run at their actual distinct
authority points:

- seed participant activation runs inside `REGISTRATION_READY`, after the
  partition services, early SQL engine and ReplicaHandler release route exist,
  and before the registration phase performs its system-table writes. It uses
  durable seed/process/boot/build authority and does not require a current
  NODES row; requiring registration here would create the cycle because those
  writes require participant origin;
- seed C3 retained learner recovery runs inside `CONTROL_PLANE_READY`, after
  `registerSeedNodeWithControlPlane()` has durably published the current NODES
  boot and before that checkpoint completes or message-group rows become
  ACTIVE; and
- join C3 recovery runs after `MEMBERSHIP_WRITTEN` has published the current
  NODES boot and before `READY_LEASE_ASSIGNED`.

Each `shouldRerun` predicate reads its own durable debt. A participant release
HOLD reruns `REGISTRATION_READY` without replaying completed earlier phases. A
C3 HOLD reruns its later unsatisfied checkpoint without moving activation
earlier or treating seed/process authority as a NODES row.

The sole owner sleeps through the injected time source, caps delay to remaining
budget, unreferences its timer, and fences every late callback by workflow,
invocation, boot and shutdown generation. Replicated-row/service/consensus
events may wake it earlier. No second scheduler, durable held bit or retry
registry is introduced.

### D. One participant release command owner and two real consumers

`ParticipantReleaseCommandOwner` is the only producer of explicit operator
release. It uses the existing startup workflow record as the node-local durable
command slot, not a new ledger. A revision-CAS accepted command contains exact
`commandId`, sorted unique concrete partition IDs, measured target build digest,
node/current boot, accepted time, absolute deadline, state and per-partition
outcomes. One active command is permitted per node; byte-identical retries join
it, competing commands return `BUSY`, and completed history can be replaced
only by a new revision after its result has been durably read.

The two production consumers are:

1. the entrypoint option
   `--release-participant-transactions=<partition-id,...|all-current>` before
   seed bootstrap/admin readiness; and
2. the node-local `AdminWebSocketAPI` action
   `RELEASE_PARTICIPANT_TRANSACTIONS` after the admin surface is live.

Both adapters only normalize strict own input and pass it to the same command
owner. `all-current` is resolved once by the command owner through actual
current partition ownership, then persisted as the concrete sorted set. The
entrypoint option uses the seed invocation's remaining absolute budget. The
admin action uses its existing request timeout budget captured at admission;
an absent/nonfinite/unsafe budget refuses. Neither adapter calls
`authorizeOperator` or release transport directly.

The accepted command is monotonic authority until every named partition has an
origin or an explicit terminal conflict. Timeout ends one request and records
`expired_pending`; it does not erase the accepted obligation. The normal boot
reads the command slot before READY/admin dependency and reenters pending work
through the shared startup HOLD owner. A lost reply, process crash or partial
origin therefore resumes the same command/partition identities. Malformed,
foreign-node, wrong-build and conflicting command rows remain actionable
refusals and cannot be silently replaced.

### E. Authorization at the first-origin actuation seam

`ParticipantReleaseAuthorizationOwner` issues only process-local handles. A
handle is bound to authorization kind, durable authority/command or CREATE
identity, source node/current boot, exact partition/build, activation invocation
and deadline. Trigger labels remain diagnostics.

Authorization is checked twice:

1. before cutover begins, to prevent unauthorized pause/settlement work; and
2. immediately at `ACTION.ENABLE`, after every route, census, reopen and
   settlement await, before `enableParticipantTransactionAdmission` proposes
   the generation origin.

The second check is the sole first-origin permission seam. It rereads:

- seed: exact durable birth authority, current activation invocation, held
  process owner and current boot;
- fresh CREATE: the exact current durable admission operation, partition,
  replica, attempt token/sequence, workflow timestamp, materialized state and
  physical generation; or
- operator: the exact accepted command revision, partition membership, build,
  invocation and pending state.

It also revalidates current leader/service generation, release identity and
attempt. A stale CREATE, retired boot, direct ENABLE, copied handle, changed
command, successor generation or expired invocation cannot propose origin.
The origin command bytes carry the authorization kind plus canonical durable
authority/attempt digest and release ID; committed apply validates this exact
shape and current partition generation. It stores no new authorization ledger.
Existing consensus position remains the durable origin fact.

After an origin is observed, the origin itself replaces no-origin permission.
Retries recover by the same origin command/readback identity; they do not mint
a replacement origin or require the old process-local handle.

### F. Serializable remote authorization and current control proof

WeakMap objects never cross transport. The wire carries a strict serializable
`authorizationReference` only:

```text
{
  version,
  authorizationId,
  sourceNodeId,
  sourceBootIncarnation,
  authorityKind,
  operationId,
  partitionId,
  targetBuildDigest,
  invocationId,
  deadlineAtMs
}
```

The reference is not self-authenticating. A no-origin remote leader validates
it through the bounded `VALIDATE_PARTICIPANT_RELEASE_AUTHORIZATION` interaction
back to `${sourceNodeId}/service/replica-handler`. The request binds a fresh
challenge digest to the exact release ID, leader attempt, leader lifecycle,
target generation and ENABLE action. The source handler captures its current
registration/delivery lifetime, looks up the local handle, rereads the durable
seed/CREATE/operator owner above, and returns only `AUTHORIZED`, `HELD`,
`CONFLICT` or `EXPIRED` plus the echoed challenge and durable authority digest.
Transport ACK means only processed. Missing handler, connection, timeout and
redirect are bounded retained outcomes.

Seed and operator authority is monotonic for its accepted invocation. Fresh
CREATE no-origin activation must execute on the target node that owns the
materialized CREATE and current service generation; it is not transferable to
another node. Immediately after the authorization response, the remote leader
revalidates its captured service/generation/release attempt and invokes the
sole ENABLE seam. Late or mismatched answers are inert. A NOT_LEADER redirect
reruns validation at the new current leader and does not reuse the old answer.

Existing-origin reconsideration needs no no-origin handle. For a dependent
partition, the topology snapshot supplies only a route hint to the control
leader. Missing/stale route returns checkpoint HOLD and reenters on topology,
service or consensus revision; it never proves population.

A successful control answer now returns strict own data:

```text
{
  outcome: "cut_over",
  requestId,
  release,
  attempt,
  leaderFacts,
  census,
  queryDrainProof
}
```

The producer obtains `leaderFacts` and every census row after final origin and
before resume. The consumer calls the existing full `releaseCensusDefect`
contract with `leaderFacts` as the local/current leader fact and the returned
attempt/query proof. This proves exact committed voters plus learners, one
unique observation per member, term/leader/lifecycle/generation, release/build,
origin, clean connection, rowid, topology, accepted-work drain, schema/enforcer
and query settlement. Nonempty or count-only census is insufficient.

`requestId` binds caller operation/command, source boot, partition/build and
absolute deadline. Singleflight joins only byte-identical request ID,
authorization reference and deadline; same-build requests with different
authority or invocation receive `BUSY`. The consumer rereads current route and
rejects a response after cohort/release/generation change. All wire arrays are
dense, own, unique and bounded by the existing committed-membership maximum;
no new participant-set cap is introduced.

### G. Parent budgets and complete awaited work

Authority and request budget are separate. Expiring a request leaves an
accepted seed/CREATE/operator obligation pending and admission closed.

- Seed creates the durable `startupInvocation` before first entry to the
  held-capable `REGISTRATION_READY` checkpoint. It captures
  `seedStartupHoldStartedAtMs` once and persists `deadlineAtMs =
  seedStartupHoldStartedAtMs + leadershipWaitTimeoutMs`. Participant activation
  and any later C3 retained recovery in that boot consume this same remaining
  budget; neither checkpoint recaptures it. This is the existing
  release/leadership bound anchored once rather than `now + bound` on each
  retry. A new boot may create a new invocation only under the same immutable
  birth authority after the old boot is fenced.
- Fresh CREATE uses the durable admission attempt's
  `create_admission_workflow_updated_at + syncTimeoutMs`. Restart keeps that
  deadline for the same attempt. Only the existing admission rotation owner may
  create a new attempt/timestamp; a callback or release retry cannot.
- Operator uses the entrypoint seed remaining budget or the admitted admin
  request's existing timeout. The accepted command persists the resulting
  absolute deadline. Missing or invalid caller budget refuses admission.
- Join/C3 uses the existing join start plus retryable-resume max elapsed bound
  described in C.

All boundaries use safe finite integer milliseconds, reject `-0`, fractional,
unsafe and overflowed sums, and compare through the lifecycle owner's injected
time source. Persisted absolute times use the repository's wall-clock epoch
domain; tests inject a faithful advancing epoch clock. A restart never
interprets elapsed monotonic ticks as persisted epoch time.

Remaining budget is threaded through measured-build reads, durable authority
reads, route discovery, membership and all-member census, pause, accepted-work
settlement, reopen, origin proposal/readback, final census and resume.
`settleTransactionReleaseRows` and every participant operation accept the same
deadline/cancellation context. Each await rechecks deadline and current
generation after completion. Timeout never proves noncommitment: a late result
is reconciled by origin/decision/readback before retry, and no admission opens
from a timed-out reply.

Foreground seed, CREATE and operator runs share the existing per-partition
cutover singleflight, now keyed by full request identity. Background
existing-origin reconsideration retains its four-way concurrency, one-second
retry and coalesced diagnostics. Cohort fanout stays bounded by the existing
membership maximum. No new scheduler, count cap or arbitrary duration is
introduced.

### H. Pause, accepted-work settlement, drain, reopen and origin order

The release order is exact:

1. Resolve control owner as a route hint, but close the requesting local
   partition before awaiting any remote control release. Control itself closes
   its current leader before remote census. A route refusal can therefore never
   leave a reachable participant admitting new work.
2. Pause every member of the actual committed cohort. A partial pause remains
   closed and returns HOLD; it is not drain proof.
3. Let only already accepted work owners progress under the pause. For
   `sql_transactions`, `settleTransactionReleaseRows` rereads canonical
   manifests/decisions and drives exact participant COMMIT/ROLLBACK. Participant
   partitions apply those bound decisions. Already admitted write-kernel
   proposals finish through their existing commit owner. Legacy active/prepared
   debt uses the accepted L6 compatibility owner; unreconstructible legacy/NULL
   rows remain preserved and refuse activation with actionable IDs/schema
   digest.
4. Re-read the whole cohort and require completion drain: no legacy active or
   prepared sessions, SQLite transaction, participant staging/PREPARED debt,
   proposals or pending outcomes, and own applied equals commit equals last.
   Query release proof binds every retained coordinator result. An optional
   earlier reopen-safety observation may establish that no SQLite/proposal is
   in flight, but it never substitutes for this completion drain.
5. Reopen dirty followers first, then transfer leadership if the leader is
   dirty, and recensus the new exact term/generation. Reopen is neither origin
   permission nor debt discharge.
6. Revalidate no-origin authorization at the ENABLE seam, propose/read back the
   single origin, and perform final full census including clean connection,
   schema/enforcer, query drain and applied origin.
7. Resume the exact cohort. Any failure stays paused/default closed and retains
   the durable obligation for the shared startup/background wake.

Control release completes first. Dependents consume its full current proof,
then run their own cohort schedule. No dependent opens from a control route,
label, partial census or settlement status alone.

### I. Failure/result table

| Condition | Typed result | Durable treatment | Reentry |
| --- | --- | --- | --- |
| Existing/unreadable/conflicting directory | `OPERATOR_REQUIRED` / `STORAGE_CONFLICT` | no birth record | explicit operator command |
| Durable birth committed, fact temporarily unavailable | `STARTUP_CHECKPOINT_HELD` | authority and invocation retained | same checkpoint owner event/retry |
| Malformed/foreign/terminal birth record | `AUTHORITY_CONFLICT` | preserve bytes; no origin | operator repair/action |
| Current CREATE admission unavailable | `STARTUP_CHECKPOINT_HELD` | same attempt and deadline retained | operation/NODES revision |
| Stale/successor CREATE | `AUTHORITY_CONFLICT` | no adoption or overwrite | admission owner disposition |
| Accepted operator command pending | `STARTUP_CHECKPOINT_HELD` | command revision/outcomes retained | startup/admin/route/service wake |
| Invocation deadline spent | `EXPIRED_PENDING` | authority/command remains owed; admission closed | new owner invocation, never same-request reset |
| Missing route/handler/member/census fact | `STARTUP_CHECKPOINT_HELD` / `UNAVAILABLE` | no origin; partial pause remains closed | topology/service/consensus wake |
| Malformed or incomplete current population | `CENSUS_REFUSED` | preserve debt and artifacts | corrected authoritative facts |
| Origin applied but reply lost | `ORIGIN_REPLICATION_PENDING` then readback | origin is authority | exact origin/final-census recovery |
| Complete final census and resume | `CUT_OVER` | invocation/command outcome completed | none |

### J. Required paired witnesses and impact registration

Implementation review requires production-shaped pairs:

- two normal startup processes contend for one absent leaf, including alias
  paths and claim-order inversion; exactly one durable birth plus held owner can
  authorize;
- crash before file fsync, after file fsync, after rename and after directory
  fsync; only the fully durable exact record resumes, and every update preserves
  immutable authority bytes and revision CAS;
- same birth across a new boot, terminal/foreign/copied/malformed record
  refusal, and expired invocation followed by a new owner invocation without
  changing authority;
- early entrypoint and runtime admin commands use the same durable command
  owner; duplicates join, conflicts refuse, lost reply/restart resumes;
- stale CREATE after awaits, direct ENABLE, copied wire reference and successor
  generation refuse at the origin seam; current seed/CREATE/operator positives
  each produce one origin;
- two actual handlers through real router serialization, canonical redirect,
  authorization callback, missing member, stale cohort, noHandler/DEFERRED/
  FAILED and genuine authorized remote success;
- one injected epoch clock proves every await spends one inherited invocation
  budget, including a slow legitimate settlement and an expiry that stays
  closed with debt retained;
- retained coordinator and participant debt settles after pause and before
  completion drain; malformed legacy debt remains preserved/actionable; reopen
  and partial census never open admission;
- shared seed/join HOLD tests prove no fulfilled HELD advances a checkpoint,
  join uses its existing outer retry, seed preserves durable debt, and shutdown
  fences late callbacks.

Register the coupled impact contract `participant_release_activation_authority`
with primary endpoints in data-directory process acquisition, startup workflow
storage/session, runtime startup/bootstrap checkpoint, authorization/command
owner, release client/cutover/recipient and origin request/apply. Resource
witnesses are the focused storage race/durability suite, startup HOLD suite,
operator consumer suite, remote serialized release suite, release ordering
suite and production bootstrap/CREATE integration. Generated impact, primary,
resource and subsystem metadata move with the contract; a green helper-only or
co-located fixture is insufficient.

This amendment changes no production authority by itself. C56-1/4/6 reviewed
transaction bytes remain outside this design revision and byte-identical.

## Round-three owner and lifetime correction

The round-two review subject is preserved verbatim at
`evidence/design-participant-release-activation-authority-round2c-4be62904.md`,
SHA-256
`4be62904fb19991dd1f78ba93249d87b62edfdfdf3e58e1262c4e87c6d969155`.
This section answers R2-1 through R2-6 in linked independent report
`review-activation-authority-design-round2.md`, SHA-256
`38987c77ad76acd5f5a2ae1578cdf1abc6fda6ca76f44ea4e31b2be3f0f1082c`.
It supersedes the rendezvous cleanup, physical birth, workflow invocation,
operator budget, remote authorization lifetime and remote population
consumption rules above. The accepted participant-before-registration and
C3-after-current-NODES checkpoint split, and the thrown HOLD contract, remain
unchanged.

### R2-1. Stable no-follow rendezvous lifetime

`DataDirectoryProcessOwner` retains each created per-leaf rendezvous database;
the application never unlinks it or its live SQLite journal/sidecars. Its
existence and bytes remain non-authoritative. This removes the release/unlink/
reopen generation race: every supported initializer that observes the stable
path joins the same SQLite file, while an initializer that observed no path
must recheck after acquiring the inner claim as specified above.

The owner opens both leaf and rendezvous entries without following their final
path component. A leaf symlink, rendezvous symlink, non-ordinary rendezvous,
changed parent/leaf physical identity, or exact-leaf row for another canonical
path is `ENTRY_CONFLICT`. Canonical spelling never converts a symlink into a
directory identity. The rendezvous schema contains one immutable exact
canonical-leaf row. Initialization of an empty crash remnant occurs only while
SQLite holds that same file's exclusive transaction; a valid existing row is
read-only thereafter. A corrupt/partial nonempty database refuses
`OWNERSHIP_UNAVAILABLE`; it is never deleted and recreated as a second mutex.
SQLite alone recovers its journal. Application cleanup never removes a journal
another process may have opened.

Lock order is always rendezvous then inner claim. The existing/no-rendezvous
path may tentatively acquire the inner claim, but if its mandatory post-acquire
check sees a rendezvous it releases inner before joining outer. No owner holds
inner while awaiting outer. `SQLITE_BUSY` is bounded by the caller's process
claim acquisition budget and returns `OWNERSHIP_UNAVAILABLE`; it never grants
birth. A newly created leaf's retained rendezvous can later be opened and
locked through its existing writable database file even if the parent becomes
non-writable. A truly precreated leaf with no rendezvous continues to require no
parent write and always remains ineligible for birth.

The race witness latches two normal processes before rendezvous publication,
after publication, after leaf mkdir, while outer is released, and while inner
is acquired. It includes open-before-release and lookup/open interleavings,
empty crash remnants, alias paths, writable parent creation, and a precreated
writable leaf under an unwritable parent. Exactly one uninterrupted creator can
carry birth; every other path either owns the same inner mutex without birth or
returns typed unavailability.

### R2-2. Physical birth identity and complete namespace commit

The same storage owner creates a private birth marker inside a newly created
leaf before any startup workflow. It uses exclusive no-follow creation, writes
one random fixed-width value, fsyncs the marker, and captures no-follow physical
identity for both the leaf and marker. The immutable authority record adds:

```text
physicalBirth: {
  directoryDevice,
  directoryInode,
  markerDevice,
  markerInode,
  markerDigest
}
```

Device and inode values are captured as canonical unsigned decimal strings
from BigInt stat fields; marker digest is fixed SHA-256 over the primitive
marker bytes. Restart reopens without following links and requires the exact
directory and marker physical tuple plus content digest before it may reissue a
birth authorization. Alias paths to the same directory match. A copied marker
and authority record at the same canonical pathname have different physical
identity and refuse; deleting/recreating the leaf also refuses even if record
bytes and boot counter were copied. An in-place block restore that deliberately
preserves the complete filesystem physical identity is outside automatic
restore detection and requires the explicit operator restore workflow; it is
never advertised as a newly born directory.

Initial durability order is owned by the same process claim:

1. create the leaf and fsync its existing parent directory;
2. create/fsync the marker and inner owner database, then fsync the leaf
   directory so both entries are established;
3. reserve/fsync the first boot through `BootIncarnationOwner`;
4. create `startup-workflows` and fsync the leaf directory again;
5. write/fsync the exclusive authority temporary file, rename it, fsync
   `startup-workflows`, and reread exact canonical bytes.

Only step 5's exact readback after every required fsync is the initial authority
commit. If write, rename or an fsync answer is lost, no caller capability is
issued. A later owner with the exact physical claim performs lost-answer
reconciliation: it validates the final record/marker/boot identity, repeats
file and containing-directory fsyncs, and rereads exact bytes. Matching bytes
allow completion of the same conditional create; temp-only, competing,
malformed or mismatched bytes refuse. Surviving bytes alone do not assert that
the earlier process observed success.

### R2-3. Immutable authorization separated from boot execution

`StartupWorkflowStore` remains the one file owner, but its record separates
three concerns:

```text
{
  immutableAuthorization: seedStorageBirthV1 | null,
  workflow: {generation, sessionId, bootIncarnation, checkpoint, terminal,
    completionDigest},
  startupInvocation: {invocationId, bootIncarnation,
    seedStartupHoldStartedAtMs, deadlineAtMs,
    state: "pending" | "completed" | "expired" | "abandoned"},
  participantReleaseCommand: commandOrNull
}
```

All mutations remain revision-CAS updates of the same record and preserve
immutable authorization and any accepted command bytes. Starting an ordinary
boot workflow after `FINALIZED` advances `workflow.generation`; it does not
replace the record, restart the old session, or mint birth again. Every seed
boot with the held physical claim and current durable boot reservation may
create one bounded `startupInvocation`, whether immutable birth exists or not.
That invocation is execution budget and callback fencing only. It grants no
first-origin permission.

The transitions are exact:

- a completed seed restarts with a new ordinary workflow/invocation, retains
  birth history unchanged, and may recover existing origins or C3 debt without
  presenting birth as new authorization;
- an abruptly interrupted pending invocation becomes `abandoned` only after
  the new process holds the exclusive physical claim and
  `BootIncarnationOwner` proves the prior boot is superseded. The new bounded
  invocation may continue the same immutable birth obligation and phase;
- a directory that never had birth authority still receives an ordinary
  invocation for startup and C3, but no no-origin participant release occurs
  until the explicit operator command is durably accepted;
- request expiry marks an accepted operator command `expired_pending`, not
  terminal. A later ordinary startup invocation reenters the same command ID,
  exact partition set, build and per-partition effect/outcome state with a new
  execution window. It does not renew the expired request or replace command
  authority; and
- `completed` invocation/command outcomes remain readback results. A later boot
  creates a new execution invocation only for currently retained work.

This same invocation is available to seed C3 after current NODES publication,
including a learner CREATE admitted long after the original seed finalized.
The HOLD producer names the current workflow/invocation but derives authority
from the retained CREATE/artifact owner, never from immutable birth presence.

### R2-4. Command admission points, real budgets and node-wide accounting

The entrypoint parser only captures a strict primitive
`participantReleaseIntent`; it neither resolves `all-current` nor persists a
command. At the existing `REGISTRATION_READY` checkpoint, after partition
services, the early SQL engine, ReplicaHandler, measured build and the current
startup invocation exist, `ParticipantReleaseCommandOwner` resolves the actual
current local partition owner set, persists the concrete command, and begins
release before registration writes. An empty/unavailable population is a typed
HOLD, never an accepted empty plan. Its absolute deadline is the already
persisted `startupInvocation.deadlineAtMs`.

The runtime admin consumer is the new
`AdminWebSocketAPI` `RELEASE_PARTICIPANT_TRANSACTIONS` message. Dispatch captures
`acceptedAtMs` from the API's injected `nowFn` and uses the actual configured
`admin.queryTimeoutMs` (`CONFIG_KEY.ADMIN_QUERY_TIMEOUT_MS`, default 30 s),
validated by the existing safe admin timeout-budget helper. It constructs one
absolute deadline before awaiting command admission. It does not call the SQL
query execution wrapper or inherit a per-query cancellation token. The command
owner persists that deadline and exact accepted command. Request expiry returns
`expired_pending`; later recovery uses the new ordinary startup invocation
described in R2-3, not a reset of this admin request.

Fresh CREATE keeps the durable original
`create_admission_workflow_updated_at + syncTimeoutMs` deadline. Attempt-token
rotation does not change that timestamp and therefore cannot replenish the
window. An already elapsed original workflow returns `EXPIRED_PENDING` to the
existing CREATE disposition/recovery owner; a release retry cannot invent a
later attempt start.

All seed, operator, CREATE and background partition release calls enter the
existing `createParticipantReleaseRecovery` pending/running owner. Its existing
four running slots become the node-wide release-attempt bound; the pending map
continues to coalesce by partition and `runParticipantCutover` remains the
per-partition exact-identity singleflight. Seed and explicit multi-partition
operator plans submit partitions sequentially. Background retries retain the
existing one-second cadence; election/pause retry remains 100 ms. No second
queue, timer or scheduler is added.

At most four cohort phases run concurrently, each over the existing committed
membership maximum of 1024 members; phases are sequential within an attempt.
The caller's one absolute deadline includes queue wait, build and authority
reads, control reservation, route/member discovery, pause, accepted-work
settlement, reopen, origin/readback, final census and resume. Every queued start
and post-await continuation recomputes remaining time. Slow settlement that
fits proceeds; expiry leaves the command/CREATE/birth obligation and any origin
readback pending with admission closed.

### R2-5. Durable non-revocable authorization effect

The source callback no longer returns permission from a revocable invocation
snapshot. For seed and operator authority, it invokes the existing startup/
command record owner's conditional `admitParticipantReleaseEffect` operation.
The per-partition outcome fields already required for recovery gain one exact
state:

```text
{
  effectId,
  authorityKind,
  authorityDigest,
  authorizationOperationId,
  partitionId,
  targetBuildDigest,
  releaseId,
  targetConfigurationKey,
  targetMembershipGenerationIndex,
  admittedAt,
  state: "effect_admitted" | "origin_observed" | "conflict"
}
```

For automatic seed release, `authorizationOperationId` is the immutable release
plan ID revision-CASed into that boot workflow when its concrete partition set
is resolved. For explicit release it is the accepted operator `commandId`.
Neither is derived from the trigger label or callback request.

The callback challenge, source handler lifetime, durable birth/command identity
and target release attempt are reread before one revision-CAS inserts
`effect_admitted`. That CAS is the authorization linearization point. The
returned `AUTHORIZED` answer carries the exact admitted-effect bytes/digest and
echoed challenge. A callback that did not commit returns HOLD/conflict and can
never produce an actionable receipt.

Once admitted, the effect is non-revocable. Source shutdown, process-claim
release, boot replacement, startup-invocation expiry and request timeout do not
turn its late reply into unauthorized work. They turn the request result into
unknown/expired-pending while the exact effect remains owed. The next boot
re-drives the same effect ID and reconciles the target origin before recording
`origin_observed`; it never creates a second authorization. A target generation
that can no longer accept the bound effect records actionable conflict and
requires the same owner to reconcile/supersede it from current facts.

The remote ENABLE endpoint accepts only the exact admitted-effect receipt bound
to its release/generation/attempt and carries its digest into the origin command.
Thus the source may retire after the effect CAS without a check/act gap. A
source retirement before that CAS yields no receipt. Timeout does not imply
noncommitment. This strengthens the existing startup/command record rather than
adding an authorization ledger. Fresh CREATE remains local to the target node;
its existing durable CREATE row and physical claim are reread at ENABLE and no
remote receipt can substitute for them.

The required race pauses after source CAS and before callback delivery, then
retires the source boot or expires the request. The late exact receipt either
produces/readbacks the one bound origin or remains a retained conflict; it is
never refused merely because the execution invocation ended and never mints a
replacement effect. The paired pre-CAS retirement refuses.

### R2-6. Current control population reservation and consume

A dependent never consumes the `CUT_OVER` reply's self-consistent census
directly. After receiving it, the dependent asks the actual named control
leader for `RESERVE_PARTICIPANT_RELEASE_PROOF`, with a fresh challenge bound to
the dependent effect ID, partition/build, caller deadline and the reply's exact
control release identity.

The control leader uses the existing Raft operation port's group-wide
membership lane. It acquires a bounded transient read reservation, then performs
a fresh `readCommittedMembership({purpose: RETIREMENT})`; pending/joint
configuration refuses. While the reservation prevents a membership transition,
it reads the exact current cohort, reruns the full census validator and returns:

```text
{
  reservationId,
  challenge,
  leaderLifecycleIncarnation,
  term,
  configurationKey,
  membershipGenerationIndex,
  release,
  census,
  queryDrainProof,
  deadlineAtMs
}
```

The reservation is per request, process-local and authority-free. It adds no
durable row or scheduler. It is released only by exact consume, caller deadline,
handler shutdown or leadership/lifecycle loss. Those failure releases cannot
open a dependent: they make consume return STALE/HOLD. Membership changes remain
blocked only within the inherited request window.

The dependent validates the full returned population, keeps admission paused,
and may write/read back its bound origin. Before RESUME it sends
`CONSUME_PARTICIPANT_RELEASE_PROOF` with the reservation/challenge and exact
origin readback. The control leader rereads its lifecycle, term and membership
under the still-held lane. Only an exact current match consumes/releases the
reservation and returns `CONSUMED`; any expiry, new generation, changed leader
or missing reservation leaves the dependent closed. The dependent resumes only
after `CONSUMED`. If origin committed but consume was lost/refused, later
recovery keeps that origin, obtains a fresh current reservation/census, and
tries consume again.

An old successful reply delayed across a same-leader membership change therefore
cannot open anything: its later reserve reads the new configuration, detects the
old release mismatch and returns STALE. A fresh release over all new voters and
learners may then reserve and consume. Once consume succeeds, the dependent
release linearizes before any membership change that was waiting on the lane;
that later change is a new topology event, not an older reply retroactively
becoming current. Cached topology supplies only the route to this interaction.

Required witnesses add the delayed old reply across same-leader ADD/REPLACE,
fresh full-population success, reservation deadline/shutdown, origin-committed
but consume-reply-lost recovery, and proof that no expired reservation resumes
admission.

### Round-three owner surface

The amended contracts change only these existing owners/interactions:

- `src/storage/data-directory-process-owner.js`: retained no-follow rendezvous,
  physical marker/identity and namespace durability;
- `src/bootstrap/startup-workflow-store.js` and
  `src/bootstrap/seed-startup-session-store.js`: immutable authorization,
  ordinary workflow/invocation and admitted effect CAS in one record;
- `src/bootstrap/pipeline/startup-pipeline-runner.js` and
  `src/bootstrap/bootstrap-service-seed-workflow.js`: shared thrown HOLD,
  distinct checkpoint placement and ordinary restart invocation;
- `src/admin/admin-websocket-message-dispatch-methods.js` and the existing admin
  timeout-budget owner: intent admission and configured admin deadline;
- `src/node/replica-create-admission-owner.js`: original workflow timestamp
  lifetime across rotations;
- `src/node/replica-handler-release-recovery.js`,
  `src/node/participant-release-authorization-owner.js`, and
  `src/node/replica-handler-participant-release.js`: one four-slot attempt
  owner, admitted effect callback and exact receipt consumption; and
- `src/raft/raft-rs-operation-port.js`, committed-membership read owner and
  `src/partition/partition-participant-release-facts.js`: transient current
  population reservation/consume under the existing membership lane.

No second semantic owner, durable ledger, retry timer or participant-count cap
is introduced. This amendment remains documentation only pending independent
design approval.

## Round-four executable amendment

The independently rejected round-three subject is preserved verbatim at
`evidence/design-participant-release-activation-authority-round3-9d1db249.md`,
SHA-256
`9d1db249459a699c1b937f519e164a6df5c0976fd714008214e9d1c40f109330`.
This amendment answers R3-1 through R3-7 in
`review-activation-authority-design-round3-cdc56.md`, SHA-256
`aed925c8e9e3a2e8a4196e6bd7b731be1dad04b895315c1e7bbadefb90141634`.
The first round-four correction before the recovery-cycle/readiness attacks is
preserved at
`evidence/design-participant-release-activation-authority-round4-fa0d2bea.md`,
SHA-256
`fa0d2bea6bed527dc176694f234f71ea64c2aca9159861beb5fddf4cee344408`.
It supersedes the reservation, scheduling, startup phase, wake, restore and
retained-install placement above. It adds no implementation approval.

### R3-1 and R3-2. Durable narrow transition reservation through RESUME

The current operation-port read and `membershipTransitionFence` do not provide
a cross-request reservation. The correction adds an explicit narrow contract
to the existing Raft membership-transition owner. It does not hold the whole
runtime `enqueue` turn. Ticks, messages, application proposals, committed apply,
status reads and leadership transfer continue; only
`PROPOSE_MEMBERSHIP_TRANSITION` for the control group is refused retryably while
the reservation is live.

The reservation is one bounded slot in the control partition's existing
`_participant_transaction_generation` owner row, replicated by fixed committed
release commands through the ordinary application transaction. It is not a
second origin, general lock table or operation ledger. The same row already
owns this partition's release origin and generation; the new nullable fields
only retain an unfinished transition exclusion:

```text
reservationId, reservationState,
dependentPartitionId, dependentReleaseId, targetBuildDigest,
controlReleaseId, controlConfigurationKey,
controlMembershipGenerationIndex, controlTerm,
controlLeaderLifecycleIncarnation,
dependentConfigurationKey, dependentMembershipGenerationIndex,
resumeInvocationId,
recoveryRemoveReplicaIdentity, recoveryRemovePeerId,
recoveryRemoveLifecycleIncarnation, recoveryRemovePermit,
deadlineAtMs, revision
```

States are `RESERVED`, `RESUME_DISPATCHED` and
`RECOVERY_REMOVE_AUTHORIZED`. Absence means no reservation.
All IDs are canonical primitive own strings; indices, term, revision and epoch
deadline are positive safe integers. One conditional committed command creates
the slot only when absent after the current full control census, schema/build
enforcement and existing release origin have been validated. Its applied
index/term plus the exact row revision are the reserve receipt. A replay must
match every field. A competing dependent receives `TRANSITION_RESERVED` with
the existing retry-after contract.

The participant-generation application owner exposes four fixed commands:

- `reserveParticipantReleaseTransition` conditionally applies and reads back
  that exact slot, returning `RESERVED`, `HELD`, `STALE` or `UNAVAILABLE`;
- `markParticipantReleaseResumeDispatched` conditionally moves the same slot to
  `RESUME_DISPATCHED` before any RESUME RPC is sent;
- `confirmParticipantReleaseResume` validates exact processed RESUMED receipts
  from the entire dependent cohort and atomically clears the slot; and
- `cancelParticipantReleaseTransition` clears a `RESERVED` slot only before
  dispatch, or clears `RESUME_DISPATCHED` only after the release owner has
  re-paused and observed the exact current dependent cohort closed.

The private control-partition operation-port construction receives one
synchronous `readParticipantReleaseTransitionReservation` callback bound to the
same application database. It returns a frozen exact row or typed unavailable;
it exposes no database, loaded module, reservation object or public control
capability. Every membership-transition proposal invokes that callback inside
its serialized proposal turn immediately before native actuation. A present
slot returns typed retryable `PARTICIPANT_RELEASE_TRANSITION_RESERVED`; an
unavailable/malformed read fails closed. Slot-clear/configuration-change wakes
the existing membership caller.

Reservation acquisition first observes zero pending native configuration
change and captures the committed configuration. After the reservation command
is applied, it rereads the same port. If a transition won before reservation
application, a changed configuration, generation, term or nonzero pending
configuration index makes the reservation `STALE`; the release owner cancels
it before dispatch and retries within the original deadline. Once the applied
reservation readback and unchanged native read agree, the synchronous proposal
gate prevents any later transition. A replacement leader reconstructs the gate
from its replicated application row before admitting membership proposals;
application-row unavailability keeps those proposals closed while ordinary
Raft protocol and application progress continue.

A permanently unavailable member cannot turn this gate into a recovery cycle.
After dispatch, the release owner first re-pauses every reachable member and
retains their exact closed pause/admission generations. If the unavailable
member is also the member whose absence blocks control-group recovery, the
ordinary leader/quorum absence owner may conditionally change the slot to
`RECOVERY_REMOVE_AUTHORIZED`, naming exactly that replica identity, peer ID,
lifecycle incarnation, current configuration/generation and REMOVE permit. The
operation-port gate admits only that one REMOVE, only while the durable slot
and native configuration still match, and still applies all ordinary removal
and quorum rules. ADD, PROMOTE, a different REMOVE, pressure/urgency labels and
caller assertions remain refused.

Committed removal advances the configuration, making every old RESUME for the
removed target stale at the recipient's current-membership/lifecycle check.
The release owner then rereads the new committed configuration, re-pauses its
current reachable cohort, and clears the slot. Replacement ADD occurs only
after that clear through the ordinary transition path. Source-own applied
absence remains the later port-stop/cleanup authority and never holds or
reacquires the membership lane. If quorum cannot commit the exact REMOVE, the
reservation stays typed HOLD; there is no solo-removal or timeout escape.

The dependent coordinator commits `RESUME_DISPATCHED`, then sends RESUME with
the exact reservation receipt, dependent release, attempt and each target's
current pause generation. A recipient performs the existing full release,
target lifecycle and local membership checks and opens admission with
`resumeInvocationId` in the same no-await final section. Its processed RESUMED
answer contains that invocation, pause generation and installed admission
generation. Transport ACK alone is insufficient.

Only a full exact receipt set permits the control owner to commit confirmation
and clear the reservation. Thus the membership fence remains replicated across
control leader loss and runtime replacement until actual dependent actuation is
known. A lost consume/dispatch reply is read back from the row. A lost RESUME
reply leaves `RESUME_DISPATCHED`; recovery inspects the exact cohort and either
replays the same invocation or re-pauses it. A lost confirmation reply reads the
cleared row and the committed command result. No deadline, shutdown or leader
loss blindly clears `RESUME_DISPATCHED`.

Deadline/shutdown may clear `RESERVED` before dispatch. After dispatch they arm
the existing release recovery owner, which closes the exact dependent cohort,
checks the current release/configuration and only then commits cancellation.
An unavailable member keeps the reservation and control membership transition
held; it never grants resume. The injected-clock one-shot timer merely wakes
this reconciliation and is unref'd. Shutdown/restart reconstructs from the
replicated row rather than a volatile timer.

A delayed RESUME after confirmation is safe only for the same still-open local
service and exact `resumeInvocationId`; it is an idempotent readback. A restart,
new pause, lifecycle replacement or dependent membership change changes the
target/pause/admission fence and rejects the old request. Cancellation never
claims that every network delivery was drained. It establishes a later durable
pause/admission generation on each current member; for an unreachable removed
member, committed absence plus lifecycle/configuration mismatch makes its old
request inadmissible. The owner clears only after rereading those exact facts.
This closes leader-loss, expiry and delayed reply schedules without treating a
final ACK or elapsed quiet period as authority.

Required schedules cover normal membership proposal refusal while ticks and
application commits progress; same-leader ADD/REPLACE during delayed RESUME;
control leader loss before and after dispatch; deadline before dispatch and
between processed replies; lost RESUME and confirmation replies; restart
reconstruction; re-pause cancellation; and exact slot-clear wake of the queued
transition. All reuse the existing transition and release owners.

### R3-3. Control-first nonrecursive scheduling and bounded fairness

`createParticipantReleaseRecovery` remains the only node release scheduler,
but a dependent never occupies a running cohort slot while waiting for control
release. Pending work is classified as control, foreground dependent
(seed/operator/CREATE) or background dependent. The canonical control partition
singleflight runs first using one of the existing four slots. Until its exact
current CUT_OVER result is read, dependent entries stay pending and consume no
running slot. A local dependent joins that control singleflight; it never
recursively asks the same owner for another slot.

After control release, at most four dependent cohort phases run. The pending
map continues to coalesce by partition and now retains earliest acceptedAt,
class and absolute deadline. On each capacity release, the oldest foreground
entry runs first; after at most three foreground dispatches, the oldest due
background entry runs if one exists. A newly required control refresh preempts
the next dispatch but never an executing cohort. This preserves foreground
progress and prevents background starvation without a force/urgency bypass.

Queue wait, control release, discovery, drain, reopen, origin, reservation and
resume all consume the caller's original absolute deadline. Dispatch never
renews it. Expired pending work returns its typed retained debt/closed-admission
result. Capacity release synchronously arms the existing coalesced dispatcher;
shutdown rejects foreground waiters, retains durable commands/origins, and
stops background retries. The queue remains bounded by one entry per locally
hosted partition plus accepted sequential operator/seed plans; no request body,
census or promise is retained in a pending entry.

The saturation witness fills the four slots, injects dependent/background and
foreground CREATE work, and proves: the control singleflight completes before
dependents consume capacity; no recursive wait exists; foreground gets the
first released slot; background gets one by the fourth dispatch; no more than
four cohort phases run; and every expiry retains admission closed.

### R3-4. Reachable closed-admission startup cut

Participant mutation admission stays closed from service construction. Normal
startup is split before registration writes rather than holding all hydration
behind activation:

1. **Bootstrap founder initialization.** Initialize the declared seed/join
   founder message group and initial system partitions through their existing
   identity-specific owners. Ordinary retained message-group learner CREATE
   artifacts are not members of either founder batch and are not opened by a
   generic partition factory. A conflict on one of those required founder or
   system-partition identities remains its existing typed startup failure; it
   is never reclassified as C3 retained CREATE debt.
2. **Read-only startup recovery.** Acquire the existing early SQL engine and
   handler, read local authoritative system partitions, construct the
   `BootstrapTopologySnapshotOwner` from actual hosted services, hydrate cache
   projections, subscribe to system-table CDC, and replay already committed CDC
   obligations into the cache. These steps may read consensus/application state
   and deliver committed effects; they cannot issue registration/user writes or
   mark external readiness.
3. **Activation.** Resolve the actual control leader from hosted authoritative
   service facts or the existing owner-RPC route over already admitted/outbound
   control connections. The cache is only a projection/hint. Perform participant
   release under the shared startup invocation while mutation admission remains
   closed.
4. **Registration writes and normal mode.** Only after activation origin and
   release are durable may seed/join registration writes run. Then finish CDC
   readiness, normal routed wiring, message-group activation and external
   readiness.

For a genuine first seed, the locally founded control partition and immutable
birth authorization provide the noncircular route; no NODES row is required to
release before the first registration writes. For an existing-origin restart,
local authoritative reads or owner RPC discover the already published control
leader and retained origin. For a join, seed contact and the registered internal
handler supply authoritative owner RPC before membership/READY writes. Missing
metadata, empty cache or an unavailable remote leader stays HOLD.

The existing cache-hydration phase is split at its real operations:
`hydrateFromLocalPartitions`, projection verification and CDC subscription/
committed replay may run in the closed-admission recovery cut; write-leader
publication, registration, normal CDC/routed wiring and external readiness
remain after activation. No cache row grants release or origin authority.

The required multi-node restart witness uses a remote control leader and a
nonempty voter+learner cohort. It shows authoritative discovery, cache
projection and CDC committed replay progress while an ordinary user write is
refused, then the same held activation releases and registration writes proceed.

### R3-5. Exact wake map into the existing owner

Every HOLD records `missingFact` and registers one coalesced key
`[partitionId, invocationOrCommandId, deadlineAtMs]` with the existing recovery
owner. Registrations contain identity/deadline only and are removed on terminal
result, supersession or shutdown. Producers and subscribers are fixed:

| Missing fact | Existing owner event | Subscriber/reentry |
| --- | --- | --- |
| startup/command/effect revision | `StartupWorkflowStore` successful revision CAS | seed/operator adapter enqueues the exact command partition |
| hosted service or handler | ReplicaHandler service lifecycle and handler-registration completion | release recovery enqueues hosted partition |
| local role/configuration | existing consensus event | release recovery enqueues partition |
| authoritative route/leader | `BootstrapTopologySnapshotOwner` publication from owner read/CDC | startup release adapter enqueues exact held partition |
| remote membership population | processed control reserve/census result or topology CDC revision | control singleflight and dependent key reenter |
| running capacity | recovery owner `finally` removes running entry | dispatcher arms immediately |
| transition reservation cleared | committed control slot-clear application event | membership caller and held release key reenter |
| retained message-group CREATE authority | canonical replica-operation repository revision or current NODES publication | handler recovery enqueues the exact operation ID |
| retained message-group artifact pressure | no durable authority changes; the existing fallback timer retries the same operation after `SQLITE_BUSY`/`SQLITE_LOCKED` or local claim pressure | handler recovery enqueues the exact operation ID without inventing a filesystem event |

Join still consumes retryable HOLD through its existing outer loop. Seed's exact
HOLD branch preserves the same checkpoint/resources and uses the same enqueue
signal. Admin/operator waits on its accepted command result. Background work
returns immediately and relies on the keyed wake. The existing one-second
unref'd recovery timer remains the fallback; no event adds a timer or scheduler.
Every callback revalidates workflow/invocation/boot, command revision, partition
and shutdown before enqueue. A stopped or spent invocation logs its exact key
once and retains durable debt.

Witnesses fire every real event before the timer and prove one reentry. Missing
event delivery is paired with fallback recovery. Superseded invocations and
post-shutdown callbacks perform no enqueue or mutation.

### R3-6. Unsupported restore stays a conflict

The physical device/inode/marker tuple authorizes automatic restart only on the
same original directory instance. Copied, recreated, restored or ambiguous
storage returns typed `STORAGE_CONFLICT` and preserves every byte. There is no
operator restore workflow in this contract. A future backup/restore/PITR surface
requires its own reviewed owner and cannot be inferred from an operator release
command. The paired witness is original same-directory restart success versus
copied/recreated/operator-presented ambiguous storage refusal with no birth.

### R3-7. Retained message-group learner recovery on its real CREATE path

The round-three finding correctly proves that
`recoverPendingSnapshotInstall` has no production caller. Its proposed startup
collision, however, joined two different storage paths. The only current boot
call to `resolvePendingSnapshotInstall` is
`PartitionService.initialize` in `partition-service-raft-init-base.js`. Seed's
`SeedPartitionsPhase` supplies only the hard-coded initial system-partition
identities to that factory. FreshMG's retained learner install is created by
`message-group-learner-join.js` with a message-group database and checkpoint
root, and the seed founder `mg-1` is constructed separately by
`SeedMessageGroupsPhase`. A retained ordinary message-group learner therefore
cannot make the system-partition batch consume its marker. The correction does
not add a generic PartitionService preflight, a cross-service deferred replica
registry, or a ReplicaStateMachine alias for message-group CREATE authority.

The demonstrated FreshMG stop is earlier on its own CREATE path:
`message-group-learner-join.js` calls `existingTargetArtifacts` before install,
and that check currently refuses an existing target database, install marker or
staging directory. Only exact absence reaches `installLearnerImage`, which calls
`requestSnapshotInstall`; only its `INSTALLED` result reaches `openLearner` and
then `MessageGroupService.initialize`. That initialize opens the message-group
database through `openMessageGroupConsensusPort` and has no pending-snapshot
resolver. The missing recovery caller must replace this retained-artifact
refusal under current CREATE authority. A generic partition-init
`INSTALL_STATE_CONFLICT` is a separate fail-closed case, not a demonstrated
Fresh marker reproducer.

The two classes remain explicit:

- **Initial system partition or founder conflict.** The existing
  identity-specific seed/join factory owns it. A snapshot conflict at that
  exact required identity fails that service closed. It cannot be relabelled as
  an ordinary retained FreshMG learner, skipped to obtain readiness, or used as
  fresh-storage evidence.
- **Ordinary retained message-group learner CREATE.** Its durable
  `replica_operations` row is the enumeration owner. Once the canonical
  repository and current NODES boot are available, the one registered
  `MessageGroupServiceHandler` calls
  `recoverRetainedMessageGroupLearnerCreates()`, snapshots exact outstanding
  message-group admissions, and runs each operation under the existing
  `ReplicaCreateAdmissionOwner.runExclusive(operationId)` lane. It derives the
  database/checkpoint paths from that operation's exact target identity; it
  never discovers authority by walking files or accepting a marker alone.

For each operation the handler takes over the retained CREATE for the current
boot, rereads the exact operation/target/attempt/learner-origin/physical
generation, obtains the sole physical worker claim, and only then asks the
snapshot-install owner to classify and recover the known target paths. This
supersedes `existingTargetArtifacts` only for that exact retained operation;
it is not a broad existing-file allowance. Authentic
STAGING, STAGED, INSTALLED-marker and installed-binding states resume through
`recoverPendingSnapshotInstall` under `commitSnapshotInstall`. Exact absence
resumes ordinary descriptor acquisition and `requestSnapshotInstall`. Foreign,
malformed, legacy, successor or ambiguous bytes return the existing typed local
CREATE recovery conflict and preserve every artifact. Snapshot-install remains
the sole image, binding, swap and installed-evidence owner; repository rows and
markers never substitute for each other.

The handler does not construct or initialize the `MessageGroupService` before
that authenticated result. After the installed image is validated, the same
learner-join owner constructs one joining service, registers its transport,
calls `MessageGroupService.initialize`, observes its committed learner origin,
and adopts it into the canonical message-group service map. Lost answers reread
the same operation and installed evidence. Shutdown, deadline and retired-boot
callbacks cannot open, clean or adopt it.

Seed composes the learner-join host and canonical operation repository into the
single handler created in `CONTROL_PLANE_READY`. After
`registerSeedNodeWithControlPlane()` has published the current boot it invokes
the retained-CREATE recovery method once before completing the checkpoint. Join
does the same after `MEMBERSHIP_WRITTEN` and message-group row activation, at
the start of `READY_LEASE_ASSIGNED`. Both consume the shared durable startup
invocation and original absolute deadline; neither creates a new scan, worker,
timer or authority.

An ordinary retained learner is operation-local debt, not a bootstrap service
or participant-activation prerequisite. `RECOVERED` opens that target once.
`HELD`/local conflict keeps it absent, unroutable and mutation-closed, registers
its exact operation ID with the existing background recovery owner, and permits
the node checkpoint to complete when all independent bootstrap readiness facts
are satisfied. It does not throw `STARTUP_CHECKPOINT_HELD` or withhold the
node's READY lease. Only the earlier participant activation obligation may hold
the shared startup checkpoint. A conflict at an actual founder or initial
system-partition identity remains the existing service-specific startup
failure; it is not classified as ordinary C3 debt.

This placement allows the seed founder, initial system partitions, closed-
admission cache/discovery work and current NODES publication to proceed because
none opens the retained ordinary learner target. It does not weaken a genuine
founder/system-partition conflict. General application-partition snapshot
provenance remains the separate SN1 authority stop: the existing
`PartitionService.initialize` conflict stays fail-closed, and this activation/
C3 interaction claims no recovery or cleanup authority for it.

Production witnesses enter through `startLagrangeRuntime` using
`public-binding-seam-harness.js`, not a direct recovery helper. They first drive
an ordinary learner CREATE through the real handler and interrupt its real
message-group target separately at STAGING, STAGED and post-rename INSTALLED.
Restart must initialize the founder and system partitions, publish the current
boot, reach the registered handler automatically, take over the same operation,
and either open exactly one learner or register one operation-local background
hold while the healthy node reaches READY. Releasing the named fact must then
open that target through the same owner without another user action. A paired
initial system-partition conflict must
still fail closed, proving the witness did not teach the generic partition
initializer to defer or accept retained application snapshot bytes. Foreign
message-group artifacts remain a conflict on that target while unrelated
healthy services retain progress.

### Round-four owner surface and disposition

R3-1 and R3-2 are addressed by the explicit replicated single-slot transition
reservation, dispatched-before-RPC state and processed-resume confirmation.
R3-3 is addressed by control-first slot admission and bounded class fairness.
R3-4 moves only read-only/already-committed recovery before activation and keeps
registration writes closed. R3-5 binds each HOLD to a real owner event plus the
existing timer. R3-6 removes the unsupported restore claim. R3-7 wires the
missing retained message-group CREATE recovery caller on its actual handler/
learner-join path, separates it from the initial system-partition initializer,
and leaves image/CREATE decisions with their existing owners.

Required implementation endpoints are the release recovery/cutover owners,
participant generation store and committed application commands, the narrow
operation-port membership-transition gate, startup seed/join phase composition,
topology/CDC event producers, the seed/join message-group handler composition,
`ReplicaCreateAdmissionOwner`, message-group learner-join owner and
snapshot-install recovery owner. Impact
registration and generated classifications must move with those endpoints.

No raw Raft object, public control capability, new global barrier, second
origin, general lock ledger, retry scheduler or cache authority is introduced.
Source remains held pending independent review of this exact amendment and its
linked C3 checkpoint correction.

## Round-five dependent fence and reachable early recovery correction

The independently rejected round-four subject is preserved verbatim at
`evidence/design-participant-release-activation-authority-round5-ed489861.md`,
SHA-256
`ed489861e905f1cbdc982d02072679c2709874f0370b881984b0a1f50ebbdc3c`.
This amendment answers R4-1 through R4-5 in
`review-activation-authority-design-round4-marker.md`, SHA-256
`295ff3d8a18c4a474c87d1fea9789ee78d1ca51960eacb1671974c9a7d9dd30e`.
It supersedes only the round-four transition-slot, recovery-preflight, early
hydration and numeric-domain clauses. The physical-birth, startup-command,
absolute-deadline, pause/settle/drain/origin, operator, C3 and ordinary
post-registration verification contracts remain in force.

### R4-1. RESUME is a dependent committed command

A RESUME delivery never opens a replica directly. `ReplicaHandler` accepts the
fixed request only as a proposal to the named dependent partition's existing
committed application owner. That owner extends the partition's existing
`_participant_transaction_generation` row with a durable pause generation and
the last applied release authorization. `PAUSE_PARTICIPANT_ADMISSION` and
`RESUME_PARTICIPANT_ADMISSION` are ordered by that dependent partition's own
Raft log and applied by its participant-generation application transaction.
Both are internal control commands and remain admissible while user mutation is
closed.

`PAUSE_PARTICIPANT_ADMISSION` advances the durable pause generation and clears
the applied authorization. `RESUME_PARTICIPANT_ADMISSION` carries the exact
control authorization ID and revision, dependent partition and release IDs,
expected durable pause generation, dependent configuration key and membership
generation, target build digest, target replica identity and target lifecycle
incarnation. It applies only when every captured field still matches and then
records the authorization before changing the local admission projection.
The apply result is `RESUMED`, `STALE`, `HELD`, `UNAVAILABLE` or `INVALID` and
contains the dependent applied index/term and resulting pause/admission
generation. An RPC ACK, handler return, proposal acceptance or receipt from a
different partition is never a processed result.

This command ordering is the recipient-consumed fence. A request withheld
until after a later PAUSE reaches the current dependent leader is rejected by
its stale expected generation. A request sent to an isolated former leader can
neither commit nor open admission; opening occurs only in committed apply. If
that replica later catches up, it consumes RESUME and the later PAUSE in log
order while ordinary writes remain subject to the existing current-leader and
commit fence. It finishes closed. Recovery may also commit a new PAUSE after
an uncertain RESUME; the newer generation supersedes that authorization on
every replica which can again participate in a quorum.

The transition row keeps the identities separate:

```text
controlPartitionId, controlReplicaIdentity, controlPeerId,
dependentPartitionId, dependentReplicaIdentity, dependentPeerId,
dependentPauseGeneration, resumeAuthorizationId, resumeAuthorizationRevision
```

A control replica REMOVE therefore never pretends to change the dependent
configuration. Leader/quorum committed absence of a control replica can release
the control membership lane under the recovery rule below. Source-own applied
absence remains the later port-stop/cleanup authority. Neither is used as a
dependent PAUSE receipt.

The required delayed-delivery witness holds an old RESUME in the real router,
commits a newer dependent PAUSE while separately withholding the control REMOVE
from a still-running process, removes the named control replica, then delivers
RESUME first. The dependent stays closed. The witness uses different control
and dependent replica identities on the same node and proves a current
authorization can later commit and resume through the same owners.

### R4-2. A full census becomes one admitted resume obligation

The control slot states are now `RESERVED`, `RESUME_AUTHORIZED`,
`RESUME_DISPATCHED` and `RECOVERY_REMOVE_AUTHORIZED`. A `RESERVED` row is only
an exclusion and cannot authorize dependent RESUME. Immediately before
authorization, the release owner rereads the complete control cohort through
the existing release-census owner and requires exact current member identities,
configuration/membership generation, leader and term, member lifecycle
incarnations, installed build/content digests, schema/enforcer facts and
connection census. Any change since reserve returns `STALE`, leaves admission
closed and repeats census inside the original absolute deadline.

`authorizeParticipantReleaseResume` is a fixed conditional command on the same
control row. It requires that fresh census and the unchanged reserved slot, and
commits its canonical census digest plus `resumeAuthorizationId`, revision and
dependent command binding as `RESUME_AUTHORIZED`. This linearization changes
the authority contract explicitly: the exact current cohort is required when
the control group admits the resume obligation. Once committed, an ordinary
later control leadership transfer or member restart does not revoke the owed
effect or strand a half-authorized dependent; the obligation must either commit
the bound dependent RESUME or be superseded by a later committed dependent
PAUSE. It does not authorize another release, build, lifecycle or partition.

This does not let an old census authorize. A control leader/member change while
the row is only `RESERVED`, or before the authorization command commits, makes
the candidate stale and forces a new full census. Thus the required delayed
schedule has two boundaries: delay a RESERVED attempt across leader loss or a
member restart and prove it cannot emit RESUME; then collect the new complete
census and commit `RESUME_AUTHORIZED`. Delay that admitted command afterwards
and prove recovery completes the same obligation rather than recertifying an
old observation as current.

`markParticipantReleaseResumeDispatched` moves only that exact authorization
to `RESUME_DISPATCHED` before transport. `confirmParticipantReleaseResume`
clears it only after the dependent committed result names the same authorization
and command binding. A restarted dependent service starts closed; a previously
applied authorization is not replayed into a new lifecycle. Recovery must
commit a new PAUSE generation, obtain a current control authorization and bind
a new RESUME to the new dependent lifecycle. These rules preserve the
current-cohort requirement for every new service without requiring a volatile
control process to remain alive after admitting an effect.

The application owner therefore has six explicit transitions:
`reserveParticipantReleaseTransition`,
`authorizeParticipantReleaseResume`,
`markParticipantReleaseResumeDispatched`,
`confirmParticipantReleaseResume`,
`authorizeParticipantReleaseRecoveryRemove` and
`cancelParticipantReleaseTransition`. Every transition conditionally applies
and reads back the exact revision. The new recovery-remove command returns
`AUTHORIZED`, `HELD`, `STALE`, `UNAVAILABLE` or `INVALID`; it requires the
current slot, the exact control replica/peer/lifecycle and ordinary REMOVE
permit, leader/quorum committed absence for that control replica, and a newer
committed dependent PAUSE proving the uncertain resume is superseded. The
operation port permits only that REMOVE. ADD, PROMOTE, a different REMOVE and
caller urgency remain refused.

### R4-3. Zero-slot transition reconciliation precedes control release

`createParticipantReleaseRecovery` remains the one scheduler. It gains a
`reconcileParticipantReleaseTransitionSlot(controlPartitionId)` preflight
before ordinary control CUT_OVER eligibility and before any of the four cohort
slots are acquired. Startup, control-leader election and application of a slot
revision coalesce this preflight by `[controlPartitionId, reservationId]`. It
reads the one replicated generation row, consumes zero cohort capacity and
never calls ordinary control release recursively. Its typed results are
`NONE`, `RECONCILED`, `HELD` and `CONFLICT`.

The preflight reconstructs each durable state without JS history:

- `RESERVED` is revalidated against current control facts and either proceeds
  to a fresh authorization or is conditionally cancelled before dispatch.
- `RESUME_AUTHORIZED` and `RESUME_DISPATCHED` query the dependent partition's
  committed generation row. An exact applied result is confirmed. Otherwise
  the preflight commits a newer dependent PAUSE and then either retries a fresh
  authorization or conditionally cancels.
- `RECOVERY_REMOVE_AUTHORIZED` continues only the named control REMOVE through
  the existing operation port, then rereads the committed control configuration
  and dependent PAUSE before clearing the slot.

If the dependent quorum cannot commit the superseding PAUSE, the slot remains
`HELD`; expiry, missing ACK and unreachable transport do not clear it. This can
delay the one control membership transition, but it does not block Raft ticks,
application apply, control reads, release census or healthy unrelated startup.
Replacement/removal that depends on the held lane cannot bypass the debt. The
leader/quorum absence exception is available only after the independent
dependent PAUSE proof, so it does not form a release/remove cycle.

Caller deadline bounds new discovery and dispatch. A committed authorization
is a retained effect obligation and survives caller expiry until confirmed or
superseded safely. With all four ordinary slots occupied and a replacement
leader with empty JS state, this zero-slot preflight must still reconstruct and
settle the row. Only after it returns `NONE` or `RECONCILED` may the normal
control-first four-slot schedule evaluate control release.

### R4-4. Two pre-registration read and CDC cuts

The pre-registration cut no longer calls the normal
`hydrateFromLocalPartitions`/`verifyCacheHydration` pair. That pair keeps its
current local-leader and nonempty PARTITIONS/SERVICES/TABLES/MESSAGE_GROUPS
requirements and runs after registration. Empty registration tables are valid
only in the genuine first-birth branch; they never prove freshness, cohort
population or release.

For **genuine first birth**, the existing physical-birth record and durable
seed startup job bind the hard-coded initial system-partition and founder
identities. Their actual local service/operation-port facts provide the early
read source. The early criterion is: every required local initial service is
open under that identity; the control partition has its real committed leader,
configuration and release facts; its schema/build/enforcer checks pass; and
the locally founded operational message-group ingress is selected. The seed
subscribes those local partitions through the existing
`PartitionService.subscribeToCDCWithHandshake` owner and retains each exact
subscriber ID, subscription epoch and replay result. Zero registration rows and
zero replay are expected observations only after birth and service authority
have been proved. Activation may then run, followed by registration writes and
the unchanged normal hydration, projection verification and CDC readiness.

For an **existing-origin restart or join**, local leadership is not required.
The early SQL engine and `BootstrapTopologySnapshotOwner` publish only route
inputs. The canonical `BootstrapAPI.executeBootstrapControlPlaneQuery` gateway,
with `CONTROL_PLANE_RECOVERY_ELIGIBLE`, uses the existing query transport and
authoritative remote leader to read current PARTITIONS, SERVICES, TABLES,
MESSAGE_GROUPS, release origin and unfinished release/CDC obligations. The
seed-contact/control target candidates and current service facts select the
route. A cache row is never the answer, and empty, unavailable, paged or
revision-inconsistent results remain HOLD.

Remote original CDC catch-up is a bounded transport adapter to the existing
owner, not a second CDC ledger. A fixed
`SUBSCRIBE_BOOTSTRAP_RECOVERY_CDC` request is routed over the same admitted
bootstrap query transport to the exact current partition leader. Its handler
calls that leader's existing `subscribeToCDCWithHandshake` and returns the
handshake identity and catch-up bounds; replay events flow through the existing
`PartitionCdcPropagationSubscriber` and the operational message-group ingress
selected by `resolveOperationalMessageGroupSelectionAsync`. A missing handler,
redirect, absent leader, unavailable strict-forward ingress, provisional replay
or mismatched subscription epoch returns HOLD. Transport ACK does not complete
the cut. No preseeded cache, direct helper or fabricated event is accepted.

This early route is allowed only while ordinary user mutation remains closed
and consumes the existing startup invocation deadline. It establishes the
authoritative snapshot plus original committed replay needed to evaluate
activation; it does not mark ordinary CDC or external readiness. After
activation, registration resumes and the existing local hydration,
`verifyCacheHydration`, per-partition subscriptions, routed wiring and normal
CDC readiness run unchanged. The normal `startLagrangeRuntime` witnesses are a
first seed with genuinely empty registration tables and an existing-origin
restart with a remote control leader plus nonempty voters/learners. Both must
reach these real routes without a preseeded cache or direct recovery call.

### R4-5. Canonical numeric domains

`controlMembershipGenerationIndex` and
`dependentMembershipGenerationIndex` accept primitive safe nonnegative
integers, including canonical `+0`; `-0` is rejected. A founder generation of
zero remains valid until a real ConfChange. Applied reserve/authorization/
dependent command indices, terms, row revisions and authorization sequence
numbers retain their owner-defined positive safe-integer domains. Deadlines
retain the existing absolute epoch domain. All fields reject unsafe integers,
fractions, nonfinite values, boxed values, accessors and coercion. Validation
captures each own primitive once before hashing or comparison.

The paired witness reads generation zero from the real founder membership
owner, completes reserve, authorization and dependent committed RESUME without
an artificial ADD/REMOVE, and separately rejects negative zero, negative,
fractional, unsafe, nonfinite and boxed boundary values.

### Round-five scope and proof ceiling

The correction changes no source and grants no implementation authority. Its
future implementation endpoints are the existing participant generation
application owner, release recovery/cutover owners, narrow membership operation
port, bootstrap control-plane query transport, partition CDC handshake owner
and operational message-group ingress. Impact contracts and generated
classifications must move with those endpoints.

The production proof must retain the delayed-router/configuration schedule,
control/member restart boundary, four-slot crash reconstruction, real first
seed, remote-leader existing-origin restart, original committed CDC replay and
authentic founder generation zero. It must keep application mutation closed
until the exact committed dependent RESUME applies. This adds no public Raft
object, global readiness barrier, second origin, release ledger or scheduler.
Source remains held pending independent review of this exact amendment and the
linked C3 reference.

## Round-six trace correction

The unvetted round-five subject is preserved verbatim at
`evidence/design-participant-release-activation-authority-round6-e986d178.md`,
SHA-256
`e986d1782ee7005565ee57f7c1a53980c4807fd23b52c00d76c7869ccf384718`.
This short correction supersedes the round-five census linearization,
recovery-REMOVE proof order, dependent apply predicate and post-registration
remote hydration clauses. It leaves the five finding dispositions and proof
population unchanged.

### One durable decision point, without continuous freshness

The slot's `RESERVED` state now contains a random owner-generated
`censusNonce`, the exact control configuration key and membership generation,
and an initially empty canonical member-share set. It continues to exclude
membership transitions, but does not freeze Raft progress, processes or
connections.

For every replica in that fixed control configuration, the current
ReplicaHandler asks the actual local release-facts owner to issue one
`READY_TO_AUTHORIZE` share. Issuance consumes the member's exact replica/peer
identity, service lifecycle incarnation, runtime generation, connection
generation, installed runtime/build/body digest, schema/enforcer version,
release origin and drained generation. The share binds those facts to the
reservation ID, census nonce,
control configuration and dependent release command. It is an irrevocable vote
to finish that one already-drained release generation, not a claim that the
process will remain alive afterwards. A handler cannot issue a share for a
different local identity or from cached/caller-supplied facts.

`recordParticipantReleaseCensusShare` is a fixed committed command on the same
control generation row. It conditionally records one strictly validated share
for a member of the reserved configuration. Exact duplicate application is
idempotent; a different share for the same member or a changed configuration,
membership generation, reservation or census nonce returns `STALE` or
`CONFLICT`. The existing membership-operation callback still checks the slot
inside its serialized proposal turn, so no configuration change can interleave
with share accumulation.

Application of the final required unique share atomically changes the slot to
`RESUME_AUTHORIZED` and assigns its authorization ID/revision. That committed
application is the only release decision point. It consumes a bounded canonical
share from every member of the exact current configuration; there is no
check/await/commit gap after a separate census. The member-share array is dense,
sorted and unique under the existing membership cardinality bound. It is stored
in the existing generation row, not a new ledger.

The decision deliberately survives later leadership, lifecycle, connection or
build changes. Those changes cannot alter the already admitted effect, just as
a process restart cannot revoke a committed transaction decision. A member
which changes before issuing its share must issue under its new current facts.
A member which changes after its share has voted remains represented by that
durable vote for this authorization only. Every newly constructed dependent
service still starts closed: an old authorization cannot open a new dependent
lifecycle, and recovery needs a new PAUSE generation and new authorization for
that lifecycle. Thus “current cohort” means the exact membership generation
whose members each durably voted from their own current owner facts; it does
not promise impossible continuous distributed freshness until network delivery.

The six control-row transitions are therefore
`reserveParticipantReleaseTransition`,
`recordParticipantReleaseCensusShare` (the final share authorizes),
`markParticipantReleaseResumeDispatched`,
`confirmParticipantReleaseResume`,
`authorizeParticipantReleaseRecoveryRemove` and
`cancelParticipantReleaseTransition`. The separate
`authorizeParticipantReleaseResume` named in round five is removed.

The decision-point witness pauses before the last share, changes a member
lifecycle and proves the old member cannot supply the missing share. It then
records the new lifecycle's share and linearizes exactly once. A second schedule
changes a member after its share and proves the already authorized exact effect
finishes without treating the changed member as a fresh dependent-service
release. Configuration changes remain refused until the slot settles.

### Deterministic dependent state and local admission projection

Committed dependent commands never branch on a replica's local runtime state.
`PAUSE_PARTICIPANT_ADMISSION` deterministically advances the replicated pause
generation and clears the replicated authorization set. A target-specific
`RESUME_PARTICIPANT_ADMISSION` deterministically validates only replicated
fields: partition/release/origin, expected pause generation, dependent
configuration and membership generation, control authorization ID/revision,
target identity and the canonical target manifest. It records the same sorted
target authorization entry and command result on every replica. The entry is

```text
replicaIdentity, peerId, lifecycleIncarnation, runtimeGeneration,
connectionGeneration, buildDigest,
authorizationSequence
```

and the bounded set uses the dependent group's existing membership cardinality.
No SQLite apply result reads `this` replica's process identity, WeakMap,
connection, role or loaded runtime. This preserves deterministic replicated
apply and Invariant 0.

After that row transition applies, the local participant admission projection
runs separately. Only the replica named by the target entry may compare the
captured entry once with its actual local replica/peer/lifecycle/build facts,
current committed dependent membership and applied pause generation. A match
opens that service's volatile admission projection and returns a local
`OPENED` receipt containing the authorization, target entry, applied command
index/term and new local admission generation. Other replicas record the same
durable row and remain unchanged locally. A mismatch stays closed and returns
`STALE`; it never changes the committed result.

The release owner authorizes and confirms followers one at a time, performs the
existing leader-transfer step, then authorizes the former leader. Its exact
canonical receipt set must cover every entry in the captured dependent cohort;
count equality alone is insufficient. `confirmParticipantReleaseResume`
records that set's digest and clears the control slot only after every local
receipt binds the same durable command and lifecycle. Lost receipts leave the
slot recoverable. Restart clears the local projection, so old durable target
authorization is readback evidence only and never auto-opens the new service.
A later committed PAUSE closes every local projection on apply and clears all
target entries deterministically.

### REMOVE authorization precedes REMOVE; absence follows it

`authorizeParticipantReleaseRecoveryRemove` no longer requires the result of
the REMOVE it authorizes. Its preproposal proof is: the exact live slot and
reservation revision; a newer committed dependent PAUSE which supersedes every
uncertain target authorization; the current control configuration still
containing the named control replica/peer/lifecycle; the existing leader/quorum
owner's target-unavailable determination; no pending ConfChange; and the
ordinary exact REMOVE permit for that configuration and membership generation.
Its typed `AUTHORIZED` result opens only that one operation-port REMOVE.

After native proposal and committed application, the membership owner rereads
the new configuration and generation. Only this readback establishes
leader/quorum **committed absence** of the named control replica. Slot clear
then requires that postcommit absence plus the still-current dependent PAUSE.
If proposal or apply is unknown, the row stays
`RECOVERY_REMOVE_AUTHORIZED` and recovery reads native/committed state; it does
not issue a competing removal. Source-own applied absence remains a later,
independent port-stop and cleanup prerequisite. This separates the preproposal
permit, postcommit membership fact and local cleanup fact without a cycle.

### Normal hydration retains one owner and supports remote leaders

After activation and registration, `SeedCacheHydrationPhase` remains the sole
normal hydration owner and `verifyCacheHydration` remains unchanged. Its read
step is corrected rather than bypassed: for each required system table it uses
the current local-leader read when one exists; otherwise the same phase calls
the canonical `BootstrapAPI.executeBootstrapControlPlaneQuery` gateway with
`CONTROL_PLANE_RECOVERY_ELIGIBLE` and the authoritative route established by
the early existing-origin cut. The remote answer must be complete, unpaged and
bound to one partition/configuration/applied revision before this owner applies
it to the cache. Redirect, route loss, revision change, partial rows or
unavailable authority remains HOLD inside the original startup deadline.

The same local-or-canonical-remote selection applies to the normal CDC
handshake: local partitions use `subscribeToCDCWithHandshake`; a remote leader
uses the fixed bootstrap recovery CDC adapter and actual operational
message-group ingress already named in round five. After each handshake and
replay completes, the unchanged normal verifier requires the real nonempty
registration projections. No cache row selects itself as authority, no local
leader is fabricated, and no alternate hydration owner or global readiness
barrier is introduced.

Source remains held. Independent review must use this round-six subject and the
linked C3 hash, and future proof must include the last-share lifecycle race,
deterministic follower replay, preproposal REMOVE versus postcommit absence and
postregistration hydration with a genuinely remote system-table leader.

## Round-seven bounded correction

The independently rejected round-six subject is preserved verbatim at
`evidence/design-participant-release-activation-authority-round7-435332bf.md`,
SHA-256
`435332bfcca8bb04deffffd93c74b05d90ddbca90815ebc79613158b8a09ee23`.
This section answers R5-1 through R5-4 in
`review-activation-authority-design-round5-marker.md`, SHA-256
`29c806f9f924dd053c3f4b78df31da3f81c23ee220d63d16d2f688797cf2286b`.
It supersedes the round-six partial-share lifetime, zero-slot resource,
resume-order and remote-startup producer clauses. A complete persisted
`RESUME_AUTHORIZED` decision still survives later restart. Partial observations
do not.

### R5-1. Authoritative incarnation retirement is serialized with authorization

The current runtime has three real fact producers, which this proposal does not
collapse into a census reread:

- `ReplicaHandler`'s `TrackedServiceRegistry` is the publication/retirement
  boundary for a tracked service instance. Its `set`, `delete` and replacement
  paths already relay service changes, and its consensus relay publishes term,
  leader and applied-configuration changes.
- `stampParticipantConnection` is the owner that issues a new participant
  connection generation when the lifecycle owner opens a database connection.
- the partition operation port's `readStatus` owns lifecycle incarnation and
  runtime generation. `participantCutoverPauseOf` already closes a local OPEN
  projection when those facts, term, leader or configuration change.

Those producers currently wake recovery but do not serialize a remote
incarnation retirement with the control row. The required implementation
expands their release contract explicitly. The existing control generation row
stores, inside the current transition slot, one canonical `memberClaim` per
fixed control member:

```text
replicaId, peerId, nodeId,
ownerIncarnation, lifecycleIncarnation, runtimeGeneration,
connectionGeneration, admissionGeneration, buildDigest,
claimRevision, claimState
```

`claimState` is `CURRENT` or `RETIRED`. A `READY_TO_AUTHORIZE` share names the
exact CURRENT claim revision. It is a durable partial observation, not an
irrevocable authorization vote.

`publishParticipantReleaseMemberClaim` and
`retireParticipantReleaseMemberClaim` are conditional applications on that
same slot and row. They are not a second ledger. Replica lifecycle install,
replacement and participant-connection reopen must retire the prior claim
before publishing the successor as release-eligible; until the successor claim
commits, the service stays participant-admission CLOSED and cannot issue a
share or consume RESUME. The handler's tracked-service change, consensus
observation and the message router's authenticated `CONNECTION_CLOSED` event
all enqueue the existing release recovery owner to apply the corresponding
retirement. A missed or unavailable retirement leaves final authorization
`HELD`; a cache row or caller lifecycle label cannot stand in for it.

The last-share control command conditionally performs one deterministic row
transition. It requires the exact slot revision, membership generation and
configuration, and for every member an exact CURRENT claim plus a share naming
that same claim revision. Any committed retirement or replacement claim makes
the command `STALE` and leaves the slot RESERVED. A fresh claim supersedes the
old member share in that same row; it does not conflict permanently. The same
owner then records a new share and reenters the last-share transition under the
original absolute deadline.

This gives the required serialization point. If retirement/supersession applies
first, an old share cannot participate in the decision. If the complete
last-share transition applies first, `RESUME_AUTHORIZED` is already the durable
decision and a later restart cannot revoke it; the target lifecycle fence still
prevents that old authorization from opening a newly constructed dependent
service. There is no final remote rescan with a check/commit gap.

The required race witness commits A1's share, latches before B's last share,
retires A1 and publishes A2 through the actual tracked-service/connection
owner, then releases B. B's command returns STALE/HELD and cannot authorize.
A2 claims and shares through the same owner and the transition authorizes once.
The inverse latch commits the complete authorization first and proves later A2
retirement does not erase the owed effect.

### R5-2. One bounded preflight lane and bounded release payloads

`createParticipantReleaseRecovery` remains the only scheduler. Alongside its
existing four ordinary running attempts it owns exactly one
`transitionPreflightRunning` permit. This permit is reserved for transition-row
reconstruction and never calls or occupies an ordinary attempt slot. Thus four
saturated ordinary releases cannot starve one control transition, while
preflight cannot expand without bound.

The preflight key is the fixed SHA-256 digest of the canonical
`[controlPartitionId,reservationId,rowRevision]` tuple. One exact key may be
running and at most one newer key for the same control partition may be pending.
The owner retains at most 64 pending preflight descriptors and 64 KiB total
pending-key/reason bytes. Pressure retains the durable row and returns `HELD`;
the existing service-change, consensus, slot-revision and one-second fallback
wakes rediscover it. No caller Promise or reply buffer is retained in the
pending map.

When a newer row revision arrives, the pending entry is replaced by the newer
digest. A running older attempt keeps only its one bounded invocation and is
marked retired; its late replies are exact-invocation no-ops and are discarded,
not queued. Shutdown cancels the timer, clears pending descriptors, marks the
single running invocation retired and awaits its existing deadline-bounded
turn. The durable slot remains recovery debt for the next process. Logging uses
the existing one-signature-per-drain-window suppression and reports aggregate
pending/running/retired counts rather than one line per member reply.

Release control messages gain their own resource constants; they do not reuse
or change the transaction participant-manifest limit:

```text
PARTICIPANT_RELEASE_CONTROL_MAX_MEMBERS = 1024
PARTICIPANT_RELEASE_CONTROL_MAX_CANONICAL_BYTES = 1048576
PARTICIPANT_RELEASE_PREFLIGHT_MAX_RUNNING = 1
PARTICIPANT_RELEASE_PREFLIGHT_MAX_PENDING = 64
PARTICIPANT_RELEASE_PREFLIGHT_MAX_PENDING_BYTES = 65536
```

The release owner validates these positive safe-integer configuration values
once at construction. Before it constructs, sorts, hashes, fans out or stores a
share set, target manifest or receipt set, it captures each own primitive once,
measures UTF-8 lengths without copying, and uses checked addition for the exact
fixed-tag canonical encoding. Count and canonical bytes must fit. A valid but
over-budget release remains `RESOURCE_PRESSURE`/`HELD` debt and may resume after
an explicit larger release-owner configuration; it is not corruption,
completion or permission to omit members. Malformed values remain `INVALID`.

The one preflight processes member RPCs sequentially and retains at most one
bounded response plus the one bounded canonical aggregate. Four ordinary slots
and the preflight therefore retain at most five release-control aggregates at
this owner. Incoming transport may already have allocated its frame; this is a
bound on release-owner normalization, fanout, hashing and row allocation, not a
claim of whole-ingress memory safety.

The resource witness saturates all four ordinary slots, withholds a preflight
reply, advances control leader and reservation revision, and injects late old
replies. It proves one running preflight, one current pending entry per control
partition, global count/byte limits, no retained retired reply, folded logs and
event/fallback reentry of the current durable row. Separate count and byte
controls refuse before normalized set/hash/row allocation.

### R5-3. Transfer precedes authorization, target commands and receipts

Round six's follower-OPENED-before-transfer ordering is removed. The release
owner retains the actual `reopenCohort` order already implemented by
`replica-handler-participant-cutover.js`:

1. PAUSE, settle accepted work and prove drain;
2. reopen follower connections;
3. transfer leadership while the old leader connection is still fenced;
4. return `STALE` and restart the attempt from the new leader, rereading the
   complete current cohort, term, configuration and connection generations;
5. only then record current member claims/shares and commit the common
   `RESUME_AUTHORIZED` decision;
6. commit target-specific dependent RESUME commands; and
7. collect and record current local OPENED receipts, then conditionally confirm
   the complete receipt set.

The common authorization stores the release ID, authorization ID/revision,
canonical target-manifest digest, dependent partition/configuration/membership
generation and target count. Each target command has its own deterministic
command ID derived from that common identity plus target replica/peer,
lifecycle, expected pause generation and target ordinal. Its receipt names the
target command ID, committed index/term, resulting pause/admission generation
and the current local projection facts. Receipts from distinct targets are
never described as the same committed command.

`recordParticipantReleaseOpenedReceipt` conditionally stores each strict receipt
on the same control slot with the exact target claim revision, dependent term,
leader, configuration and command ID. Consensus, lifecycle, connection or build
change after OPENED closes local admission and causes the tracked-service or
consensus producer to conditionally retire that receipt before it publishes the
successor as release-eligible. `confirmParticipantReleaseResume` is then one
control-row transition requiring the unchanged slot revision and exact complete
CURRENT receipt set. It performs no remote reread whose answer could race the
commit. If retirement applies first, confirmation is STALE/HELD; if complete
confirmation applies first, the already confirmed authorization survives the
later change while the local admission fence still closes the changed service.
A mismatch leaves the slot recoverable; recovery commits a newer dependent
PAUSE, obtains a new complete control authorization and reissues target
commands. It never weakens term/leader/configuration fences to reuse a
historical receipt.

The transfer witness performs the normal follower reopen and transfer before
any RESUME. A second schedule changes term/leader after one target reports
OPENED and before final confirmation. The old receipt becomes STALE, the
service closes, slot clear is refused, and the same owner reaches a complete
current local result through PAUSE and reauthorization.

### R5-4. Cold contact, revision witness and registration handoff

The production dependency is already engaged before a client exists. On the
locked Lenovo lab, source snapshot `a9c9290...` reached
`startLagrangeRuntime` → `phaseRegistration` → `registerMessageGroup` → CDC
bootstrap SQL and was refused with `participant_transaction_cutover_paused`.
The raw log `lab-startup-a9c9290-lenovo-laptop.log` has SHA-256
`01643ef237acae882d1d75cf576eadafe415abb7651eba1035c6d75b80a82e0b`;
its ledger SHA-256 is
`82a5538f021ca8902d185cd71c92b4cd49cb97a25630592d55700c6823afc005`.
The TAP wrapper's caught-error masking is not BEGIN or startup success. This
result is a production-path failure witness only; it does not approve this
proposal or classify the same-host predecessor still under measurement.

The cold existing-origin path reuses the existing `ContactSeedPhase` owner and
its `SeedContactCandidatePolicy`; it does not claim that
`executeBootstrapControlPlaneQuery` creates a route. For this branch the
candidate list comes only from the durable peer addresses already collected by
`resolveAutoRejoinStartupDecision` from rejoin hints and durable NODES evidence.
Those addresses are route hints, not authority. No candidate means startup
HOLD/operator recovery, never fresh storage.

`ContactSeedPhase.buildSeedContactRequest` gains one fixed read-only purpose,
`EXISTING_ORIGIN_RECOVERY_SNAPSHOT`, plus the existing node identity, expected
cluster ID, membership-owner outcome and client-attempt deadline. The existing
HTTP bootstrap request owner validates cluster identity and deadline, but this
purpose performs no join admission, assignment reservation or registration
mutation. It returns one typed response:

```text
kind = bootstrap_recovery_snapshot_v1
clusterId, responderNodeId, observedAtMs
systemTableSnapshots
partitionWitnesses[]
unfinishedReleaseAndCdcObligations
```

The current `ContactSeedPhase` candidate rotation, timeout, redirect evidence,
retry/backoff and original startup invocation deadline remain the only contact
lifecycle. A lost response, wrong cluster, stale redirect, partial envelope or
exhausted deadline is HOLD. `startup-sql-runtime-handoff` consumes a validated
response exactly as the join path already consumes `bootstrapResponse`; raw
candidate hints are never installed in the routing overlay.

The response producer is an explicit expansion of the actual
`BootstrapRequestOwnerHandler` and partition remote-read boundary. For each
required system partition, the request owner routes a complete unpaged SELECT
to the current leader. `PartitionService.buildRemoteReadAuthorityWitness` is
expanded to return the exact serving partition/node/replica together with
term, leader, configuration key, membership generation, durable applied index
and commit index. The leader reads the rows and durable applied index in one
synchronous SQLite transaction, and brackets that read with operation-port
status/committed-membership observations. Both observations must match the
same leader, term, configuration, generation and applied index; otherwise the
answer is `STALE`. The request owner accepts one canonical NOT_LEADER redirect
within the remaining contact deadline and rejects a second redirect, loss or
incomplete witness.

`BootstrapTopologySnapshotOwner` consumes only those complete per-partition
witnesses to build the recovery envelope. It does not infer them from its
empty cache or promote its retained/published rows to authority. The envelope
contains PARTITIONS and SERVICES route rows plus TABLES, MESSAGE_GROUPS,
release-origin and unfinished release/CDC rows, each tied to its producing
partition witness. Cross-partition rows need no invented global revision;
every required partition must have one internally coherent witness and the
complete required table set.

`startup-sql-runtime-handoff` installs the validated PARTITIONS/SERVICES rows
only into the existing short-lived bootstrap routing overlay. It also passes
the exact per-partition witnesses to the existing partition-leadership
prerequisite owner. `SeedPartitionsPhase.checkPartitionLeaders` and
`SeedRegistrationPhase.waitForRequiredPartitionLeadership` are expanded to
accept a remote prerequisite only when that overlay still names the same
current leader/configuration/applied witness and a locally hosted initialized
follower can forward the registration write through its existing Raft lane.
This satisfies the existing registration dependency; it is not a direct-write
bypass or a cache-derived leader. Change, expiry or missing local forwarding
service returns HOLD and repeats cold contact under the same invocation
deadline.

The fixed remote CDC recovery adapter then binds its subscription handshake to
the same leader/configuration/applied witness and operational message-group
ingress. Only complete original replay advances activation. After activation,
registration writes complete through the existing writer, and
`SeedCacheHydrationPhase` performs its unchanged normal local-or-canonical-
remote hydration and verification. Normal hydration supersedes and clears the
temporary overlay; it never treats the contact envelope as final cache
readiness.

The positive production witness starts an existing-origin node with no seeded
cache, remote leaders for all required system partitions and real unfinished
CDC/release debt. It obtains the envelope through the actual HTTP contact,
installs the routing overlay, satisfies registration by real follower-to-leader
Raft forwarding, replays old CDC and reaches normal verification. Stale
configuration/applied witnesses, a partial table set and route loss each HOLD,
then recover through the same contact owner without fabricated rows or a global
barrier.

### Round-seven proof ceiling

This correction changes no source, tests, metadata or Quest log. It adds no
second release authority, ledger, scheduler, raw Raft object, direct SQL write
bypass or readiness barrier. The control generation row remains the one
authorization owner; its claim retirement and final authorization are ordered
by the same committed application. The existing release recovery owner gains
one bounded preflight permit, and the existing seed contact/bootstrap response
owners gain the named read-only recovery contract.

Implementation remains held pending independent review of this exact subject
and its linked C3 reference. Required proof retains all prior activation/C3
obligations plus the A1-before-B supersession latch, four-slots-plus-preflight
resource schedule, transfer/receipt invalidation, and genuine cold remote
contact/registration/CDC recovery path.

## Round-eight finalization and cold-start handoff correction

The independently rejected round-seven subject is preserved verbatim at
`evidence/design-participant-release-activation-authority-round8-930a26dc.md`,
SHA-256
`930a26dc386daa184dcc9f0e83f57b2624b29dc41ab9699c9435b5f9b161beae`.
This section answers R6-1 through R6-3 in
`review-activation-authority-design-round6-marker.md`, SHA-256
`95d962e9f38086e9f23c30f431c330abbe5c5641f419778b815a2688ad5e2d04`.
It supersedes round seven's queued claim/receipt retirement, discarded
durable-seed candidates and complete unpaged recovery envelope. The accepted
release preflight limits, transfer-before-RESUME order, first-birth cut,
operation-local C3 recovery and rule that registration is a new write remain.

### R6-1. One finalization interaction orders supersession and decision

The control row remains the sole durable release-decision owner. The existing
release recovery owner gains one bounded finalization interaction with the
actual lifecycle and transport producers; there is no second vote ledger,
scheduler or freshness authority. Two identity domains are deliberately
different:

- a **control-member claim** is
  `[releaseId, controlPartitionId, replicaId, peerId, nodeId,
  ownerIncarnation, lifecycleIncarnation, runtimeGeneration,
  connectionGeneration, admissionGeneration, buildDigest, claimRevision]`;
  these fixed control members supply authorization shares; and
- a **dependent-target receipt** is
  `[releaseId, authorizationRevision, targetPartitionId, targetReplicaId,
  targetPeerId, targetNodeId, targetLifecycleIncarnation,
  targetRuntimeGeneration, targetConnectionGeneration,
  targetAdmissionGeneration, targetCommandId, receiptRevision]`; these target
  instances report the result of their distinct committed RESUME command.

A control claim revision is never copied into a target receipt field. A target
receipt cannot satisfy the control population, and a control share cannot
confirm target OPENED.

For a controlled service replacement, reopen, lifecycle retirement or
connection-generation change, the existing actuation caller must enter the
release finalization gate before `service.shutdown()`,
`replaceLocalReplicaService`, `TrackedServiceRegistry.set/delete`, or the next
`stampParticipantConnection`. If the exact old identity participates in an
unresolved finalization, that caller either waits under the existing release
deadline or conditionally retires the exact claim/receipt on the control row
and obtains `RETIRED` or exact lost-answer readback before actuating. A
successor cannot publish CURRENT, issue a share, consume RESUME or report
OPENED until that old retirement is durably observed. This extends the actual
lifecycle operation; the registry relay remains a wake and never becomes
authority.

For an already observed uncontrolled transport close, the router close owner
first closes local participant admission and synchronously invalidates the
matching in-flight finalization using the exact `nodeId`, `connectionId`,
remote boot incarnation and claim-or-target identity. It does so before
failing the matching response and before emitting its ordinary reconnect wake.
The release owner then submits the same conditional retirement directly; the
current `enqueue` path remains only recovery. A close event carrying only a
node ID cannot retire anything. If no exact binding is available, finalization
is `HELD`, and recovery rereads the control row and current lifecycle owner.

Final authorization is one invocation owned by release recovery:

1. It rereads the RESERVED slot and captures the exact row revision,
   configuration, membership generation and CURRENT control-claim revisions.
2. Each control member's lifecycle owner revalidates its exact local service,
   operation-port status and participant connection, then returns
   `CLAIM_PINNED` for this invocation. The pin is a bounded volatile exclusion
   held only until this invocation resolves; it grants no authority and cannot
   survive restart.
3. A controlled supersession cannot actuate while pinned. An observed close
   invalidates the pin before the final command can newly be submitted.
4. With every exact pin still current, the release owner conditionally applies
   the single last-share transition. It consumes the same row revision and
   claim revisions captured above.
5. It retains the pins through the applied result or exact row readback, then
   releases them. `AUTHORIZED` is returned only when the row contains this
   exact authorization identity. RETIRED, a changed revision or a replaced
   claim is `STALE/HELD`; an unchanged RESERVED row permits only an idempotent
   retry of the same command under the same remaining deadline.

There is at most one pin for an exact member-or-target and finalization
invocation, and every pin expires with the existing release deadline. A process
restart discards all pins. Stored partial shares or receipts then remain
diagnostic/recovery input only: the new process must pin the exact currently
hosted lifecycle and connection again before it may submit finalization. An old
incarnation cannot recreate that pin, so its partial observation cannot finish
a later authorization.

If an exact invalidation is observed before command submission, no final
command is sent and the result is HELD even while the durable row still says
CURRENT. If the final command and retirement are already in flight together,
their conditional applications on the same control row are the serialization
point: retirement first makes finalization STALE; complete authorization first
makes the durable effect owed. The latter is not revoked by a later close, but
the local incarnation fence still prevents a successor from consuming it.
This contract makes no claim about an undetected remote crash. Once the named
owner observes or controls a supersession, it must participate in this ordering
instead of leaving an authority-changing fact in a queue.

Target confirmation uses the same interaction with the dependent-target
domain. Producing OPENED pins the exact target service/connection through
`recordParticipantReleaseOpenedReceipt` and the final confirmation readback.
A local consensus, lifecycle, connection or build change first closes
admission, invalidates the exact target invocation and conditionally retires
that receipt. `confirmParticipantReleaseResume` consumes the complete current
target receipt set only while all exact target pins remain valid. A control
claim is never accepted as the target pin. Lost answers reread the same target
receipt revision and confirmation identity; absence, an older receipt or a
new target incarnation remains HELD.

The paired control witness latches A1 after its share, performs the actual
controlled A1 retirement before B can submit finalization, and proves B cannot
consume A1's still-unretired row projection. It then commits retirement,
publishes and pins A2, and authorizes once. A second schedule submits the final
command first and proves its committed effect remains owed. The target witness
latches an exact local admission close before confirmation submission and
proves the obsolete OPENED receipt cannot confirm; the inverse ordering commits
confirmation first and preserves the owed decision while the changed local
target stays closed.

### R6-2. Durable-seed route hints reach the existing contact owner

The source path is explicit. `collectAutoRejoinDecisionContext` already
normalizes `rejoin-hints.json` and durable NODES addresses into
`context.peerAddresses`. `buildSeedServingStartupDecision` currently discards
that set by returning `peerAddress:null, peerAddresses:[]`, and
`resolveStartupJoinDecision` again returns an empty seed list before
`acquireLagrangeRuntime` chooses `startSeedNode`.

The corrected durable-seed result preserves a separate own-data
`recoveryRouteHints` array of frozen records
`{address, evidenceSource}`. Each address is one already normalized
`context.peerAddresses` entry; `evidenceSource` records whether it came from
the identity-matched rejoin hints, the durable NODES snapshot or both, without
changing either producer's evidentiary meaning. Its membership verdict, `mode:SEED`,
`peerAddress:null`, `peerAddresses:[]`, cluster fence and seed selection do not
change. Fresh seed has an empty recovery set. The array is a route hint only:
it cannot prove membership, readiness, leader identity or permission to write.

`resolveStartupJoinDecision` carries that separate array through
`acquireLagrangeRuntime` into `startSeedNode`; `startSeedNode` passes it to the
one `BootstrapService`. The seed still follows the seed branch. During the
existing seed startup workflow, after the infrastructure/required local
services exist and before REGISTRATION_READY can authorize registration, that
same service composes the existing `ContactSeedPhase` with a read-only
`EXISTING_ORIGIN_RECOVERY_ROUTE` purpose. This is the seed-side caller of the
existing candidate rotation and HTTP contact code. It performs no join
assignment, registration, membership mutation or seed-role change.

The seed composition supplies the already persisted startup invocation's
`seedStartupHoldStartedAtMs` and absolute `deadlineAtMs`. The contact context
uses that start and deadline instead of calling `now()` to mint a fresh retry
window. Every candidate attempt uses
`min(configuredHttpTimeoutMs, deadlineAtMs - now())`; rotation, redirect and
backoff consume the same remaining time. Reentering REGISTRATION_READY,
receiving an ACK or accepting one page never resets the invocation deadline.

`ContactSeedPhase.executeSeedContactAttempt` distinguishes the recovery-purpose
response from its ordinary join response before any assignment consumer runs.
It requires the requested purpose, expected cluster ID, exact candidate
responder address, responder node ID, current client-attempt deadline and the
page contract below. It passes a validated route page and witness to the
existing `BootstrapTopologySnapshotOwner`; it does not call the ordinary
`setBootstrapResponse` assignment path. A typed `DEFERRED` response names
`NOT_LEADER`, `STALE_WITNESS`, `RESOURCE_PRESSURE`, `NO_ROUTE` or
`DEADLINE_EXHAUSTED` plus bounded retry timing. Wrong cluster, malformed cursor,
foreign responder or invalid witness is a hard refusal. A canonical redirect
is tried only within the same candidate/deadline policy.

Thus a retained seed with usable durable hints reaches the real HTTP producer;
an honestly empty hint set remains startup HOLD/operator recovery. Neither case
manufactures cache state. The required control starts seed mode from retained
storage with no CLI seed override and verifies the exact hint set arrives at
the recovery-purpose `ContactSeedPhase`; stale, partial and empty controls
remain closed. The unchanged normal pgwire startup remains the end-to-end
oracle after recovery completes.

### R6-3. Minimal bounded route pages unlock existing recovery

The cold response no longer contains full system-table snapshots or unfinished
release/CDC rows. Those durable obligations stay with their existing source
owners and are recovered after routing exists while ordinary mutation remains
closed. The bootstrap response carries only the minimum positive routing cells
consumed by `seedBootstrapRoutingOverlayFromSnapshots`: the authoritative
PARTITIONS row for a required system-table partition, its current leader's
SERVICES row and the endpoint fields needed to contact that leader. A missing
cell is not absence; it is DEFERRED.

`BootstrapRequestOwnerHandler` and the partition remote-read boundary produce
`bootstrap_recovery_route_page_v1` pages. A page contains:

```text
purpose, clusterId, responderNodeId, responderAddress,
requestInvocationId, pageOrdinal, cursor, nextCursor, complete,
routeCells[], canonicalByteCount
```

Each route cell contains the required table/partition identity, the exact
leader service and endpoint projection, and one partition witness containing
term, leader, configuration key, membership generation, durable applied index
and commit index. The source orders cells by required-table ordinal and BINARY
partition ID. The opaque cursor binds that order, the client invocation, the
set of required tables and the digest of all per-partition witness identities.
Every continuation recomputes that digest. Any changed witness returns STALE
and makes the recipient discard all cells from that invocation; pages from
different witness generations cannot compose.

The producer does not call an unbounded `.all()`. It resolves one routing cell
at a time through the canonical partition read route, brackets the exact row
reads with matching operation-port status and committed-membership
observations, and stops before adding a cell that would exceed the configured
page byte/row budget. A single cell that exceeds the supported cell budget is
`UNSUPPORTED_ROUTE_CELL`, not empty, complete or corrupt. The page encoder
captures own primitive fields once, uses checked UTF-8 byte addition, encodes
once and verifies the declared byte count before reply. Its page, aggregate
route-overlay and simultaneous producer/consumer-copy limits are separate
bootstrap-recovery owner configuration; they do not reuse the 1 MiB release
message cap or raise a query/global HTTP limit. Exact defaults and amplification
must be measured before source implementation is approved.

The owner validates positive safe-integer `maxCellCanonicalBytes`,
`maxPageRows`, `maxPageCanonicalBytes`, `maxHttpResponseBytes` and
`maxOverlayCanonicalBytes` once at construction. One request produces one
page, one seed invocation consumes one page at a time, and the overlay refuses
the next cell before its charged total would exceed the captured aggregate
limit. Raising capacity is an explicit configuration change and wake; it does
not reinterpret already retained bytes as complete. Invalid configuration is
a loud startup error. The initial defaults and the worst-case encoded-buffer +
decoded-page + overlay amplification require measured evidence before any
source implementation may be approved.

The existing HTTP consumer is expanded only for this purpose. Before decoding,
it rejects a missing/invalid `Content-Length` or a declared body larger than
the configured response bound. It reads `response.body` incrementally through
one bounded byte accumulator, aborts on overflow or deadline, and invokes JSON
decode only after the bounded bytes are complete. It never uses the current
unbounded `response.json()`/error `response.text()` path for recovery pages.
Error bodies use the same bound. At most the received byte buffer, one decoded
page and the installed route cells are simultaneously charged; the byte buffer
is released immediately after validation and installation.

For this purpose the producer replies with the one pre-encoded page buffer and
sets its exact `Content-Length`; chunked or compressed recovery-page responses
are refused rather than decoded outside the byte accounting contract.

The recipient installs one complete route cell at a time into the existing
short-lived bootstrap routing overlay and retains only a bounded completion
descriptor of witnessed cell identities/cursors in the current startup
invocation. Partial positive cells may route their named partition, but they
cannot certify a missing table, finish contact, enable registration or clear
debt. The overlay owner charges all retained cell bytes against the same
aggregate recovery budget and removes the invocation's cells on STALE,
shutdown or hard refusal. A resource refusal retains the startup invocation
and source debt, releases the current page, and retries under the original
deadline after capacity is available. No network-held database transaction,
server session, second cache or durable page ledger is added.

Once every required routing cell is present with its exact witness, the
existing closed-admission snapshot/discovery, original CDC replay and release
recovery owners use those routes. They fetch and drain their own potentially
large backlogs with their own bounded protocols. Seed registration remains
blocked until complete applicable activation authorization; the recovery route
does not grant a write exception. Normal cache hydration later supersedes and
clears the overlay through its existing owner.

The resource witness uses a source with more than 16 MiB of real unfinished
release/CDC debt. Cold contact transfers only bounded route pages, then the
existing obligation owners drain that debt while writes remain closed. It also
withholds a page, changes one partition witness between continuations, exceeds
the body limit, and supplies one unsupported oversized route cell. Each case
retains debt, bounds response/copy/overlay bytes and either resumes under the
same deadline or fails loudly; none reports empty or complete.

### Round-eight authoritative timeline and ceiling

| Order | Producer / consumer | Authoritative result |
| --- | --- | --- |
| 1 | `collectAutoRejoinDecisionContext` → seed-serving decision → entrypoint → `startSeedNode` | Seed verdict stays seed; separate durable route hints reach the one seed startup owner. |
| 2 | Seed-composed `ContactSeedPhase` → `BootstrapRequestOwnerHandler` → remote partition read | Bounded witnessed route pages install only positive bootstrap overlay cells under the original startup deadline. |
| 3 | Existing snapshot/discovery, CDC and release recovery owners | Durable recovery progresses while ordinary mutation and registration remain closed. |
| 4 | Control-member lifecycle/connection owners → release finalization | Exact pins plus the conditional control-row transition serialize observed/controlled supersession with `RESUME_AUTHORIZED`. |
| 5 | Target RESUME owners → OPENED receipt confirmation | Exact target pins and receipts confirm distinct committed target commands; control claims cannot substitute. |
| 6 | Existing registration writer and normal hydration owner | Registration writes only after complete applicable authorization; normal hydration replaces the temporary overlay. |

This amendment changes no source, tests, metadata or Quest log. It adds no
second authorization owner, page ledger, scheduler, cache authority, readiness
barrier, direct SQL write or snapshot-transfer shortcut. Source remains held
pending independent review of this exact subject and its linked C3 hash.
Future proof must include both finalization race orderings, the real durable-seed
hint chain, bounded multi-page HTTP decode/retention, a backlog above 16 MiB
drained by its existing owner, same-source refusals and legitimate startup, and
the unchanged pgwire startup oracle.

## Round-nine ordered-finalization stop and route-buffer lifetime

The immutable round-eight subject is retained at
`evidence/design-participant-release-activation-authority-round9-976e6199.md`,
SHA-256
`976e61994108f94c469b1c6f9ea33bc48bb869d9fb33ca7e1d740bcb44d68276`.
This amendment addresses round-seven review findings R7-1 and R7-2 together.
It changes no source, tests, registry, Quest log or runtime claim.

### R7-1. The requested wall-clock precommit precedence is incompatible with the ordered owner

Four events must remain distinct:

1. **Enqueue** places a request in the local release-owner queue. It conveys no
   authorization and may be withdrawn before consensus acceptance.
2. **Consensus acceptance** assigns the command a position in the consensus
   owner's ordered operation stream. It is still not permission, but a later
   command cannot overtake it.
3. **Committed apply** conditionally changes the exact control row to
   `RESUME_AUTHORIZED`, or commits the exact target confirmation. This is the
   permission-changing decision.
4. **Consumption** revalidates the applicable current local identity and reads
   that committed decision before dependent RESUME, registration or reopening.

The round-eight text is superseded where it implied that an asynchronously
observed invalidation can retire an already accepted command before that
command applies. Consider the exact control trace:

```text
q0 enqueue final authorization                         no authority
q1 consensus accepts final authorization at order 41  no authority yet
q2 A1 close/lifecycle invalidation becomes known      close local admission
q3 retirement is accepted at order 42                 no retroactive reorder
q4 order 41 commits RESUME_AUTHORIZED                  durable authorization
q5 order 42 retires A1                                 later durable change
```

The target-confirmation trace is identical with an OPENED receipt at order 41
and its retirement at order 42. Deterministic replicated apply must produce the
same result on every replica. It cannot consult a volatile connection pin,
process-local timer, newly observed remote state or local callback at q4. A
cancellation submitted at q3 is ordered after q1. Treating q1 as complete
permission would violate the committed boundary, while adding another durable
sequencer would create a second decision owner and would still define an order
rather than retroactively change order 41.

Therefore the stronger rule “a remote invalidation observed after consensus
acceptance but before commit always defeats that accepted command” cannot be
implemented by the permitted owners while preserving deterministic apply and
native consensus traffic. This is an explicit **design STOP**, not an approval
of the round-eight pin protocol. Source for release authorization, target
confirmation and their activation consumers remains held until the owner/user
chooses semantics consistent with one durable order.

The strongest guarantee the existing owner can provide without changing that
semantic boundary is precise:

- enqueue and preflight never authorize anything;
- a known invalidation before consensus acceptance closes local admission and
  prevents acceptance of that final command;
- a controlled lifecycle replacement must commit retirement/readback before
  the final command is accepted;
- after acceptance, consensus order decides. If retirement is ordered first,
  finalization is stale. If finalization is ordered first, its later commit is
  a historically valid complete authorization followed by retirement;
- later retirement immediately closes local admission and fences successor
  consumption. It does not rewrite the earlier committed decision;
- restart, expiry, timeout, ACK and lost response never infer either outcome.
  Recovery rereads the exact command identity, control-row authorization
  identity or target-confirmation identity and its ordered retirement. An
  unresolved read remains HOLD under the original absolute deadline;
- the inverse positive must establish the complete **committed** authorization
  or target confirmation before the later lifecycle change. “Submitted first”
  is not a positive control.

This attainable guarantee still rejects stale partial observations before
acceptance and prevents a successor from consuming a retired authorization.
It does not satisfy the demanded q2-before-q4 wall-clock precedence. No new pin,
lease, pre-enqueue check or retirement priority can close that incompatibility.

Required evidence remains a paired, deterministic schedule for both domains:

| Schedule | Required observation |
| --- | --- |
| Enqueue, invalidate, then attempt acceptance | No command is accepted; no committed authorization/confirmation appears. |
| Accept final command, then accept retirement | Apply follows consensus order; the final decision commits before retirement, and a successor cannot consume it after retirement. This is the explicit incompatible trace, not claimed acceptance. |
| Commit final decision, lose answer, then change lifecycle | Exact readback recovers the same decision; no duplicate authorization, confirmation or dependent command occurs. |
| Restart/expire before an accepted command's outcome is readable | The new process reports HOLD and rereads the same ordered identity; it neither assumes cancellation nor submits a replacement. |

### R7-2. The existing bootstrap request owner retains producer bytes through HTTP release

The semantic owner remains `BootstrapRequestOwner`. Current source owns request
count admissions in `bootstrap-api-admission-methods.js:87-116`, calls the
handler from `bootstrap-api-server-methods.js:122-125`, returns a response at
`bootstrap-request-owner-handler.js:611`, and releases the count admission in
the handler `finally` at :667-669. `PressureGovernor` remains an upstream
pressure sensor/admission signal; it is not relabelled as a retained-byte
lease. The proposed recovery-purpose branch expands the existing request owner
with one purpose-specific aggregate `bootstrapRecoveryRouteCapacity`; it does
not add a durable ledger, scheduler, cache authority or global HTTP framework.

At construction, that owner validates positive safe-integer limits for
concurrent recovery-route producers, aggregate retained producer bytes,
canonical bytes per projected cell, page rows, canonical page bytes, encoded
response bytes and overlay bytes. Invalid configuration fails startup. Exact
defaults and worst-case amplification remain measurement gates before source
approval. Capacity refusal is typed `RESOURCE_PRESSURE/DEFERRED`, preserves the
route/startup debt and original absolute deadline, and wakes from the same
owner's release or explicit configuration revision.

Before any variable source value crosses into JavaScript, the canonical remote
partition read boundary performs a projection preflight in the same read
transaction and witness generation:

1. For the exact PARTITIONS row, exact SERVICES leader row and endpoint fields,
   it reads only fixed-shape scalar descriptors: SQLite storage type, BLOB byte
   length, row identity and fixed-width witness coordinates. Checked addition
   includes field tags, JSON escaping upper bounds and page-envelope overhead.
   A malformed type, unsafe sum or field above `maxCellCanonicalBytes` returns
   hard invalid/`UNSUPPORTED_ROUTE_CELL` without materializing that value.
2. The all-required-cells witness pass uses the same scalar projection and
   streams one bounded descriptor at a time in required-table/BINARY-key order.
   It retains only checked count/bytes, rolling canonical digest and the last
   bounded key. It never calls `.all()`, constructs a row census, or embeds the
   census in a cursor. The cursor is a fixed-schema tuple of invocation,
   ordinal, last bounded key, checked counts and digest.
3. Before the full value projection, `BootstrapRequestOwner` acquires an
   aggregate retained-byte claim for the configured maximum simultaneous
   source projection, canonical page, encoded Buffer and one explicit HTTP
   handoff copy. If that worst-case claim is unavailable, no variable row is
   read. The measured preflight can narrow the claim, but no later step may
   exceed it or allocate first and charge afterward.
4. The partition read boundary then materializes one admitted cell at a time,
   verifies the preflight identity/length and live witness in the same
   transaction, appends it to the bounded page and releases the prior temporary
   projection before advancing. Any changed length, row or witness is STALE;
   all cells from that invocation are discarded.

This is a read-only extension of the existing canonical remote-read boundary.
It does not give a direct-SQL caller routing authority, keep a network-held
database transaction, or treat scalar length metadata as a complete cell.
`query-result-budget.js:62-106` remains insufficient for this purpose because
it measures a row after SQLite has materialized it and after `JSON.stringify`.

The admitted-copy and HTTP lifetime is explicit:

| Step | Retained allocation and owner |
| --- | --- |
| 1. Admission | Request-count admission plus aggregate byte claim are acquired by `BootstrapRequestOwner` before source projection. |
| 2. Projection | One source cell, canonical page storage and rolling cursor state are charged; checked totals cannot exceed the claim. |
| 3. Encoding | The owner encodes exactly once into a Buffer, sets exact `Content-Length`, and charges page storage, encoded Buffer and the declared framework handoff copy simultaneously. Compression and chunked recovery-page replies remain unsupported. |
| 4. Send | The same handler calls `reply.send(buffer)` and binds one release-once closure to the actual `reply.raw` `finish`, `close` and send-error outcomes before sending. The ordinary handler `finally` releases only the request-count/work admission. |
| 5. Release | The byte claim is released only by the first terminal send callback, a synchronous send refusal before ownership transfers, or server shutdown after connection closure proves the response no longer retains the Buffer. Sibling callbacks become no-ops. |

A client deadline, abort or retry ends that client's wait but cannot release a
sender claim while Node/Fastify may still retain the response. Shutdown closes
connections, blocks new claims and drains the same tracked claims; it never
drops accounting merely because the request handler returned. A late `finish`,
`close` or error releases once. Concurrent or repeated contacts must acquire
from the same aggregate pool, so queued responses plus active projections
cannot exceed configured producer bytes.

The consumer's bounded body accumulator is a separate claim. Sender and
consumer copies are both charged at their respective nodes. Consumer abort
does not release sender bytes; source close does. After bounded decode and
atomic cell installation, the consumer releases the body Buffer while the
overlay continues to charge its own retained cells. Partial pages, ACKs and
HTTP completion never certify a complete source population or reset the
startup deadline.

Required resource proof is one paired production HTTP schedule:

- a cell above the supported bound is refused by scalar preflight before its
  variable field is materialized, retaining source debt;
- a supported response is held below socket completion while overlapping
  contacts exhaust the aggregate byte pool and receive typed DEFERRED without
  reading rows;
- caller timeout and consumer disconnect do not release the sender claim until
  the raw response closes; that close releases exactly once and wakes the same
  owner;
- a later supported request completes under the original startup invocation,
  while the greater-than-16-MiB CDC/release backlog remains with and progresses
  through its existing owners.

### Round-nine authoritative timelines and disposition

**Finalization timeline:** local enqueue (no authority) → consensus acceptance
(ordered, still no permission) → committed control-row decision (authorization)
→ exact current consumer. A known invalidation can prevent acceptance or be a
later ordered retirement; it cannot retroactively overtake an accepted command.
This preserves deterministic apply but leaves the user's stronger precommit
precedence requirement unresolved and blocks activation source.

**Allocation timeline:** aggregate claim → scalar preflight/streaming witness →
one-cell projection → one encode with all copies charged → `reply.send` with raw
terminal callbacks → release-once/wake. Request-handler return, deadline and
consumer cancellation are not byte-release facts.

R7-2 is now a coherent design contract pending measured limits,
implementation, paired semantic controls and exact-snapshot Lab proof. R7-1 is
an explicit owner-semantics STOP. All accepted hint-chain, seed-contact,
original-deadline, minimal-route, debt-owner, firstbirth and registration-as-
new-write rules from round eight remain in force. C3 and activation source stay
held; this document makes no whole-TX/FreshMG or implementation approval claim.

## Round-ten owner-ordered invalidation and finalization contract

The immutable round-nine subject is retained at
`evidence/design-participant-release-activation-authority-round10-e82769a5.md`,
SHA-256
`e82769a592c544a6860cda087bad5af4727f44098c58c2122f336665572fac02`.
This amendment applies the owner decision of 2026-10-11 and resolves the
round-eight review's R8-1 semantic STOP. It supersedes round nine only where
that section left incarnation supersession undecided or described native
proposal acceptance as an irrevocable ordered result. The independently
approved R7-2 route-resource contract, durable-seed hint chain, original
startup deadline, closed-admission recovery, complete fixed population and
registration-as-new-write rules remain unchanged.

### One affected handoff, with local HOLD and one replicated decision owner

The control generation row remains the sole durable authorization owner. Its
finalization command binds the release/configuration/population identity, the
complete fixed eligible population, and every exact CURRENT claim and share
revision. The target-confirmation command separately binds the complete exact
OPENED receipt population. No transport state, status projection or local
HOLD is copied into either replicated predicate.

An affected lifecycle/connection change has two coordinated effects through
the existing owners:

1. The local lifecycle/router owner closes mutation admission for the exact
   affected `[nodeId, replicaId, lifecycleIncarnation, runtimeGeneration,
   connectionGeneration, admissionGeneration]`, marks that local observation
   invalid, and wakes `replica-handler-release-recovery`. A connection close
   with no exact binding closes only what it can identify and leaves the
   release operation HELD. Reconnect alone never clears the invalidation or
   reinstates a grant.
2. The existing release recovery owner carries that invalidation to the
   control-row owner as the exact retirement/current-generation transition.
   For a controlled shutdown, replacement, reopen or successor publication,
   the lifecycle owner waits for the retirement's committed result or exact
   lost-answer readback before actuation or publication. The successor cannot
   publish CURRENT, supply a share, consume authorization or report OPENED
   before that ordering completes.

This is one lifecycle-to-release handoff. It adds no pin protocol, local vote,
durable invalidation ledger or second scheduler. The local invalidation closes
use immediately; the control-row transition supplies the replicated order.
An uncontrolled physical disconnect has no invented wall-clock precedence at
a remote leader that has not observed it.

### Actual dispatch and committed-apply ordering

The existing release recovery queue may enqueue a finalization or confirmation
request, but enqueue is only owed work. The request passes through the existing
operation port and `raft-rs-runtime-owner.js` command turn. After queued inbound
traffic is drained and immediately before `performCommand` invokes native
`propose`, the narrow release-finalization handoff revalidates the exact local
request identity and the deciding gate's current invalidation state. This is
the actual dispatch decision, not another validation round. If that gate knows
the identity is invalidated, dispatch returns typed local HOLD/STALE and no
proposal is issued. A remote observation that has not reached this gate cannot
be treated as knowledge at this point.

Native propose success, follower forwarding, a runtime-turn `CORE_OK`, a
transport ACK and leader append are never an authorization certificate. A
leader append is a tentative candidate and may be replaced above the committed
index by ordinary leader-change reconciliation. The release owner therefore
retains the exact command identity and result-recovery obligation until one of
these authoritative outcomes is established:

- committed application records this exact authorization/confirmation;
- committed application records `STALE` because an earlier ordered
  retirement/current revision changed its predicate; or
- canonical same-identity redrive/readback establishes that the tentative
  suffix was replaced. Replacement proves only nonapplication of that
  candidate. The owner may retry the same identity while its exact generation
  is still CURRENT, or evaluate a new complete current generation after its
  committed retirement/new-CURRENT transition. It never combines old partials
  with new claims or mints a new identity merely from timeout, missing reply or
  transport failure.

`raft-rs-application-transaction-owner.js` remains the deterministic committed
boundary. Every replica evaluates the finalization predicate solely from the
replicated control row and immutable command bytes in the same SQLite apply
transaction. Volatile socket state, local HOLD, timers and process callbacks
are forbidden inputs. The two authoritative orderings are:

```text
retirement R commits -> final F applies
  R changes the exact CURRENT revision
  F's replicated predicate is stale and cannot authorize

final F commits -> retirement R commits
  F records complete authorization against the then-current full population
  R later retires that applicability for future consumption/successors
  historical F remains durable; it is not rewritten or cancelled
```

The same two orderings apply to exact target OPENED confirmation and receipt
retirement. Submission first is not the inverse control: the positive control
must observe the final command's committed application before the later
retirement.

### Consumption and restart

`partition-participant-transaction-pause.js` and the registration/reopen
consumers use only a committed complete decision plus their exact applicable
current lifecycle, runtime, connection, admission, configuration and
population identity. Local HOLD/current-incarnation fencing runs before any
dependent RESUME, registration or open. Thus a committed historical decision
survives restart as durable history, while a retired or mismatched successor
cannot consume it. Restart begins locally closed and reconstructs the
control-row/current-generation state; a volatile observation or reconnect is
never enough to open admission.

Timeout, shutdown, restart and a lost result preserve the same command identity
and debt. They do not prove cancellation, replacement or commitment. With an
unreadable outcome the owner reports typed HOLD under the existing absolute
deadline and wakes through the existing lifecycle/control-row/recovery events.
Once replacement or an ordered retirement is authoritative, stale old debt can
release through that same owner and a fresh complete generation may progress.

### Required paired source witnesses

Implementation and source approval require the complete production interaction,
not a port stub:

1. Local enqueue, then exact invalidation before the deciding gate's dispatch:
   local admission closes, the command never reaches native propose, and the
   same recovery owner later progresses after committed retirement/new CURRENT.
2. Follower forwarding and runtime-turn success without leader append: neither
   records authorization nor clears the exact unresolved obligation.
3. Leader append followed by normal uncommitted suffix replacement: no
   committed authorization appears; same-identity recovery makes progress
   without mixing old shares or permanently vetoing the new generation.
4. Finalization appended and committed before retirement: readback recovers the
   exact committed decision after a lost answer; later retirement closes local
   admission and prevents successor consumption without rewriting history.
5. Retirement committed before finalization: deterministic apply returns stale
   on every replica, then only a full new CURRENT population can authorize.
6. Repeat 1–5 for target OPENED confirmation, including a local target
   invalidation before dispatch and an inverse committed-confirmation control.

Each witness observes queue entry, actual runtime/native dispatch, tentative
leader append where applicable, committed SQLite application and the final
consumer. It retains exact command and lifecycle identities and proves that
ACK, runtime-turn completion and read status are insufficient.

### Round-ten disposition

The authoritative transition is:

```text
local disconnect/change
  -> close exact local mutation admission and mark local HOLD
  -> wake existing release recovery
  -> committed retirement/current-generation transition
  -> full current evidence and exact final command
  -> actual dispatch revalidation at the operation-port/runtime handoff
  -> tentative append or local refusal
  -> deterministic committed control-row decision
  -> exact current consumer revalidation
```

The unresolved-command path retains the same identity until committed result,
stale result or authoritative replacement/redrive resolution. The controlled
successor path waits for the ordered retirement result. This satisfies the
selected owner-ordered incarnation rule without claiming instantaneous global
knowledge of an uncontrolled disconnect.

This is a design correction only. Activation, linked C3 and route-resource
source remain held for independent review, measured limits, paired source
controls and exact-snapshot Lab proof. No source, tests, metadata, Quest log,
runtime behavior, whole-TX/FreshMG approval, merge or publication is claimed.

## Round-eleven release-cycle identity and post-ENABLE catch-up

The immutable round-ten subject is retained at
`evidence/design-participant-release-activation-authority-cycle-predecessor-82b11d80.md`,
SHA-256
`82b11d80a3a4f8abe2b29e5377b9effb73c658384997df34051d2287f29906b9`.
This amendment is bounded to two production failures observed on the
round-ten implementation. It does not change the owner, add a ledger, create a
scheduler, relax a stale check, or extend the operation deadline.

### Observed failures and source boundary

The exact captured implementation source was
`14fac7d6ef64881daa7a0d266a272b724dfe640a` on the preservation branch. Its
67-path manifest is
`test-output/continuation-20261011/startup-activation/retirement-reconstruction/source-manifest.json`,
SHA-256
`7357539a7730f4a672d4a5f81b3b9812172225903839259962960bff3d4a9162`.
The unchanged pgwire oracle is RED; its raw log SHA-256 is
`aca296ecce3e3c3116749b902f3dea1746f02a44907ef721955e992268562ab7`.
The later instrumented scratch is diagnostic only and must carry its own
source delta and fingerprint; it is not byte-identical to `14fac7d6` and is
not implementation evidence.

The diagnostic established two separate transitions:

1. Immediately after committed ENABLE, the leader had
   `appliedIndex=commitIndex=lastIndex=3` and every work counter was zero.
   Both followers had every work counter zero and
   `appliedIndex=commitIndex=2,lastIndex=3`. The first refusal was therefore
   exact follower catch-up, not accepted mutation work, transaction debt or a
   permission to restart the lifecycle.
2. A completed control cycle had committed its three receipts, CONFIRM and
   RETIRE. A later release with the same root authorization and release ID
   derived the same authorization ID. The control row was already `RETIRED`,
   so the correct stale guard rejected RESERVE. Retrying rebuilt the same
   PAUSE invocation and the same RESERVE identity under the unchanged leader
   term. It could never create a new cycle.

The second failure cannot be fixed by including the current PAUSE entry ID in
the authorization hash alone: the current PAUSE invocation is itself derived
only from the root authorization, release ID, leader and term, so a later
same-term lifecycle replays the prior PAUSE. Nor may RETIRED accept the same
authorization ID, because that would revive a completed historical grant.

### One durable cycle in the existing control slot

The existing control row remains the sole serialized cycle owner. A cycle is
identified by immutable canonical bytes:

```text
cyclePredecessor = {
  controlPartitionId,
  priorAuthorizationId | null,
  priorTerminalState: EMPTY | RETIRED,
  priorControlRevision,
  priorRetirementId | null,
  priorRetirementIndex | null,
  priorRetirementTerm | null
}

pauseInvocationId = H(
  "participant-release-pause-cycle-v2",
  rootAuthorizationId,
  dependentReleaseId,
  canonical(cyclePredecessor)
)

pauseProof = {
  pauseInvocationId,
  pauseEntryId,
  pauseIndex,
  pauseTerm,
  pauseGeneration
}

authorizationId = H(
  "participant-release-authorization-cycle-v2",
  rootAuthorizationId,
  dependentReleaseId,
  canonical(cyclePredecessor),
  canonical(pauseProof)
)
```

`H` is the existing canonical SHA-256 identity helper over captured primitive
data. The initial predecessor is the exact empty control slot at its observed
revision. A later predecessor is accepted only from an exact committed
terminal RETIRED row. The prior retirement index and term are historical
ordering facts, not current leadership claims. No clock, retry count, local
admission generation, route hint or mutable post-reservation revision enters
either identity.

The control owner first captures the predecessor bytes and expected control
revision, then commits or recovers that exact PAUSE. A lost PAUSE result is
resolved by the dependent partition's durable pause entry. It never causes a
new predecessor capture. Only the committed pause proof may construct the
RESERVE command. RESERVE stores the cycle predecessor and pause proof beside
the existing release, configuration, target, deadline and population bytes in
the same control row and the same SQLite apply transaction.

The single slot follows this transition table:

| Existing slot | Incoming cycle | Result |
| --- | --- | --- |
| exact empty predecessor | matching PAUSE/RESERVE | create RESERVED |
| RESERVED, AUTHORIZED, DISPATCHED or CONFIRMED | same authorization and command identity | replay or continue the exact phase |
| RESERVED, AUTHORIZED, DISPATCHED or CONFIRMED | different cycle | typed HELD/STALE; retire or complete the current cycle first |
| RETIRED | same authorization | replay the exact retirement; never reserve or reopen |
| RETIRED | new authorization whose predecessor exactly binds this RETIRED row and revision | atomically replace the terminal slot with RESERVED while retaining the immediate predecessor digest and retirement coordinates |
| any state | stale predecessor, stale PAUSE proof or changed expected revision | STALE with no row change |

The immediate predecessor fields let the one slot refuse an old PAUSE or old
RESERVE after the next cycle starts. Older duplicate commands may return
STALE; they cannot mutate the new cycle. The previous owner must establish an
exact committed retirement result or same-identity readback before the next
cycle may begin, so no unresolved retirement is discarded by this bounded
history. This is not a second history table.

### Incomplete-cycle retirement and both finalization orderings

RETIRE continues to carry the exact authorization ID, target and stable
retirement ID. Retirement of any required CURRENT claim or receipt invalidates
the complete-population grant, so that one apply atomically marks the named
element and terminalizes the whole cycle as RETIRED. The remaining claim,
share and receipt bytes are historical evidence only and cannot authorize or
reopen anything from a RETIRED slot. A same-command retry replays its exact
retirement. A different target from the same old authorization may establish
that the whole cycle is already terminal, but cannot change the terminal
coordinates or manufacture target-specific retirement; a controlled successor
still needs the exact ordered result for its target, or the canonical terminal
read proving that its old authorization was already invalid before successor
publication. A new predecessor cannot be captured before this terminal state
and every already-known controlled-successor retirement obligation has such a
result.

This gives both existing orderings a complete next-cycle boundary:

```text
finalize -> confirm -> retire
  committed authorization remains historical
  local applicability closes
  exact RETIRE terminalizes the slot
  only that terminal row can seed a later PAUSE cycle

retire -> delayed finalize
  exact claims/receipts retire and terminalize the old slot
  delayed finalize is STALE against the changed revision/state
  a later cycle binds the terminal retirement, never the stale finalize
```

An incomplete AUTHORIZED or DISPATCHED cycle stays the same cycle across lost
answers and restart. It is completed or retired with its original deadline
and exact commands. It does not become a new cycle merely because local
admission is CLOSED. A CONFIRMED then RETIRED grant remains historical and is
not applicable to a later incarnation.

### Post-ENABLE catch-up remains inside the same attempt

After the exact ENABLE command commits, the release owner re-reads the same
fixed cohort until each member proves all of the following under the original
absolute deadline:

- the same partition, replica identity, lifecycle incarnation, runtime
  generation, connection generation and admission generation;
- the same committed membership/configuration and leader attempt;
- `appliedIndex == commitIndex == lastIndex` for the observed pause/enable
  boundary; and
- every accepted-work counter and transaction/query drain predicate is empty.

Follower `appliedIndex < lastIndex` is retryable catch-up. The owner waits on
the existing consensus/recovery wake or bounded poll and re-reads; it does not
return to the outer lifecycle, recapture a predecessor, commit another PAUSE,
or renew the deadline. A membership, configuration, lifecycle or incarnation
change is STALE/HOLD and leaves the exact current cycle owed to the existing
retirement/recovery owner. Deadline or shutdown also retains that cycle and
its command identities for restart; neither proves retirement.

### Retry, restart and concurrency schedules

The implementation proof must cover these schedules with the actual durable
row and command bytes:

1. Lose PAUSE reply: read back the same `pauseEntryId/index/term/generation`,
   then issue one RESERVE identity. No clock-derived remint.
2. Lose RESERVE reply: the row's matching cycle predecessor and pause proof
   resume CLAIM/SHARE/FINALIZE. No second PAUSE or authorization ID.
3. Lose RETIRE reply: retain the same retirement ID and read back RETIRED
   before any successor cycle captures its predecessor.
4. Restart in each nonterminal phase: reconstruct the exact cycle from the
   dependent PAUSE/authorization row and control row, preserving the original
   deadline and current local HOLD.
5. Finish and retire a cycle, then repeat in the same leader term: the second
   PAUSE and authorization IDs differ because their predecessor is the first
   committed retirement; both are deterministic across replicas.
6. Race two different requests from the same terminal predecessor: they have
   distinct root/release identities. At most one RESERVE wins the expected
   revision. The loser remains CLOSED and, after the winner retires, must
   capture the newer terminal predecessor and commit a newer PAUSE. Its stale
   earlier PAUSE can never reserve.
7. After ENABLE, delay one follower at the final entry with all work counters
   zero: the same attempt waits, catches up and proceeds. Change that
   follower's membership or incarnation instead: the attempt refuses and
   preserves its cycle debt.

Each lost-answer case must observe the proposed command, committed log entry,
SQLite row before and after, and the outer recovery re-entry. Each positive
control must prove one original deadline, bounded polling, current
membership/incarnation, and no duplicate PAUSE, RESERVE, FINALIZE, RETIRE or
RESUME effect. The negative controls keep same-ID RETIRED reuse, stale
predecessor, stale pause proof, old-incarnation consumption and mixed
population refusal red.

### Round-eleven disposition

The two failures have one bounded existing-owner resolution:

```text
terminal predecessor
  -> deterministic cycle PAUSE identity
  -> committed PAUSE proof
  -> deterministic authorization identity
  -> existing one-slot authorization phases
  -> ENABLE
  -> same-attempt current cohort catch-up/drain
  -> RESUME/confirmation
  -> exact ordered retirement
  -> terminal predecessor for a later lifecycle
```

This is a design supplement and deterministic feasibility contract only.
Activation source remains held for author-distinct review of this amendment.
No implementation, source approval, startup closure, FreshMG closure, merge
or publication is claimed.

## Round-twelve pre-effect custody, conditional PAUSE and monotonic closure

The immutable round-eleven subject is retained at
`evidence/design-participant-release-activation-authority-cycle-round12-predecessor-819e4590.md`,
SHA-256
`819e4590be60f90a2f1918f6db7899b516c68b7110f91775d1b6495565d5d612`.
Independent review report
`review-activation-cycle-design-round1-independent.md`, SHA-256
`5e602b16fac568165bacf2269eb2216108769ee443b57ef1f1bc5815f77148a2`,
rejects round eleven for AC1 through AC3. This amendment replaces the
round-eleven PAUSE-before-RESERVE ordering and its immediate-predecessor-only
retirement rule. The accepted round-ten owner ruling, complete current
population, dispatch fence, original foreground deadline, same-attempt
follower catch-up and R7-2 route-resource contract remain binding.

### Evidence attribution correction

The exact `14fac7d6` oracle proves a production startup refusal: first
`post_enable_release_census / release_drain_pending`, followed by
`current_control_owner_fact / release_generation_changed /
committed_control_reservation`, under one original deadline. It does not expose
the repeated command bytes in the later scratch.

The separately fingerprinted instrumented diagnostic proves a different
schedule: authorization `b24ae48e...` repeats one exact
`RETIRE_PARTICIPANT_RELEASE` entry 219 times at indices 60 through 278 while
the current control row contains a different authorization `f1aa6015...`, is
RETIRED at index 59/term 1, and has control revision 54. Round eleven's wording
that described this retained diagnostic as a repeated RESERVE is withdrawn.
The diagnostic is evidence for an older retirement consumer stranded behind a
newer slot. Source inspection separately shows that the old implementation's
cycle and PAUSE identities lack a committed predecessor. Neither observation
is relabeled as exact-source proof of the other.

### Compact authoritative transition table

| Phase | Authoritative durable facts | Exact effect identity | Acceptance/application point | Restart or lost answer | Retained obligation and next release condition |
| --- | --- | --- | --- | --- | --- |
| Root request | Existing durable seed `immutableAuthorization` plus `startupInvocation`, exact CREATE operation/admission row, or live operator request before effects | Canonical `rootAuthorityText`, `effectId`, original `deadlineAtMs` | Existing startup/create/operator owner validates once; no partition effect yet | Before claim-command submission, loss means no effect and a caller may submit a new request. Once submitted, the exact claim identity is retained until committed result or authoritative replacement; it is never reminted from uncertainty. After committed claim, the live token is no longer needed to recover that exact effect. | Existing route/body/control-candidate byte reservations cover the captured descriptor; release only on rejected/replaced claim or terminal cycle. |
| Control cycle claim | Current control row, `controlRevision`, `cycleOrdinal`, `closedThroughCycleOrdinal`, terminal state and complete control/dependent descriptor | `cycleId` and the exact canonical conditional PAUSE command bytes | `CLAIM_PARTICIPANT_RELEASE_CYCLE` CAS commits `CYCLE_CLAIMED` in the existing control row before PAUSE dispatch | Same command/readback recovers claim index/term/revision, root descriptor, original deadline and PAUSE bytes after crash, leader change or compaction | Sole control slot is occupied. No contender may dispatch PAUSE. Release only after this cycle becomes terminal or is conditionally superseded. |
| Dependent PAUSE | Claimed control-cycle certificate plus dependent row's exact prior cycle fence, membership, configuration and attempt | Stored PAUSE command; `cycleId`, ordinal, expected dependent fence, leader/term and descriptor digest are immutable | Conditional PAUSE apply in the dependent's existing `_partition_write_generation` transaction stores the accepted cycle/proof and advances pause generation once | Immediate replay returns the stored proof. A changed attempt cannot remint; it is conditionally fenced/superseded under the same claim | PAUSE/proof and command custody remain in control and dependent rows until control records the result or terminal supersession. |
| Control continuation | Exact dependent PAUSE proof and the still-current claimed descriptor | Same `cycleId`; authorization ID derives from claim plus committed PAUSE proof | Existing control CAS changes `CYCLE_CLAIMED` to RESERVED, then existing claim/share/finalize/dispatch/confirm phases run | Every command is read back by its exact ID. Missing reply, timeout or restart preserves the same cycle | Full descriptor, population and pending responses remain charged. Release only on CONFIRMED then RETIRED, or authoritative supersession. |
| ENABLE catch-up | Same cohort/configuration/attempt/lifetimes and exact committed ENABLE boundary | Same cycle, authorization and original deadline | Existing owner repeatedly reads the fixed cohort; no new control apply is needed | Follower lag waits and rereads. Membership/incarnation change returns HOLD/STALE and leaves cycle debt | Poll/wake uses existing owner and bounded slots. Progress requires all work predicates empty and `applied=commit=last`. |
| Terminal/superseded | Exact RETIRE or supersession proof plus dependent fence result | Stable retirement/supersession command ID for the claimed cycle | Control apply advances `closedThroughCycleOrdinal` only after the dependent can reject every delayed command from that cycle | Lost answer reads the same closure. Later recovery may use a bounded execution turn but cannot change root/effect/original deadline | Current command buffers release after durable closure. New cycle may claim only from the terminal row and high-water. |
| Delayed old target | Target's own durable authorization names old control partition, authorization and cycle ordinal; current control row has a monotonic closure high-water | Read-only old-cycle retirement query bound to exact target authorization | Existing control owner returns canonical `RETIRED_SUPERSEDED` only when `oldOrdinal <= closedThroughCycleOrdinal` | Arbitrarily many later cycles do not erase the high-water; unreadable route/row stays HOLD | Consumer clears old replacement debt only after exact-target validation plus whole-cycle closure; current cycle is unchanged. |

The model columns identify intended facts and transitions. They do not claim
the current source contains these fields or commands. The actual seam evidence
is limited to the existing singleton control revision CAS, dependent pause
generation CAS, durable startup authority file, operation rows and retained
diagnostic. Future source must implement the table through those owners.

### AC1: durable descriptor and exact command before the first effect

The existing control row becomes the pre-effect custody owner. A new
`CLAIM_PARTICIPANT_RELEASE_CYCLE` command is an operation of the existing
participant-release control owner, stored in
`_partition_write_generation.participant_release_control_text` with the
existing `participant_release_control_revision` CAS. It is not a new ledger or
coordinator.

The command captures own primitive canonical data exactly once:

```text
cycleDescriptor = {
  version,
  controlPartitionId,
  cycleOrdinal,
  priorControlRevision,
  closedThroughCycleOrdinal,
  rootAuthorityText,
  effectId,
  originalDeadlineAtMs,
  targetBuildDigest,
  controlReleaseText,
  controlConfigurationText,
  controlTargetEntriesText,
  dependentReleaseText,
  dependentConfigurationText,
  dependentTargetEntriesText,
  dependentAttemptText,
  expectedDependentFenceText,
  pauseCommandText,
  pauseCommandDigest
}
```

For seed startup, `rootAuthorityText` is the canonical immutable subset of the
existing file-backed startup record: storage-birth kind, activation scope,
data-directory authority ID, canonical data directory, node and durable
session identity, plus the exact existing invocation ID, current boot
incarnation, target build and original deadline. Current boot remains an
applicability fence; it is not the immutable storage-birth authority. For a
fresh CREATE it is the canonical exact operation/admission/physical-worker
claim already owned by the CREATE lifecycle. For an operator request, the
live operator capability may authorize this first claim only. Once committed,
the control claim is durable authority to finish or retire that exact effect,
never to create another operator effect.

`effectId` is the existing root owner's canonical effect identity. A seed or
CREATE restart reads it from the durable source record. An operator crash
before claim has no effect to recover. No path reissues a random token and
pretends it is the old effect.

The exact PAUSE command is built before the control claim and stored verbatim
inside it. First the owner captures a canonical PAUSE intent containing the
dependent leader/term, full release and configuration, cycle ordinal, expected
dependent fence and original deadline. `cycleId` hashes the versioned
root/effect identity, control partition, prior terminal revision/high-water,
dependent release and that intent digest. The exact PAUSE body then binds the
cycle ID to the intent, and its entry ID hashes that complete body. This order
has no self-referential digest. Both intent digest and final command digest are
stored in the claim. The command's entry ID is stable across lost replies and
process restarts. If its captured leader/term becomes stale, the owner settles
this claimed cycle; it cannot rebuild a different PAUSE inside the same cycle.

The claim CAS is the winner and durable acceptance point. Only after its
committed result or exact readback may the existing owner dispatch the stored
PAUSE. Thus the PAUSE-before-RESERVE crash interval in round eleven no longer
exists. Compaction or snapshot restore retains the complete descriptor and
command in the control row. Once PAUSE applies, the dependent singleton row
also retains `cycleId`, cycle ordinal, command entry ID, apply index/term,
pause generation, descriptor digest and original deadline. Existing snapshot
ownership carries those row bytes; log retention is not required.

The later authorization ID is deterministic from the committed claim identity
and exact dependent PAUSE proof. RESERVE changes the same slot from
`CYCLE_CLAIMED` to RESERVED. It never recaptures root authority, deadline,
leader facts or command bytes after an await.

### AC2: conditional PAUSE and loser settlement

The global contended key is the existing control partition's singleton
participant-release slot. All dependents using that control owner compete at
`CLAIM_PARTICIPANT_RELEASE_CYCLE`, before any PAUSE. At most one exact cycle is
`CYCLE_CLAIMED`, RESERVED, AUTHORIZED, DISPATCHED or CONFIRMED. A different
request receives typed HELD/STALE and cannot enqueue a dependent PAUSE.

Each dependent singleton row gains a monotonic release-cycle fence in its
existing participant-release state:

```text
dependentFence = {
  acceptedCycleOrdinal,
  acceptedCycleId,
  acceptedPauseEntryId,
  acceptedPauseIndex,
  acceptedPauseTerm,
  supersededThroughCycleOrdinal,
  supersessionEntryId,
  supersessionIndex,
  supersessionTerm
}
```

Conditional PAUSE apply accepts only the exact committed-claim command shape,
the expected prior dependent fence and a cycle ordinal above
`supersededThroughCycleOrdinal`. It then atomically advances pause generation,
clears the prior dependent authorization and stores the full accepted proof.
An immediate exact replay returns that proof without another generation. A
different or older cycle whose ordinal is at or below the accepted or
superseded fence returns STALE and does not advance generation or clear the
successor authorization. Apply uses only command bytes and the replicated
dependent row; no socket, route, timer or volatile control lookup enters it.

The control claim alone is not presented to the dependent as self-authenticating
authority. Dispatch remains restricted to the existing registered release
handler/operation port after committed claim readback. The monotonic dependent
fence supplies deterministic late-command safety. Under the repository threat
model these two existing owners form the handoff; arbitrary direct Raft command
injection is outside the API boundary and is not turned into a second verifier.

If the exact PAUSE cannot apply because its captured attempt is stale, its
outcome is unknown, or the original foreground deadline expires, the same
release owner issues one exact conditional supersession command for that
cycle. At the dependent log, PAUSE and supersession have a total order:

```text
PAUSE first       -> PAUSE proof is stored -> supersession closes it
supersession first -> supersededThrough advances -> delayed PAUSE is inert
```

The control row cannot terminalize the claim until it records the exact
dependent supersession proof. A lost supersession reply is read back by its
entry ID. Only then does an exact control terminalization advance the closure
high-water and allow a new claim. A later leader may use a bounded recovery
execution window to resolve an already accepted PAUSE/supersession command,
but the immutable root, effect, original deadline and command identity remain
unchanged. Recovery cannot begin a new foreground cycle after expiry.

For concurrent A and B, the complete schedule is:

```text
A control claim CAS commits
B control claim CAS loses; B has no PAUSE dispatch right
A exact PAUSE applies or is conditionally superseded
A continues or terminalizes with dependent proof
only after terminal closure may B capture the new predecessor and claim
delayed A PAUSE observes the dependent high-water and has no effect
```

For two requests that are byte-identical at the same terminal predecessor,
the claim entry ID is identical and they coalesce as one unresolved effect.
For different roots, releases or targets the cycle IDs differ and the control
CAS chooses one. Local singleflight remains an optimization; correctness is
the two durable conditional transitions.

### AC3: bounded canonical result after arbitrary later cycles

The control row carries two safe monotonic integers:

- `cycleOrdinal`, assigned as prior ordinal plus one by the claim CAS; and
- `closedThroughCycleOrdinal`, advanced only by a terminal RETIRE or
  supersession whose dependent fence proof is recorded.

Every dependent authorization row stores the exact control cycle ordinal and
cycle ID that authorized it. A new control claim is legal only from a terminal
row and copies forward its closure high-water. Therefore a current row with
`closedThroughCycleOrdinal = N` is a compact committed proof that every cycle
ordinal at or below N is globally inapplicable. It does not claim which target
caused closure or fabricate a target-specific retirement.

The actual retirement consumer sends its target's durable authorization ID,
cycle ID, cycle ordinal and target bytes to the current control owner. The
owner has exactly three results:

1. Matching current cycle: execute or read back the exact target RETIRE.
2. Requested ordinal at or below the current closure high-water, with the
   target's own dependent authorization validating its membership in that old
   cycle: return typed `RETIRED_SUPERSEDED` with the control partition,
   requested cycle ID/ordinal, current high-water and its committed closure
   index/term/revision. The command is read-only with respect to the current
   cycle.
3. Unknown, active different, malformed or unreadable evidence: return HOLD or
   STALE and retain the successor-publication obligation.

The superseded result is produced only by the current control leader through
the existing operation-bound INSPECT/release interaction after current
committed membership, lifecycle and applied-boundary checks. A stale replica
with a lower high-water can only return HOLD; it cannot manufacture closure.
No route hint, cache row, local projection or transport answer is closure
authority.

`RETIRED_SUPERSEDED` means the complete old authorization was ordered
inapplicable before any later cycle claim. It does not assert that the old
target's individual RETIRE command committed. The controlled successor owner
may consume it only after revalidating that its own durable old authorization
and target match the request and that no successor has yet published. This is
the canonical whole-cycle terminal read promised by round eleven.

The high-water survives arbitrary slot reuse without an unbounded list. For
cycles A, B and C:

```text
A claim/apply/authorize -> closure records closedThrough=1
B claim requires that closure -> closure records closedThrough=2
C claim requires that closure -> active C carries closedThrough=2
late A target presents its durable cycleOrdinal=1
control returns RETIRED_SUPERSEDED(1, closedThrough=2)
C bytes and applicability remain unchanged
```

If C later retires, the high-water becomes 3. If A closure was never
authoritative, B could not have claimed, so no later high-water can falsely
certify A. Route unavailability, missing dependent authorization or malformed
ordinals never prove closure.

Cycle ordinals and closure high-water values use the existing safe-integer,
nonnegative, non-`-0` validation. The claim refuses before effect when the next
ordinal cannot be represented exactly; it never wraps, coerces or resets the
high-water on restart.

### Full phase and recovery rules

The one slot now has these states and legal successors:

```text
EMPTY/RETIRED
  -> CYCLE_CLAIMED
  -> PAUSE_APPLIED
  -> RESERVED
  -> AUTHORIZED
  -> DISPATCHED
  -> CONFIRMED
  -> RETIRED

CYCLE_CLAIMED or PAUSE_APPLIED
  -> SUPERSESSION_PENDING
  -> RETIRED
```

Every transition is an existing control-row revision CAS or an exact
conditional dependent-row apply. Same-command replay returns the stored phase
result. Different-cycle work is HELD while the slot is nonterminal. A delayed
finalization after RETIRE remains STALE; a committed finalization before
RETIRE remains historical but future consumption is closed. An unfinished
AUTHORIZED/DISPATCHED cycle resumes the same identity. Local HOLD is required
throughout restart and does not itself terminalize anything.

The original foreground deadline covers discovery, claim admission, PAUSE,
drain, authorization and initial dispatch. It is captured before the first
release operation and stored in the claim. ACK, retry and checkpoint re-entry
never renew it. After expiry, the existing recovery owner may take one bounded
later execution turn only to read back, finish, retire or supersede already
accepted exact commands. That turn has its own execution budget but creates no
new authority, cycle, PAUSE, admission permission or startup deadline.

Descriptor/control candidate bytes are admitted before the claim CAS through
the already approved participant-release/R7-2 resource owner, charging old row
plus candidate, command copies and response custody. Dependent PAUSE and
supersession copies remain charged until their durable result/readback. The
single control slot bounds live cycle descriptors; the two ordinal fields are
constant size. Capacity refusal happens before claim effect and remains typed
pressure under the original deadline. Release wakes the same owner. No count
or participant cap, global limit increase, new timer or network-held SQLite
transaction is introduced.

### Required deterministic feasibility and production witnesses

The design model must distinguish its supplied commit coordinates from actual
Raft proof. Before source implementation review it must execute all of these
state-machine schedules:

1. crash before claim, after claim/before PAUSE, after PAUSE/before control
   continuation, and after RESERVE; only the first may accept a genuinely new
   caller request;
2. lost PAUSE, supersession, RESERVE and RETIRE replies with exact command
   readback and no ID remint;
3. leader/process change and log compaction after claim, proving the stored
   command and proof rows suffice;
4. A claim versus B contender before effects, plus A PAUSE then supersession
   and delayed A after a successor PAUSE; the delayed command cannot advance
   generation or clear authorization;
5. finalize-before-retire and retire-before-finalize with replicated-state-only
   predicates;
6. three distinct dependent cycles A/B/C, then delayed A target recovery via
   `RETIRED_SUPERSEDED`, with C's row byte-identical before and after;
7. post-ENABLE one-follower catch-up positive, membership/incarnation negative
   and expiry retaining the exact cycle; and
8. original foreground deadline versus later bounded recovery turn, including
   shutdown and restart with no new foreground PAUSE.

Future production tests must additionally traverse the real authority issuer,
operation port, proposal/append/apply, SQLite rows, transport loss, startup
re-entry, local admission consumer and controlled successor publisher. They
must retain a same-source refusal and legitimate progress pair, complete
population, current lifecycle/configuration, exact commands and before/after
rows. The unchanged pgwire oracle remains required after focused proof.

### Round-twelve disposition

The corrected whole handoff is:

```text
durable root/effect + original deadline
  -> control claim chooses one cycle and stores exact PAUSE command
  -> conditional dependent PAUSE or conditional supersession
  -> control records exact proof and continues the same cycle
  -> existing authorization/finalization/confirmation
  -> same-attempt post-ENABLE catch-up
  -> exact retirement/supersession advances monotonic closure
  -> later cycle or delayed-old-target canonical result
```

This is a design and feasibility target only. Product source remains frozen at
the unapproved `14fac7d6` snapshot until author-distinct review approves this
complete amendment. No source, test, metadata, startup, FreshMG, merge or
publication approval is claimed.

## Round-thirteen exact pre-submit custody, executable supersession and history scope

The immutable round-twelve subject is retained at
`evidence/design-participant-release-activation-authority-cycle-round13-predecessor-3aeadfe3.md`,
SHA-256
`3aeadfe3b654b6b065cd99ac6d9df583dc2fff4a3636225517da8a945763a32d`.
Independent report
`review-activation-cycle-design-round2-independent.md`, SHA-256
`f14f361452a8240db6275a72de18073eb27d82021f9cd700b51b7a54e9b87d1a`,
rejects round twelve for AC12-1 through AC12-3. This amendment corrects those
three boundaries as one existing-owner handoff. It preserves the accepted
round-ten prefix `82b11d80...`, R7-2 route/resource lifetime, the committed
control winner, the conditional dependent fence, the same-attempt post-ENABLE
catch-up and the original foreground deadline versus bounded later recovery
turn.

This section supersedes round twelve only where that section assigned
precommit custody to the control row, treated an operator crash generically as
"before claim", or compared a bare ordinal/high-water. Precommit custody now
starts at the existing root command record's candidate CAS; the control row
owns the descriptor only after committed apply. An operator crash before
durable root acceptance has no effect, while a crash after root acceptance or
candidate capture retains exactly the corresponding obligation. Every ordinal
comparison below is qualified by one durable control history.

The words **candidate**, **command** and **execution envelope** have one
meaning in this section:

- a candidate is exact immutable command bytes retained by the root command
  owner before any proposal call;
- a command is the deterministic replicated operation derived from those
  bytes; and
- an execution envelope is current routing and receiver admission evidence.
  It is neither part of the immutable replicated effect nor durable authority.

No absence, timeout, transport ACK, forward success, append observation,
CORE_OK status or volatile pending response proves commitment or replacement.

### One complete authoritative lifecycle

| Step | Existing authoritative owner and durable facts | Exact effect / command identity | Durable acceptance or application point | Crash, lost answer or changed attempt | Retained custody, capacity and release |
| --- | --- | --- | --- | --- | --- |
| 0. Root accepted | Seed/operator: `StartupWorkflowStore.participantReleaseCommand` and its admitted per-partition effect. Fresh CREATE: the existing `replica_operations` CREATE/admission payload. Background recovery reads one of those already admitted roots; it does not mint a new root. | Root command/operation ID, `effectId`, immutable authority digest, target build, exact partition and original request deadline. | Existing startup/command revision CAS or CREATE operation admission. No control proposal exists. | Before this owner CAS, a failed caller has no accepted effect. After it, a restart must resume this exact root even if no cycle candidate exists yet. | Root bytes and one per-partition outcome remain owned until origin observed, conflict, or exact terminal disposal. Existing command/resource limits apply. |
| 1. Claim candidate captured | The same root command owner extends that per-partition effect with one `pendingControlClaim`. This is a revision-CAS of the existing record, not a new ledger. | Exact control history precondition, predecessor revision/high-water, root/effect, original deadline, complete cycle descriptor, `claimEntryId`, exact CLAIM body, exact PAUSE body and their digests. | The root-owner revision CAS to `captured_unsubmitted` occurs before the first possible operation-port/proposal call. | A crash before this CAS may recapture from the accepted root. A crash after it, even before send, may only redrive these exact bytes. Startup invocation replacement cannot overwrite them. | The approved R7-2 owner admits old record + candidate + serialized/request/response copies before the CAS. Capacity pressure refuses before capture. Lease remains until the candidate has a canonical terminal outcome or custody transfers to the committed control row. |
| 2. Claim submitted or uncertain | `pendingControlClaim` remains in the root record. A second revision CAS marks the exact attempt `submitted_unknown` immediately before calling the existing request/operation port. | Same `claimEntryId` and CLAIM body. The route envelope contains current control replica, lifecycle, configuration and deadline but cannot change the command. | Only committed apply/readback accepts the claim. `submitted_unknown` records custody, not success. | Process loss, forwarded ACK, leader loss or tentative append retains the exact bytes. Current-route recovery redrives the same entry ID. A different candidate is forbidden until the same entry obtains a canonical committed terminal result (`CLAIMED`, `STALE` or `INVALID`). | Pending command and response copy stay charged. A committed `STALE/INVALID` proof releases that candidate; the accepted root may capture a successor candidate only after recording that proof, using the same root/effect and original deadline or its already authorized bounded recovery turn. Uncertainty never remints. |
| 3. Control claim committed | Existing control singleton row, now including `controlHistoryId`, cycle ordinal/high-water and complete cycle descriptor. The root record records the exact committed result then may drop its duplicate candidate copy. | The committed CLAIM entry ID identifies the cycle. Exact PAUSE bytes are copied from the candidate, never rebuilt. | `CLAIM_PARTICIPANT_RELEASE_CYCLE` apply is the global winner CAS. If the control history is initially empty, the same apply initializes its durable history ID as described below. | Readback after process/leader change or compaction uses the entry ID and the complete control row. A losing root records HELD/STALE and has no PAUSE right. | Custody transfers without a gap: root lease is released only after the committed row/readback has been validated and the control owner has charged its retained row/copies. Sole slot remains occupied until exact terminal closure. |
| 4a. Conditional PAUSE | Committed control claim plus dependent row's exact history/fence and replicated release/configuration evidence. | Immutable PAUSE command stored by the claim, including control history/cycle, expected dependent fence and its captured target attempt. | Dependent replicated apply either stores the exact PAUSE proof and advances generation once, or records a typed replay/stale result. | Same entry replay is inert. A changed target attempt correctly blocks dispatch of the obsolete PAUSE envelope. It does not allow body mutation. | PAUSE copy and result remain charged until control continuation or supersession closure consumes the proof. |
| 4b. Conditional supersession | The control row first CASes the claimed cycle to `SUPERSESSION_PENDING` and stores the exact immutable supersession command before any dependent dispatch. | `supersessionId` hashes the old history/cycle/claim, dependent release, original PAUSE entry, expected dependent fence and supersession reason. Its command body excludes current route/leader/term. | Dependent replicated apply orders PAUSE versus supersession using only immutable command bytes and its own durable fence. | A stale execution envelope is refused before proposal. Recovery reacquires a current envelope and forwards the same command body/entry ID. If a prior send may have proposed it, exact redrive remains safe; delayed old delivery is replay. | One pending supersession per claimed cycle. Its retained command/result copies stay charged until the control row records the exact dependent proof. No new foreground deadline or admission permission is created. |
| 5. Control continuation | Same control row and exact dependent PAUSE or supersession proof. | Same history/cycle. Authorization ID derives from committed claim plus the exact dependent PAUSE proof; a superseded cycle has no authorization ID. | Existing RESERVED, claims, shares, FINALIZE, DISPATCH and CONFIRM revision-CAS transitions, or terminal closure after supersession. | Every exact command is read back by ID. Follower lag rereads within the fixed cohort; membership/incarnation change holds or terminalizes through the specified path. | Complete population, descriptor and response custody stay charged. Different root work is HELD by the singleton. |
| 6. ENABLE and catch-up | Existing admission owner consumes exact committed authorization, current target incarnation/configuration and fixed cohort. | Same effect/cycle/authorization and original deadline. | Existing origin command apply/readback and same-attempt `applied=commit=last` catch-up. | Unknown origin/dispatch result retains the same effect. A later bounded recovery turn can read/finish that effect but cannot create authority. | Local admission stays closed until exact RESUME/confirmation. Existing CDC/snapshot/settlement recovery remains operable while ordinary writes are closed. |
| 7. RETIRE or close superseded cycle | Existing control and dependent rows, exact target authorization or supersession proof, history ID and cycle ordinal. | Exact RETIRE or control terminalization entry ID. | Control apply advances the history-scoped `closedThroughCycleOrdinal` only after dependent delayed-command safety is durable. | Lost result is read by exact ID. Finalize-before-retire remains historical authority with future use fenced; retire-before-finalize makes the later finalize STALE. | Current-cycle buffers release only after closure is durable. A later cycle may start only from that terminal predecessor. |
| 8. Delayed old target | Old target's authentic durable authorization plus current control row in the same durable history. Controlled successor owner also proves no successor has published yet. | Old target authorization ID, `controlHistoryId`, cycle ID/ordinal and exact target bytes. | Current control owner returns `RETIRED_SUPERSEDED` only for same-history `oldOrdinal <= closedThrough`. | After the async answer, the consumer rereads the old authorization/target and no-successor fence. Changed bytes, different history or unreadable state retain HOLD. | Old target cleanup/successor debt releases only after that revalidation. Current cycle bytes do not change. |
| 9. Final disposal | Root command owner, control history and target lifecycle each retain only their owned terminal facts. | Root effect outcome, history-scoped closure proof and target retirement proof. | Existing owners mark their own terminal state; none infers another owner's completion. | Restart reconstructs no permission from absence. Snapshot/replacement preserves history and high-water exactly. | Candidate/envelope/buffer leases release; durable compact history ID/high-water and terminal root outcome remain. No unbounded per-cycle list is kept. |

The table is normative design. The unapproved `14fac7d6` source does not yet
implement these fields or commands.

### AC12-1: exact candidate custody before submission

`ParticipantReleaseCommandOwner` is the semantic owner already accepted in
R2-4. Its physical durable stores remain the existing ones:

- seed and accepted operator work extend the existing
  `StartupWorkflowStore.participantReleaseCommand` per-partition effect;
- Fresh CREATE extends the already durable CREATE `replica_operations`
  operation payload owned by the CREATE admission/lifecycle owner; and
- `createParticipantReleaseRecovery` is only a trigger/runner over those
  records. It does not own or reconstruct a candidate.

Each per-partition effect owns at most one unresolved claim candidate:

```text
pendingControlClaim = {
  version,
  rootOperationId,
  effectId,
  originalDeadlineAtMs,
  controlPartitionId,
  controlHistoryExpectation,
  prospectiveControlHistoryId,
  historySeedOrNull,
  predecessorControlRevision,
  predecessorCycleOrdinal,
  predecessorClosedThroughOrdinal,
  controlReleaseText,
  controlConfigurationText,
  controlTargetEntriesText,
  dependentReleaseText,
  dependentConfigurationText,
  dependentTargetEntriesText,
  dependentAttemptText,
  expectedDependentFenceText,
  cycleId,
  pauseCommandText,
  pauseCommandDigest,
  claimCommandText,
  claimEntryId,
  state: "captured_unsubmitted" | "submitted_unknown" |
    "committed_claimed" | "committed_stale" | "committed_invalid",
  committedResultOrNull
}
```

Every value is an own primitive or canonical text captured once. The owner
type-pins strings, safe integers and dense arrays before canonical encoding;
it rejects accessors, inherited fields, boxes, sparse inputs, nonfinite/-0
numbers and unsupported versions before admission. Hashes consume the pinned
canonical bytes, never values after an await.

The owner first admits the aggregate old-record plus candidate/copies under
the existing R7-2 resource owner. It then revision-CASes
`captured_unsubmitted` into its existing record and rereads byte equality.
Only after that readback can the request owner build a route envelope. A
second revision-CAS to `submitted_unknown` happens immediately before the
first operation-port call. The latter state does not assert the call happened:
after a crash, exact redrive is correct in both the before-call and
after-call schedules.

The accepted root and pending candidate are separate facts. A process crash
before candidate capture leaves the accepted root pending, not erased. A
crash after capture but before send, or after send before commitment, must
resume the candidate. `startupInvocation` boot replacement fences the old
callback but preserves `participantReleaseCommand` and its candidate. CREATE
attempt takeover similarly preserves its operation payload. An operator
capability may admit the durable root once; it is not needed to resolve its
retained candidate.

The existing exact operation request/readback owner resolves an uncertain
candidate by entry ID. If it is absent from the application row, recovery
redrives the same body through the current lawful route; absence, ACK and
elapsed transport time are not replacement. A later leader may commit the
same entry. Only a committed typed CLAIMED/STALE/INVALID result is canonical.
On CLAIMED, custody transfers to the complete control row before the root copy
and lease release. On STALE/INVALID, the root stores that exact result before
release. A successor claim candidate is legal only after this terminal result,
under the same root/effect and remaining original entitlement or its existing
bounded recovery turn. It is a new execution attempt after proven failure,
never a relabeling of uncertainty.

The per-partition effect keeps the current unresolved candidate and one
constant-size `lastTerminalClaim` result. Installing a successor candidate
revision-CASes that terminal result and the successor together; it never
temporarily loses both. Older terminal attempts require no list because their
committed result has no remaining effect, while an unresolved attempt can
never be displaced. This bounds retained metadata without turning absence into
proof.

At no point do volatile route/body reservations substitute for durable
custody. They account physical copies while the existing command record owns
the bytes and obligation.

### AC12-2: one immutable supersession effect, many current deliveries

Supersession settles one old claimed cycle; it does not grant a new release.
The existing control owner constructs and commits this canonical body into
the same singleton before dispatch:

```text
supersessionEffect = {
  version,
  controlHistoryId,
  controlPartitionId,
  cycleId,
  cycleOrdinal,
  controlClaimEntryId,
  dependentPartitionId,
  dependentReleaseText,
  originalPauseEntryId,
  expectedDependentFenceText,
  reason: "captured_attempt_stale" | "deadline_expired" |
    "claim_terminalizing"
}

supersessionCommand = {
  action: "SUPERSEDE_PARTICIPANT_RELEASE_CYCLE",
  entryId: H(version, canonical(supersessionEffect)),
  effect: supersessionEffect
}
```

`reason` is explanatory and fixed when the control CAS moves to
`SUPERSESSION_PENDING`; it does not alter apply authority. The command carries
no current receiver node, replica, boot, leader, term, route, socket or clock.
The control row owns its exact text and entry ID before any send.

For each send, the existing release recovery owner asks the canonical topology
owner only for a route hint, then obtains current operation-bound INSPECT facts
from the target dependent leader. It constructs a volatile execution envelope:

```text
supersessionExecution = {
  immutableEntryId,
  targetNodeId,
  targetReplicaId,
  targetReleaseText,
  targetConfigurationText,
  targetLifecycleIncarnation,
  leaderReplicaId,
  leaderTerm,
  operationDeadlineAtMs
}
```

The registered participant-release receiver revalidates this envelope after
queueing and immediately before asking its consensus operation port to propose
the immutable command. If the attempt/configuration/lifecycle is stale, it
returns typed `STALE_EXECUTION` and proposes nothing. The owner may acquire a
new envelope, but it reuses the same immutable body and entry ID. The envelope
is neither hashed into that body nor consumed by replicated apply.

The existing delivery disposition remains canonical: no handler, no
connection, queue loss or stale envelope is `DEFERRED` with the existing
retryable reason/retryAfter shape; malformed command/history evidence is
`FAILED`; and only exact committed apply/readback proof is `DELIVERED` for the
semantic operation. A transport ACK is never the latter proof. Every await
revalidates the recovery turn deadline and current receiver envelope. Shutdown
retains the command in the control row and the existing wake owner retries it;
no response renews the original foreground deadline.

Once a receiver may have proposed the command, an unknown answer never causes
a new effect identity. The existing request correlation and recovery
singleflight retain the entry ID. A current receiver may redrive the exact
body after the old delivery closes or times out; even if the old receiver
later delivers it, replicated apply returns the same proof. Thus leader/term
change does not trap recovery behind an obsolete envelope, and it cannot
change the old cycle being settled.

The deterministic dependent apply consumes only the command and its existing
row. In one SQLite application transaction it validates own primitive fields,
history ID, cycle/claim IDs, release identity, expected prior fence and exact
stored PAUSE relationship, then returns one of:

- `SUPERSEDED_BEFORE_PAUSE`: expected fence matched and no PAUSE for this
  cycle applied; advance `supersededThroughCycleOrdinal`, store the command
  proof and leave pause generation/authorization unchanged;
- `SUPERSEDED_AFTER_PAUSE`: the exact cycle PAUSE is stored; close that PAUSE,
  advance the same high-water and store the supersession proof;
- `REPLAYED`: exact entry ID and proof already stored;
- `STALE_CYCLE`: a later accepted/superseded ordinal in the same history makes
  the command inert; return the durable later fence without altering it;
- `HISTORY_MISMATCH` or `INVALID`: retain control debt; never report closure.

`SUPERSEDED_BEFORE_PAUSE` requires the exact expected prior fence from the
claim. `SUPERSEDED_AFTER_PAUSE` instead requires the exact accepted PAUSE
entry/cycle proof named by the same claim. These are the only two legal
preconditions; a merely different current fence is `STALE_CYCLE`, never
closure.

The total orders are therefore explicit:

```text
PAUSE commits first
  -> supersession sees exact accepted PAUSE
  -> SUPERSEDED_AFTER_PAUSE proof

supersession commits first
  -> SUPERSEDED_BEFORE_PAUSE proof
  -> delayed original PAUSE sees supersededThrough and is inert

target attempt changes before first supersession send
  -> old envelope refused with no proposal
  -> current envelope sends same immutable command

target attempt changes after an uncertain send
  -> retain exact entry/body
  -> current envelope redrives it
  -> first committed copy wins; all others replay
```

Only after the control owner reads an exact dependent proof does it
terminalize that cycle and advance the control closure high-water. No local
STALE result, route answer or missing handler releases the slot. Ordinary
mutation admission remains closed; the existing recovery wake/singleflight
and bounded execution turn perform this work.

### AC12-3: durable control-history identity and incompatible-history HOLD

Cycle ordinal and closure high-water belong to one explicit durable history.
The existing control singleton gains one scalar identity and its initialization
evidence inside the canonical `participant_release_control_text` object
already replaced by the control revision CAS:

```text
participantReleaseControlHistory = {
  version,
  controlPartitionId,
  historyId,
  historySeed,
  originIndex,
  originTerm,
  initializedByClaimEntryId
}
```

Every later control state copies this history block forward byte-for-byte.
This is part of `_partition_write_generation`'s participant-release control
state, not a second table or SQL row. When the first lawful CLAIM observes a
null history, its pending candidate captures a fresh own-string `historySeed`
and the exact committed partition origin before building the PAUSE. It computes
the prospective `historyId` as the hash of version, control partition, seed and
origin tuple. The exact PAUSE and CLAIM both carry that ID. CLAIM apply verifies
the current origin tuple, recomputes the ID from the retained seed and
initializes the history plus cycle1 atomically;
`initializedByClaimEntryId` is recorded as evidence but is not an input to that
ID. This acyclic order keeps the PAUSE byte-identical before and after CLAIM.
Random seed bytes are not authority: pre-submit durable custody plus committed
initialization is.

Every later claim, dependent fence, authorization, supersession, retirement
query/result and closure proof carries this exact `historyId`. A leader/term,
boot incarnation, route or current replica is never the history domain.
Leadership changes and ordinary process restarts therefore preserve
comparability.

Application snapshot/image production copies the complete singleton row,
including history ID and high-water. Authentic snapshot install and controlled
replica replacement retain the bytes exactly before the new replica serves
the control operation. Validators reject a partial combination such as a
history ID without its origin/high-water, or cycles/high-water without a
history ID. They never infer the ID from a catalog, route, boot or current
membership. An old unreleased image lacking this field returns typed
`CONTROL_HISTORY_UNAVAILABLE` and holds successor debt; it does not fabricate
ordinal comparability.

A genuinely empty/recreated control owner initializes a different history
seed on its first lawful claim. An old target authorization from the former
history is not comparable even if partition ID, origin coordinates or ordinal
are numerically equal. Its read returns `CONTROL_HISTORY_MISMATCH`/HOLD. This
design does not assert automatic cleanup when authentic former history has
been destroyed; the successor remains unpublished until the existing
lifecycle/restore owner supplies authentic history or an independently
authorized future policy supersedes that debt.

The current control leader's old-target response is:

```text
{
  outcome: "RETIRED_SUPERSEDED",
  controlPartitionId,
  controlHistoryId,
  requestedCycleId,
  requestedCycleOrdinal,
  closedThroughCycleOrdinal,
  closureIndex,
  closureTerm,
  controlRevision
}
```

It is produced only when the target's authentic durable authorization carries
the same history ID and requested ordinal is within the history-scoped closed
high-water. The controlled successor/lifecycle consumer captures its local
old authorization, old target and `successorPublished=false` fence before the
await. After the answer it rereads all three. Byte mismatch, successor already
published, lifecycle replacement, different history or unreadable state
retains the debt. The control response is read-only with respect to any current
cycle.

For same-history cycles A, B and C, closure of A permits B and closure of B
permits C. Delayed A can consume C's `closedThrough>=A.ordinal` only because A
and C carry the same history ID; C remains byte-identical. A same-named control
partition in history D with the same numeric high-water refuses A. No local
inference or cross-history ordinal manufactures retirement.

### Complete paired schedules and proof ceiling

The round-thirteen feasibility model must cover these together:

1. accepted root with no candidate, captured-before-send crash, and
   submitted-unknown crash; the last two redrive byte-identical CLAIM/PAUSE;
2. later commitment of the uncertain candidate and committed STALE of that
   candidate followed by a successor capture only after the terminal proof;
3. PAUSE-first and supersession-first, changed attempt before send and after
   uncertain send, all with one immutable supersession body;
4. lost CLAIM, PAUSE, supersession, RESERVE and RETIRE answers with exact
   readback and no uncertain identity remint;
5. control history A/B/C with delayed A target, byte-identical C before/after,
   and a different-history equal-ordinal refusal;
6. target authorization mutation or successor publication during the
   old-target await, both retaining debt;
7. ordinary restart and authentic snapshot/replacement preserving history,
   plus history-unavailable refusal; and
8. finalize-before-retire, retire-before-finalize, same-attempt post-ENABLE
   catch-up and original foreground versus bounded recovery budgets.

The model remains a supplied-coordinate state machine, not production Raft
proof. Future source review must exercise the actual startup/CREATE/operator
stores, operation request/receiver, proposal/apply SQLite rows, authentic
snapshot transfer, transport loss, lifecycle consumer and controlled
successor publisher. It must include paired progress/refusal, resource and
metadata registration, exact before/after rows, current population and the
unchanged production pgwire oracle.

The corrected complete handoff is:

```text
durable accepted root
  -> durable exact claim candidate before submit
  -> same candidate through unknown proposal outcome
  -> history-scoped committed control winner
  -> exact conditional PAUSE or persisted immutable supersession
  -> existing authorization/finalization/confirmation
  -> same-attempt catch-up and RESUME
  -> history-scoped closure
  -> exact old-target revalidation before successor publication
  -> owner-specific terminal disposal
```

This is a design and feasibility target only. Product source remains frozen at
the unapproved `14fac7d6` snapshot. No source, test, metadata, startup,
FreshMG, merge or publication approval is claimed.
