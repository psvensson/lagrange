/**
 * Property Tests: Service Definition Validation
 *
 * **Property 1: Service definition validation rejects invalid
 * definitions**
 * **Validates: Requirements 1.1, 1.4, 1.5**
 *
 * *For any* service definition, the validator SHALL accept it if
 * and only if: (a) the referenced handler function exists in the
 * code table, AND (b) the replica count is an odd number >= 3.
 * For all other definitions, the validator SHALL reject with a
 * descriptive error.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ServiceDefinitionValidator,
} from '../../src/wasm-service/service-definition-validator.js';
import {
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  WASM_SERVICE_ERROR_MSG,
} from '../../src/wasm-service/wasm-service-constants.js';

const READ_MODES = Object.values(READ_CONSISTENCY_MODE);
const WRITE_MODES = Object.values(WRITE_CONSISTENCY_MODE);

/**
 * Creates a mock SQL query engine that returns rows for
 * the given set of known function IDs.
 * @param {Set<string>} knownIds - Set of function IDs that exist.
 * @return {Object} Mock sqlQueryEngine.
 */
function createMockSqlEngine(knownIds) {
  return {
    async executeQuery(_sql, params) {
      const functionId = params[0];
      if (knownIds.has(functionId)) {
        return {rows: [{function_id: functionId}]};
      }
      return {rows: []};
    },
  };
}

/** Generates a non-empty alphanumeric identifier string. */
const identifierArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/);

/** Generates a set of known function IDs (1-5 IDs). */
const knownIdsArb = fc.array(identifierArb, {minLength: 1, maxLength: 5})
  .map((ids) => new Set(ids));

/** Generates a valid odd replica count >= 3. */
const validReplicaCountArb = fc.integer({min: 1, max: 50})
  .map((n) => n * 2 + 1)
  .filter((n) => n >= 3);

/** Generates an invalid replica count (even or < 3). */
const invalidReplicaCountArb = fc.oneof(
  fc.integer({min: 0, max: 2}),
  fc.integer({min: 2, max: 100}).filter((n) => n % 2 === 0),
);

/** Generates a valid resource budget with non-negative values. */
const validBudgetArb = fc.record({
  cpuTimeLimitMs: fc.nat(),
  memoryLimitBytes: fc.nat(),
  sessionSizeLimitBytes: fc.nat(),
  serviceSizeLimitBytes: fc.nat(),
});

test(
  'Feature: replicated-wasm-services, ' +
  'Property 1: Service definition validation rejects ' +
  'invalid definitions',
  async (t) => {
    /**
     * **Validates: Requirements 1.1, 1.4, 1.5**
     */
    t.test(
      'accepts iff handler exists AND replica count is odd >= 3',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            knownIdsArb,
            identifierArb,
            fc.boolean(),
            fc.boolean(),
            validBudgetArb,
            async (
              knownIds,
              funcId,
              useExistingHandler,
              useValidReplica,
              budget,
            ) => {
              // Pick a handler function ID: either one that
              // exists or one that does not
              const knownArray = [...knownIds];
              const existingId = knownArray[0];
              const handlerFunctionId = useExistingHandler ?
                existingId :
                `nonexistent-${funcId}`;

              // Pick a replica count: either valid or invalid
              const validReplica = 3;
              const invalidReplica = 2;
              const replicaCount = useValidReplica ?
                validReplica :
                invalidReplica;

              // Use valid consistency modes and budget so only
              // handler + replica count determine validity
              const definition = {
                serviceId: `svc-${funcId}`,
                serviceName: `test-${funcId}`,
                handlerFunctionId,
                readConsistency: READ_MODES[0],
                writeConsistency: WRITE_MODES[0],
                replicaCount,
                resourceBudget: budget,
              };

              const handlerExists = knownIds.has(handlerFunctionId);
              const replicaValid = replicaCount % 2 !== 0 &&
                replicaCount >= 3;
              const shouldBeValid = handlerExists && replicaValid;

              const engine = createMockSqlEngine(knownIds);
              const validator = new ServiceDefinitionValidator({
                sqlQueryEngine: engine,
              });
              const result = await validator.validate(definition);

              if (result.valid !== shouldBeValid) return false;

              if (!shouldBeValid) {
                if (result.errors.length === 0) return false;
              }

              if (!handlerExists) {
                const hasHandlerErr = result.errors.includes(
                  WASM_SERVICE_ERROR_MSG
                    .HANDLER_FUNCTION_NOT_FOUND,
                );
                if (!hasHandlerErr) return false;
              }

              if (!replicaValid) {
                const hasReplicaErr = result.errors.includes(
                  WASM_SERVICE_ERROR_MSG
                    .ODD_REPLICA_COUNT_REQUIRED,
                );
                if (!hasReplicaErr) return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'rejects with handler error when function missing',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            knownIdsArb,
            identifierArb,
            validReplicaCountArb,
            validBudgetArb,
            async (knownIds, funcId, replicaCount, budget) => {
              // Ensure the handler ID is NOT in the known set
              const handlerFunctionId =
                `missing-handler-${funcId}`;

              const definition = {
                serviceId: `svc-${funcId}`,
                serviceName: `test-${funcId}`,
                handlerFunctionId,
                readConsistency: READ_MODES[0],
                writeConsistency: WRITE_MODES[0],
                replicaCount,
                resourceBudget: budget,
              };

              const engine = createMockSqlEngine(knownIds);
              const validator = new ServiceDefinitionValidator({
                sqlQueryEngine: engine,
              });
              const result = await validator.validate(definition);

              // Must be invalid
              if (result.valid) return false;

              // Must contain the handler not found error
              const hasErr = result.errors.includes(
                WASM_SERVICE_ERROR_MSG
                  .HANDLER_FUNCTION_NOT_FOUND,
              );
              return hasErr;
            },
          ),
          {numRuns: 10},
        );
      },
    );

    t.test(
      'rejects with replica error when count is invalid',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            knownIdsArb,
            invalidReplicaCountArb,
            validBudgetArb,
            async (knownIds, replicaCount, budget) => {
              // Use an existing handler so only replica count
              // causes rejection
              const knownArray = [...knownIds];
              const handlerFunctionId = knownArray[0];

              const definition = {
                serviceId: 'svc-prop',
                serviceName: 'test-prop',
                handlerFunctionId,
                readConsistency: READ_MODES[0],
                writeConsistency: WRITE_MODES[0],
                replicaCount,
                resourceBudget: budget,
              };

              const engine = createMockSqlEngine(knownIds);
              const validator = new ServiceDefinitionValidator({
                sqlQueryEngine: engine,
              });
              const result = await validator.validate(definition);

              // Must be invalid
              if (result.valid) return false;

              // Must contain the replica count error
              const hasErr = result.errors.includes(
                WASM_SERVICE_ERROR_MSG
                  .ODD_REPLICA_COUNT_REQUIRED,
              );
              return hasErr;
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);
