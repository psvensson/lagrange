# A2 reconnaissance — partition-key boundary representation

Status: measurement only. This note does **not** open or seal A2 and makes no
production decision.

Measured from the 0.3 authoritative branch after A1-v7 planning updates.
GitHub Actions run `37020016302` and the self-recorded rerun on branch
`recon/a2-boundary-representation-2026-10-02` produced
`a2-boundary-recon-output.jsonl`.

## Measured precision facts

The discriminator was the exact integer `9007199254740993` (2^53 + 1).

1. JavaScript `Number("9007199254740993")` is already
   `9007199254740992`. Once a boundary becomes an ordinary Number at that
   magnitude, the exact value is gone.
2. Lagrange's current `SQLParser` preserves the unquoted SQL literal
   `9007199254740993` as the exact decimal string in both SQLite and
   PostgreSQL parser modes. The parser therefore does **not** itself force this
   particular literal through Number.
3. Binding an already-rounded JavaScript Number into a SQLite `TEXT` column
   stores `9.00719925474099e+15`: the existing partitions
   `partition_key_start/end TEXT` schema can therefore destroy both exact
   integer identity and canonical decimal spelling if a Number reaches it.
4. Binding the exact decimal string or a BigInt into a SQLite `TEXT` column
   round-trips the exact decimal text.
5. Binding an exact decimal string or BigInt into an SQLite `INTEGER` column
   stores the exact integer, but an ordinary better-sqlite3 read returns the
   rounded JavaScript Number. A statement with `safeIntegers(true)` returns
   the exact BigInt.
6. Binding an already-rounded Number into `INTEGER` cannot recover the lost
   bit; safe-integer reads faithfully return the rounded integer that was
   actually bound.

Consequence: changing the system-table columns from TEXT to INTEGER is not an
A2 solution by itself. Exactness needs an end-to-end representation contract at
the points where the key is parsed/bound, selected as a split median, persisted
as partition metadata, reloaded, compared, and routed.

## Existing authorities to reuse

- `tables.partition_key` already records the declared partition-key column.
- `tables.schema_definition` already records the user table's column
  definitions, including the declared SQL type. A2 should prefer this as the
  table-level type authority rather than inventing a second independent type
  declaration if it is available at every required boundary.
- `partitions.partition_key_start/end` are currently declared `TEXT`.
- Managed split and merge workflows persist their child/merged boundary values
  through the canonical control-plane system-table gateway.
- `partition-service-schema-migration-base.js` already owns incremental
  system-table column migration, including `ensurePartitionsTableColumns()`.
  A2 should extend this owner rather than create a second migration mechanism.

## Design pressure exposed by the measurement

### Exact INTEGER keys

A viable exact path can keep a canonical signed decimal string at metadata and
routing boundaries and use BigInt internally for integer comparison, while
using the declared schema type to distinguish an INTEGER key from a TEXT key
whose bytes happen to contain digits. SQLite statements that must read an
INTEGER boundary from user data need safe-integer mode before converting it to
canonical decimal text.

This does **not** imply exposing BigInt through the public application API.
Today that API rejects BigInt. Exact SQL literals are already preserved as
decimal text, and a parameter may remain a string until the declared key type
authorizes integer interpretation.

The remaining question is where typed interpretation belongs so SQL TEXT
`'9007199254740993'` and SQL INTEGER `9007199254740993` can never collapse
into one heuristic numeric-text key space.

### TEXT keys

A1 establishes SQLite-BINARY-compatible UTF-8 order. A2 should persist a
canonical text value without numeric coercion and keep the table schema as the
type authority, so text consisting only of digits stays text when the declared
partition key is TEXT.

### BLOB keys

A1 still recognizes Buffer keys, but this recon has not yet measured BLOB
system-table persistence, cache/CDC round-trip, or canonical wire encoding.
A2 must measure this before choosing a single boundary encoding.

### REAL keys

Finite JavaScript numbers have an exact IEEE-754 value even when their decimal
spelling varies. A2 must decide whether REAL partition keys are supported in
0.3 and, if so, define a canonical representation/order rather than inheriting
SQLite affinity formatting accidentally.

## Migration / old-row pressure

Existing alpha clusters can contain ambiguous legacy TEXT boundaries:

- numeric values that were formatted by SQLite TEXT affinity (for example
  `500.0`);
- values already rounded before persistence;
- genuine TEXT keys that happen to match the old numeric-text heuristic.

A migration cannot infer information that was already rounded away. A2 needs a
typed outcome for every old row:

1. prove and canonicalize from authoritative table schema + exact value;
2. rederive/revalidate the boundary from authoritative user data where that is
   safe and deterministic; or
3. fail closed and require rebuild/repartition when exact recovery is
   impossible.

Silently treating any digit-looking TEXT as numeric is not an acceptable
migration rule.

## Measurements still required before A2 can seal

1. Parameter routing for INTEGER/TEXT keys through pgwire and the embedded
   application API, including exact decimal strings above 2^53.
2. Split median selection for a real INTEGER primary key with values above
   2^53, with and without better-sqlite3 safe-integer reads.
3. BLOB boundary persistence through the partitions table, CDC/cache and
   restart.
4. REAL boundary canonicalization if REAL partition keys remain supported.
5. Restart/upgrade proof through the existing partitions-table migration owner,
   including one recoverable legacy row and one deliberately unrecoverable row.

The A2 Quest should be authored only after A1 predecessor evidence is terminal,
per the 0.3 task ordering.
