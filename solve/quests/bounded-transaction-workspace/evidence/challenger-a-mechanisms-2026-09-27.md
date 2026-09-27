# Challenger A: workspace mechanisms and existing-owner reuse

Head reviewed: `292b7204334cf47617e675dd9b12bc708b682886`

Mode: read-only. No files were changed by the challenger.

## Verdict

No existing repository or binding primitive provides a private writable,
exact, current SQLite branch whose transaction-critical startup is independent
of total partition size.

Page-level copy-on-write is the only candidate class with the required
asymptotic shape. It remains **UNKNOWN**, not approved: the hard boundary is
rooting that branch at an exact current WAL snapshot without enumerating or
copying the complete database or WAL history.

Snapshot-plus-overlay is unavailable in the current binding, filesystem clone
is an optional accelerator rather than a portable correctness mechanism, and
a continuously maintained image creates a second state owner.

## Consumed surfaces

- The partition opens one SQLite file, applies WAL/NORMAL policy and passes
  the same handle to application and rs-raft ownership:
  `src/partition/partition-service-raft-init-base.js:383-400,452-458`.
- rs-raft's durable records share that file and connection:
  `src/raft/raft-rs-durable-store-constants.js:1-19`.
- The applied index is committed atomically with state-machine effects and is
  available as a snapshot identity:
  `src/partition/partition-committed-log.js:29-39` and
  `src/raft/raft-rs-application-transaction-owner.js:41-55`.
- Split/merge already pins a read-only WAL view using a second connection and
  `BEGIN` without blocking apply:
  `src/partition/partition-service-split-accessor-base.js:309-327`.
  Its full row backfill plus mirrored delta stream remains total-state work:
  `src/partition/partition-service-split-accessor-base.js:345-393` and
  `src/partition/partition-mirror-replay-cursor.js:20-36,98-127`.
- Checkpoint creation uses `db.backup()`, scans log rows, drops historical
  consensus tables, vacuums, rereads and digests the full payload:
  `src/raft/snapshot-checkpoint-store.js:154-220,256-325`.
- Current rs-raft partition cadence explicitly does not support that snapshot
  mechanism, whose scrub list names historical rather than `_raft_rs_*`
  tables: `src/partition/partition-snapshot-cadence.js:8-19,54-74` and
  `src/raft/snapshot-checkpoint-constants.js:21-41`.
- Snapshot install is a closed-handle, full-payload recovery transition:
  `src/raft/snapshot-install.js:232-308`. Its manifest-last publication and
  boot cleanup patterns are reusable; its bytes are not a workspace primitive.
- `better-sqlite3` backup walks all pages:
  `node_modules/better-sqlite3/lib/methods/backup.js:36-65` and
  `node_modules/better-sqlite3/src/better_sqlite3.cpp:1334-1374`.
- Serialization materializes the image and the buffer constructor performs a
  second allocation/copy:
  `node_modules/better-sqlite3/src/better_sqlite3.cpp:602-623,771-795`.
  The vendored SQLite header preserves the measured rule that a serialized
  WAL image needs header bytes 18 and 19 normalized to `0x01` before anonymous
  deserialization:
  `node_modules/better-sqlite3/deps/sqlite3/sqlite3.h:10843-10870,10910-10943`.
- The installed binding exposes neither selectable VFS nor snapshot API. It
  opens SQLite with a null VFS, builds deserialize but not
  `SQLITE_ENABLE_SNAPSHOT`, and the optional SQLite snapshots are read-only
  and checkpoint-sensitive:
  `node_modules/better-sqlite3/src/better_sqlite3.cpp:468-506`,
  `node_modules/better-sqlite3/deps/defines.gypi:3-40`, and
  `node_modules/better-sqlite3/deps/sqlite3/sqlite3.h:10645-10768`.
- The repository has no clone helper. Node's `COPYFILE_FICLONE` silently
  falls back to a full copy; only `COPYFILE_FICLONE_FORCE` fails closed:
  `node_modules/@types/node/fs.d.ts:4217-4234,4261-4277`.
- Production storage declares a writable data directory/volume, not reflink
  semantics: `docs/operations-readiness.md:7-15`,
  `docs/dockerhub-overview.md:147-165`, and
  `src/storage/data-directory-manager.js:53-80`.

