---
audience: development
documentClass: proposal
---

# Participant release activation authority correction

Status: **round-five proposed for independent design re-review; no authority
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
