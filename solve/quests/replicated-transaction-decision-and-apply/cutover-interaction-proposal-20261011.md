---
audience: development
documentClass: planning
---

# TX1 increment 5a: release interaction and restart proposal

Status: **proposed for owner judgment; no protocol implementation or proof**.
Subject: `e7c89f4b5114c0238312d3831b65889a4622f4e9` plus inherited 5a
draft. The eight sealed receipts and accepted v10 remain unchanged. The
inherited draft's claim that remote `matchedIndex` is an application census
is rejected. Its claim that every failed attempt may lower the pause is also
rejected. This proposal implements owner-decisions line 234's release
obligation and the parent's 2026-10-11 safety-first interpretation: the
connection stamp is not another participant BEGIN gate; release admission
remains closed until the release sequence has evidence.

## Existing facts and owner boundaries

| Fact / action | Existing owner and exact source |
| --- | --- |
| Stable committed eligible set | Operation port `readCommittedMembership({purpose: RETIREMENT})`; `src/raft/raft-rs-committed-membership-read.js` refuses joint configuration, pending change, missing identity, held core and unavailable generation. Rows discover addresses only. |
| Each replica's applied configuration | Same operation with `WITNESS`, read at that replica. `appliedIndex` is the recorded application boundary, not remote `followerProgress.matched`. |
| Generation origin / permanent legacy retirement | `readPartitionWriteOrigin`, committed application in participant store/apply. Only an applied origin is that durable fact. |
| Actual opened connection | `participantConnectionStampOf` in participant connection owner; generation + servedLegacy. A null generation is unproved. |
| Node boot incarnation | Read-only `ReplicaHandler.ownerIncarnation`, stamped by `defineReplicaLifecycleOwnerIncarnation` in `replica-state-machine.js`. No request supplies it as truth. |
| Live physical service | `ReplicaHandler.localServices`, `getTrackedService`, active storage admission, and current service identity. Snapshot already uses shutdown/new factory/`replaceLocalReplicaService`. |
| Connection reopen | New service through existing wrapped `createPartitionService`, restoring durable membership; never reinitialize a shutdown instance and never REMOVE/CREATE workflow or delete DB. |
| Host route surviving reopen | `${nodeId}/service/replica-handler`, registered by `replica-handler-runtime-methods.js`; current handler echoes correlation identity. |
| Leader and term | Local Raft operation-port observation; leader rows and caller assertions do not authorize cutover. |
| Release build evidence | Existing boot source fingerprint is only 16 hex and diagnostic. `executionEnvelopeOf` measures SQLite/source/compile options and classifier revision; it is not a JS artifact identity. There is presently no exact runtime build census. |
| Drain | Existing transaction maps + participant staging/durable PREPARED store + proposal queue + durable applied/commit/log boundary; absence in a caller's map alone cannot prove it. |

The only new volatile state is the existing lifecycle owner's per-partition
release execution record and each service's admission record. No new
coordinator service, table, sidecar store, durable release phase or completion
ledger. Committed origin remains the only TX1 cutover durable fact.

## Two necessary explicit policy decisions

1. **Before an origin, restart cannot distinguish never-paused from
   interrupted-paused.** With no new durable intent, every upgraded user-table
   replica (including every system/control-table partition) must open mutation admission closed until an explicit release
   request. It may recover committed work and serve reads. A pre-origin
   restart reports `release-request-required`; it does not auto-propose an
   origin on BEGIN or startup. With an origin, lifecycle start/leader change
   runs the same census/resume sequence automatically and never proposes a
   second origin. New partitions require the same release entry point, issued
   by their existing fresh-create owner as specified below. System/control
   tables are included; bootstrap establishes their exact cohort before any
   seed mutation. There is no excluded-table legacy path. This is a visible
   startup policy consequence, not an implementation detail.
