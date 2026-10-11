---
audience: development
documentClass: proposal
---

# Participant release activation authority correction

Status: **round-three proposed for independent design re-review; no authority
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
