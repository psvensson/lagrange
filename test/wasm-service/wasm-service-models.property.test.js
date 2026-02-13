/**
 * Property Tests: Serialization Round-Trips for WASM Service Models
 *
 * **Property 7: ServiceDefinition serialization round-trip**
 * **Property 8: ResourceBudget serialization round-trip**
 * **Property 9: TimerEntry serialization round-trip**
 * **Validates: Requirements 1.3, 14.1, 14.2, 14.3**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  serializeResourceBudget,
  deserializeResourceBudget,
  serializeServiceDefinition,
  deserializeServiceDefinition,
  serializeTimerEntry,
  deserializeTimerEntry,
} from '../../src/wasm-service/wasm-service-models.js';
import {
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  TIMER_STATUS,
  WASM_SERVICE_PROTOCOL,
  WASM_SERVICE_DEFINITION_STATUS,
} from '../../src/wasm-service/wasm-service-constants.js';
import {SERVICE_PROFILE} from '../../src/constants/index.js';

// --- Arbitraries ---

const READ_CONSISTENCY_VALUES = Object.values(READ_CONSISTENCY_MODE);
const WRITE_CONSISTENCY_VALUES = Object.values(WRITE_CONSISTENCY_MODE);
const TIMER_STATUS_VALUES = Object.values(TIMER_STATUS);
const PROTOCOL_VALUES = Object.values(WASM_SERVICE_PROTOCOL);
const DEFINITION_STATUS_VALUES =
  Object.values(WASM_SERVICE_DEFINITION_STATUS);
const SERVICE_PROFILE_VALUES = Object.values(SERVICE_PROFILE);

/** Generates odd integers >= 3 for replica counts. */
const oddReplicaCount = fc.integer({min: 1, max: 50}).map(
  (n) => n * 2 + 1,
).filter((n) => n >= 3);

/** Generates a valid ResourceBudget object with non-negative fields. */
const resourceBudgetArb = fc.record({
  cpuTimeLimitMs: fc.nat(),
  memoryLimitBytes: fc.nat(),
  sessionSizeLimitBytes: fc.nat(),
  serviceSizeLimitBytes: fc.nat(),
});

/** Generates a non-empty alphanumeric-ish identifier string. */
const identifierArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/);

/** Generates a valid ServiceDefinition object. */
const serviceDefinitionArb = fc.record({
  serviceId: identifierArb,
  serviceName: identifierArb,
  serviceProfile: fc.constantFrom(...SERVICE_PROFILE_VALUES),
  handlerFunctionId: identifierArb,
  readConsistency: fc.constantFrom(...READ_CONSISTENCY_VALUES),
  writeConsistency: fc.constantFrom(...WRITE_CONSISTENCY_VALUES),
  replicaCount: oddReplicaCount,
  protocol: fc.constantFrom(...PROTOCOL_VALUES),
  resourceBudget: resourceBudgetArb,
  safetyIntervalMs: fc.nat(),
  status: fc.constantFrom(...DEFINITION_STATUS_VALUES),
  createdAt: fc.nat(),
  updatedAt: fc.nat(),
});

/**
 * Generates a JSON-safe payload object (no undefined, no special
 * floats). Uses fc.jsonValue which produces values that survive
 * JSON round-trips.
 */
const jsonSafePayloadArb = fc.jsonValue().map((v) => {
  if (v === null || typeof v !== 'object') return {};
  return v;
});

/** Generates a valid TimerEntry object. */
const timerEntryArb = fc.record({
  timerId: identifierArb,
  serviceId: identifierArb,
  delayMs: fc.nat(),
  fireAt: fc.nat(),
  payload: jsonSafePayloadArb,
  status: fc.constantFrom(...TIMER_STATUS_VALUES),
  createdAt: fc.nat(),
});

// --- Property Tests ---

