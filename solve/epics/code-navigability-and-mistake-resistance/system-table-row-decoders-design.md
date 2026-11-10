# system-table-row-decoders: design

Census, scope finding and the lead's decisions: `system-table-row-decoders-notes.md`
and the epic decision log (2026-11-08, 21:40 CET).

## Modules
| table | decoder (detector-recognised) | export | projections |
| --- | --- | --- | --- |
| services | `src/control-plane/services-row-decoder.js` | `decodeServicesRow(row, projection?)` | `defineServicesProjection(name, columns)` |
| nodes | `src/control-plane/nodes-row-decoder.js` | `decodeNodesRow(row, projection?)` | `defineNodesProjection(name, columns)` |
| replica_operations | `src/rebalancer/replica-operations-row-decoder.js` | `decodeReplicaOperationsRow(row, projection?)` | `defineReplicaOperationsProjection(name, columns)` |

Shared rules live once in `src/control-plane/system-table-row-decoding.js`
(`defineSystemTableDecoding`, `defineSystemTableProjection`,
`decodeSystemTableRow`, `ROW_ABSENT`, `SystemTableRowDecodeError`,
`SYSTEM_TABLE_ROW_DECODE_REFUSAL`). Each decoder declares its table from the
stored schema object (`SERVICES_SCHEMA`, `NODES_SCHEMA`,
`REPLICA_OPERATIONS_SCHEMA`), so the column list exists once: the schema.

## Canonical object
- One camelCase field per stored column (`service_id` -> `serviceId`), plus
  `projection` (`full_row` for `SELECT *`, else the projection's name).
  Frozen (shallow; JSON arrays are frozen too).
- Decoding keeps every stored value as stored, case included (round 5,
  lead decision 2026-11-09: the decoders read like HEAD; strictness is a
  follow-up quest paired with register-service write validation). A
  closed-domain value decodes to itself when it is exactly a vocabulary
  value; any other stored value of any column (an unknown or
  differently-cased state, a wrong stored type, a JSON text holding no
  array) decodes to the named state `{state: ROW_UNRECOGNISED, raw}`:
  services `status` (SERVICES_ROW_STATUS) and `raft_role`
  (SERVICES_ROW_RAFT_ROLE, nullable); nodes `status` (NODES_ROW_STATUS) and
  `connection_state` (NODES_ROW_CONNECTION_STATE); replica_operations `type`
  (OperationType), `status` (ReplicaStatus), `workflow_step`
  (WORKFLOW_STEP). The domains are the writer census (notes).
- SQL NULL -> `ROW_ABSENT` (=== null; the one named absent value, the same
  convention as the stream's STATE_ABSENT) in every column.
- Refusals (typed, they propagate): a non-row; the row must carry exactly
  the projection's columns in stored spelling (missing / extra / camelCase
  key; constraint decoder-is-not-authority: never fetch, cache or default;
  a seeded partial row decodes its unobserved columns to ROW_NOT_OBSERVED);
  a malformed replica_operations `steps_history` (the declared refusing
  JSON column).
- Readers read a decoded row only through a declared reading
  (`readDecodedRow`): ROW_NOT_OBSERVED as declared, ROW_UNRECOGNISED as its
  raw value, and the folded normalisers' readers (services and nodes views)
  as HEAD's readText / readLowerText read the stored value.

## Projections
A query that selects a column subset declares its projection once beside
the SQL with `define<Table>Projection(name, columns)` and decodes through
it; the result carries exactly those fields and the marker. A consumer that
needs a field outside its projection widens the projection at the query.

## Ownership
- Readers: only the decoder module reads a table's stored column names
  (measured by `system_table_raw_column_reads_outside_decoder`; the six
  group rows are the per-directory quests' probes).
- Writers keep the stored shape (row builders, SQL text, CDC upserts); a
  writer that reads a row back decodes it. `COLUMN` stays the shared
  constants object (src/constants/columns.js, ~20 tables).
- `ReplicaOperationRepository#rowToOperation` keeps only enrichment (entity
  identity, epoch binding, owner lease, semantic phase, witnesses,
  steps_history metadata) over the decoded row; its column reads are gone.
- Folded and deleted: normalizeServiceRow, normalizeNodeRow,
  normalizeReplicaRow, normalizeCensusServiceRow,
  normalizeCurrentVoterServiceRow, normalizeReplicaOperationRecord,
  normalizeOperationProgressRecord, readOperationWorkflowRecord,
  normalizePublicationOperationWorkflowRecord and the routed display
  normalisers (outcome per function in the notes).

## Tests
- `test/control-plane/system-table-row-decoders.test.js`: every column of
  each table, every named state, ROW_UNRECOGNISED for another case, an
  unknown value, a wrong type and a JSON text holding no array, NULL per
  column, missing / extra / camelCase / non-row refusals, the malformed
  steps_history refusal, projections (exact columns, marker, foreign
  projection refused).
- `test/control-plane/decoded-reader-differential.test.js`: every decoded
  reader's answer equals HEAD 730225bf1's frozen answer on partial rows and
  on the behaviour cases (case, unknown, wrong type, NULL, the loop sites).
- `test/test-helpers/system-table-row-fixture.js`: the one builder of
  production-shaped stored rows for tests.
