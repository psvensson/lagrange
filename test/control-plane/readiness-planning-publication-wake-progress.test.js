// Progress under continuous source churn: the readiness planning owner's
// rebuild loop answers a planning read made at its publication, while a
// reader that only polls on a cadence can be starved forever.
//
// The rebalancer's PLANNING_TARGET_READINESS_DEFERRED wait
// (src/rebalancer/rebalancer-local-mutation-readiness-wake.js) relies on
// exactly this property: a pass whose candidate reads were deferred re-reads
// when the owner publishes a completed snapshot for one of those nodes.
//
// The world is the REAL ControlPlaneReadinessService and planning owner on
// the PRODUCTION SystemTableCache; the owner's build queue is drained by the
// test (scheduleDrainFn), so the interleaving is deterministic. Each round
// applies one semantic change to the read node's own row (its cpu load, a
// per-node planning input) - the formation pattern of a source changing
// between every rebuild and the next poll.
import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from
  '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  isDeferredReadinessPlanningSnapshot,
} from '../../src/control-plane/readiness-planning-version-contract.js';
import {createReadinessServiceForTest} from
  '../helpers/readiness-service-fixture.js';

const NODE_ID = 'node-a';
const T0 = Date.parse('2026-11-11T06:00:00.000Z');
const READY_LEASE_WINDOW_MS = 60000;
const CHURN_ROUNDS = 25;
const PLANNING_READ = Object.freeze({
  decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
});

function flushDeferredNotifications() {
  return new Promise((resolve) => setImmediate(resolve));
}

function seedNode(cache, clock) {
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.LAST_HEARTBEAT]: clock,
    [COLUMN.READY_LEASE_EXPIRES_AT]: clock + READY_LEASE_WINDOW_MS,
    [COLUMN.CPU_USAGE_PERCENT]: 1,
    connection_state: 'ready',
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    [COLUMN.SERVICE_ID]: 'service-a',
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${NODE_ID}/partition/nodes-p1`,
    partition_id: 'nodes-p1',
  });
}

async function churnNodeLoad(cache, clock, round) {
  cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.LAST_HEARTBEAT]: clock,
    [COLUMN.READY_LEASE_EXPIRES_AT]: clock + READY_LEASE_WINDOW_MS,
    [COLUMN.CPU_USAGE_PERCENT]: 2 + (round % 7),
  });
  await flushDeferredNotifications();
}

// Run every queued build to quiescence: the queue schedules its next drain
// only after the previous one settles.
async function drainScheduledBuilds(scheduled) {
  while (scheduled.length > 0) {
    while (scheduled.length > 0) {
      scheduled.shift()();
    }
    await Promise.resolve();
    await Promise.resolve();
  }
}

test('a planning read at the owner\'s publication makes progress under ' +
  'continuous churn; a cadence-only poll is starved', async (t) => {
  let clock = T0;
  const scheduled = [];
  const cache = new SystemTableCache({cacheId: 'publication-wake-progress'});
  const readiness = createReadinessServiceForTest({
    nodeId: NODE_ID,
    systemTableCache: cache,
    now: () => clock,
    readinessPlanningScheduleDrainFn: (callback) => scheduled.push(callback),
    messageRouter: {
      getConnectionState: () => 'connected',
      getConnectedNodes: () => new Set([NODE_ID]),
    },
  });
  const wokenReads = [];
  const unsubscribe = readiness.subscribeReadinessPlanningSnapshots(
    (event) => {
      if (event?.ownerKey === NODE_ID) {
        wokenReads.push(readiness.getNodeReadinessSync(NODE_ID, PLANNING_READ));
      }
    },
  );
  try {
    seedNode(cache, clock);
    await flushDeferredNotifications();
    readiness.getNodeReadinessSync(NODE_ID, PLANNING_READ);
    await drainScheduledBuilds(scheduled);

    let cadenceAnswered = 0;
    let cadenceDeferred = 0;
    for (let round = 0; round < CHURN_ROUNDS; round += 1) {
      clock += 1000;
      const wokenBefore = wokenReads.length;
      // The rebuild of the previous round published; then the source moved
      // again before the cadence poll, as it does every round.
      await churnNodeLoad(cache, clock, round);
      const polled = readiness.getNodeReadinessSync(NODE_ID, PLANNING_READ);
      if (isDeferredReadinessPlanningSnapshot(polled)) {
        cadenceDeferred += 1;
      } else {
        cadenceAnswered += 1;
      }
      await drainScheduledBuilds(scheduled);
      // One publication per build variant of the node: a read of one
      // variant woken by another's publication may still be deferred, and
      // the deferred pass re-arms; the variant's own publication answers.
      t.ok(
        wokenReads.slice(wokenBefore).some((snapshot) =>
          !isDeferredReadinessPlanningSnapshot(snapshot)),
        `round ${round}: a publication answered the woken planning read`,
      );
    }

    t.equal(
      cadenceAnswered,
      0,
      'a poll that lands after each change is never answered: starved',
    );
    t.equal(cadenceDeferred, CHURN_ROUNDS, 'every poll was deferred');
    const answeredWokenReads = wokenReads.filter(
      (snapshot) => !isDeferredReadinessPlanningSnapshot(snapshot));
    t.ok(
      answeredWokenReads.length >= CHURN_ROUNDS,
      'publication-woken reads progress every round ' +
        `(${answeredWokenReads.length} of ${wokenReads.length} answered)`,
    );
  } finally {
    unsubscribe();
    readiness.shutdown?.();
  }
});
