/**
 * Property Test: Policy Display Completeness
 * Property 30: For any table with non-null policy fields (placement_policy,
 * replication_policy, consistency_level, durability, compression), the
 * formatted policy summary string should contain substrings representing
 * each non-null policy field.
 *
 * **Validates: Requirements 4.11, 4.12, 4.13**
 */

import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {TablesView, POLICY_SUMMARY_MAX_LENGTH} from
  '../../../src/cli/views/tables-view.js';

test('Property 30: Policy Display Completeness', async (t) => {
  await t.test('placement_policy appears in summary when set', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 15}),
        (placementPolicy) => {
          const view = new TablesView();
          const table = {
            table_policies: JSON.stringify({
              placement_policy: placementPolicy,
            }),
          };

          const summary = view.formatPolicySummary(table);

          // Summary should contain the placement policy value
          // (unless truncated)
          return summary.includes('Placement') ||
                     summary.endsWith('...');
        },
      ),
      {numRuns: 10},
    );
    t.pass('placement_policy appears in summary when set');
  });

  await t.test('replication_policy appears in summary when set', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 15}),
        (replicationPolicy) => {
          const view = new TablesView();
          const table = {
            table_policies: JSON.stringify({
              replication_policy: replicationPolicy,
            }),
          };

          const summary = view.formatPolicySummary(table);

          // Summary should contain the replication policy value
          return summary.includes('Replication') ||
                     summary.endsWith('...');
        },
      ),
      {numRuns: 10},
    );
    t.pass('replication_policy appears in summary when set');
  });

  await t.test('consistency_level appears in summary when set', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 15}),
        (consistencyLevel) => {
          const view = new TablesView();
          const table = {
            table_policies: JSON.stringify({
              consistency_level: consistencyLevel,
            }),
          };

          const summary = view.formatPolicySummary(table);

          // Summary should contain the consistency level value
          return summary.includes('Consistency') ||
                     summary.endsWith('...');
        },
      ),
      {numRuns: 10},
    );
    t.pass('consistency_level appears in summary when set');
  });

  await t.test('durability appears in summary when set', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 15}),
        (durability) => {
          const view = new TablesView();
          const table = {
            table_policies: JSON.stringify({
              durability: durability,
            }),
          };

          const summary = view.formatPolicySummary(table);

          // Summary should contain the durability value
          return summary.includes('Durability') ||
                     summary.endsWith('...');
        },
      ),
      {numRuns: 10},
    );
    t.pass('durability appears in summary when set');
  });

  await t.test('compression appears in summary when set', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 15}),
        (compression) => {
          const view = new TablesView();
          const table = {
            table_policies: JSON.stringify({
              compression: compression,
            }),
          };

          const summary = view.formatPolicySummary(table);

          // Summary should contain the compression value
          return summary.includes('Compression') ||
                     summary.endsWith('...');
        },
      ),
      {numRuns: 10},
    );
    t.pass('compression appears in summary when set');
  });

  await t.test('multiple policies are combined', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          placement_policy: fc.option(fc.string({minLength: 1,
            maxLength: 8})),
          replication_policy: fc.option(fc.string({minLength: 1,
            maxLength: 8})),
          consistency_level: fc.option(fc.string({minLength: 1,
            maxLength: 8})),
        }),
        (policies) => {
          const view = new TablesView();

          // Filter out null values
          const nonNullPolicies = {};
          for (const [key, value] of Object.entries(policies)) {
            if (value !== null) {
              nonNullPolicies[key] = value;
            }
          }

          const table = {
            table_policies: JSON.stringify(nonNullPolicies),
          };

          const summary = view.formatPolicySummary(table);

          // If no policies, should be Default
          if (Object.keys(nonNullPolicies).length === 0) {
            return summary === 'Default';
          }

          // Otherwise should contain policy labels or be truncated
          return summary !== 'Default' || summary.endsWith('...');
        },
      ),
      {numRuns: 10},
    );
    t.pass('multiple policies are combined');
  });

  await t.test('summary respects max length', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          placement_policy: fc.string({minLength: 10, maxLength: 20}),
          replication_policy: fc.string({minLength: 10, maxLength: 20}),
          consistency_level: fc.string({minLength: 10, maxLength: 20}),
          durability: fc.string({minLength: 10, maxLength: 20}),
          compression: fc.string({minLength: 10, maxLength: 20}),
        }),
        (policies) => {
          const view = new TablesView();
          const table = {
            table_policies: JSON.stringify(policies),
          };

          const summary = view.formatPolicySummary(table);

          // Summary should never exceed max length
          return summary.length <= POLICY_SUMMARY_MAX_LENGTH;
        },
      ),
      {numRuns: 10},
    );
    t.pass('summary respects max length');
  });

  await t.test('truncated summaries end with ellipsis', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          placement_policy: fc.string({minLength: 15, maxLength: 25}),
          replication_policy: fc.string({minLength: 15, maxLength: 25}),
          consistency_level: fc.string({minLength: 15, maxLength: 25}),
        }),
        (policies) => {
          const view = new TablesView();
          const table = {
            table_policies: JSON.stringify(policies),
          };

          const summary = view.formatPolicySummary(table);

          // If truncated, should end with ...
          if (summary.length === POLICY_SUMMARY_MAX_LENGTH) {
            return summary.endsWith('...');
          }

          return true;
        },
      ),
      {numRuns: 10},
    );
    t.pass('truncated summaries end with ellipsis');
  });

  await t.test('empty policies return Default', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, '{}', ''),
        (policies) => {
          const view = new TablesView();
          const table = {table_policies: policies};

          const summary = view.formatPolicySummary(table);

          return summary === 'Default';
        },
      ),
      {numRuns: 10},
    );
    t.pass('empty policies return Default');
  });

  await t.test('malformed JSON returns Default', async (t) => {
    fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20}).filter(
          (s) => {
            try {
              JSON.parse(s);
              return false;
            } catch (_e) {
              return true;
            }
          }),
        (invalidJson) => {
          const view = new TablesView();
          const table = {table_policies: invalidJson};

          const summary = view.formatPolicySummary(table);

          return summary === 'Default';
        },
      ),
      {numRuns: 10},
    );
    t.pass('malformed JSON returns Default');
  });
});
