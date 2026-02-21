import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_AST_TYPE} from '../../src/query/query-constants.js';

/**
 * Feature: write-path-throughput
 *
 * Property-based test for payload hash determinism.
 */

const statementTypeArb = fc.constantFrom(
  QUERY_AST_TYPE.INSERT,
  QUERY_AST_TYPE.UPDATE,
  QUERY_AST_TYPE.DELETE,
);

const partitionIdArb = fc.stringMatching(/^p-[a-z0-9]{1,12}$/);

const writePlanArb = fc.record({
  operationId: fc.uuid(),
  partitionStatements: fc.array(partitionIdArb, {minLength: 1, maxLength: 8})
    .map((ids) => new Map(ids.map((id) => [id, {type: 'stub'}]))),
});

// ---------------------------------------------------------------------------
// Property 6: Payload hash is deterministic
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------
test(
  'Feature: write-path-throughput, Property 6: ' +
  'Payload hash is deterministic',
  async (t) => {
    const engine = new SQLQueryEngine();

    await fc.assert(
      fc.property(
        writePlanArb,
        statementTypeArb,
        (writePlan, statementType) => {
          const hash1 = engine.createWriteOperationPayloadHash(
            writePlan, statementType,
          );
          const hash2 = engine.createWriteOperationPayloadHash(
            writePlan, statementType,
          );

          t.equal(
            hash1, hash2,
            'two calls with identical inputs produce identical hashes',
          );
          t.equal(
            typeof hash1, 'string',
            'hash should be a string',
          );
          t.ok(
            hash1.length > 0,
            'hash should be non-empty',
          );
        },
      ),
      {numRuns: 10},
    );
  },
);
