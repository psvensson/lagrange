# Bounded readiness fixture custody and operation-reader design review

Reviewer: `subagent:/root/independent_review`, 2026-11-06. Source baseline: `205b5683f36a3f667bcec7499d04df43cc33da33` (same relevant production bytes as 4024). This supplements `independent-focused-failure-review.md`, SHA-256 `2af47a1960672bf00eacb25c94c9cf4c047005e40ef20cd9ee4d328e546aa825`. It is a design recommendation, not implementation approval or runtime evidence. No tests or lab jobs were run for this review.

## Recommended fixture construction

Consolidate the controlled port at the existing `createMockControlPlaneReadinessService` factory. Remove `withFixtureCommittedNodes` entirely. Do not replace it with object-extensibility checks, proxies, a clone of an incoming real service, or a permissive missing-method fallback.

The factory should construct its own complete test port once, closing over the fixture world's cache/read callbacks. The committed-node answer, per-node readiness and planning snapshot must use that same declared world. Read the current world on each call; do not capture its initial rows into a permanent snapshot. Custom callbacks belong in explicit factory construction inputs. This is construction of a controlled double, not adaptation of an arbitrary owner into a different authority. Its name/documentation must say that the fixture is substituting a committed reader; it cannot claim an actual consensus read merely because the backing test rows live in a cache.

`createTestCoordinator` and `createTestRebalancer` then have one custody rule: an explicitly supplied readiness port is passed through by exact identity, unchanged. Only when no port is supplied do they invoke the fixture factory after their cache is available. They must not add properties, replace methods, wrap subscriptions, materialize getters or rebind the supplied object's `this`. A deliberately incomplete or unavailable supplied port remains so; the constructor helper must not repair it into permission.

The helper-created mock coordinator and rebalancer should receive the same fixture port at construction. Today `createMockCoordinator()` constructs a cache-less port at `test-helpers.js:666`, and `createTestRebalancer` later mutates it using the injector. Supply the known fixture world/port when constructing that mock instead. Also remove the unconditional assignment to `mockCoordinator.controlPlaneReadinessService` at lines 1237–1238 for a supplied coordinator. If a test supplies both a coordinator and a readiness port, the test composition must deliberately provide one shared owner; do not silently overwrite an owner chosen elsewhere. Real production dependency synchronization is a separate owner behavior and need not be patched by the fixture helper.

Existing custom fixture constructors such as `buildPriorityDrainReadinessService` may compose their declared callback answers through the same factory and freeze the completed result. They must receive the intended fixture-world input explicitly if their tests need committed-node answers. They should not be un-frozen merely to make the old injector work. A fully constructed real/frozen port passes straight through and preserves callback/event behavior.

### Reachable scope

Live search found `fixtureSystemTableCache` and `withFixtureCommittedNodes` only in `test/rebalancer/test-helpers.js`; there is no production use to preserve. There are three injector call sites: the readiness factory itself, coordinator construction and rebalancer construction. Removing the mechanism at these owners is bounded.

The readiness factory has 82 textual declaration/call sites across 45 test files, including 34 zero-argument calls. Some of these currently rely on later implicit cache injection; those must be inspected and migrated to explicit construction inputs, not rescued by a compatibility branch. The shared coordinator/rebalancer helpers occur in 122 rebalancer files, so their caller cone is much wider than the five tests currently throwing. That is an impact-verification requirement, not a reason to preserve mutation of foreign ports.

To avoid constructing a cache twice, a helper may accept explicit *fixture construction options/callbacks* separately from `controlPlaneReadinessService`; it can pass those to the sole factory after creating its world. Such options describe a double that the helper owns. The actual port option always retains its separate meaning: already constructed, caller owned, passed unchanged. Do not infer which option means which by checking whether the object is frozen or which methods it happens to have.

### Discriminating verification

