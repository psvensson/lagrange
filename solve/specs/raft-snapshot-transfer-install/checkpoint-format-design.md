# S1 Design — Raft Snapshot Checkpoint Format

Scope: quest `raft-snapshot-checkpoint-format` only (create + durable publish +
restart-read + typed validation). No transfer (S3), no install (S2), no
retention policy (S5). Nothing in this design touches the existing adapters or
weakens `raft-snapshot-gated-compaction`.

## Owner placement

New sibling owner modules; existing raft files are NOT modified
(`sqlite-log-adapter.js` is 794/800 lines — six from the cap — and the
gated-compaction guard must stay byte-identical):

- `src/raft/snapshot-checkpoint-constants.js` — envelope version, field names,
  payload kinds, include/exclude matrix, typed validation outcomes, digest
  domain.
- `src/raft/snapshot-checkpoint-format.js` — pure envelope logic: seal a
  descriptor, canonicalize, digest, validate bytes + identity → one typed
  outcome.
- `src/raft/snapshot-checkpoint-store.js` — durable create/read: SQLite
  backup-then-scrub payload materialization, atomic durable publish, restart
  listing/read.

## Envelope (descriptor) — `lagrange-raft-snapshot-checkpoint`, version 1

Canonical-JSON descriptor sealed AFTER the payload is durable. Fields (all
required, exact-object validation — unknown or missing fields are typed
rejections):

| Field | Source (S1) |
| --- | --- |
| `envelopeVersion` | constant `1` |
| `clusterId` | opaque non-empty string supplied by the creating owner; S1 validates presence + exact receiver match. The authoritative production source (bootstrap cluster incarnation) is threaded when S2/S3 wire real callers — no cluster identity exists at the raft layer today (verified: zero `clusterId`/`clusterIncarnation` hits under `src/raft/`, `src/partition/`). |
| `raftGroupId` | partition id for partitions (e.g. `sql_transactions-p1`), group id for message groups. The adapter does not know this; the creating owner (PartitionService layer) supplies it. |
| `entity` | `{kind, id}` — `kind` = worker entity type (`partition`), `id` = table name/id the state machine serves. |
| `membershipEpoch` | opaque non-negative integer supplied by the creating owner; receivers match exactly (foreign-epoch = typed rejection). Authoritative source pinned in S2 (candidates: partition descriptor `active_partition_version`; assignment epoch). |
| `lastIncludedIndex` / `lastIncludedTerm` | read from the BACKUP COPY's own `_raft_state`/`_raft_log` before scrubbing (see creation), so the metadata is exact for the sealed image — not racy against post-backup commits. Empty log ⇒ term 0 (CL-042 discipline). |
| `payloadKind` / `payloadVersion` | from the compatibility matrix below |
| `payloadByteLength` | byte length of the sealed payload file |
| `payloadDigest` | `sha256:<64hex>` over the sealed payload bytes |

Descriptor integrity: the descriptor file's own bytes are canonical JSON; a
`descriptorDigest` is NOT self-embedded — corruption is detected by canonical
re-parse (exact-object, strict) + payload digest mismatch. (Transport-level
authentication — HMAC with a `lagrange-raft-snapshot-v1` domain per the OCI
host-agent precedent — is S3's authenticated transfer, not S1; recorded as an
explicit quest constraint.)

## Payload-kind compatibility matrix (the S1 authoring bar)

| Payload kind | Version | Include | Exclude | Notes |
| --- | --- | --- | --- | --- |
| `sqlite_state_machine_image` | 1 | every table EXCEPT the exclude set — explicitly including `_transaction_outcomes` (2PC outcome memoization IS applied state-machine state; scrubbing it would break exactly-once after install) and the state-machine table + its indices | `_raft_log`, `_raft_state` | one raft group == one `.db` file (verified empirically on production DBs), so the include-set is table-name-based, not prefix-based; an exclude built as `_%` would wrongly drop `_transaction_outcomes` |
| in-memory adapter / memory-backed SQLite | — | — | — | typed `unsupported_adapter` creation outcome. Covers BOTH the InMemoryLogAdapter (no durable state to seal) AND SQLiteLogAdapter over `:memory:` (`db.memory === true` — the message-group worker and default partition-worker paths), which holds only consensus tables and would seal an empty payload. Enumerated, not silently absent. |
| single-replica direct-apply partitions | — | — | — | typed `apply_watermark_divergence` creation outcome (see applied-watermark precondition): `applyWrite` bypasses raft commit, so committedIndex cannot certify the image. |

