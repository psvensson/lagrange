# Runtime Grammar Contract Audit Guardrail

## Why

The latest `node-join-under-load` failures were foreseeable from static code
shape:

1. strict harness consistency could previously compare leader maps before the
   publication-recovery owner said strict comparison was ready
2. priority progress and visibility events needed to wake both the rebalancer
   owner queue and membership-publication owner queue
3. priority transition persistence had to normalize durable snake-case and
   in-memory camel-case operation rows before selecting a persistence lane
4. membership publication planning had to merge compatible owner-owned evidence
   instead of choosing one source as an alternate route
5. local replica removal completion had to route durable service-row cleanup
   before returning a completed idempotent remove response

Those are grammar contracts, not timing accidents. A bounded static audit
should make the same class of drift visible before a harness rerun spends
minutes rediscovering it.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Add a bounded runtime-grammar contract audit script.
2. Encode the specific static contracts surfaced by the latest harness failure
   migration.
3. Add focused script tests for required and forbidden fragments.
4. Wire the audit into package and sprint validation.

## Out Of Scope

1. A general type system or full semantic parser.
2. Replacing focused owner-path tests.
3. Treating the static audit as proof that the representative harness scenario
   is green.

## Shared Boundary Contract

- Semantic owner:
  runtime grammar contracts declared in `architecture/runtime-grammar-hierarchy.md`
  and `architecture/current-owner-maps.md`.
- Canonical contract:
  hotspot code paths must retain the owner/wakeup/normalization contracts that
  prevent publication-scoped consistency and priority-recovery drift.
- Allowed consumers:
  local validation, package closure checks, and future sprint guardrails.
- Prohibited reinterpretations:
  broad regex-only linting as runtime proof, or guardrail bypasses that leave
  the harness to discover known grammar drift again.
- Primary proof:
  script tests plus one targeted run of the audit against the current hotspot
  set.

## Progress Grammar

1. `present` means a required contract fragment exists inside the named
   hotspot or function.
2. `forbidden` means a known alternate route is absent from the named hotspot
   or function.
3. `violated` means one required fragment is missing or one forbidden fragment
   is present.
4. `ready` means the hotspot contract set has zero violations.

## Hotspots

1. `scripts/check-runtime-grammar-contracts.js`
2. `test/scripts/check-runtime-grammar-contracts.test.js`
3. `test/distributed/harness/assertions-segment-1.js`
4. `test/distributed/harness/assertions-segment-3.js`
5. `src/rebalancer/unified-rebalancer-segment-1.js`
6. `src/rebalancer/operation-workflow-owner-segment-2.js`
7. `src/control-plane/membership-publication-coordinator.js`
8. `src/node/replica-handler-class-part-1.js`
9. `src/node/replica-handler-class-part-2.js`

## Detection / Analysis Tasks

- [x] Identify the code-shape contracts that map directly to the latest
      harness failure migration.
- [x] Keep the guard bounded to known hotspots instead of scanning for vague
      vocabulary.

## Implementation Tasks

- [x] Add the runtime-grammar contract audit script.
- [x] Add focused tests that fail on the exact forbidden/required shapes.
- [x] Add an npm script for the audit.
- [x] Run focused proof and update this package.

## Residual Closure Inventory

- [x] Static guard script exists and exports testable collectors.
- [x] The guardrail checks the known publication/priority recovery hotspot
      contracts.
- [x] Focused tests cover missing required fragments and forbidden strict-path
      leader inference.
- [x] The audit passes against the current hotspot set.

## Progress Notes

1. Added `scripts/check-runtime-grammar-contracts.js`.
2. Added `npm run audit:runtime-grammar`.
3. Added `test/scripts/check-runtime-grammar-contracts.test.js`.
4. The audit checks the current hotspot contracts for:
   - canonical control-snapshot leaders on the strict path
   - publication-recovery gate readiness in consistency comparison
   - priority progress wakeup into both rebalancer and publication owners
   - transition row-shape normalization before priority persistence selection
   - merged membership-publication planning evidence
   - durable service-row cleanup before idempotent remove completion
5. Focused proof:
   `npx tap test/scripts/check-runtime-grammar-contracts.test.js`.
6. Current hotspot audit:
   `npm run audit:runtime-grammar`.
7. Lint proof:
   `npx eslint scripts/check-runtime-grammar-contracts.js test/scripts/check-runtime-grammar-contracts.test.js test/distributed/harness/publication-evidence-replay.js test/distributed/harness/__tests__/publication-evidence-replay.test.js`.

## Validation

1. `npx tap test/scripts/check-runtime-grammar-contracts.test.js`
2. `npm run audit:runtime-grammar`

## Done When

1. A future edit that reopens one of the known grammar drifts fails a fast
   static audit before the harness rerun.
2. The guard remains bounded and points to the specific owner contract that
   moved the latest blocker.

## Closure Deep Dive

Reviewed the affected script/test surface and the hotspot owner-map entries.
The package only adds a bounded diagnostic guard; it does not create a new
runtime path, publication grammar, or harness exception.