2. **Exact build identity needs a production source.** Extend the existing
   boot provenance owner to retain an immutable full content fingerprint of
   the boot artifact, plus verified native binding identity and the actual
   connection's execution envelope. Source deployments use the existing
   content-fingerprint algorithm over the shipped source/dependency manifest;
   SEA builds embed its build-time counterpart through `build-sea.js`.
   Missing/unreadable provenance is `build-unproved`. The release request
   names an expected digest, but each host independently measures its own;
   a callback, env-supplied expected digest, version string, status row or
   equality boolean is not evidence. The published release artifact mapping
   must bind this digest to actual shipped bytes. Do not quietly promote the
   short diagnostic fingerprint to authority. This requires narrowly scoped
   provenance/build-owner work outside the initial partition files.

These decisions need acceptance before implementing a guessed protocol.
The no-durable-intent alternative to decision 1 cannot safely retain normal
pre-origin restart admission. A new replicated intent would be a larger
contract and is not proposed here.

## Narrow route and identities

Add one `PARTICIPANT_RELEASE` message to the existing replica-handler route,
with actions `inspect`, `pause`, `drain`, `reopen`, `enable`, `resume`.
Keep these actions in one release algorithm owned by ReplicaHandler and its
partition service. No generic remote execution operation.

Canonical release identity:
`{partitionId, protocolVersion, targetBuildDigest, configurationKey,
membershipGenerationIndex}`. Its canonical digest is the stable request
identity, unchanged across retries, delivery loss and restart. Each phase
request also carries exact target `replicaId` and an attempt fence
`{leaderReplicaId, term, leaderLifecycleIncarnation}`. A term change ends that
attempt; it does not change the durable transaction/origin. A new leader
reconstructs a new attempt for the same release identity after reading its
own current membership. Membership change produces a different release
identity and invalidates outstanding receipts.

The target validates the request against its operation port and current
tracked service, never against SERVICES ownership alone. Stale leader,
configuration, boot, runtime, connection or pause generation is typed
refusal. `reopen` and `resume` name the exact target stamp observed earlier:
`{nodeId, ownerIncarnation, replicaId, lifecycleIncarnation,
runtimeGeneration, connectionGeneration, admissionGeneration}`.
Correlation IDs route replies; they are not authority or deduplication keys.

An inspection answer is immutable data containing those locally read fields,
the applied membership witness, actual build evidence, origin index/term,
connection stamp, admission phase, drain counts and own-table rowid census.
It cannot carry `eligible: true` or `canResume: true` instead of the facts.
Missing facts are typed unavailable, not zero or absence.

## Ordered execution and commit points

1. The current leader's lifecycle handler reads stable RETIREMENT membership
   and discovers a route to **every voter and learner named by that answer**.
   Missing address, unsupported build, unavailable current owner or active
   topology transition leaves admission closed, with a bounded refusal.
   An old executable lacking the route is never assumed paused.
2. `pause` closes new ordinary mutations and both forms of BEGIN at each
   eligible member, returns its exact admission generation, and is
   idempotent for that release identity. Accepted statements/prepare/decision
   and durable outcome reads continue. Raft delivery/application, lifecycle
   control and application of already committed control-table recovery are
   not blocked. Newly proposed control-table mutations are paused too.
3. Only after all pause answers, collect `drain`. Each target reports zero
   active legacy sessions, zero retained unresolved legacy PREPARED, zero
   participant staging/PREPARED, zero admitted mutation executions, zero
   queued/inflight proposals, and its applied/commit/persisted-log boundary.
   Deadline never erases sessions or converts an uncertain proposal to
   absence. Resolve accepted obligations through their owners. An unapplied
   log suffix keeps the drain pending; do not guess it is discardable.
   Reads/control messages do not count as mutation executions.
4. Reopen every replica whose connection is unproved or served legacy,
   using current storage/lifecycle admission and the normal shutdown/new
   factory/swap path. The new service starts closed before registration and
   before it can lead. Followers first; before reopening a leader, request
   existing leadership transfer to an already reopened voter. The resulting
   term change ends the old attempt; the new leader restarts inspection.
   This makes leadership change an ordinary recovery trigger rather than
   continuing with stale leader authority. A one-replica group is reopened
   by its stable node handler and reconstructs after election.
