# Application image / restore dependency decision

Read-only source audit by `subagent:/root/snapshot_contract_audit`, against
`108282c80318fbc9e7094f2e7a99ba37430374fd`. No snapshot edits, test runs or lab
leases. Select the existing content/format and coupled native-install owners;
do not create a release-specific image or installer. Implementation remains HOLD.

## Exact preserved work and ownership

| Work | Ref inspected now | Worktree state |
| --- | --- | --- |
| Coupled catch-up/install ownership draft | `9554f689ef1fd4560e23ed8ca4f386266539f83f`, `handoff/rs-raft-salvage-20261008-snapshot-catchup-ownership-wip` | Clean |
| Application content/format predecessor | `458076e64b4e36ac1525f93f6daa41bbf3fadc5c`, `handoff/rs-raft-salvage-20261008-snapshot-content-format-wip` | Clean; recorded STOP |
| Local-open completeness predecessor | `2384216d16d11dc6d62a682ffef192dc944a7a15`, `handoff/rs-raft-salvage-20261008-snapshot-dependency-b-wip` | Clean; incomplete historical work |
| Application-preservation diagnostic | `82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af`, `codex/snapshot-owner-application-preservation-diagnostic-20261008` | Untracked `test/raft/raft-rs-backend/partition-native-checkpoint-application-preservation.test.js` preserved |

These are current ref/status observations, not active leases. No active snapshot
implementation agent was established. Existing routing authority is
`solve/epics/raft-rs-full-cutover/contract-first-2026-10-08.md:99` and
`local-priorities-2026-10-10.md` SN1. The catch-up draft's
`planning/2026-10-08-independent-predecessors-owner-judgment.md` allocates content
to checkpoint owners, local-open to lifecycle/durable/open owners, and
publication/transfer/native admission/atomic import/continuation to one coupled
interaction. The old branches are design and witness inputs, not merge candidates.

## Source-to-contract map

All paths below are under `src/`, at the accepted source baseline.

| Concern | Current authoritative surface | Required extension / blocker |
| --- | --- | --- |
| Atomic committed application | `raft/raft-rs-application-transaction-owner.js:51` runs effect and applied position in one SQLite transaction | Application owner supplies exact replicated inventory and boundary B. |
| Image construction | `raft/snapshot-checkpoint-store.js:244`, `:262`, `:302` derives native descriptor then scrubs application tables; HLC is zero | Versioned application image, owner-fed inventory and real HLC. |
| Image validation | Same file `:469` requires exactly one table, `raft_rs_peer_identity` | Explicit v2 validator. Keeping release rows in v1 would be CORRUPT_PAYLOAD/PAYLOAD_TABLES. |
| Registered source call | `raft/snapshot-catchup.js:210` omits raftRsGroupId | Wire reviewed v2 producer into existing source path. |
| Native consensus acceptance | `raft/raft-rs-runtime-owner.js:1191` processes actual Ready | Bind exact staged image and receiver service generation to native accepted snapshot Ready. |
| Durable import | `raft/raft-rs-durable-store.js:404` persists snapshot/log/HardState; runtime `:1136` finishes Ready | Atomic application import plus relevant native durability/applied/configuration state before dependent sends/acknowledgement/advance. No such application import exists here. |
| Current install | `raft/snapshot-catchup.js:346` shuts service down; `raft/snapshot-install.js:555` requires fresh CREATE authority; receiver admission `:19` requires learner | Preserve fresh CREATE path. Intact voter installation cannot be obtained by weakening these checks. |
| Local eligibility | `partition/partition-participant-transaction-pause.js:190` starts CLOSED in WeakMap | Never import sender OPEN. Re-establish receiver-local eligibility after replay. |
| Retention | `raft/snapshot-retention.js:31`, `:218` keeps two newest complete plus all pins | Two is not a total capacity bound; pinned generations and outcome/transaction retirement differ. |
| Cadence | `partition/partition-snapshot-cadence.js:54` returns COMMITTED_LOG_UNSUPPORTED | Keep refused until application image/install/replay consumers permit compaction. |

The content predecessor's log entry `2026-10-08T01:59:51.108Z` explicitly stops:
`sqlite_schema` minus a denylist is not owner-fed replicated-schema provenance.
No current applicationSchema/content inventory producer was found. Newer TX1
replicated PREPARE does not establish provenance for all application objects.
TX1 store and committed-result owners can declare their own image state;
checkpoint code must not infer authority merely from names of existing tables.

## Selected boundary and restore semantics

