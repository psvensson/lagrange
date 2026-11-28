/**
 * What production did in the transaction-path telemetry probe's scenarios
 * (test/bootstrap/transaction-telemetry-production-scenarios.js), measured
 * at the base commit named below (quest transaction-path-telemetry-export,
 * sealed constraint production-unchanged). This file is the one copy of
 * these values: the production-defaults probe, the guard's witnesses and
 * every test that pins one of these transactions' mutation sequence or
 * per-purpose counts read them from here, so a later change that alters them
 * supersedes this one file.
 *
 * Measured with the scenarios module on an export of the quest's seal commit
 * 86d4d392b716b015e9335b0d658e99212ea3d865, whose src is byte-identical to
 * the base; two runs gave identical values. promiseCreations counts the
 * promises the scenario causes (async resources triggered from its root). The per-purpose counts are those
 * of COMMIT_ONE_WRITE, read from that tree's per-transaction breakdown; the
 * other scenarios end in FAILED participant rows, whose purposes the base
 * inferred from status where the export takes the purpose its stage hands
 * (ruling D8, telemetry only), so they pin no purposes.
 */

// {tableName, operation, status, participantSetState, decision, rowCount}
function mutations(rows) {
  return Object.freeze(rows.map(([tableName, operation, status, participantSetState, decision,
    rowCount]) => Object.freeze({tableName, operation, status, participantSetState, decision,
    rowCount})));
}

// The fields of each answer a client reads: {success, operation, stage, errorCode}.
function answers(rows) {
  return Object.freeze(rows.map(([success, operation, stage, errorCode]) =>
    Object.freeze({success, operation, stage, errorCode})));
}

function scenario(values) {
  return Object.freeze({...values, deliveries: Object.freeze(values.deliveries),
    armedHostPrimitives: Object.freeze(values.armedHostPrimitives),
    metricsTags: Object.freeze(values.metricsTags)});
}