- A frozen complete port, with receiver-sensitive methods and a real callback registration/unsubscribe pair, survives coordinator and rebalancer construction by exact identity; no own descriptors/keys change, and live callbacks still reach the original port.
- A custom unavailable answer remains unavailable even when the fixture cache contains healthy rows. A supplied port missing the committed reader is not populated by the helper.
- A helper-owned default port sees later changes in its declared world through both committed-node and readiness answers. Two worlds do not overwrite each other's source, and coordinator/rebalancer sharing uses one identity rather than rebinding an existing instance.
- The five existing frozen-port failures reach their original lease/drain assertions after the fixture correction; do not weaken those assertions to conceal a new later failure.
- The topology fixtures explicitly model the committed reader and required authoritative operation reader. Keep current/expired/absent/read-error distinctions and the trigger-disabled controls. A projection-only answer must not satisfy a committed-read predicate.

This is preferable to adding a handwritten reader to every test: it removes the foreign-object mutation once, keeps one declared test-port construction owner, and preserves scenario-specific facts at its inputs. It does not require a production cache fallback.

## Separate production concern: missing operation authority

At `unified-rebalancer-critical-topology-methods.js:377–384`, a missing `getOperationsByEntity` method returns the incoming blocker. A null incoming blocker therefore grants without the required reader. Removing that early return and calling the method inside the existing try/catch is a sound narrow correction: absence becomes the named `UNAVAILABLE` decision rather than an exception escaping or a grant. Validate `Array.isArray(entityOperations)` inside that same try before downstream iteration; the declared coordinator API returns an Array, and resolved null/undefined/object/string must not be interpreted as an empty successful inventory. Preserve the method receiver and the `OWNER_RPC_REQUIRED` option. An actual successful empty Array and an unavailable owner are different outcomes.

Required narrow negative/control matrix: missing coordinator, missing method, thrown read, rejected promise, and resolved malformed result all yield `UNAVAILABLE` with no evaluation/operation creation; actual empty Array opens the operation gate; an actual in-flight decoded operation blocks; restoration of the required reader reopens on the existing next owner attempt. Keep the normal scheduling owner and bounds.

### Important deeper propagation gap discovered while tracing the real owner

The narrow correction above is **not sufficient evidence for full C11 unavailable-read propagation**. The real production chain is:

1. `rebalance-coordinator-recovery-budget-bindings.js:149–150` calls the existing recovery helper.
2. `rebalance-coordinator-recovery-helper.js:197–209` calls `repository.getOperationsByEntityAuthoritative` when `OWNER_RPC_REQUIRED` and that method exists. If the authoritative method is missing, it currently falls through to the ordinary cache-capable repository reader.
3. `replica-operation-repository-entity-read-methods.js:142–224` builds an authoritative observation. A failed owner query produces `deferredOutcome` and an observation with `state: deferred` when there are no fallback operations (or `state: present` plus a deferred outcome when retained fallback operations exist).
4. The array facade at lines 227–233 returns only `observation.operations`, discarding that deferred outcome and substituting `[]` for malformed/missing operations. The topology consumer can therefore receive an apparently valid empty Array after an unavailable read.

This is source-confirmed loss of a required distinction, inherited from the predecessor. It has not been independently executed in this review. A missing-method-only fixture test would not expose it. The adjacent `getEntityAuthoritativeOperationObservation` at `rebalance-coordinator-operation-read-methods.js:180–230` is not automatically a safe substitute: its ordinary path also extracts `.operations` then reconstructs `deferredOutcome: null`; its special test-override branch behaves differently.

Before claiming C11 closure, drive a failed authoritative query through the actual repository and coordinator, not only a throwing stub. Preserve the existing observation envelope at the strict authority boundary or make its Array facade refuse deferred/malformed observations through an existing typed error channel; the topology owner must receive the difference. `OWNER_RPC_REQUIRED` must never fall through to the ordinary cache reader when its authoritative dependency is missing. Check both empty fallback and retained-operation fallback schedules, since `state: present` does not erase a non-null deferred outcome. A successful authoritative empty read remains a valid separate control.

Do not silently absorb this source repair into fixture custody or the already-reviewed partition-target change. Declare its exact source boundary and affected callers, record a red real-owner witness, then independently review the implementation. If only the narrow absent-method repair is undertaken first, label that proof honestly and leave this deeper unavailability propagation claim open.