One immutable B binds cluster/group/entity identity; applied index/term;
ConfState and membership-generation provenance; application schema, explicit
and implicit indexes, data, sequences and committed HLC; participant obligations,
operations/validation, origin/write generation and terminal outcomes; release
state, exact outcomes, committed accounting and retirement protection. Include
query-owned discharge records and their schema/provenance and pinning rules.
Format, manifest and payload hashes bind those bytes.
Source core/Ready-held and uncommitted pending credits are not replicated image
contents; the receiver runtime reconstructs its own outstanding suffix/custody
accounting before admitting requests. Unresolved query obligations pin their
discharge records until the query owner's reviewed retirement contract permits
their removal; release-result retirement cannot silently remove those facts.
Include the INIT activation marker and protocol version at B. A pre-INIT image
must replay the retained INIT suffix before new admission. A post-INIT image
missing release state or marker is unavailable/corrupt, never fresh storage or
permission to rerun INIT.

Keep the preserved draft's separation: manifest M contains immutable
application/native boundary facts; descriptor D carries publication/routing
freshness; native binding N identifies the exact checkpoint. Publication epoch,
membership generation, releaseVersion and request-retirement generation are
different identities. Historical B is valid while source writes continue if
every committed suffix entry after B remains available; equality with today's
applied position is not a liveness requirement.

Exclude sender vote/HardState, lifecycle/runtime/connection/admission state and
volatile staging. Group membership and peer identity are supplied by their
owner; they are not an unfiltered copy of sender-local authority.

For an intact receiver, bytes and descriptor validation alone do not grant
installation. Actual native accepted Ready, exact binding and current target
generation permit the existing durable/application owners to commit the image,
native state and exact completion marker atomically. Lost replies resolve from
that marker. Suffix application starts after B. APPROVED imported as replicated
state does not open D3; the receiver starts CLOSED and follows current release
validation. A crash leaves the old coherent state or new coherent state, never
a mixture acknowledged as installed.

Fresh CREATE, intact local restart, known destructive loss and unavailable
reads remain separate. Cold restart of intact voters must not require a live
majority/control token. Known wipe must not recreate the same voter. Read
unavailability does not establish absence.

## Typed missing contracts

These names classify proposed behavior; they are not existing new symbols.

| Classification | Consequence and re-entry owner |
| --- | --- |
| APPLICATION_PROVENANCE_UNAVAILABLE | No publish/compact; application/schema owner must supply reviewed inventory. |
| APPLICATION_IMAGE_UNSUPPORTED | Current peer-only v1 cannot restore application authority; checkpoint owner supplies v2. |
| AWAITING_NATIVE_SNAPSHOT | Staged bytes have no matching accepted Ready; existing runtime/transfer owner retains bounded custody. |
| NATIVE_SNAPSHOT_NOT_ADMITTED | Native packet produced no accepted snapshot Ready; transport success cannot override. |
| NATIVE_SNAPSHOT_BINDING_MISMATCH | Refuse import; preserve prior coherent state and exact target identity. |
| APPLICATION_IMPORT_ENVIRONMENT_FAILURE | Atomic rollback/recovery hold, no invented result or acknowledgement. |
| LOCAL_OPEN_RECOVERY_REQUIRED | Native snapshot lies above usable application state; local-open/durable owner holds before core construction. |
| READ_UNAVAILABLE / KNOWN_WIPE | Different facts and recovery paths, never interchangeable. |

## Required native witness in the existing R1-R7 ladder

1. File-backed RF3 with nonempty schema/index/sequence data, ordinary exact
   outcome, a terminal transaction and a separate durable PREPARED obligation.
2. Committed HOLD plus retained release conflict/refusal results and retirement
   protection; capture B while the obligation is pinned.
3. Source commits authoritative settlement and reauthorization after B,
   retaining the suffix. Separate COMMIT and ROLLBACK cases are required.
4. Real source MsgSnapshot, bulk staging and receiver-native Ready feed the
   coupled intact-receiver import. No handcrafted Ready or mocked success.
5. Compare all application/obligation/release/result/retirement state at B and
   exact positions. Receiver-local admission must be CLOSED.
6. Replay suffix once; prove exact effects/outcomes, no retired resurrection,
   and reopening only through fresh local D3 validation.
7. Crash before/after atomic boundary, lose acknowledgement, duplicate/conflict
   requests, replace target generation, corrupt binding and exercise pressure.
8. Pair intact-voter cold restart without a live leader with known-wipe and
   read-unavailable controls.

A SQLite serialize byte count, ordinary restart, empty image or direct call
to the existing fresh-CREATE installer is not this proof. The existing
`snapshot-receiver-lifecycle-staging` interaction covers fresh CREATE; its future
registry extension must include application content/native Ready/import and
the exact release recovery witness. This packet does not implement that work.
