# A2 boundary representation reconnaissance — 2026-10-07

Status: planning/reconnaissance only. This document does **not** create Quest
authority and does not authorize source changes. A2 remains behind terminal A1.

## Why this note exists

A1-v13 is waiting on its final rs-raft compatibility handoff. That wait does
not block source-free reconnaissance for planned A2
(`partition-key-boundary-representation`).

The A2 task explicitly forbids choosing "typed comparator metadata" versus an
order-preserving encoding before the red discriminator exists. This note keeps
that rule: it records the current representation path, falsifiers, candidate
decision cells, and the evidence needed before sealing A2.

## Current durable path

### Declared table/key authority

`tables` already persists both:

- `partition_key`: the declared primary/partition key column name(s);
- `schema_definition`: the normalized column schema, including SQLite-facing
  column type.

The normal type normalization maps common SQL types into SQLite storage
families, including INT/BIGINT -> INTEGER, VARCHAR/CHAR -> TEXT,
FLOAT/DOUBLE/DECIMAL/NUMERIC -> REAL, and date/time-like values -> TEXT.

Therefore A2 does **not** need a second owner for the declared key type. It must
derive representation from the existing schema owner.

### Boundary storage authority

`partitions.partition_key_start` and `partition_key_end` are both declared
as `TEXT`.

A split median is selected from the actual user partition by SQLite:

1. count rows;
2. `ORDER BY <primary-key> ... OFFSET ?`;
3. return the selected primary-key value as the split median.

The managed split then carries that value through two durable representations:

1. `tables.partition_transition_metadata` via the transition/workflow
   `splitKey`;
2. the child `partitions` rows as `partition_key_start/end`.

Those two representations must agree. Fixing only one leaves restart/resume
and ordinary routing with different key identities.

### Existing upgrade seam

Existing system-table partitions already have a canonical in-place schema
upgrade seam. `createPartitionServiceTable()` calls
`ensurePartitionsTableColumns()` after CREATE TABLE IF NOT EXISTS.

This proves A2 can add/version durable representation state without inventing
a second bootstrap/migration owner. It does **not** decide which representation
to add.

## Concrete falsifiers found during census

### F1 — TEXT affinity erases runtime type

The boundary columns are TEXT regardless of the declared partition-key type.
A numeric median and a user TEXT key can therefore have the same durable
surface string while requiring different comparison semantics.

A2 must never infer the declared type from whether a stored string "looks
numeric".

### F2 — falsey boundary values are not durable-presence-safe

`resolvePersistedSplitPlan()` currently classifies the split key with:

`if (!splitKey) return null`

That treats valid keys such as numeric `0` and empty TEXT `''` as if no
persisted split key existed. NULL/unbounded and value-presence semantics are
therefore not currently explicit.

The A2 representation contract must distinguish:

- absent/missing representation;
- unbounded boundary;
- a present value whose value is falsey.

### F3 — exact integer precision is not yet an owned contract

No production use of better-sqlite3 safe-integer mode was found in the current
census. Partition-side SQL parsing also converts numeric literals through
JavaScript `Number`.

A2 must prove the **real** system path, not assume behavior:

- a SQLite INTEGER boundary above the JS safe-integer range;
- median read;
- transition persistence;
- child boundary persistence;
- restart/decode;
- routing comparison.

If precision is already lost before boundary encoding, the representation
cannot repair it downstream; the read/bind seam must be part of A2.

### F4 — transition metadata is JSON-shaped

Managed split state persists the split key inside JSON transition metadata.
Any representation whose runtime form is not JSON-safe must define its durable
form before it can be used as split authority.

In particular, a future exact-integer runtime representation cannot simply
place an unencoded BigInt inside the existing metadata object.

### F5 — A1 compatibility is transitional, not A2 authority

A1 deliberately supports NUMBER versus numeric-looking TEXT so old TEXT
boundaries remain routable during the current cutover. A2 must not make that
heuristic the permanent storage contract.

After A2, routing should know the boundary's declared representation rather
than guessing from lexical content.

## Required pre-seal discriminator matrix

Before an A2 Quest is sealed, build one deterministic probe through the real
median -> durable transition -> child boundary -> restart -> route path.

At minimum it must distinguish these cells:

