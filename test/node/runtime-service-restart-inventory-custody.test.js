// U1 v3 restart-inventory custody: the real SQLite journal/recovery reader
// and RuntimeServiceHandler, with only the native local-inspection seam
// controlled. A wake is a hint, never authority to fabricate inventory.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOriginFixture} from '../service/service-consensus-creation-fixture.js';
import {RuntimeServiceHandler} from '../../src/node/runtime-service-handler.js';
import {WASM_CREATION_LOCAL_INSPECTION as LOCAL} from
  '../../src/wasm-service/wasm-creation-opening.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SERVICE_INSTANCE_OUTCOME as OUTCOME} from '../../src/constants/service-instance.js';
import {RUNTIME_SERVICE_HANDLER_ERROR_MSG as ERROR} from
  '../../src/node/runtime-service-handler-constants.js';

const QUIET = {debug() {}, info() {}, warn() {}, error() {}};

async function world(t) {
  const journal = await createOriginFixture({after: (cleanup) => t.after(cleanup)},
    {canonicalFounders: true});
  const admitted = await journal.prepare();
  assert.equal(admitted.outcome, 'ADMISSION_RETAINED');
  const manager = journal.manager();
  manager.inspectRetainedCreation = async ({consensusCreation}) => {
    assert.deepEqual(consensusCreation.token, admitted.token);
    return {outcome: LOCAL.ADMITTED};
  };
  const handler = new RuntimeServiceHandler({
    nodeId: journal.intent.consensusSlotRequest.nodeId,
    cdcIntegrationService: {},
    serviceLifecycleManager: manager,
    systemTableCache: {get: () => null},
    awaitsRestartInventory: true,
  });
  handler.logger = QUIET;
  handler.initialize();
  t.after(() => handler.shutdown());
  return {journal, manager, handler, admitted,
    operationId: journal.intent.consensusSlotRequest.operationId,
    replicaId: journal.intent.consensusSlotRequest.replicaId};
}

function deferred() {
  return Promise.withResolvers();
}

async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('U1 inventory: failed journal read can retry, one shared successful scan applies once',
  async (t) => {
    const w = await world(t);
    let scans = 0;
    const scan = w.manager.recoverPendingOperations.bind(w.manager);
    w.manager.recoverPendingOperations = (...args) => {
      scans += 1;
      return scan(...args);
    };
    w.journal.setReadFault('U1_INVENTORY_UNAVAILABLE');
    await assert.rejects(w.handler.recoverRetainedCreations(), /U1_INVENTORY_UNAVAILABLE/);
    assert.equal(scans, 1);
    assert.equal(w.handler.restartTask, undefined,
      'FAILED_SCAN_MUST_RELEASE_ITS_RETRY_OWNERSHIP');
    assert.equal(w.handler.restartLatch.isReady(), false);
    assert.equal(w.handler.localReplicas.size, 0);

    w.journal.setReadFault(null);
    const joined = await Promise.all([
      w.handler.recoverRetainedCreations(),
      w.handler.recoverRetainedCreations(),
      w.handler.recoverRetainedCreations(),
    ]);
    assert.equal(scans, 2, 'THREE_OBSERVERS_STARTED_MULTIPLE_OWNER_SCANS');
    for (const plans of joined) {
      assert.equal(plans.length, 1);
      assert.equal(plans[0].creation.operationId, w.operationId);
      assert.equal(plans[0].creation.replicaId, w.replicaId);
    }
    const memo = w.handler.localReplicas.get(w.replicaId);
    assert.equal(memo.status, ReplicaStatus.HELD);
    assert.equal(memo.operationId, w.operationId);
    assert.equal(w.handler.restartTask.applied, true);
    assert.equal(w.handler.restartLatch.isReady(), true);
    // STOP before the queued re-entry gets a turn: the original journal
    // obligation remains durable, but no closed handler may act on it.
    w.handler.shutdown();
    await turn();
    assert.equal(w.handler.inProgressOperations.size, 0);
    assert.equal(w.handler.localReplicas.size, 0);
  });

test('U1 inventory: shutdown during held journal scan cannot publish late memos or admission',
  async (t) => {
    const w = await world(t);
    const entered = deferred();
    const release = deferred();
    const scan = w.manager.recoverPendingOperations.bind(w.manager);
    let scans = 0;
    w.manager.recoverPendingOperations = async (...args) => {
      scans += 1;
      entered.resolve();
      await release.promise;
      return scan(...args);
    };
    const first = w.handler.recoverRetainedCreations();
    const repeat = w.handler.recoverRetainedCreations();
    await entered.promise;
    assert.equal(w.handler.restartLatch.isReady(), false);
    w.handler.shutdown();
    release.resolve();
    const outcomes = await Promise.all([first, repeat]);
    assert.equal(scans, 1);
    for (const outcome of outcomes) {
      assert.equal(outcome.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(outcome.reason, ERROR.HANDLER_STOPPED);
    }
    await turn();
    assert.equal(w.handler.restartLatch.isReady(), false);
    assert.equal(w.handler.localReplicas.size, 0);
    assert.equal(w.handler.inProgressOperations.size, 0);
    assert.equal((await w.handler.recoverRetainedCreations()).outcome, OUTCOME.UNAVAILABLE);
  });

test('U1 inventory: shutdown during per-row physical inspection cannot publish stale work',
  async (t) => {
    const w = await world(t);
    const entered = deferred();
    const release = deferred();
    w.manager.inspectRetainedCreation = async () => {
      entered.resolve();
      await release.promise;
      return {outcome: LOCAL.ADMITTED};
    };
    const scanning = w.handler.recoverRetainedCreations();
    await entered.promise;
    w.handler.shutdown();
    release.resolve();
    const result = await scanning;
    assert.equal(result.outcome, OUTCOME.UNAVAILABLE);
    assert.equal(result.reason, ERROR.HANDLER_STOPPED);
    await turn();
    assert.equal(w.handler.restartLatch.isReady(), false);
    assert.equal(w.handler.localReplicas.size, 0);
    assert.equal(w.handler.inProgressOperations.size, 0);
  });
