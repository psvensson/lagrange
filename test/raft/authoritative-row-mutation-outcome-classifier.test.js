import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_MUTATION_OUTCOME,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  AuthoritativeRowMutationHelper,
} from '../../src/raft/authoritative-row-mutation-helper.js';

const EXPECTED_REASON_BY_OUTCOME = Object.freeze({
  [CONTROL_PLANE_MUTATION_OUTCOME.APPLIED]: 'applied',
  [CONTROL_PLANE_MUTATION_OUTCOME.NO_OP]: 'noop',
  [CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY]: 'applied',
  [CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED]: 'deferred',
  [CONTROL_PLANE_MUTATION_OUTCOME.REJECTED]: 'rejected',
  [CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY]: 'owner-not-ready',
  [CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED]:
    'observed-state-changed',
});

function createMutationHarness(partitionResult) {
  const scheduled = [];
  let refreshCount = 0;
  const helper = new AuthoritativeRowMutationHelper({
    tableName: 'services',
    buildWhereClause: () => ({service_id: 'replica-1'}),
    buildUpdateData: (value) => ({raft_role: value}),
    readValueFromCache: () => null,
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      submitMutation: async () => partitionResult,
    },
    refreshObservedRow: async () => {
      refreshCount += 1;
    },
    retryDelayMs: 100,
    setTimeoutFn: (callback, delayMs) => {
      const timer = {callback, delayMs, unref() {}};
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {},
  });
  helper.pendingValue = 'leader';
  return {
    helper,
    scheduled,
    getRefreshCount: () => refreshCount,
  };
}

async function flushMutationResult(partitionResult) {
  const harness = createMutationHarness(partitionResult);
  const result = await harness.helper.flush();
  return {...harness, result};
}

test('Raft authoritative-row completion has an explicit disposition for ' +
  'every canonical mutation outcome', async (t) => {
  t.same(
    Object.keys(EXPECTED_REASON_BY_OUTCOME).sort(),
    Object.values(CONTROL_PLANE_MUTATION_OUTCOME).sort(),
    'the Raft decision table must exhaust the frozen gateway enum',
  );

  for (const outcome of Object.values(CONTROL_PLANE_MUTATION_OUTCOME)) {
    const {helper, result, scheduled, getRefreshCount} =
      await flushMutationResult({outcome});
    const applied = outcome === CONTROL_PLANE_MUTATION_OUTCOME.APPLIED ||
      outcome === CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY;
    t.equal(result.reason, EXPECTED_REASON_BY_OUTCOME[outcome],
      `${outcome} should retain its Raft disposition`);
    t.equal(result.applied, applied,
      `${outcome} should use the canonical apply effect`);
    t.equal(helper.pendingValue, applied ? null : 'leader',
      `${outcome} should ${applied ? 'clear' : 'preserve'} pending state`);
    t.equal(helper.persistedValue, applied ? 'leader' : null,
      `${outcome} should ${applied ? '' : 'not '}record persistence`);
    t.equal(scheduled.length, applied ? 0 : 1,
      `${outcome} should ${applied ? 'not ' : ''}arm a bounded retry`);
    t.equal(
      getRefreshCount(),
      outcome === CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED ? 1 : 0,
      `${outcome} should refresh only for observed-state changes`,
    );
  }
  t.end();
});