5. Read each actual new connection, drain again and do rowid census with
   exact integers (`max(rowid) < 2^62` on applicable own tables). A
   WITHOUT ROWID table is classified explicitly, not via swallowed SQL
   error. Store/schema/read failure and ceiling violation refuse. Census is
   bound to the same connection and admission generation. Legacy committed
   divergence is not repaired or blessed by this sequence; L6's compatible
   starting application state remains a prerequisite and requires evidence.
6. Re-read stable membership; the leader invokes the existing low-level
   origin owner **only here**, if no origin exists. The command's durable
   application is the one retirement/generation commit point. Lost proposal
   answer is resolved by reading the origin/durable command outcome, never
   by lowering the gate or inventing a second origin. Pending same entry
   identity joins its existing proposal. No BEGIN/startup auto-enable.
7. After local origin application, collect fresh `inspect`/census from
   every member: equal origin index/term, own applied boundary at or past
   origin, same applied configuration generation, actual target build,
   clean stamped connection, matching closed admission generation, no
   unresolved drain work. Matched index is excluded from this decision.
8. Re-read leader membership/tenure. `resume` carries the complete immutable
   census and exact target stamp; the release owner validates all fields,
   and each target revalidates its own current facts before opening. No
   public `lowerPause()` or caller boolean opens admission. Opening is only
   volatile execution permission; origin remains durable authority.
   Partial resume / lost answers replay idempotently. A target restart or
   changed stamp refuses the old resume, opens nothing and triggers fresh
   census. Never lower admission in `finally` or on a non-success return.

A completed census is not a promise that no remote process can restart an
instant later. Every replacement/restart starts locally closed, and a new
leader needs a fresh census before new mutation admission. Deploying a
different build remains a release event requiring pause before deployment;
this proposal does not create a supported mixed-version rolling upgrade or
put build checks in committed Raft application.

## Triggers, recovery and bounded consequences

One lifecycle release algorithm runs on explicit release requests, tracked
service creation/replacement, leadership/configuration observations and
bounded retry. Existing-origin boot schedules census; no-origin boot asks
for explicit release, as above. Handler shutdown cancels scheduling but does
not reopen admission. New leader takes over by re-reading origin/membership,
not by adopting an old task's claimed phase. In-process duplicate requests
join; after process loss phases are inferred again from owner facts.

Responses carry `{releaseId, phase, outcome, missingFact, owner,
retryAfterMs, observedStamp}`. Retryable outcomes include not-leader with a
hint, member-unreachable, origin-application-pending, drain-pending,
membership-changed and replica-generation-changed. Automatic bounded retry
ends each request by its declared deadline but preserves the closed gate
and owned level-trigger for reconsideration. Build incompatibility,
unproved source, rowid ceiling, malformed topology, lost required storage
authority and unresolved legacy obligations return operator-required with
the exact correction needed; they are not reported as completed 5a.

Topology BEGIN/PREPARE exclusion remains accepted R10's admission hint,
not a distributed split barrier. Runtime handles and valid active source or
target metadata refuse admission. Unreadable owner data or active malformed
metadata cannot prove absence; answer topology-unavailable. Existing
PREPARED settlement remains allowed. The APPLIED mirror cursor is untouched.

## Behavioral falsifiers required before readiness

Use canonical classified runner, then locked-lab real three-replica proof.
Controls must actually break the named behavior and show the witness red.

1. Omit pause on one replica: legacy BEGIN/new ordinary write remains
   possible; origin is not enabled.
2. Pause only after draining: inject a new mutation in the gap; no seal.
3. Keep legacy PREPARED or an uncertain proposal: deadline must preserve it.
4. Reuse a contaminated connection: enable refused; normal lifecycle reopen
   removes PRAGMA/TEMP contamination on all three replicas.
5. Fake remote matched progress while applied origin is absent: no resume.
6. Change replica boot/runtime/connection after census: stale resume refused.
7. Lose reopen reply then retry: exact current replacement is inspected,
   not destroyed/recreated again from an old generation.
8. Crash after origin apply before reply: same origin survives; restart
   re-censuses and eventually resumes with one origin command.
9. Crash before origin after pause: restart is closed and explicit release
   continues; no window of legacy admission.
