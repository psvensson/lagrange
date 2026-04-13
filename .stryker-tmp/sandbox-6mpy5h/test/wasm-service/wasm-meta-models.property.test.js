/**
 * Property Tests: WASM Meta Models Serialization Round-Trips
 *
 * Covers registry mappings, registry overrides, dependency locks,
 * and wasm operations.
 *
 * **Validates: Requirements 10.4, 13.4**
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  serializeRegistryMapping,
  deserializeRegistryMapping,
  serializeRegistryOverride,
  deserializeRegistryOverride,
  serializeDependencyLock,
  deserializeDependencyLock,
  serializeWasmOperation,
  deserializeWasmOperation,
} from '../../src/wasm-service/wasm-meta-models.js';
import {WASM_OPERATION_STATE} from '../../src/constants/index.js';

// --- Arbitraries ---

/** Valid namespace: lowercase alpha start, then lowercase alphanum + hyphens. */
const namespaceArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/);

/** Valid package name: same pattern as namespace. */
const packageNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/);

/** Non-empty identifier for IDs, commands, etc. */
const identifierArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/);

/** Semver-like version string. */
const versionArb = fc.tuple(
  fc.nat({max: 99}), fc.nat({max: 99}), fc.nat({max: 99}),
).map(([a, b, c]) => `${a}.${b}.${c}`);

/** URL-like string for registry URLs. */
const registryUrlArb = fc.stringMatching(
  /^https:\/\/[a-z][a-z0-9.-]{1,40}$/,
);

/** Simple JSON-safe object for policy metadata / result / error. */
const jsonObjectArb = fc.oneof(
  fc.constant({}),
  fc.record({
    key: fc.string({minLength: 1, maxLength: 10}),
  }),
);

/** Valid WASM operation state. */
const opStateArb = fc.constantFrom(
  ...Object.values(WASM_OPERATION_STATE),
);

/** Dependency entry for lock resolved_dependencies. */
const depEntryArb = fc.record({
  moduleId: identifierArb,
  digest: fc.stringMatching(/^sha256:[a-f0-9]{64}$/),
});

// --- Registry Mapping round-trip ---

test('RegistryMapping serialization round-trip', async (t) => {
  /**
   * *For any* valid registry mapping, serializing to a table row
   * and deserializing back SHALL produce an equivalent object.
   *
   * **Validates: Requirements 10.4, 13.4**
   */
  t.test(
    'serialize then deserialize produces equivalent object',
    async () => {
      await fc.assert(
        fc.property(
          fc.record({
            namespace: namespaceArb,
            registryUrl: registryUrlArb,
            policyMetadata: jsonObjectArb,
            createdAt: fc.nat(),
            updatedAt: fc.nat(),
          }),
          (mapping) => {
            const row = serializeRegistryMapping(mapping);
            const result = deserializeRegistryMapping(row);
            return (
              result.namespace === mapping.namespace &&
              result.registryUrl === mapping.registryUrl &&
              JSON.stringify(result.policyMetadata) ===
                JSON.stringify(mapping.policyMetadata) &&
              result.createdAt === mapping.createdAt &&
              result.updatedAt === mapping.updatedAt
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );
});

// --- Registry Override round-trip ---

test('RegistryOverride serialization round-trip', async (t) => {
  /**
   * *For any* valid registry override, serializing to a table row
   * and deserializing back SHALL produce an equivalent object.
   *
   * **Validates: Requirements 10.4, 13.4**
   */
  t.test(
    'serialize then deserialize produces equivalent object',
    async () => {
      await fc.assert(
        fc.property(
          fc.record({
            namespace: namespaceArb,
            name: packageNameArb,
            registryUrl: registryUrlArb,
            policyMetadata: jsonObjectArb,
            createdAt: fc.nat(),
            updatedAt: fc.nat(),
          }),
          (override) => {
            const row = serializeRegistryOverride(override);
            const result = deserializeRegistryOverride(row);
            return (
              result.namespace === override.namespace &&
              result.name === override.name &&
              result.registryUrl === override.registryUrl &&
              JSON.stringify(result.policyMetadata) ===
                JSON.stringify(override.policyMetadata) &&
              result.createdAt === override.createdAt &&
              result.updatedAt === override.updatedAt
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );
});

// --- Dependency Lock round-trip ---

test('DependencyLock serialization round-trip', async (t) => {
  /**
   * *For any* valid dependency lock, serializing to a table row
   * and deserializing back SHALL produce an equivalent object.
   *
   * **Validates: Requirements 10.4, 13.4**
   */
  t.test(
    'serialize then deserialize produces equivalent object',
    async () => {
      await fc.assert(
        fc.property(
          fc.record({
            lockId: identifierArb,
            targetModuleNamespace: namespaceArb,
            targetModuleName: packageNameArb,
            targetModuleVersion: versionArb,
            targetServiceId: fc.option(
              identifierArb, {nil: null},
            ),
            resolvedDependencies: fc.array(
              depEntryArb, {maxLength: 3},
            ),
            createdAt: fc.nat(),
          }),
          (lock) => {
            const row = serializeDependencyLock(lock);
            const result = deserializeDependencyLock(row);
            return (
              result.lockId === lock.lockId &&
              result.targetModuleNamespace ===
                lock.targetModuleNamespace &&
              result.targetModuleName ===
                lock.targetModuleName &&
              result.targetModuleVersion ===
                lock.targetModuleVersion &&
              result.targetServiceId ===
                lock.targetServiceId &&
              JSON.stringify(result.resolvedDependencies) ===
                JSON.stringify(lock.resolvedDependencies) &&
              result.createdAt === lock.createdAt
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );
});

// --- Wasm Operation round-trip ---

test('WasmOperation serialization round-trip', async (t) => {
  /**
   * *For any* valid wasm operation, serializing to a table row
   * and deserializing back SHALL produce an equivalent object.
   *
   * **Validates: Requirements 10.4, 13.4**
   */
  t.test(
    'serialize then deserialize produces equivalent object',
    async () => {
      await fc.assert(
        fc.property(
          fc.record({
            operationId: identifierArb,
            tenantId: identifierArb,
            command: identifierArb,
            idempotencyKey: fc.option(
              identifierArb, {nil: null},
            ),
            state: opStateArb,
            result: jsonObjectArb,
            error: jsonObjectArb,
            createdAt: fc.nat(),
            updatedAt: fc.nat(),
          }),
          (op) => {
            const row = serializeWasmOperation(op);
            const result = deserializeWasmOperation(row);
            return (
              result.operationId === op.operationId &&
              result.tenantId === op.tenantId &&
              result.command === op.command &&
              result.idempotencyKey ===
                op.idempotencyKey &&
              result.state === op.state &&
              JSON.stringify(result.result) ===
                JSON.stringify(op.result) &&
              JSON.stringify(result.error) ===
                JSON.stringify(op.error) &&
              result.createdAt === op.createdAt &&
              result.updatedAt === op.updatedAt
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );
});