test('Raft authoritative-row completion preserves valid legacy results and ' +
  'fails closed on contradictory or coercive envelopes', async (t) => {
  const cases = [
    {label: 'legacy success', value: {success: true}, applied: true},
    {label: 'legacy positive nested rows', value: {
      success: true, partitionResult: {affectedRows: 1},
    }, applied: true},
    {label: 'legacy positive top-level rows', value: {
      success: true, affectedRows: 1,
    }, applied: true},
    {label: 'legacy zero rows', value: {
      success: true, partitionResult: {affectedRows: 0},
    }, reason: 'observed-state-changed'},
    {label: 'legacy failure', value: {success: false}, reason: 'rejected'},
    {label: 'unknown typed success', value: {
      outcome: 'future_outcome', success: true, affectedRows: 1,
    }, reason: 'rejected'},
    {label: 'contradictory applied failure', value: {
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED, success: false,
    }, reason: 'rejected'},
    {label: 'contradictory pending failure', value: {
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
      success: false,
    }, reason: 'rejected'},
    {label: 'string row count', value: {
      success: true, affectedRows: '1',
    }, reason: 'rejected'},
    {label: 'boxed row count', value: {
      success: true, affectedRows: Object(1),
    }, reason: 'rejected'},
    {label: 'negative row count', value: {
      success: true, affectedRows: -1,
    }, reason: 'rejected'},
    {label: 'negative zero row count', value: {
      success: true, affectedRows: -0,
    }, reason: 'rejected'},
    {label: 'unsafe row count', value: {
      success: true, affectedRows: Number.MAX_SAFE_INTEGER + 1,
    }, reason: 'rejected'},
  ];

  for (const entry of cases) {
    const {helper, result, scheduled} = await flushMutationResult(entry.value);
    const applied = entry.applied === true;
    t.equal(result.applied, applied, `${entry.label}: apply effect`);
    t.equal(result.reason, entry.reason || 'applied',
      `${entry.label}: typed Raft reason`);
    t.equal(helper.persistedValue, applied ? 'leader' : null,
      `${entry.label}: persisted state`);
    t.equal(helper.pendingValue, applied ? null : 'leader',
      `${entry.label}: pending state`);
    t.equal(scheduled.length, applied ? 0 : 1,
      `${entry.label}: retry ownership`);
  }
  t.end();
});

test('Raft authoritative-row completion rejects inherited, accessor, and ' +
  'proxy envelopes without invoking hostile code', async (t) => {
  let accessorCalls = 0;
  const outcomeAccessor = {success: true, affectedRows: 1};
  Object.defineProperty(outcomeAccessor, 'outcome', {
    get() {
      accessorCalls += 1;
      return CONTROL_PLANE_MUTATION_OUTCOME.APPLIED;
    },
  });
  const rowsAccessor = {success: true};
  Object.defineProperty(rowsAccessor, 'affectedRows', {
    get() {
      accessorCalls += 1;
      return 1;
    },
  });
  const retryAccessor = {outcome: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED};
  Object.defineProperty(retryAccessor, 'retryAfterMs', {
    get() {
      accessorCalls += 1;
      return 900;
    },
  });
  const proxyReads = [];
  const proxy = new Proxy({}, {
    getOwnPropertyDescriptor() {
      proxyReads.push('getOwnPropertyDescriptor');
      return {configurable: true, value: 1};
    },
    get(_target, property) {
      proxyReads.push(String(property));
      return CONTROL_PLANE_MUTATION_OUTCOME.APPLIED;
    },
  });
  const inherited = Object.create({
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    success: true,
    affectedRows: 1,
  });

  for (const [label, envelope] of [
    ['outcome accessor', outcomeAccessor],
    ['affectedRows accessor', rowsAccessor],
    ['inherited fields', inherited],
    ['proxy', proxy],
  ]) {
    const {helper, result, scheduled} = await flushMutationResult(envelope);
    t.equal(result.reason, 'rejected', `${label} should fail closed`);
    t.equal(helper.persistedValue, null,
      `${label} should not record persistence`);
    t.equal(helper.pendingValue, 'leader',
      `${label} should preserve pending state`);
    t.equal(scheduled.length, 1, `${label} should arm a retry`);
  }

  const deferred = await flushMutationResult(retryAccessor);
  t.equal(deferred.result.reason, 'deferred',
    'retry accessor does not invalidate the canonical mutation fields');
  t.equal(deferred.scheduled[0].delayMs, 100,
    'retry accessor is ignored in favor of bounded backoff');
  t.equal(accessorCalls, 0, 'mutation and retry accessors never execute');
  t.same(proxyReads, ['then'],
    'only async promise assimilation reads the proxy; classification does not');
  t.end();
});

test('Raft authoritative-row completion accepts only an own finite retry hint',
  async (t) => {
    const hinted = await flushMutationResult({
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
      retryAfterMs: 250,
    });
    t.equal(hinted.scheduled[0].delayMs, 250,
      'an own finite retry hint can widen the bounded delay');

    for (const retryAfterMs of ['250', Object(250), Infinity, -1, 0]) {
      const {scheduled} = await flushMutationResult({
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
        retryAfterMs,
      });
      t.equal(scheduled[0].delayMs, 100,
        'coercive or non-positive retry hints use bounded backoff');
    }
    t.end();
  });
