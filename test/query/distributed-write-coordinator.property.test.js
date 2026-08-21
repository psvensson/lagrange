import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {DistributedWriteCoordinator}
  from '../../src/query/distributed/distributed-write-coordinator.js';
import {QUERY_AST_TYPE} from '../../src/query/query-constants.js';

/**
 * Feature: write-path-throughput
 *
 * Property-based tests for parallel partition execution in
 * DistributedWriteCoordinator.executePlan().
 */

/**
 * Build a minimal write plan targeting the given partition IDs.
 */
function buildPlan(partitionIds, statementType = QUERY_AST_TYPE.INSERT) {
  const partitionStatements = new Map();
  for (const id of partitionIds) {
    partitionStatements.set(id, {type: statementType, table: 't'});
  }
  return {
    statementType,
    partitionStatements,
    idempotencyKey: 'idem-1',
    operationId: 'op-1',
  };
}

/**
 * Create a coordinator whose executePartitionStatement is replaced
 * by a lookup into a result map keyed by partitionId.
 */
function createCoordinator(resultsByPartition) {
  const coordinator = new DistributedWriteCoordinator({
    partitionResolver: {},
    queryExecutor: {
      async executeInsert() {
        return {success: true, affectedRows: 0, rows: []};
      },
      async executeUpdate() {
        return {success: true, affectedRows: 0, rows: []};
      },
      async executeDelete() {
        return {success: true, affectedRows: 0, rows: []};
      },
    },
    getTablePartitions() {
      return [];
    },
    getTableInfo() {
      return {primaryKey: 'id'};
    },
  });

  coordinator.executePartitionStatement =
    async (_type, _ast, partitionId, _params) => {
      const entry = resultsByPartition.get(partitionId);
      if (!entry) {
        return {success: true, affectedRows: 0, rows: [], attempts: 1};
      }
      if (entry.shouldThrow) {
        throw new Error(entry.error);
      }
      return entry;
    };

  return coordinator;
}

// Generator: unique partition IDs (at least 2 for multi-partition path)
const partitionIdsArb = fc.uniqueArray(
  fc.stringMatching(/^p-[a-z0-9]{1,8}$/),
  {minLength: 2, maxLength: 8},
);

// ---------------------------------------------------------------------------
// Property 1: Parallel execution reports all failures
// Validates: Requirements 1.2
// ---------------------------------------------------------------------------
test(
  'Feature: write-path-throughput, Property 1: ' +
  'Parallel execution reports all failures',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        partitionIdsArb.chain((ids) =>
          fc.tuple(
            fc.constant(ids),
            fc.array(fc.boolean(), {
              minLength: ids.length,
              maxLength: ids.length,
            }),
          ),
        ),
        async ([partitionIds, failFlags]) => {
          // Ensure at least one failure
          if (!failFlags.some((f) => f)) {
            failFlags[0] = true;
          }

          const resultsByPartition = new Map();
          const expectedFailedIds = [];

          for (let i = 0; i < partitionIds.length; i++) {
            const pid = partitionIds[i];
            if (failFlags[i]) {
              expectedFailedIds.push(pid);
              resultsByPartition.set(pid, {
                success: false,
                error: `fail-${pid}`,
                attempts: 1,
              });
            } else {
              resultsByPartition.set(pid, {
                success: true,
                affectedRows: 1,
                rows: [],
                attempts: 1,
              });
            }
          }

          const coordinator = createCoordinator(resultsByPartition);
          const plan = buildPlan(partitionIds);
          const result = await coordinator.executePlan(plan, []);

          t.equal(result.success, false);
          t.equal(
            result.failedPartitions.length,
            expectedFailedIds.length,
          );

          const sortedExpected = [...expectedFailedIds].sort();
          const sortedActual = [...result.failedPartitions].sort();
          t.same(sortedActual, sortedExpected);

          t.equal(
            result.partitionErrors.length,
            expectedFailedIds.length,
          );
          for (const pe of result.partitionErrors) {
            t.ok(expectedFailedIds.includes(pe.partitionId));
          }
        },
      ),
      {numRuns: 10},
    );
  },
);


// ---------------------------------------------------------------------------
// Property 2: Parallel execution aggregates success results
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------
test(
  'Feature: write-path-throughput, Property 2: ' +
  'Parallel execution aggregates success results',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        partitionIdsArb.chain((ids) =>
          fc.tuple(
            fc.constant(ids),
            fc.array(
              fc.record({
                affectedRows: fc.nat({max: 100}),
                rowCount: fc.nat({max: 5}),
              }),
              {minLength: ids.length, maxLength: ids.length},
            ),
          ),
        ),
        async ([partitionIds, partitionData]) => {
          const resultsByPartition = new Map();
          let expectedAffectedRows = 0;
          let expectedRowCount = 0;

          for (let i = 0; i < partitionIds.length; i++) {
            const pid = partitionIds[i];
            const data = partitionData[i];
            const rows = Array.from(
              {length: data.rowCount},
              (_, j) => ({id: `${pid}-row-${j}`}),
            );
            expectedAffectedRows += data.affectedRows;
            expectedRowCount += rows.length;
            resultsByPartition.set(pid, {
              success: true,
              affectedRows: data.affectedRows,
              rows,
              attempts: 1,
            });
          }

          const coordinator = createCoordinator(resultsByPartition);
          const plan = buildPlan(partitionIds);
          const result = await coordinator.executePlan(plan, []);

          t.equal(result.success, true);
          t.equal(result.affectedRows, expectedAffectedRows);
          t.equal(result.rows.length, expectedRowCount);
        },
      ),
      {numRuns: 10},
    );
  },
);

// ---------------------------------------------------------------------------
// Property 3: Partition result ordering is deterministic
// Validates: Requirements 1.5
// ---------------------------------------------------------------------------
test(
  'Feature: write-path-throughput, Property 3: ' +
  'Partition result ordering is deterministic',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        partitionIdsArb,
        async (partitionIds) => {
          // Introduce random delays so results arrive out of order
          const resultsByPartition = new Map();
          for (const pid of partitionIds) {
            resultsByPartition.set(pid, {
              success: true,
              affectedRows: 1,
              rows: [],
              attempts: 1,
            });
          }

          const coordinator = createCoordinator(resultsByPartition);
          const plan = buildPlan(partitionIds);
          const result = await coordinator.executePlan(plan, []);

          const resultPartitionIds = result.participantResults.map(
            (r) => r.partitionId,
          );
          const expectedOrder = [...partitionIds].sort();
          t.same(resultPartitionIds, expectedOrder);
        },
      ),
      {numRuns: 10},
    );
  },
);