10. Change membership/leader between census and resume: stale attempt refused,
    new owner converges after prerequisites return.
11. Missing/old remote route, wrong measured build, forged expected digest or
    missing boot incarnation cannot pass census.
12. Rowid boundary at exactly `2^62`, unreadable DB and malformed active
    topology metadata refuse without proposal.
13. Lost final resume reply replays; no repeated origin or reopened already
    clean connection, and resumed ordinary + participant mutations succeed.
14. Control-table bootstrap and committed transaction recovery progress
    while user-table mutation admission is closed.
15. Explicit production route/factory/registration path drives all three
    replicas through pause, drain, actual reopen, enable, census and resume;
    a local callback-only test cannot substitute for this witness.

## Revision 2: concrete bootstrap and creation call sites

Parent review rejected the initial system-table exception. The ordering below
replaces it. It requires production integration, not only injected callbacks.

### Seed group before registration writes

`SeedPartitionsPhase.phasePartitions` already opens every system-table
replica and starts deferred elections before registration. Its registration
dependency cut is explicit (`getRequiredLeaderPartitionIds`); initial peer
addresses come from `getInitialReplicaIds` and the actual node identity, not
an empty cache. `SeedRegistrationPhase.phaseRegistration` currently waits for
required leadership, enables its bootstrap writer and immediately begins
registration writes. Insert the exact cohort release **after actual group
leadership/elections and before `registerMessageGroup` or any other seed
mutation**. Also release other system partitions before their first writes
and before `CACHE_HYDRATED` can start schema migration. All apply the origin;
M1's `tables` and `schema_migration_partitions` are not exceptions.

The node's current ReplicaHandler is acquired too late (the
`CONTROL_PLANE_READY` step of `bootstrap-service-seed-workflow.js`). Split
`initializeReplicaHandler` in `bootstrap-service-replica-registration-methods.js`
into lifecycle acquisition/runtime registry attachment and its later state
publication work. Acquire the same incarnation-bound owner and register its
route before seed registration. Attach the actual PartitionService instances
to its existing live registry. Leave `registerReplicasWithStateMachine` and
its SERVICES publication at the existing later step. The bootstrap replica
factory/closed-handle ownership is unchanged. No ACTIVE/READY row is invented
to make release work.

`ReplicaHandler.handleMessage` currently waits for removed-cleanup startup
authorities before dispatching every operation. Release inspection,
pause/drain, origin and resume require the current live service and its
consensus facts, not completed removed-storage cleanup; dispatch that narrow
control interaction independently. Actual reopen still requires the existing
storage/lifecycle authority. Freshly opened clean seed services need no
reopen. An unproved storage authority never grants a reopen.

Bootstrap topology reads must not require cache hydration (which comes
after registration). The existing bootstrap writer's authoritative read
lane can read `tables` from the already opened local leader without proposing
a mutation; enable its routing before release, then read that owner's actual
table. Fresh seed proves absent transition rows through that read, not
through `getAll() || []`. Reads of an unavailable/restoring TABLES cohort
return pending; committed apply/elections continue. Cohort addresses come
from the seed's actual open service registry matched to Raft identities.
No new transaction, metadata insertion or completed serving readiness is
needed to acquire these facts.

Fresh-seed authorization comes from the existing membership startup owner's
`FRESH_SEED` outcome (`rejoin-hints.js`, exported reason vocabulary in
`rejoin-hints-constants.js`), propagated by `startLagrangeRuntime` into
`startSeedNode` and BootstrapService. The seed branch currently drops
`startupJoinDecision.membershipOwnerOutcome` while join retains it; preserve
it. A GENESIS request by itself does not prove fresh storage because the
runtime may restore a durable group regardless of the supplied stamp.
`DURABLE_SEED`, explicit seed mode, unreadable evidence or a restored legacy
group without origin does not silently acquire automatic fresh permission.
Those take explicit operator release (below). A fresh startup interrupted
before origin may need that explicit reissue if the startup owner can no
longer prove freshness; it remains closed and has an available operation.

### Ordinary fresh table creation