## Applied-watermark precondition (design-verifier correction, load-bearing)

The original claim "applied rows == the copy's committed prefix" was REFUTED
against code: apply and `setCommittedIndex` are separate autocommit statements
(`sqlite-log-adapter.js:479-487` then
`partition-service-entry-apply-base.js:744-809`), there is no durable applied
marker (`PartitionRaftStorage.lastApplied` aliases committedIndex), an apply
throw leaves the watermark durably AHEAD of applied state (restart does not
re-apply), and the single-replica `applyWrite` path applies with NO raft commit
(committedIndex stale at 0 while tables hold data). The copy's committedIndex
therefore bounds the applied prefix in neither direction.

Correction adopted (exactness, fail-closed), second-round-verifier hardened:

- **Dense advance, never a committedIndex copy (MF-1).** liferaft
  `commitEntries` advances the adapter's durable committed watermark to the
  BATCH END before the first commit event fires, so copying
  `storage.commitIndex` at apply time overstates the applied prefix on every
  multi-entry batch (adversarially reproduced: a sealed checkpoint claimed
  index 2 while missing entry 2's effects). Instead the commit wiring calls
  `recordAppliedAdvance()` — a durable +1 per successful synchronous apply.
  Commit events fire once per committed entry in index order, so a dense
  count from an aligned origin equals the applied entry's own index;
  under-counting only ever refuses creation.
- **Startup gap detection (sticky).** `PartitionRaftStorage` startup compares
  the durable `lastAppliedIndex` with the adapter's committed index; any
  mismatch (crash between a batch's commits and its applies — permanent
  effect loss, restart does not re-apply) records a durable
  `appliedGapMarker` that refuses checkpoint creation forever on that
  database (typed reason `applied_gap_marker`). Healing is S2+ scope.
- **Legacy adoption.** A database with no `lastAppliedIndex` adopts the
  current committed index as its dense-count baseline WITHOUT writing it;
  the gate still refuses (`applied_watermark_absent`) until the first
  post-upgrade apply records a durable aligned watermark. This documents the
  bootstrap assumption that a legacy DB is aligned at adoption — the same
  state the replica itself serves.
- Checkpoint creation reads BOTH watermarks from the copy (legacy-tolerant:
  `committedIndex` falling back to legacy `commitIndex`) and REQUIRES
  `lastAppliedIndex === committedIndex`; any divergence (apply-throw skew,
  single-replica direct-apply, crash window, pre-watermark legacy DB where
  `lastAppliedIndex` is absent) is the typed creation outcome
  `apply_watermark_divergence` — fail-closed, never a checkpoint that
  under- or over-states its `lastIncludedIndex`. Single-replica direct-apply
  partitions are thereby unsupported for checkpointing in S1 (recorded in the
  matrix); healing divergence is S2+ scope.
- `lastAppliedIndex` is consensus-adjacent local state in `_raft_state`, so it
  is automatically scrubbed from payloads by the existing exclude set.

## Creation (SQLite) — backup, read metadata from the copy, scrub, seal

0. Gate: the source db handle must be file-backed (`db.memory === true` →
   typed `unsupported_adapter`; message-group and default worker paths run
   SQLiteLogAdapter over `:memory:` and would otherwise seal an empty payload
   with a real committedIndex). Ensure the checkpoint temp/final directories
   exist BEFORE `db.backup()` (it throws on a missing parent).
1. `await db.backup(tempPayloadPath)` (better-sqlite3 native online backup —
   API verified empirically, promise-returning, WAL-aware) → consistent
   point-in-time copy that INCLUDES `_raft_log`/`_raft_state`.
2. Open the copy; read `committedIndex` (legacy-tolerant) + `lastAppliedIndex`
   from the copy's `_raft_state`; enforce the applied-watermark gate above;
   read the term at `lastIncludedIndex` from the copy's `_raft_log` →
   `lastIncludedIndex/Term` exact for the copied image. Empty log ⇒ term 0.
3. Scrub the copy: `DROP TABLE _raft_log`, `DROP TABLE _raft_state`, `VACUUM`.
4. CLOSE the scrub connection (the copy inherits WAL mode; close checkpoints
   away `payload.db-wal`/`-shm` — verified empirically), THEN fsync the payload
   file and compute `payloadByteLength` + `payloadDigest` over the final bytes.
5. Write descriptor canonical JSON to a temp name, fsync, atomic rename,
   fsync directory — REUSING `canonicalJsonBytes`/`sha256Digest`/`exactKeys`/
   `fsyncDirectory`/`ensureDirectory`/`readCanonicalJson` imported from
   `src/runtime/oci-host-agent-durable-files.js` (verified importable: no
   raft↔runtime cycle exists and the cycle gate is cycles-only; porting would
   trip the exact-count jscpd duplication baseline). The descriptor is the
   publication token: payload without descriptor is typed `partial`, never
   progress.
6. Validation additionally treats a stray `payload.db-wal`/`-shm` sibling as
   `corrupt_payload` (a leftover WAL would change effective DB content without
   changing the digested `payload.db` bytes).

Checkpoint directory layout (per replica, sibling of the replica DB):
`{dataDir}/partitions/{partitionId}/checkpoints/{replicaId}/{lastIncludedIndex}/`
containing `payload.db` + `checkpoint.json`. Generation = lastIncludedIndex
(monotonic); retention/pinning is S5 and out of scope (S1 keeps every
generation it writes).

## Typed validation outcomes (never advertised as progress)

`RAFT_CHECKPOINT_VALIDATION_OUTCOME`: `valid`, `partial` (payload without
descriptor / descriptor without payload), `corrupt_descriptor` (non-canonical /
non-exact-object / bad field types), `corrupt_payload` (digest or byte-length
mismatch — covers truncation), `unsupported_envelope_version`,
`unsupported_payload_kind`, `foreign_cluster`, `foreign_group`,
`foreign_entity`, `stale_epoch` (receiver epoch newer than descriptor's),
plus creation-side `unsupported_adapter` and `apply_watermark_divergence`. One
decision-table evaluation → one canonical `{outcome, reasons}` result; no
boolean piles, no null states.

## Guard tests (deterministic; scenario `raft-snapshot-checkpoint-format`)

- `test/raft/snapshot-checkpoint-format-contract.test.js` — envelope
  seal/validate round-trip; identity mismatch matrix (foreign cluster / group /
  entity / epoch each rejected with its own outcome); exact-object rejection
  of unknown/missing fields; empty-log term-0.
- `test/raft/snapshot-checkpoint-sqlite-payload.test.js` — SEEDS `_raft_log`,
  `_raft_state`, `_transaction_outcomes`, and a state-machine table with rows
  FIRST (anti-vacuous-assertion), creates a checkpoint from a temp-file DB,
  then inspects the sealed payload: `_raft_log`/`_raft_state` ABSENT,
  `_transaction_outcomes` + state-machine rows PRESENT and equal to the
  committed image; lastIncluded matches the copy's own committed state.
- `test/raft/snapshot-checkpoint-restart-read.test.js` — restart-readability:
  re-open the checkpoint dir cold and read/validate; corruption attacks
  (flip payload byte → `corrupt_payload`; truncate payload → `corrupt_payload`;
  stray `payload.db-wal` sibling → `corrupt_payload`; mangle descriptor JSON →
  `corrupt_descriptor`; delete descriptor → `partial`); in-memory adapter and
  `:memory:`-backed SQLite typed `unsupported_adapter`; watermark divergence
  (applied ≠ committed, and absent `lastAppliedIndex`) typed
  `apply_watermark_divergence`.
- Runner `scripts/checks/run-raft-snapshot-checkpoint-format-scenarios.js`
  also re-runs the gated-compaction regression files so S1 provably does not
  weaken them.

## Explicitly deferred (recorded so S2+ pick them up)

- Authoritative production sources for `clusterId` and `membershipEpoch`
  (bootstrap incarnation / descriptor epoch) — S2 wiring.
- HMAC-authenticated envelope + transfer resume — S3.
- `votedFor`/term reconstruction, `_raft_state` dual-writer reconciliation
  (`sqlite-log-adapter.js` vs `partition-service-constants.js` both create it)
  — S2 install.
- Retention bounds, pinning, compaction enablement — S5.
