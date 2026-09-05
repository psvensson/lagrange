import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';
import {NodeLivenessSemanticProjectionOwner} from
  '../../src/control-plane/node-liveness-semantic-projection-owner.js';
import {ReadinessPlanningSnapshotOwner} from
  '../../src/control-plane/readiness-planning-snapshot-owner.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const NODE_ID = 'node-a';
const NOW_MS = 10_000;

function buildSnapshot(revision) {
  return Object.freeze({
    dimensions: Object.freeze({clusterMemberHealthy: true}),
    nodeEvidence: Object.freeze({
      clusterMemberHeartbeatFreshness: 'fresh',
      derivationGraceActive: true,
      readyNow: true,
      repairHeartbeatFreshness: 'fresh',
    }),
    nodeId: NODE_ID,
    revision,
  });
}

/**
 * One barrier rig: a real SystemTableCache seeded with an active node row, a
 * real liveness owner over it, a virtual clock, a service double whose builds
 * are numbered, and a planning owner whose drains are captured in `scheduled`.
 */
function createBarrierRig() {
  const cache = new SystemTableCache();
  const timeSource = new VirtualTimeSource({startMs: NOW_MS});
  const initialRow = {
    [COLUMN.CONNECTION_STATE]: 'ready',
    [COLUMN.LAST_HEARTBEAT]: NOW_MS,
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + 100,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
  };
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, initialRow);
  const readNodeRow = () => cache.get(TABLES.NODES, NODE_ID);
  const livenessOwner = new NodeLivenessSemanticProjectionOwner({
    localNodeId: 'other-node',
    readNodeEvidence: () => ({nodeRow: readNodeRow(), transportConnected: true}),
    timeSource,
  });
  const scheduled = [];
  let buildRevision = 0;
  const service = {
    buildNodeReadinessSyncCurrent: () => buildSnapshot(++buildRevision),
    clearTimeoutFn: (handle) => timeSource.clearTimeout(handle),
    getNodeLivenessSemanticIdentity: (nodeId, nowMs) =>
      livenessOwner.getNodeLivenessSemanticIdentity(nodeId, nowMs),
    getNodeRow: readNodeRow,
    messageRouter: {getConnectedNodes: () => new Set([NODE_ID])},
    nodeLivenessSemanticProjectionOwner: livenessOwner,
    setTimeoutFn: (...args) => timeSource.setTimeout(...args),
    systemTableCache: cache,
  };
  const owner = new ReadinessPlanningSnapshotOwner({
    now: () => timeSource.now(),
    scheduleDrainFn: (callback) => scheduled.push(callback),
    service,
  });
  return {cache, initialRow, livenessOwner, scheduled, service, owner};
}

async function drainScheduledCallbacks(callbacks) {
  while (callbacks.length > 0) {
    callbacks.shift()();
    await Promise.resolve();
  }
}

test('cache apply closes stored admission until its exact revision is classified',
  async (t) => {
    const {cache, initialRow, livenessOwner, scheduled, service, owner} =
      createBarrierRig();
    owner.reconcile(NODE_ID, {options: {}});
    const before = owner.readSync(
      NODE_ID,
      {},
      () => service.buildNodeReadinessSyncCurrent(),
    );
    cache.onCacheChange((tableName, operation, record, metadata) => {
      livenessOwner.recordNodeSourceChange(NODE_ID);
      owner.recordTableChange(
        tableName,
        operation,
        record,
        metadata.tableMutationRevision,
      );
    });

    cache.applySystemTableChange(
      TABLES.NODES,
      CDC_OPERATION.UPDATE,
      {...initialRow, [COLUMN.LAST_HEARTBEAT]: NOW_MS + 1},
    );
    const deferred = owner.readSync(
      NODE_ID,
      {},
      () => service.buildNodeReadinessSyncCurrent(),
    );
    t.equal(deferred.readinessPlanningTokenStatus, 'stale',
      'the apply-before-listener window fails closed');
    t.equal(owner.getDiagnostics().buildCount, 1,
      'a barrier read does not run a cold build');

    scheduled.shift()();
    await Promise.resolve();
    t.equal(owner.getDiagnostics().buildCount, 1,
      'a prequeued drain cannot build through the barrier');
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(
      owner.getDiagnostics().classifiedSourceRevisions[TABLES.NODES],
      cache.getTableMutationVersion(TABLES.NODES),
      'the listener classifies exactly its immutable apply-time revision',
    );

    await drainScheduledCallbacks(scheduled);
    const after = owner.readSync(
      NODE_ID,
      {},
      () => service.buildNodeReadinessSyncCurrent(),
    );
    t.not(after, before,
      'blocked work is rebuilt once after classification closes the barrier');
    t.equal(owner.getDiagnostics().buildCount, 2,
      'the post-classification path performs exactly one replacement build');

    const buildsBeforeBurst = owner.getDiagnostics().buildCount;
    let deliveredBurstEvents = 0;
    let betweenCallbacks = null;
    cache.onCacheChange(() => {
      deliveredBurstEvents++;
      if (deliveredBurstEvents === 1) {
        betweenCallbacks = owner.readSync(
          NODE_ID,
          {},
          () => service.buildNodeReadinessSyncCurrent(),
        );
      }
    });
    cache.applySystemTableChange(
      TABLES.NODES,
      CDC_OPERATION.UPDATE,
      {...initialRow, [COLUMN.LAST_HEARTBEAT]: NOW_MS + 2},
    );
    cache.applySystemTableChange(
      TABLES.NODES,
      CDC_OPERATION.UPDATE,
      {
        ...initialRow,
        [COLUMN.CPU_USAGE_PERCENT]: 91,
        [COLUMN.LAST_HEARTBEAT]: NOW_MS + 3,
      },
    );
    t.equal(owner.readSync(
      NODE_ID,
      {},
      () => service.buildNodeReadinessSyncCurrent(),
    ).readinessPlanningTokenStatus, 'stale',
    'two applied writes close admission before either callback');
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(betweenCallbacks?.readinessPlanningTokenStatus, 'stale',
      'classifying N+1 cannot launder an already-applied N+2 revision');
    t.equal(owner.getDiagnostics().buildCount, buildsBeforeBurst,
      'neither barrier read performs heavy work');
    await drainScheduledCallbacks(scheduled);
    t.equal(owner.getDiagnostics().buildCount, buildsBeforeBurst + 1,
      'the final semantic callback wakes exactly one coalesced rebuild');
    owner.shutdown();
    livenessOwner.shutdown();
    t.end();
  });

