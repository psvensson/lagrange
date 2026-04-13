# Boundary Normalizer Hardening for Null and Undefined Ingress

## Why

Raw boundaries may physically encounter `null` or `undefined`, but those values
must not be allowed to enter runtime contracts.

This package contains and normalizes boundary ambiguity after the core runtime
contracts have been hardened.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Hotspots

1. `src/transport/node-address-resolution.js`
2. `src/cdc/cdc-sql-builder.js`
3. additional raw decode/parse modules identified during implementation

## Invariants

1. Boundaries may parse raw nullish input, but they must normalize immediately.
2. Boundary APIs do not return null-filled domain objects.
3. Runtime callers receive explicit parse/normalization results.

## Analysis Tasks

- [ ] Identify ingress functions that currently return `null`, `undefined`, or null-filled objects.
- [ ] Classify each as parse failure, missing field, unsupported shape, or optional capability.

## Implementation Tasks

- [ ] Replace nullish boundary returns with explicit normalized result variants.
- [ ] Keep raw interop ugliness confined to the boundary itself.
- [ ] Add unit coverage proving normalized boundary outputs are explicit and non-null.

## Done When

1. In-scope boundaries no longer leak raw nullish values into runtime code.
2. Parse outcomes are explicit and named.
3. Remaining nullish handling is localized to raw decode logic only.

## 2026-04-12 execution update

Implemented slice:
1. `parseAddressPartsResult(...)` now emits explicit subfield states for
   `host`, `port`, and `protocol` instead of returning parsed objects with
   `null` values.
2. Internal address-resolution logic now consumes the explicit parse result
   instead of routing through null-filled local helper objects.
3. `resolveNodeWebSocketAddressResult(...)` remains the explicit boundary
   contract for websocket endpoint resolution.
4. `CDCSqlBuilder` explicit result contracts are now covered for default-value
   normalization and SQL table-name extraction.

Focused validation passed:
1. `node test/transport/node-address-resolution-contract.test.js`
2. `node test/cdc/cdc-sql-builder.test.js`
3. `node test/transport/node-address-resolution.test.js`

Remaining gap in this package:
1. legacy compatibility wrappers such as `parseAddressParts(...)` and
   `normalizeDefaultValue(...)` still preserve older nullish/undefined caller
   expectations even though the explicit result seams are now available.
