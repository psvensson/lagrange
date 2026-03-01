import {test} from '../../src/test-helpers/tap.js';
import {
  createInvariantRecord,
  getInvariantDefinition,
  INVARIANT_ID,
  INVARIANT_SEVERITY,
  INVARIANT_SCOPE,
} from '../../src/invariants/invariant-catalog.js';

test('Invariant catalog defines required stability invariants', (t) => {
  const requiredInvariantIds = [
    INVARIANT_ID.PARTITION_SINGLE_CANONICAL_LEADER,
    INVARIANT_ID.REPLICA_LOCAL_ROLE_IS_STABLE_FOR_READINESS,
    INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
    INVARIANT_ID.CDC_SUBSCRIPTION_PROGRESS_VISIBLE,
    INVARIANT_ID.BENCHMARK_REQUIRED_NODES_ALL_READY,
  ];

  for (const invariantId of requiredInvariantIds) {
    const definition = getInvariantDefinition(invariantId);
    t.ok(definition, `${invariantId} should exist`);
    t.type(definition?.defaultReasonCode, 'string');
    t.type(definition?.owningSubsystem, 'string');
    t.type(definition?.expected?.condition, 'string');
  }
  t.end();
});

test('createInvariantRecord applies canonical severity and payload shape',
  (t) => {
    const record = createInvariantRecord({
      invariantId: INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
      passed: false,
      entityId: 'node-1',
      observed: {
        previousLeaseExpiresAt: 200,
        currentLeaseExpiresAt: 100,
      },
      details: {
        staleSweepNodeId: 'node-1',
      },
      timestampMs: 1234,
    });

    t.equal(
      record.severity,
      INVARIANT_SEVERITY.CRITICAL,
      'severity should come from catalog',
    );
    t.equal(
      record.scope,
      INVARIANT_SCOPE.NODE,
      'scope should come from catalog',
    );
    t.equal(record.reasonCode, 'lease_state_regressed');
    t.equal(record.entityId, 'node-1');
    t.equal(record.passed, false);
    t.same(
      record.observed,
      {
        previousLeaseExpiresAt: 200,
        currentLeaseExpiresAt: 100,
      },
    );
    t.same(record.details, {staleSweepNodeId: 'node-1'});
    t.equal(record.timestampMs, 1234);
    t.end();
  });

test('createInvariantRecord rejects unknown invariant IDs', (t) => {
  t.throws(
    () => createInvariantRecord({
      invariantId: 'missing.invariant',
      passed: false,
    }),
    /Unknown invariant ID/,
  );
  t.end();
});
