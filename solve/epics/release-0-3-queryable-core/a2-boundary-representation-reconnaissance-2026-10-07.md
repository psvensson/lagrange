# A2 boundary representation reconnaissance — 2026-10-07

Status: planning/reconnaissance only. This document does **not** create Quest authority and does not authorize source changes. A2 remains behind terminal A1.

## Why this note exists

- Reconnaissance for planned A2 (`partition-key-boundary-representation`) while A1 finishes.
- Preserves the rule forbidding premature representation choice before a red discriminator exists.

## Current durable path

### Declared table/key authority

- `tables` persists `partition_key` and normalized `schema_definition` (INT->INTEGER, VARCHAR->TEXT, FLOAT->REAL). A2 derives type representation from schema.

### Boundary storage authority

- `partitions.partition_key_start/end` stored as `TEXT`. SQLite selects medians (`ORDER BY <key> ... OFFSET ?`). Metadata and child boundaries must agree.

### Existing upgrade seam

- `createPartitionServiceTable()` calls `ensurePartitionsTableColumns()` for in-place schema upgrades.

## Concrete falsifiers found during census

### F1 — TEXT affinity erases runtime type

- Boundary columns are TEXT; numeric medians and string keys produce identical text. Types must not be guessed from content.

### F2 — falsey boundary values are not durable-presence-safe

- `resolvePersistedSplitPlan()` uses `if (!splitKey)`, conflating `0` and `''` with absence. Distinguish absent, unbounded, and falsey values.

### F3 — exact integer precision is not yet an owned contract

- Large integers above `Number.MAX_SAFE_INTEGER` risk precision loss during SQLite reads, JS conversions, JSON encoding, or routing.

### F4 — transition metadata is JSON-shaped

- Split keys serialize into JSON; runtime representations require safe canonical encodings.

### F5 — A1 compatibility is transitional, not A2 authority

- A1's permissive comparison is transitional, not the permanent durable storage model.

## Required pre-seal discriminator matrix

| Cell | Key | Boundary | Observation |
| --- | --- | --- | --- |
| D1 | INTEGER | `0` | Survives resume; not unbounded |
| D2 | TEXT | `''` | Survives if SQL semantics admit |
| D3 | INTEGER | `9007199254740993` | Exact value and order survive |
| D4 | INTEGER | `500` | Distinct from TEXT `'500'` |
| D5 | TEXT | `'500'` | Preserved as TEXT |
| D6 | TEXT | U+E000 / U+10000 | SQLite BINARY order |
| D7 | REAL | Non-integer | Round-trip order verified |
| D8 | Any | Unbounded | Distinct from falsey values |
| D9 | Legacy | Ambiguous | Fails closed / revalidates |

## Candidate representation families — deliberately undecided

### R1 — typed metadata + canonical scalar payload

- Canonical payload plus type/version columns. Minimal migration; reuses schema; requires multi-column coherence.

### R2 — versioned self-describing boundary envelope

- Single versioned envelope in boundary field. Atomic representation; requires decode on comparison.

### R3 — order-preserving binary/text encoding

- Lexical byte order matches key order. Strong index substrate; avoids runtime decode; higher complexity.

## Alpha-upgrade rule to test

- Trusted typed boundary -> decode and route. Unbounded -> explicit unbounded representation. Legacy ambiguous TEXT -> fail closed.

## Indexed tuple reuse constraint

- Substrate for future ordered index tuples (A5/A6), defining identity, payload, NULL handling, and collation.

## Proposed A2 sealing prerequisites

1. A1-v13 landed through Solver.
2. Final rs-raft compatibility SHA certified against A1.
3. D1-D9 discriminator probe red on inherited representation.
4. Large-integer loss seams identified across full path.
5. Minimal candidate representation family selected.
6. Fail-closed legacy alpha upgrade policy established.