| Cell | Declared key | Boundary value | Required observation |
| --- | --- | --- | --- |
| D1 | INTEGER | `0` | remains a present boundary across resume; never becomes missing/unbounded |
| D2 | TEXT | `''` | remains a present TEXT boundary if the declared SQL semantics admit it |
| D3 | INTEGER | `9007199254740993` | exact value/order survives or the probe proves the earlier loss seam |
| D4 | INTEGER | `500` | cannot be confused with TEXT `'500'` |
| D5 | TEXT | numeric-looking `'500'` | stays TEXT; no numeric guessing |
| D6 | TEXT | UTF-8 discriminator such as U+E000 / U+10000 | persisted and routed in SQLite BINARY order |
| D7 | REAL | finite non-integral boundary | round-trip and order are explicit, or REAL is deliberately excluded |
| D8 | any supported type | unbounded start/end | represented independently from a present falsey value |
| D9 | legacy TEXT boundary without trusted type evidence | ambiguous old row | fail closed or enter an explicitly sealed alpha revalidation path |

The exact large-integer witness may be adjusted to fit the accepted SQL
surface, but it must remain outside JavaScript's safe-integer range and inside
SQLite INTEGER range.

## Candidate representation families — deliberately undecided

The red probe must choose among, or rule out, these families.

### R1 — typed metadata + canonical scalar payload

Keep a canonical payload plus explicit type/version metadata for each boundary.
Possible examples are type/version columns adjacent to the existing boundary
payload or one table-level representation version plus per-boundary type.

Advantages:
- smallest migration from current rows;
- declared type can come from `schema_definition`;
- reusable scalar codec can later serve ordered index tuples.

Risks:
- two/three columns must be kept atomically coherent;
- current TEXT payload still needs a precise canonical encoding for INTEGER,
  REAL, TEXT, and any admitted binary family;
- legacy rows remain ambiguous until revalidated.

### R2 — versioned self-describing boundary envelope

Store one versioned typed scalar envelope in the durable boundary field (or a
new replacement field), with explicit tags and a canonical payload.

Advantages:
- value + type + version are one atomic representation;
- transition metadata can carry the same JSON-safe envelope;
- naturally distinguishes missing, unbounded and falsey values.

Risks:
- every consumer must decode before comparison;
- existing plain TEXT rows need a hard legacy discriminator;
- lexical ordering of the envelope is irrelevant unless explicitly designed.

### R3 — order-preserving binary/text encoding

Encode scalar values so durable lexical/byte order is the actual key order.

Advantages:
- strong substrate for later local/global ordered indexes;
- avoids a separate comparator for encoded values.

Risks:
- largest migration and proof surface;
- mixed SQLite type semantics, NULL, REAL edge cases and tuple composition must
  all be designed now;
- may be disproportionate for the minimum honest 0.3 partition boundary
  contract.

No family is selected by this note.

## Alpha-upgrade rule to test

The safest 0.x default is:

- trusted typed boundary -> decode and route;
- unbounded boundary -> explicit unbounded representation;
- legacy ambiguous non-null TEXT boundary -> **do not infer type from content**;
  either revalidate/recompute against the owning table under a sealed procedure,
  or require recreation of that boundary/table if safe revalidation cannot be
  proven.

A2 should prefer a visible typed upgrade requirement over a lossy migration.

## Indexed tuple reuse constraint

A2 is also the representation substrate for ordinary ordered index tuple
elements. The implementation should therefore introduce one scalar/tuple
representation owner, not a special "partition boundary only" format that A5/A6
would have to replace.

This does not require implementing indexes in A2. It requires the A2 contract
to answer, for each admitted 0.3 scalar family:

- declared type identity;
- canonical durable payload;
- NULL/unbounded semantics;
- comparison/collation semantics;
- decode/refusal semantics.

## Proposed A2 sealing prerequisites

Do not create `partition-key-boundary-representation/quest.json` until all of
the following hold:

1. A1-v13 is terminal and its exact accepted bytes are landed through Solver.
2. The final rs-raft compatibility SHA has certified those A1 bytes; no
   intermediate rs-raft SHA is accepted.
3. The D1-D9 real-path discriminator exists and is red on the inherited
   representation for the claimed reason(s).
4. The probe establishes whether large-integer loss occurs at SQLite read,
   SQL parsing/bind, JSON transition persistence, TEXT system-table storage, or
   more than one seam.
5. One candidate representation family has a strictly smaller honest change
   surface than the alternatives while satisfying both partition boundaries
   and later ordered tuple elements.
6. Legacy alpha-state behavior is explicit and fail-closed; no numeric-looking
   string inference is permitted.

Only then is the A2 statement narrow enough to seal.
