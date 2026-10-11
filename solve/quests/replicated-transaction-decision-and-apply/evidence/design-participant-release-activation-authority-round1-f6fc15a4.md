---
audience: development
documentClass: proposal
---

# Participant release activation authority correction

Status: **proposed for owner judgment; no authority source change or proof**.
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