test('Property 7: ServiceDefinition serialization round-trip',
  async (t) => {
    /**
     * *For any* valid ServiceDefinition object, serializing it to a
     * table row (with JSON-encoded resource_budget) and deserializing
     * back SHALL produce an equivalent ServiceDefinition object.
     *
     * **Validates: Requirements 1.3, 14.1**
     */
    t.test('serialize then deserialize produces equivalent object',
      async () => {
        await fc.assert(
          fc.property(
            serviceDefinitionArb,
            (definition) => {
              const row = serializeServiceDefinition(definition);
              const result = deserializeServiceDefinition(row);

              // All scalar fields must match
              if (result.serviceId !== definition.serviceId) return false;
              if (result.serviceName !== definition.serviceName) {
                return false;
              }
              if (result.serviceProfile !==
                definition.serviceProfile) {
                return false;
              }
              if (result.handlerFunctionId !==
                definition.handlerFunctionId) {
                return false;
              }
              if (result.readConsistency !==
                definition.readConsistency) {
                return false;
              }
              if (result.writeConsistency !==
                definition.writeConsistency) {
                return false;
              }
              if (result.replicaCount !== definition.replicaCount) {
                return false;
              }
              if (result.protocol !== definition.protocol) return false;
              if (result.safetyIntervalMs !==
                definition.safetyIntervalMs) {
                return false;
              }
              if (result.status !== definition.status) return false;
              if (result.createdAt !== definition.createdAt) {
                return false;
              }
              if (result.updatedAt !== definition.updatedAt) {
                return false;
              }

              // ResourceBudget nested object must match
              const rb = result.resourceBudget;
              const eb = definition.resourceBudget;
              if (rb.cpuTimeLimitMs !== eb.cpuTimeLimitMs) return false;
              if (rb.memoryLimitBytes !== eb.memoryLimitBytes) {
                return false;
              }
              if (rb.sessionSizeLimitBytes !==
                eb.sessionSizeLimitBytes) {
                return false;
              }
              if (rb.serviceSizeLimitBytes !==
                eb.serviceSizeLimitBytes) {
                return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );
      });
  });

test('Property 8: ResourceBudget serialization round-trip',
  async (t) => {
    /**
     * *For any* valid ResourceBudget object with non-negative numeric
     * fields (cpuTimeLimitMs, memoryLimitBytes, sessionSizeLimitBytes,
     * serviceSizeLimitBytes), serializing to JSON and deserializing
     * back SHALL produce an equivalent object.
     *
     * **Validates: Requirements 14.2**
     */
    t.test('serialize then deserialize produces equivalent object',
      async () => {
        await fc.assert(
          fc.property(
            resourceBudgetArb,
            (budget) => {
              const json = serializeResourceBudget(budget);
              const result = deserializeResourceBudget(json);

              if (result.cpuTimeLimitMs !== budget.cpuTimeLimitMs) {
                return false;
              }
              if (result.memoryLimitBytes !== budget.memoryLimitBytes) {
                return false;
              }
              if (result.sessionSizeLimitBytes !==
                budget.sessionSizeLimitBytes) {
                return false;
              }
              if (result.serviceSizeLimitBytes !==
                budget.serviceSizeLimitBytes) {
                return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );
      });
  });

test('Property 9: TimerEntry serialization round-trip',
  async (t) => {
    /**
     * *For any* valid TimerEntry object, serializing to JSON (for Raft
     * log storage) and deserializing back SHALL produce an equivalent
     * TimerEntry object with identical timerId, serviceId, delayMs,
     * fireAt, payload, and status.
     *
     * **Validates: Requirements 14.3**
     */
    t.test('serialize then deserialize produces equivalent object',
      async () => {
        await fc.assert(
          fc.property(
            timerEntryArb,
            (entry) => {
              const json = serializeTimerEntry(entry);
              const result = deserializeTimerEntry(json);

              if (result.timerId !== entry.timerId) return false;
              if (result.serviceId !== entry.serviceId) return false;
              if (result.delayMs !== entry.delayMs) return false;
              if (result.fireAt !== entry.fireAt) return false;
              if (result.status !== entry.status) return false;
              if (result.createdAt !== entry.createdAt) return false;

              // Payload must deep-equal (JSON-safe objects)
              const resultPayload = JSON.stringify(result.payload);
              const entryPayload = JSON.stringify(entry.payload);
              if (resultPayload !== entryPayload) return false;

              return true;
            },
          ),
          {numRuns: 10},
        );
      });
  });