## Candidate classification

| Candidate | Transaction-critical startup | Verdict |
| --- | --- | --- |
| A. Page-level COW/VFS | Target `O(1)` token/setup; reads and writes scale with touched/dirty pages | **UNKNOWN; strongest fit** |
| B. SQLite snapshot + writable overlay | Read snapshot may be `O(1)`; current binding has no writable branch | **REJECT with current facilities**; adding the branch becomes A |
| C. Filesystem clone | Filesystem/extent-dependent; live main/WAL clone is not atomic | **REJECT as correctness owner**; optional accelerator only |
| F. Continuously maintained second image | Cheap begin only by paying a second apply/recovery protocol continuously | **REJECT** |

### A: page-level COW/VFS

The intended cost shape is metadata-only setup, page reads proportional to
actual reads, private pages proportional to SQLite's actual dirty set, and
finalization/cleanup proportional to transaction state. Letting SQLite execute
normally is the only investigated shape that naturally retains indexes,
constraints, triggers, expressions, BLOBs, DDL and multi-statement
read-your-own-writes.

The unresolved base is decisive. A COW VFS cannot fall through to a changing
main database unless it can resolve every page at one pinned WAL end mark.
Constructing a page map at `BEGIN`, checkpointing first, or cloning main/WAL
bytes moves total-state work into another phase. A pinned reader also retains
WAL history while apply continues, so a viable owner must bound workspace
lifetime, concurrent pins, retained WAL bytes, dirty pages, temporary spill
and handles by transaction activity.

### B: snapshot plus overlay

The split reader proves only the immutable read half. SQLite snapshot tokens
do not redirect writes. On the current binding the only routes to an
independent writable database are backup and serialize, both whole-image.

### C: filesystem copy-on-write

Reflinking the main file omits committed WAL state. Cloning main, WAL and SHM
sequentially is not one atomic SQLite snapshot. Checkpointing first can block
or scale with WAL work, while cloning a sealed checkpoint is stale and needs
tail replay. Support and complexity also depend on filesystem extent shape.
There is no safe full-copy fallback on the transaction path.

### F: continuously maintained second image

An exact second image must consume every apply, fence lag, recover, and expose
an atomic snapshot boundary. That is a second local state machine and recovery
protocol. If instead it is an incrementally versioned page store with cheap
branch tokens, it is candidate A rather than a second SQLite owner.

## Typed failure edges required for candidate A

| Edge | Required outcome |
| --- | --- |
| Exact base snapshot cannot be acquired without total scan/copy | `WORKSPACE_BASE_UNAVAILABLE`, fail closed |
| Snapshot identity/schema/partition generation moves during setup | `WORKSPACE_IDENTITY_MOVED`, dispose and redirect/abort |
| Required WAL frame has been checkpointed/recycled | `WORKSPACE_SNAPSHOT_EXPIRED`, never mix page versions |
| Private dirty-page/temp/handle/lifetime bound reached | `WORKSPACE_RESOURCE_LIMIT`, bound transaction work |
| Filesystem clone unsupported | explicit accelerator-unavailable result; never full-copy fallback |
| Orphan manifest is missing, corrupt or belongs to another identity | quarantine/dispose; never open as authority |
| Effect extraction requires whole-file comparison | reject candidate as total-state coupled |

## Cached-view and identity audit

The immutable base view is anchored to partition identity/version, schema
generation, leader/runtime generation and the atomic applied index. Private
overlay pages add workspace generation, transaction/session identity and a
canonical input digest. Movement of any authority anchor closes the workspace;
it never refreshes some pages from a newer base.

The reusable lifecycle shapes are the split reader's WAL pin and the
checkpoint/install staging-manifest-cleanup protocol. Backup bytes, split
backfill, a follower file, and `_raft_rs_snapshot` are not reusable as the
workspace.

## Recommended first binary probe

Before a general overlay, prove or refute:

> Can a writable SQLite branch be rooted at one exact applied-index/WAL
> snapshot with `O(1)` setup and page access proportional only to pages the
> transaction touches?

The spike is probe-only, not production `src/` repair. It must count VFS
bytes/pages as well as time and fail if any phase enumerates the base,
constructs a complete page map, compares whole files, or requires full-copy
fallback.
