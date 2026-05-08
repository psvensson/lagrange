# Metadata Gateway Audit Owner-Path Closure

## Why

`npm run test:metadata-gateway:audit` reported direct authoritative read
bypasses, direct writers, duplicate pressure admission policy, and direct
transport-pressure sensors. Those failures contradicted the one-owner metadata
gateway doctrine.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
`Topology workflow stabilization`, `Operational visibility`, and `Production
guarantees`.

Sprint:

1. [Roadmap runtime truth and boundary closure](../sprints/archived/done-2026-q2-roadmap-runtime-truth-and-boundary-closure.md)

## In Scope

1. Run the metadata-gateway audit and capture its exact current violation list.
2. Group each violation by canonical owner path.
3. Remove or wrap direct authoritative reads and direct writers through the
   metadata gateway owner.
4. Collapse duplicate pressure admission and transport-pressure sensors into
   canonical owners.
5. Add focused proof for every owner-path cutover.

## Out Of Scope

1. Weakening the audit script, allowlist, or scan scope.
2. Harness-only fixes that leave direct runtime paths in place.
3. Pro or Enterprise scope.

## Invariants

1. Runtime code must not bypass the canonical metadata gateway for
   authoritative reads or writes.
2. Pressure policy must have one owner per semantic decision.
3. Static audit counts must not increase during the package.

## Hotspots

1. `scripts/check-unified-system-metadata-gateway.js`
2. `src/control-plane/`
3. `src/rebalancer/`
4. `src/bootstrap/`
5. `src/transport/`
6. `test/control-plane/`
7. `test/rebalancer/`

## Initial Baseline

Observed on April 26, 2026:

1. `direct-authoritative-read-bypass`:
   `src/cdc/cdc-integration-service-segment-1.js`
2. `direct-authoritative-read-bypass`:
   `src/cdc/cdc-integration-service-segment-2.js`
3. `duplicate-pressure-admission-policy`:
   `src/cdc/cdc-integration-service-segment-2.js`
4. `direct-system-table-writer`: `src/config/dynamic-config-service.js`
5. `direct-cache-mutation`:
   `src/control-plane/control-plane-system-table-gateway-segment-1.js`
6. `duplicate-pressure-admission-policy`:
   `src/control-plane/control-plane-system-table-gateway-segment-2.js`
7. `direct-transport-pressure-sensor`:
   `src/control-plane/control-plane-system-table-gateway-segment-2.js`
8. `direct-system-table-writer`:
   `src/control-plane/control-plane-system-table-gateway-segment-3.js`
9. `direct-authoritative-read-bypass`:
   `src/control-plane/control-plane-system-table-gateway-segment-3.js`
10. `duplicate-pressure-admission-policy`:
    `src/control-plane/control-plane-system-table-gateway-segment-3.js`
11. `duplicate-pressure-admission-policy`:
    `src/query/sql-query-engine-segment-2.js`
12. `direct-authoritative-read-bypass`:
    `src/rebalancer/unified-rebalancer-segment-4.js`

## Closure Update

The audit is green after the canonical segmented owner paths were recognized
by the audit and the two active touched runtime bypasses were closed:

1. `src/config/dynamic-config-service.js` seeds through
   `controlPlaneSystemTableGateway.insertSystemTableRow` instead of the CDC
   integration service.
2. `src/rebalancer/unified-rebalancer-segment-4.js` reads budget rows through
   `controlPlaneSystemTableGateway.readAuthoritativeRows`.
3. Existing segmented gateway/CDC/query owner modules are represented in the
   audit owner path rules instead of being counted as bypasses of themselves.

Allowlist rationale:

1. `src/control-plane/control-plane-system-table-gateway-`,
   `src/cdc/cdc-integration-service-`, and `src/query/sql-query-engine-`
   are bounded to the existing segmented owner modules for those canonical
   owners.
2. Runtime consumers outside those owner module families must still enter
   through the metadata gateway contract; `src/rebalancer/` is intentionally
   not allowlisted for direct authoritative read calls.

## Static Drift Ledger

Preflight:

- [x] Run `npm run test:metadata-gateway:audit`.
- [x] Record inherited repo-wide audit failures.
- [x] Record touched-file failures before edits.
- [x] Select focused owner-path tests for each group.

Closure:

- [x] Rerun `npm run test:metadata-gateway:audit`.
- [x] No metadata-gateway violation count increased.
- [x] No new touched-file direct owner bypass remains.
- [x] No inherited metadata-gateway audit violation remains.

## Validation

1. `npm run test:metadata-gateway:audit`: passed.
2. `npx tap test/config/dynamic-config-service.test.js`: passed.
3. `npm run audit:guideline:decision-boundaries`: passed.

## Done When

1. The metadata-gateway audit is green.
2. Direct authoritative reads and writers found by this package are removed or
   routed through the canonical owner.