`sql-query-engine-initial-partition-provisioning.js` is the existing second
GENESIS origin: it constructs the exact founding topology, stamps the
existing CREATE operations and waits for a current leader before returning
its provisioning summary. Invoke the release request at that boundary, before
the summary may report a writable group. The trigger carries the existing
create operation/job identities and planned peer addresses as discovery;
the release handler still reads actual RETIREMENT membership and includes
all actual committed voters/learners. Initial CREATE retry uses the same
durable job, not a new release authority record. Existing-table lookup or
RESTART_CREATE alone does not authorize initial no-origin release.

`table-creation-service-partition-provisioning.js`/completion must preserve
the release-pending/refused outcome; a metadata-only success cannot advertise
writable completion. This changes the present quorum-only creation fast path
where the committed cohort contains an unavailable extra founder: it waits or
returns owned pending until every eligible replica has passed the census.
Root/query owns this narrow call-site integration; 5a supplies the shared
request shape and executable handler. A request cannot use an arbitrary
`fresh: true` boolean to choose this path.

### Existing-origin startup and leadership change

`registerExistingReplica`, successful CREATE's registry attachment and
`replaceLocalReplicaService` trigger the handler's same release reconciler
when the local durable origin exists. `partition-service-raft-lifecycle-wiring.js`
closes a previously opened leader admission on tenure loss/change; the
existing `CONSENSUS_OBSERVED` relay schedules fresh census after leadership or
configuration changes. No origin is proposed in these startup paths. If the
group has no origin and lacks a fresh-create or explicit operator request,
the reconciler publishes `release-request-required` and keeps new mutations
closed. Reads and committed apply do not wait for release.

### Available operator entry point

The normal admin WebSocket runtime starts after `bootstrapService.bootstrap`
returns (`lagrange-runtime-startup.js`), so a new admin method alone cannot
recover a blocked legacy seed. Add an explicit one-shot startup operation to
the existing CLI/startup composition naming the partition set and target
build digest. It passes a release request to the early lifecycle handler as
each requested group becomes available; it does not toggle a feature or
pretend an expected digest is measured evidence. It must return/log the
typed bounded per-partition result and preserve closed admission on failure.
No-origin legacy seed/system groups can therefore be upgraded while normal
bootstrap remains paused. A runtime admin operation on the existing admin
surface invokes the same release method for running clusters. Both require
the concrete partition identities and immutable target build; the driver
resolves the leader from current consensus and can be retried safely.

### Local-write bypass and CDC dependency

`cdc-bootstrap-direct-sql.js` falls back after a Raft write refusal to
`PartitionService.executeLocalQuery`, which currently mutates SQLite without
pause/origin admission. The partition owner must refuse local mutation while
closed and permanently retire that local mutation path once origin applies.
The read branch remains available. The CDC owner must propagate the typed
cutover/retired refusal without treating it as permission for another lane.
Seed writes after successful release use the existing Raft lane. This is a
required production dependency and positive seed witness, not an exemption.
No CDC-owned source is edited by this agent.

### Additional falsifiers for revision 2

- Real fresh seed opens exact system cohorts, records origin everywhere,
  performs registration and cache hydration, then succeeds at explicit M1
  using `tables`/`schema_migration_partitions` and persisted coordinator rows.
- Block cache hydration until after release; verify release makes no system
  mutation to obtain membership, topology data or fresh authorization.
- Start durable no-origin seed without explicit operation: bounded named
  refusal. Repeat with explicit release: completes without bypassing local
  mutation/origin gates. Normal admin is not required to become ready first.
- Fault one system-table follower's actual build/origin apply: seed cannot
  claim registration/migration readiness; recovery resumes when the fact is
  corrected. No direct-local fallback writes appear on any replica.
- Fresh CREATE full cohort census completes before writable result; a missing
  committed founder yields release-pending instead of quorum-only success.
- Reuse fresh seed/create labels on existing unproved legacy storage: no
  auto release; old startup status or a caller boolean cannot authorize it.

No source implementation, independent approval or readiness claim follows
from this proposal. Query owns decision-record codec/schema changes; root
owns integration and separately assigns independent verification.
