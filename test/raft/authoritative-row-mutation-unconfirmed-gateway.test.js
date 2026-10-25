import {test} from '../../src/test-helpers/tap.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {AuthoritativeRowMutationHelper} from
  '../../src/raft/authoritative-row-mutation-helper.js';

const objectFreeze = Object.freeze;
const arrayPush = Function.call.bind(Array.prototype.push);
const WRITE_KEY = 'mutation-proof-retained-entry';
const PENDING_ROLE = 'leader';
const ROW_GUARD = objectFreeze({
  service_id: 'mutation-proof-replica',
  status: 'active',
  updated_at: 41,
});
const UPDATE_DATA = objectFreeze({raft_role: PENDING_ROLE, updated_at: 42});
const CONFIRMED_ANSWER = objectFreeze({
  success: true,
  outcome: 'applied',
  affectedRows: 1,
  visibilityState: 'visible',
});
const UNCONFIRMED_ANSWERS = objectFreeze([
  objectFreeze({label: 'empty answer', answer: objectFreeze({})}),
  objectFreeze({label: 'success-only answer', answer: objectFreeze({success: true})}),
]);

for (const {label, answer} of UNCONFIRMED_ANSWERS) {
  test(`real mutation gateway retains ${label} then completes the same intent`,
    async (t) => {
      const writes = [];
      const scheduled = [];
      let producerAnswer = answer;
      const cdcIntegrationService = {
        async updateSystemTableRow(tableName, whereClause, data, options) {
          arrayPush(writes, {tableName, whereClause, data, options});
          return producerAnswer;
        },
      };
      const now = () => 42;
      const gateway = new ControlPlaneSystemTableGateway({
        cdcIntegrationService,
        now,
      });
      const helper = new AuthoritativeRowMutationHelper({
        tableName: 'services',
        buildWhereClause: () => ROW_GUARD,
        buildUpdateData: () => UPDATE_DATA,
        buildUpdateOptions: () => ({idempotencyKey: WRITE_KEY}),
        buildExpectedCacheFields: () => ({raft_role: PENDING_ROLE}),
        readValueFromCache: () => null,
        cdcIntegrationService,
        controlPlaneSystemTableGateway: gateway,
        now,
        setTimeoutFn: (callback, delayMs) => {
          const timer = {callback, delayMs, unref() {}};
          arrayPush(scheduled, timer);
          return timer;
        },
        clearTimeoutFn: () => {},
      });

      helper.pendingValue = PENDING_ROLE;
      try {
        const first = await helper.flush();

        t.equal(writes.length, 1, 'the real gateway reached the CDC producer');
        t.equal(first.partitionResult?.outcome, 'unconfirmed',
          'the outcome owner names uncertainty without inventing refusal');
        t.equal(first.applied, false, 'no application is claimed');
        t.equal(first.authoritativeWriteApplied, false,
          'no durable progress is claimed');
        t.equal(first.cacheVisible, false, 'no cache visibility is claimed');
        t.equal(helper.persistedValue, null, 'persisted progress remains unset');
        t.equal(helper.pendingValue, PENDING_ROLE,
          'the original pending intent remains owned');
        t.equal(scheduled.length, 1, 'the existing owner schedules continuation');
        t.ok(scheduled[0]?.delayMs > 0 && scheduled[0]?.delayMs <= 30_000,
          'continuation retains a positive bounded delay');

        // Re-enter the same owner without queueing or restoring pendingValue.
        // The predecessor cleared it prematurely, so it cannot engage this
        // second producer call even after a confirmed answer is available.
        producerAnswer = CONFIRMED_ANSWER;
        const completed = await helper.flush();

        t.equal(writes.length, 2, 'the retained intent reaches its producer again');
        t.equal(completed.applied, true, 'later confirmed application completes');
        t.equal(completed.authoritativeWriteApplied, true,
          'later confirmed application advances durable progress');
        t.equal(completed.cacheVisible, true,
          'the positive has explicit producer visibility evidence');
        t.equal(helper.persistedValue, PENDING_ROLE,
          'the confirmed value becomes persisted');
        t.equal(helper.pendingValue, null,
          'only confirmed completion clears pending work');
        for (const write of writes) {
          t.equal(write.tableName, 'services', 'the same table owner is used');
          t.same(write.whereClause, ROW_GUARD, 'the exact row guard is retained');
          t.same(write.data, UPDATE_DATA, 'the original payload is retained');
          t.equal(write.options.idempotencyKey, WRITE_KEY,
            'every delivery retains the caller-owned logical write identity');
        }
      } finally {
        helper.shutdown();
      }
    });
}
