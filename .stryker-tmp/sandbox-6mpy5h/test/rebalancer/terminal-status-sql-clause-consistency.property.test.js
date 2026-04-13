/**
 * Property Test: Terminal status SQL clause consistency
 *
 * For any status value, that status is in the TERMINAL_STATUSES array if and
 * only if it appears in the TERMINAL_STATUS_SQL_CLAUSE string.
 *
 * **Validates: Requirements 4.1, 4.4**
 *
 * Tag: Feature: guideline-violations-cleanup, Property 2: Terminal status SQL
 * clause consistency
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaStatus,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
} from '../../src/rebalancer/replica-status.js';

/**
 * All valid ReplicaStatus values for generating test inputs.
 */
const ALL_STATUSES = Object.values(ReplicaStatus);

test('Property 2: Terminal status SQL clause consistency', async (t) => {
  await t.test(
    'terminal statuses appear in SQL clause iff in array (known statuses)',
    async (t) => {
      await fc.assert(
        fc.property(
          fc.constantFrom(...ALL_STATUSES),
          (status) => {
            const inArray = TERMINAL_STATUSES.includes(status);
            const inSqlClause =
              TERMINAL_STATUS_SQL_CLAUSE.includes(`'${status}'`);
            return inArray === inSqlClause;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'For all known statuses, array membership matches SQL clause presence',
      );
    },
  );

  await t.test(
    'random strings not in TERMINAL_STATUSES are absent from SQL clause',
    async (t) => {
      await fc.assert(
        fc.property(
          fc.string({minLength: 1, maxLength: 20})
            .filter((s) => !TERMINAL_STATUSES.includes(s)),
          (randomStatus) => {
            const inSqlClause =
              TERMINAL_STATUS_SQL_CLAUSE.includes(`'${randomStatus}'`);
            return inSqlClause === false;
          },
        ),
        {numRuns: 10},
      );

      t.pass(
        'Random non-terminal strings are absent from SQL clause',
      );
    },
  );

  await t.test(
    'every entry in TERMINAL_STATUSES has a quoted form in SQL clause',
    async (t) => {
      for (const status of TERMINAL_STATUSES) {
        t.ok(
          TERMINAL_STATUS_SQL_CLAUSE.includes(`'${status}'`),
          `'${status}' should appear quoted in TERMINAL_STATUS_SQL_CLAUSE`,
        );
      }
    },
  );

  await t.test(
    'SQL clause contains exactly as many quoted entries as TERMINAL_STATUSES',
    async (t) => {
      const quotedEntries =
        TERMINAL_STATUS_SQL_CLAUSE.match(/'[^']+'/g) || [];
      t.equal(
        quotedEntries.length,
        TERMINAL_STATUSES.length,
        'SQL clause should have same number of entries as TERMINAL_STATUSES',
      );
    },
  );
});