const TRANSACTION_TELEMETRY_PRODUCTION_BASELINE = Object.freeze({
  baseCommit: 'ab347e9625a64ed24b7700b8f958bd54d8e3db06',
  scenarios: Object.freeze({
    COMMIT_ONE_WRITE: scenario({
      gatewayMutations: mutations([
        ['sql_transactions', 'insert', 'ACTIVE', null, null, null],
        ['sql_transactions', 'update', null, 'OPEN', null, null],
        ['sql_transaction_participants', 'upsert', 'ACTIVE', null, null, null],
        ['sql_write_operations', 'upsert', 'SUCCEEDED', null, null, null],
        ['sql_transactions', 'update', 'PREPARING', 'FROZEN', null, null],
        ['sql_transaction_participants', 'upsert', 'PREPARED', null, null, null],
        ['sql_transactions', 'update', 'PREPARED', null, null, null],
        ['sql_transactions', 'update', 'COMMITTING', null, 'COMMIT', null],
        ['sql_transaction_participants', 'upsert', 'COMMITTED', null, null, null],
        ['sql_transactions', 'update', 'COMMITTED', null, null, null],
      ]),
      // type|operation|statement verb|partition of each router delivery, in order.
      deliveries: [
        'TRANSACTION|BEGIN||p1',
        'QUERY||INSERT|p1',
        'TRANSACTION|PREPARE||p1',
        'TRANSACTION|COMMIT||p1',
      ],
      answers: answers([
        [true, 'BEGIN_TRANSACTION', null, null],
        [true, 'INSERT', null, null],
        [true, 'COMMIT', null, null],
      ]),
      // Host timers armed through the globals or node:timers, in order.
      armedHostPrimitives: [],
      promiseCreations: 371,
      asyncHookCreations: 0,
      metricsTags: [],
      // The decision trace of the last answer that carries one, without timestamps.
      decisionTrace: Object.freeze([
        Object.freeze({sequence: 1, event: 'PARTICIPANT_SET_FROZEN', participantCount: 1}),
        Object.freeze({sequence: 2, event: 'COMMIT_MODE_SELECTED', participantCount: 1,
          commitMode: 'TWO_PHASE_COMMIT'}),
      ]),
      submissionCountByPurpose: Object.freeze({
        registration: 1,
        participantAdmission: 2,
        statementOutcome: 1,
        manifestFreeze: 1,
        preparing: 2,
        decisionAndCommitting: 1,
        settlement: 2,
      }),
    }),
    ROLLBACK_ONE_WRITE: scenario({
      gatewayMutations: mutations([
        ['sql_transactions', 'insert', 'ACTIVE', null, null, null],
        ['sql_transactions', 'update', null, 'OPEN', null, null],
        ['sql_transaction_participants', 'upsert', 'ACTIVE', null, null, null],
        ['sql_write_operations', 'upsert', 'SUCCEEDED', null, null, null],
        ['sql_transactions', 'update', null, 'FROZEN', null, null],
        ['sql_transactions', 'update', 'ROLLING_BACK', null, 'ROLLBACK', null],
        ['sql_transaction_participants', 'upsert', 'ROLLED_BACK', null, null, null],
        ['sql_transactions', 'update', 'ROLLED_BACK', null, null, null],
      ]),
      // type|operation|statement verb|partition of each router delivery, in order.
      deliveries: [
        'TRANSACTION|BEGIN||p1',
        'QUERY||INSERT|p1',
        'TRANSACTION|ROLLBACK||p1',
      ],
      answers: answers([
        [true, 'BEGIN_TRANSACTION', null, null],
        [true, 'INSERT', null, null],
        [true, 'ROLLBACK', null, null],
      ]),
      // Host timers armed through the globals or node:timers, in order.
      armedHostPrimitives: [],
      promiseCreations: 302,
      asyncHookCreations: 0,
      metricsTags: [],
      decisionTrace: null,
    }),
    REFUSED_PREPARE: scenario({
      gatewayMutations: mutations([
        ['sql_transactions', 'insert', 'ACTIVE', null, null, null],
        ['sql_transactions', 'update', null, 'OPEN', null, null],
        ['sql_transaction_participants', 'upsert', 'ACTIVE', null, null, null],
        ['sql_write_operations', 'upsert', 'SUCCEEDED', null, null, null],
        ['sql_transactions', 'update', 'PREPARING', 'FROZEN', null, null],
        ['sql_transaction_participants', 'upsert', 'FAILED', null, null, null],
        ['sql_transactions', 'update', 'ROLLING_BACK', null, 'ROLLBACK', null],
        ['sql_transaction_participants', 'upsert', 'ROLLED_BACK', null, null, null],
        ['sql_transactions', 'update', 'ROLLED_BACK', null, null, null],
      ]),
      // type|operation|statement verb|partition of each router delivery, in order.
      deliveries: [
        'TRANSACTION|BEGIN||p1',
        'QUERY||INSERT|p1',
        'TRANSACTION|PREPARE||p1',
        'TRANSACTION|ROLLBACK||p1',
      ],
      answers: answers([
        [true, 'BEGIN_TRANSACTION', null, null],
        [true, 'INSERT', null, null],
        [false, 'COMMIT', 'PREPARING', 'TRANSACTION_CONFLICT'],
      ]),
      // Host timers armed through the globals or node:timers, in order.
      armedHostPrimitives: [],
      promiseCreations: 359,
      asyncHookCreations: 0,
      metricsTags: [],
      decisionTrace: null,
    }),
    ROLLBACK_FANOUT_FAILED_THEN_COMMIT: scenario({
      gatewayMutations: mutations([
        ['sql_transactions', 'insert', 'ACTIVE', null, null, null],
        ['sql_transactions', 'update', null, 'OPEN', null, null],
        ['sql_transaction_participants', 'upsert', 'ACTIVE', null, null, null],
        ['sql_write_operations', 'upsert', 'SUCCEEDED', null, null, null],
        ['sql_transactions', 'update', null, 'FROZEN', null, null],
        ['sql_transactions', 'update', 'ROLLING_BACK', null, 'ROLLBACK', null],
        ['sql_transaction_participants', 'upsert', 'FAILED', null, null, null],
        ['sql_transaction_participants', 'upsert', 'ROLLED_BACK', null, null, null],
        ['sql_transactions', 'update', 'ROLLED_BACK', null, null, null],
      ]),
      // type|operation|statement verb|partition of each router delivery, in order.
      deliveries: [
        'TRANSACTION|BEGIN||p1',
        'QUERY||INSERT|p1',
        'TRANSACTION|ROLLBACK||p1',
        'TRANSACTION|ROLLBACK||p1',
      ],
      answers: answers([
        [true, 'BEGIN_TRANSACTION', null, null],
        [true, 'INSERT', null, null],
        [false, 'ROLLBACK', null, 'DISTRIBUTED_PARTICIPANT_FAILURE'],
        [false, 'COMMIT', 'ROLLED_BACK', 'DISTRIBUTED_PARTICIPANT_FAILURE'],
      ]),
      // Host timers armed through the globals or node:timers, in order.
      armedHostPrimitives: [],
      promiseCreations: 385,
      asyncHookCreations: 0,
      metricsTags: [],
      decisionTrace: null,
    }),
  }),
});

export {TRANSACTION_TELEMETRY_PRODUCTION_BASELINE};
