// Production fixture for the liferaft half of raft-backend-evaluation.
//
// Every object here is the REAL production owner: `src/raft/liferaft.js`
// (the Lagrange LifeRaft wrapper over `@markwylde/liferaft`), the real
// `LiferaftProvider`, and the real peer-cache reconciliation the partition
// service runs. Only the surroundings a partition service would supply -
// a system-table cache, a logger, a clock - are doubles, and the cache
// double is deliberate: the whole point of the measurement is that two nodes
// can hold different cached `services` rows for one partition.
//
// No wall-clock timer is ever armed: the wrapper's injected time source owns
// every liferaft timer (test/raft/liferaft-deterministic-construction.test.js
// seals that invariant), so these drives are deterministic and bounded.

import LifeRaft from '../../../src/raft/liferaft.js';
import {LiferaftProvider} from '../../../src/raft/liferaft-provider.js';
import {PARTITION_SERVICE_SHARED} from
  '../../../src/partition/partition-service-shared.js';

const {ENTITY_TYPE, ReplicaStatus, SERVICE_TYPE} = PARTITION_SERVICE_SHARED;

const FIXTURE = Object.freeze({
  PARTITION_ID: 'partition-under-evaluation',
  NODE_PREFIX: 'node-',
  ADDRESS_SEPARATOR: '/',
  ELECTION_MIN_MS: 100,
  ELECTION_MAX_MS: 200,
  HEARTBEAT_MS: 50,
  CLOCK_ORIGIN_MS: 0,
});

/**
 * A clock that arms nothing on the host: the wrapper installs a VirtualTick
 * over it, so no liferaft timer reaches the event loop.
 * @return {Object} injectable time source
 */
function virtualTimeSource() {
  const armed = new Map();
  let nextId = FIXTURE.CLOCK_ORIGIN_MS;
  return {
    armed,
    now: () => FIXTURE.CLOCK_ORIGIN_MS,
    setTimeout(handler, delayMs) {
      nextId += 1;
      armed.set(nextId, {handler, delayMs});
      return nextId;
    },
    clearTimeout(id) {
      armed.delete(id);
    },
    setInterval(handler, delayMs) {
      return this.setTimeout(handler, delayMs);
    },
    clearInterval(id) {
      armed.delete(id);
    },
    charge() {},
  };
}

/**
 * The unified address production builds for a partition replica.
 * @param {string} replicaId
 * @return {string}
 */
function replicaAddress(replicaId) {
  return [
    `${FIXTURE.NODE_PREFIX}${replicaId}`,
    ENTITY_TYPE.PARTITION,
    replicaId,
  ].join(FIXTURE.ADDRESS_SEPARATOR);
}

/**
 * One cached `services` row of the shape the reconciliation reads.
 * @param {string} replicaId
 * @param {string} status one of ReplicaStatus
 * @return {Object}
 */
function serviceRow(replicaId, status) {
  return {
    partition_id: FIXTURE.PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    service_id: replicaId,
    node_id: `${FIXTURE.NODE_PREFIX}${replicaId}`,
    status,
  };
}

/**
 * A partition-service-shaped host for the real reconciliation: real raft
 * node, real provider, a cache holding exactly the rows this node sees.
 * @param {Object} options
 * @param {string} options.replicaId
 * @param {Array<Object>} options.cachedRows
 * @return {Object}
 */
function partitionServiceHost({replicaId, cachedRows}) {
  const timeSource = virtualTimeSource();
  const raft = new LifeRaft(replicaAddress(replicaId), {
    'election min': FIXTURE.ELECTION_MIN_MS,
    'election max': FIXTURE.ELECTION_MAX_MS,
    'heartbeat': FIXTURE.HEARTBEAT_MS,
    timeSource,
  });
  return {
    partitionId: FIXTURE.PARTITION_ID,
    replicaId,
    raft,
    raftProvider: new LiferaftProvider(),
    replicaIds: [replicaId],
    peerAddresses: [],
    timeSource,
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    systemTableCache: {
      filter(_table, predicate) {
        return cachedRows.filter(predicate);
      },
    },
  };
}

/**
 * The membership this node itself reports: the addresses in its own peer
 * array plus its own address. Nothing here is declared by the caller.
 * @param {Object} host
 * @return {Array<string>} sorted member addresses as the node holds them
 */
function memberAddressesReportedBy(host) {
  const peers = host.raft.nodes.map((node) => node.address);
  return [host.raft.address, ...peers].sort();
}

/**
 * The node's own majority arithmetic over its own peer array.
 * @param {Object} host
 * @return {number}
 */
function majorityReportedBy(host) {
  return host.raft.majority();
}

function shutdown(hosts) {
  for (const host of hosts) {
    if (host.raft && typeof host.raft.end === 'function') {
      host.raft.end();
    }
  }
}

export {
  ReplicaStatus,
  majorityReportedBy,
  memberAddressesReportedBy,
  partitionServiceHost,
  replicaAddress,
  serviceRow,
  shutdown,
  virtualTimeSource,
};
