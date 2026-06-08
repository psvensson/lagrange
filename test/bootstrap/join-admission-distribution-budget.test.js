import t from 'tap';
import {
  extractPriorityPartitionSummary,
  resolveJoinAdmissionConcurrencyBudget,
} from '../../src/bootstrap/join-admission-distribution-budget.js';

t.test('resolveJoinAdmissionConcurrencyBudget', async (t) => {
  t.equal(
    resolveJoinAdmissionConcurrencyBudget({
      configuredMax: 4,
      priorityPartitionSummary: null,
      enabled: false,
    }),
    4,
    'disabled gating returns the configured max unchanged',
  );

  t.equal(
    resolveJoinAdmissionConcurrencyBudget({
      configuredMax: 4,
      priorityPartitionSummary: {satisfied: true},
      enabled: true,
    }),
    4,
    'spread satisfied imposes no extra throttle',
  );

  t.equal(
    resolveJoinAdmissionConcurrencyBudget({
      configuredMax: 4,
      priorityPartitionSummary: null,
      enabled: true,
    }),
    1,
    'missing summary while enabled throttles to the conservative floor',
  );

  t.equal(
    resolveJoinAdmissionConcurrencyBudget({
      configuredMax: 4,
      priorityPartitionSummary: {satisfied: false, blockedPartitions: []},
      enabled: true,
    }),
    1,
    'under-spread with no detail throttles to the floor',
  );

  t.equal(
    resolveJoinAdmissionConcurrencyBudget({
      configuredMax: 4,
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitions: [{readyDistinctNodeCount: 0}],
      },
      enabled: true,
    }),
    1,
    'zero ready host nodes still admits one join to begin building spread',
  );

  t.equal(
    resolveJoinAdmissionConcurrencyBudget({
      configuredMax: 4,
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitions: [
          {readyDistinctNodeCount: 2},
          {readyDistinctNodeCount: 3},
        ],
      },
      enabled: true,
    }),
    2,
    'budget tracks the fewest-ready join-critical partition (ramps with spread)',
  );

  t.equal(
    resolveJoinAdmissionConcurrencyBudget({
      configuredMax: 3,
      priorityPartitionSummary: {
        satisfied: false,
        blockedPartitions: [{readyDistinctNodeCount: 9}],
      },
      enabled: true,
    }),
    3,
    'never exceeds the operator-configured max',
  );

  t.equal(
    resolveJoinAdmissionConcurrencyBudget({
      configuredMax: 0,
      priorityPartitionSummary: {satisfied: false, blockedPartitions: []},
      enabled: true,
    }),
    0,
    'a non-positive configured max is preserved (no behavior change)',
  );
});

t.test('extractPriorityPartitionSummary', async (t) => {
  t.equal(extractPriorityPartitionSummary(null), null, 'null snapshot -> null');

  const summary = {satisfied: false, blockedPartitions: []};
  t.equal(
    extractPriorityPartitionSummary({priorityPartitionSummary: summary}),
    summary,
    'top-level priorityPartitionSummary is found',
  );
  t.equal(
    extractPriorityPartitionSummary({
      dimensions: {
        priorityControlPlaneRecovery: {details: {priorityPartitionSummary: summary}},
      },
    }),
    summary,
    'summary nested under a readiness dimension detail is found',
  );
  t.equal(
    extractPriorityPartitionSummary({details: {priorityPartitionSummary: {x: 1}}}),
    null,
    'a candidate without a boolean `satisfied` is rejected',
  );
});
