/**
 * Shared fixture builder for local partition service test doubles in bootstrap tests.
 * Conforms to PartitionLocalServiceStatusRecord contract, rejecting phantom members.
 */

import {
  PARTITION_LOCAL_SERVICE_STATUS_KEYS,
} from '../../src/partition/partition-local-service-status-contract.js';

const NODE_IDS = Object.freeze(['node-1', 'node-2', 'node-3']);

const DEFAULT_LOCAL_SERVICE_OPTIONS = Object.freeze({
  role: 'leader',
  term: 3,
  initialized: true,
  isShutdown: false,
  state: 'NORMAL',
  keyRange: Object.freeze({start: null, end: null}),
  sizeBytes: 0,
  replicaCount: NODE_IDS.length,
  cdcSubscribers: 0,
  getRows: () => [],
  queryResultOverrides: () => ({}),
});

const KNOWN_FIXTURE_CONFIG_KEYS = Object.freeze([
  'getRows',
  'queryResultOverrides',
  'isShutdown',
  'statusInitialized',
  ...PARTITION_LOCAL_SERVICE_STATUS_KEYS,
]);

function resolveLocalServiceStubConfig(partitionId, overrides) {
  const base = {
    ...DEFAULT_LOCAL_SERVICE_OPTIONS,
    nodeId: NODE_IDS[0],
    tableId: partitionId,
    tableName: partitionId,
    ...overrides,
  };
  const replicaId = base.replicaId ?? `${partitionId}-${base.nodeId}`;
  const isLeader = Object.hasOwn(overrides, 'isLeader') ?
    overrides.isLeader :
    base.role === 'leader';
  const leaderId = Object.hasOwn(overrides, 'leaderId') ?
    overrides.leaderId :
    (isLeader ? replicaId : null);
  const statusInitialized = Object.hasOwn(overrides, 'statusInitialized') ?
    overrides.statusInitialized :
    base.initialized;
  return {...base, replicaId, isLeader, leaderId, statusInitialized};
}

function buildLeaderWitness(partitionId, nodeId) {
  return {
    state: 'observed',
    partitionId,
    role: 'leader',
    servingNodeId: nodeId,
    servingReplicaId: `${partitionId}-${nodeId}`,
    term: 3,
    appliedIndex: 1,
    commitIndex: 1,
    observedAtMs: Date.now(),
  };
}

function buildLocalPartitionService(partitionId, overrides = {}) {
  for (const key of Object.keys(overrides)) {
    if (!KNOWN_FIXTURE_CONFIG_KEYS.includes(key)) {
      throw new TypeError(`Fixture double rejects unrecognized phantom property: ${key}`);
    }
  }
  const cfg = resolveLocalServiceStubConfig(partitionId, overrides);
  const status = Object.freeze({
    partitionId,
    tableId: cfg.tableId,
    tableName: cfg.tableName,
    replicaId: cfg.replicaId,
    nodeId: cfg.nodeId,
    role: cfg.role,
    isLeader: cfg.isLeader,
    leaderId: cfg.leaderId,
    term: cfg.term,
    state: cfg.state,
    keyRange: cfg.keyRange,
    sizeBytes: cfg.sizeBytes,
    replicaCount: cfg.replicaCount,
    cdcSubscribers: cfg.cdcSubscribers,
    initialized: cfg.statusInitialized,
  });
  return {
    partitionId,
    tableId: cfg.tableId,
    tableName: cfg.tableName,
    replicaId: cfg.replicaId,
    nodeId: cfg.nodeId,
    initialized: cfg.initialized,
    isShutdown: cfg.isShutdown,
    role: cfg.role,
    isLeader: cfg.isLeader,
    leaderId: cfg.leaderId,
    getRole: () => cfg.role,
    isLeaderReplica: () => cfg.isLeader,
    getStatus: () => status,
    buildRemoteReadAuthorityWitness: () =>
      (cfg.role === 'leader' ? buildLeaderWitness(partitionId, cfg.nodeId) : null),
    readPartitionConsensusAuthority: ({nowMs = Date.now()} = {}) => {
      const isLeader = cfg.role === 'leader' && cfg.isLeader === true;
      return {
        outcome: 'core-ok',
        available: cfg.initialized === true && cfg.isShutdown !== true,
        partitionId,
        replicaId: cfg.replicaId,
        nodeId: cfg.nodeId,
        role: cfg.role,
        isLeader,
        leaderId: isLeader ? cfg.replicaId : null,
        term: cfg.term,
        commitIndex: 1,
        appliedIndex: 1,
        configurationKey: `conf-${partitionId}`,
        membershipGenerationIndex: 1,
        lifecycleIncarnation: `inc-${partitionId}`,
        voters: [cfg.replicaId],
        voterCount: 1,
        confChangePending: false,
        hasQuorum: isLeader,
        observedAtMs: nowMs,
      };
    },
    executeLocalQuery: () => ({
      success: true,
      rows: cfg.getRows(),
      rowSetComplete: true,
      partial: false,
      source: 'local_partition_replica',
      readAuthorityWitness: cfg.role === 'leader' ?
        buildLeaderWitness(partitionId, cfg.nodeId) :
        null,
      ...cfg.queryResultOverrides(),
    }),
  };
}

export {
  buildLocalPartitionService,
};
