import {test} from '../../src/test-helpers/tap.js';
import {
  DEFERRED_OUTCOME_HOTSPOT_CONTRACTS,
  collectDeferredOutcomeViolationsFromSource,
} from '../../scripts/check-guideline-deferred-outcomes.js';

const MUTATION_READINESS_FILE_PATH =
  'src/control-plane/control-plane-mutation-readiness.js';
const NON_HOTSPOT_FILE_PATH = 'src/runtime/plain-helper.js';

test('detects missing structured deferred-outcome fragments in hotspot files',
  async (t) => {
    const violations = collectDeferredOutcomeViolationsFromSource(
      [
        'export function buildDeferredOutcome() {',
        '  return {',
        '    outcome: CONTROL_PLANE_MUTATION_READINESS_OUTCOME,',
        '    reasonCodes: [],',
        '    retryAfterMs: 10,',
        '  };',
        '}',
      ].join('\n'),
      MUTATION_READINESS_FILE_PATH,
    );

    t.equal(violations.length, 1);
    t.equal(
      violations[0].target,
      'runtimeAuthority',
    );
  });

test('accepts hotspot files that expose the full deferred-outcome contract',
  async (t) => {
    const violations = collectDeferredOutcomeViolationsFromSource(
      [
        'export function buildDeferredOutcome() {',
        '  return {',
        '    outcome: CONTROL_PLANE_MUTATION_READINESS_OUTCOME,',
        '    reasonCodes: [],',
        '    retryAfterMs: 10,',
        '    runtimeAuthority: {state: "establishing"},',
        '  };',
        '}',
      ].join('\n'),
      MUTATION_READINESS_FILE_PATH,
    );

    t.equal(violations.length, 0);
  });

test('ignores non-hotspot files', async (t) => {
  const violations = collectDeferredOutcomeViolationsFromSource(
    [
      'export function helper() {',
      '  return {ok: true};',
      '}',
    ].join('\n'),
    NON_HOTSPOT_FILE_PATH,
  );

  t.equal(violations.length, 0);
});

test('tracks the bounded deferred-outcome hotspot set explicitly', async (t) => {
  t.same(
    Object.keys(DEFERRED_OUTCOME_HOTSPOT_CONTRACTS).sort(),
    [
      'src/control-plane/control-plane-mutation-readiness.js',
      'src/control-plane/priority-recovery-completion.js',
      'test/distributed/harness/cluster.js',
      'test/distributed/scenarios/table-distribution-helpers.js',
    ],
  );
});
