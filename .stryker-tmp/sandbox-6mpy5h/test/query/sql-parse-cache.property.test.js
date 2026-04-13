// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SqlParseCache} from '../../src/query/sql-parse-cache.js';
import {SQL_PARSE_CACHE} from '../../src/query/query-constants.js';

/**
 * Feature: write-path-throughput
 *
 * Property-based tests for SqlParseCache LRU cache behavior.
 */

/**
 * Arbitrary for generating a simple AST-like object with optional
 * _paramMapping array (simulating PG dialect parse results).
 */
const astArb = fc.record({
  type: fc.constantFrom('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
  table: fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/),
  columns: fc.array(
    fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/),
    {minLength: 1, maxLength: 5},
  ),
  where: fc.option(
    fc.record({
      column: fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/),
      value: fc.oneof(fc.integer(), fc.string({maxLength: 20})),
    }),
    {nil: undefined},
  ),
});

const pgAstArb = astArb.chain((ast) =>
  fc.array(fc.nat({max: 20}), {minLength: 1, maxLength: 8}).map(
    (mapping) => ({...ast, _paramMapping: mapping}),
  ),
);

const sqlArb = fc.stringMatching(/^[A-Z][A-Za-z0-9 _,*()=]{0,60}$/);
const dialectArb = fc.constantFrom(undefined, 'sqlite', 'postgresql');

// ---------------------------------------------------------------------------
// Property 4: Parse cache round-trip equivalence
// Validates: Requirements 2.1, 2.2, 2.5
// ---------------------------------------------------------------------------
test(
  'Feature: write-path-throughput, Property 4: ' +
  'Parse cache round-trip equivalence',
  async (t) => {
    await fc.assert(
      fc.property(
        sqlArb,
        dialectArb,
        fc.oneof(astArb, pgAstArb),
        (sql, dialect, ast) => {
          const cache = new SqlParseCache(
            SQL_PARSE_CACHE.DEFAULT_MAX_SIZE,
          );

          // First access: cache miss
          const miss = cache.get(sql, dialect);
          t.equal(miss, null, 'first get should be a cache miss');

          // Store the AST
          cache.set(sql, dialect, ast);

          // Second access: cache hit — clone 1
          const clone1 = cache.get(sql, dialect);
          t.not(clone1, null, 'second get should be a cache hit');
          t.same(clone1, ast, 'clone1 should be structurally equal');
          t.not(
            clone1, ast,
            'clone1 should not be the same reference',
          );

          // Third access: cache hit — clone 2
          const clone2 = cache.get(sql, dialect);
          t.same(clone2, ast, 'clone2 should be structurally equal');
          t.not(
            clone2, clone1,
            'clone2 should be a distinct reference from clone1',
          );

          // Verify _paramMapping preservation for PG-style ASTs
          if (ast._paramMapping) {
            t.same(
              clone1._paramMapping,
              ast._paramMapping,
              '_paramMapping should be preserved in clone1',
            );
            t.same(
              clone2._paramMapping,
              ast._paramMapping,
              '_paramMapping should be preserved in clone2',
            );
          }

          // Mutating clone1 must not affect clone2 or future gets
          clone1.table = 'MUTATED';
          const clone3 = cache.get(sql, dialect);
          t.same(
            clone3, ast,
            'mutation of clone1 should not affect cached AST',
          );
        },
      ),
      {numRuns: 10},
    );
  },
);

// ---------------------------------------------------------------------------
// Property 5: LRU eviction maintains bounded cache size
// Validates: Requirements 2.3, 2.6
// ---------------------------------------------------------------------------

/**
 * Arbitrary for a cache operation: either a set or a get.
 */
const cacheOpArb = fc.oneof(
  fc.record({
    kind: fc.constant('set'),
    sql: fc.stringMatching(/^q[0-9]{1,3}$/),
    dialect: dialectArb,
    ast: astArb,
  }),
  fc.record({
    kind: fc.constant('get'),
    sql: fc.stringMatching(/^q[0-9]{1,3}$/),
    dialect: dialectArb,
  }),
);

test(
  'Feature: write-path-throughput, Property 5: ' +
  'LRU eviction maintains bounded cache size',
  async (t) => {
    await fc.assert(
      fc.property(
        fc.integer({min: 1, max: 10}),
        fc.array(cacheOpArb, {minLength: 1, maxLength: 40}),
        (maxSize, ops) => {
          const cache = new SqlParseCache(maxSize);

          // Track insertion order for LRU verification
          const lruOrder = [];

          for (const op of ops) {
            if (op.kind === 'set') {
              const key = cache.buildKey(op.sql, op.dialect);

              // Remove from tracking if already present (re-insert)
              const idx = lruOrder.indexOf(key);
              if (idx !== -1) lruOrder.splice(idx, 1);
              lruOrder.push(key);

              // If over capacity, the oldest should be evicted
              while (lruOrder.length > maxSize) {
                lruOrder.shift();
              }

              cache.set(op.sql, op.dialect, op.ast);
            } else {
              const key = cache.buildKey(op.sql, op.dialect);
              const result = cache.get(op.sql, op.dialect);
              if (result !== null) {
                // Promote to most recently used
                const idx = lruOrder.indexOf(key);
                if (idx !== -1) {
                  lruOrder.splice(idx, 1);
                  lruOrder.push(key);
                }
              }
            }

            // Invariant: cache size never exceeds maxSize
            t.ok(
              cache.cache.size <= maxSize,
              `cache size ${cache.cache.size} should not exceed ` +
              `maxSize ${maxSize}`,
            );
          }

          // After all ops, verify the cache contains exactly the
          // keys we expect from our LRU tracking
          const actualKeys = [...cache.cache.keys()];
          t.equal(
            actualKeys.length,
            lruOrder.length,
            'cache should contain expected number of entries',
          );
          t.same(
            actualKeys.sort(),
            [...lruOrder].sort(),
            'cache keys should match LRU-tracked keys',
          );
        },
      ),
      {numRuns: 10},
    );
  },
);
