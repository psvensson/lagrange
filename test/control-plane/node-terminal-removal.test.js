import {test} from '../../src/test-helpers/tap.js';
import {NODE_REMOVAL_ERROR_CODE, NodesOwner} from
  '../../src/control-plane/owners/nodes-owner.js';
import {CONTROL_PLANE_MUTATION_OUTCOME} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {PARTITION_SETTLED_REPLAY} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {AdminOwnerOperations} from '../../src/admin/admin-owner-operations.js';

const NODE_ID = 'terminal-owner-node';
const OBSERVATION = Object.freeze({bootIncarnation: 1, status: NODE_STATE.STOPPED});
const APPLIED = Object.freeze({success: true, outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
  partitionResult: {success: true, affectedRows: 1}});

function fixture(answer = APPLIED, retryOptions = {}) {
  const calls = [];
  const owner = new NodesOwner({
    controlPlaneSystemTableGateway: {
      async deleteSystemTableRow(table, where, options) {
        calls.push({table, where, options});
        return typeof answer === 'function' ? answer(calls.length) : answer;
      },
    },
    ...retryOptions,
  });
  return {owner, calls, admin: new AdminOwnerOperations({getNodesOwner: () => owner})};
}

test('NodesOwner requires explicit terminal observation and has no unconditional remove API',
  async (t) => {
    const {owner, calls} = fixture();
    t.equal(typeof owner.removeNode, 'undefined');
    for (const observation of [undefined, {}, {bootIncarnation: 0},
      {bootIncarnation: '1'}, {bootIncarnation: -1}]) {
      await t.rejects(owner.removeTerminalNode(NODE_ID, observation),
        {code: NODE_REMOVAL_ERROR_CODE.INCARNATION_REQUIRED});
    }
    await t.rejects(owner.removeTerminalNode('', OBSERVATION),
      {code: NODE_REMOVAL_ERROR_CODE.NODE_ID_REQUIRED});
    for (const status of [undefined, NODE_STATE.ACTIVE, NODE_STATE.DRAINING]) {
      await t.rejects(owner.removeTerminalNode(NODE_ID, {bootIncarnation: 1, status}),
        {code: NODE_REMOVAL_ERROR_CODE.TERMINAL_STATUS_REQUIRED});
    }
    t.equal(calls.length, 0, 'invalid intent never reaches persistence');
  });

test('NodesOwner fences each permitted terminal status and consumes the exact row count',
  async (t) => {
    for (const status of [NODE_STATE.STOPPED, NODE_STATE.FAILED]) {
      const {owner, calls} = fixture();
      const result = await owner.removeTerminalNode(NODE_ID, {bootIncarnation: 1, status});
      t.equal(result.affectedRows, 1);
      t.same(calls[0].where, {node_id: NODE_ID, boot_incarnation: 1, status});
    }
    for (const outcome of [CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      CONTROL_PLANE_MUTATION_OUTCOME.NO_OP, CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED]) {
      const {owner} = fixture({success: true, outcome, partitionResult: {affectedRows: 0}});
      await t.rejects(owner.removeTerminalNode(NODE_ID, OBSERVATION),
        {code: NODE_REMOVAL_ERROR_CODE.OBSERVATION_CHANGED});
    }
  });

test('NodesOwner never reports missing, ambiguous, rejected or deferred counts as removed',
  async (t) => {
    const unconfirmed = [
      {success: true, outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED},
      {...APPLIED, partitionResult: {affectedRows: 0,
        settledReplay: PARTITION_SETTLED_REPLAY.OUTCOME_NOT_RETAINED}},
      {...APPLIED, partitionResult: {affectedRows: 2}},
      {...APPLIED, partitionResult: {affectedRows: -1}},
      {success: true, outcome: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED, affectedRows: 0},
      {success: true, outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED, affectedRows: 0},
    ];
    for (const answer of unconfirmed) {
      const {admin} = fixture(answer);
      const response = await admin.removeNode(NODE_ID, OBSERVATION);
      t.equal(response.statusCode, 503);
      t.equal(response.body.errorCode, NODE_REMOVAL_ERROR_CODE.OUTCOME_UNCONFIRMED);
      t.equal(response.body.success, false);
    }
  });

test('NodesOwner gateway retry retains original predicate and logical write identity', async (t) => {
  let now = 0;
  const observation = {...OBSERVATION};
  const {owner, calls} = fixture((attempt) => attempt === 1 ? {
    success: false, error: 'authoritative_row_source_unavailable', deferRetry: true,
  } : APPLIED, {
    controlPlaneWriteRetryNow: () => now,
    controlPlaneWriteRetrySleep: async (delayMs) => {
      now += delayMs;
      observation.bootIncarnation = 2;
      observation.status = NODE_STATE.FAILED;
    },
  });
  const answer = await owner.removeTerminalNode(NODE_ID, observation);
  t.equal(answer.bootIncarnation, 1);
  t.equal(answer.status, NODE_STATE.STOPPED);
  t.equal(calls.length, 2, 'one finite retry');
  t.same(calls[1].where, calls[0].where);
  t.same(calls[1].where, {node_id: NODE_ID, boot_incarnation: 1, status: NODE_STATE.STOPPED});
  t.equal(calls[1].options.writeIdentity, calls[0].options.writeIdentity);
  t.type(calls[0].options.writeIdentity, 'string');
});

test('admin preserves actual gateway failure and refuses an omitted observation', async (t) => {
  const {admin, calls} = fixture();
  const absent = await admin.removeNode(NODE_ID);
  t.equal(absent.statusCode, 400);
  t.equal(absent.body.errorCode, NODE_REMOVAL_ERROR_CODE.INCARNATION_REQUIRED);
  t.equal(calls.length, 0);
  const failed = fixture({success: false, error: 'owner permanently unavailable',
    errorCode: 'OWNER_CLOSED', outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED});
  const response = await failed.admin.removeNode(NODE_ID, OBSERVATION);
  t.equal(response.statusCode, 500);
  t.equal(response.body.errorCode, 'OWNER_CLOSED');
  t.equal(response.body.mutationOutcome, CONTROL_PLANE_MUTATION_OUTCOME.REJECTED);
});