test('an invalid source revision reopens the barrier at the next bracketed ' +
  're-baseline and wakes blocked work exactly once',
async (t) => {
  const {cache, initialRow, livenessOwner, scheduled, service, owner} =
    createBarrierRig();
  const read = () => owner.readSync(
    NODE_ID,
    {},
    () => service.buildNodeReadinessSyncCurrent(),
  );
  cache.onCacheChange((tableName, operation, record, metadata) => {
    livenessOwner.recordNodeSourceChange(NODE_ID);
    owner.recordTableChange(
      tableName,
      operation,
      record,
      metadata.tableMutationRevision,
    );
  });
  owner.reconcile(NODE_ID, {options: {}});
  read();
  await drainScheduledCallbacks(scheduled);
  const settled = read();
  t.not(settled.readinessPlanningTokenStatus, 'stale',
    'the baseline is established and the read is current');
  const generationBefore = owner.getDiagnostics().globalPlanningGeneration;
  const buildsBefore = owner.getDiagnostics().buildCount;
  let publications = 0;
  owner.subscribe(() => {
    publications++;
  });

  // A variant is barrier-blocked BEFORE the fault: a write lands and a read
  // arrives in the apply-before-listener window, so the read registers the
  // variant in the blocked registry and enqueues its build.
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE,
    {...initialRow, [COLUMN.LAST_HEARTBEAT]: NOW_MS + 1});
  t.equal(read().readinessPlanningTokenStatus, 'stale',
    'a read in the apply-before-listener window is barrier-blocked');

  // Fault: the listener delivers a null revision, exactly as handleCacheChange
  // does when a source-owner observer throws. The tracker must fail closed
  // (global rotation, barrier closed) but must NOT close the barrier forever.
  owner.recordTableChange(
    TABLES.NODES,
    CDC_OPERATION.UPDATE,
    {...initialRow, [COLUMN.LAST_HEARTBEAT]: NOW_MS + 1},
    null,
  );
  await new Promise((resolve) => setImmediate(resolve));
  t.equal(owner.getDiagnostics().sourceRevisionRebaselinePending, true,
    'an invalid revision leaves the tracker awaiting a re-baseline');
  t.equal(owner.getDiagnostics().globalPlanningGeneration,
    generationBefore + 1, 'the invalid revision rotates global once');

  // Ordered exact events keep arriving while the baseline is pending: they
  // must neither rotate again nor be classified against the stale frontier.
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE,
    {...initialRow, [COLUMN.LAST_HEARTBEAT]: NOW_MS + 2});
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE,
    {...initialRow, [COLUMN.LAST_HEARTBEAT]: NOW_MS + 3});
  t.equal(owner.getDiagnostics().sourceRevisionRebaselinePending, true,
    'ordered events cannot close the barrier by themselves');
  t.equal(owner.getDiagnostics().globalPlanningGeneration,
    generationBefore + 1, 'events in the pending window do not rotate again');
  t.equal(owner.getDiagnostics().buildCount, buildsBefore,
    'no build lands while the baseline is pending');

  // The first bracketed quiescent capture (here the queued drain's own source
  // capture) re-adopts the observed revisions, rotates the global identity
  // exactly once for the unclassified span, reopens the barrier, and performs
  // exactly one rebuild; the following read is current.
  await new Promise((resolve) => setImmediate(resolve));
  await drainScheduledCallbacks(scheduled);
  const diagnostics = owner.getDiagnostics();
  t.equal(diagnostics.sourceRevisionRebaselinePending, false,
    'the bracketed capture completed the re-baseline');
  t.equal(diagnostics.sourceRevisionBaselineEstablished, true,
    'the baseline is established again');
  t.equal(diagnostics.classifiedSourceRevisions[TABLES.NODES],
    cache.getTableMutationVersion(TABLES.NODES),
    'the observed revisions are adopted as the classified frontier');
  t.equal(diagnostics.globalPlanningGeneration, generationBefore + 2,
    'the re-baseline rotates global exactly once more');
  t.equal(diagnostics.buildCount, buildsBefore + 1,
    'the reopened barrier wakes exactly one rebuild');
  t.equal(publications, 1,
    'the pre-fault blocked variant is not rebuilt a second time while its ' +
      'build is in flight: exactly one publication');
  const current = read();
  t.not(current.readinessPlanningTokenStatus, 'stale',
    'reads are current again after the recovery');
  await drainScheduledCallbacks(scheduled);
  t.equal(owner.getDiagnostics().buildCount, buildsBefore + 1,
    'no further rebuild follows a current read');
  t.equal(owner.getDiagnostics().globalPlanningGeneration,
    generationBefore + 2, 'the recovery rotated global exactly twice in total');
  owner.shutdown();
  livenessOwner.shutdown();
  t.end();
});
