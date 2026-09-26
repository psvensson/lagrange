/**
 * The shared node-liveness projection has one evidence source (fix-f4,
 * Fact 1 of the instrumented join-SLO classification at ab7669fd0).
 *
 * The planning identity rotates on every change of a node's shared liveness
 * component, and a rotation stales every completed planning record of the
 * reading node, for every read kind. Instrumented join runs (local repro of
 * tv-dator runs 2/4/5) showed the owner node's OWN liveness projection
 * flipping healthy <-> invalid several times per second: the planning build
 * projected it from the cache row, and the membership-publication planning
 * read (getAllNodeReadiness with allowAuthoritativeRefresh) projected it from
 * NO row, because the authoritative node read was unavailable
 * ({success:false, error:'authoritative_row_source_unavailable'}) and came
 * back as an empty row set. Each flip rotated the global planning
 * generation, so the REPLACE owner's reads of the seed were served the
 * deferred snapshot ~44 ms after the seed's own current publication, while
 * routed reads were bridged.
 *
 * Invariant: an evaluation over a row that is not the projection's source
 * row (an authoritative or preloaded row, or no row at all) answers for its
 * caller only; it never writes the shared projection, so it never rotates
 * the planning identity, and a read of every participation kind after it is
 * served the completed snapshot exactly as a routed read is.
 */
import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {isDeferredReadinessPlanningSnapshot} from
  '../../src/control-plane/readiness-planning-version-contract.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

ConfigurationManager.getInstance().initialize();

const SELF_NODE_ID = 'node-owner-self';
const PEER_NODE_ID = 'node-seed-peer';
const START_MS = 300000;
const LEASE_MS = 15000;
const HEARTBEAT_AGE_MS = 100;
const WARM_ROUNDS = 20;
// The production refusal of an authoritative row read (the listNodes result
// recorded on the owner node in the red join runs).
const UNAVAILABLE_AUTHORITATIVE_READ = Object.freeze({
  success: false,
  error: 'authoritative_row_source_unavailable',
});
const DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
const PARTICIPATION_KINDS = Object.values(CONTROL_PLANE_PARTICIPATION_KIND);

function nodeRow(nodeId, heartbeatAtMs) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: 'ready',
    [COLUMN.READY_LEASE_EXPIRES_AT]: START_MS + LEASE_MS,
    [COLUMN.LAST_HEARTBEAT]: heartbeatAtMs,
    [COLUMN.CPU_USAGE_PERCENT]: 10,
    [COLUMN.MEMORY_USAGE_PERCENT]: 10,
    [COLUMN.DISK_USAGE_PERCENT]: 10,
  };
}

function macrotask() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function createRig(listNodes) {
  const clock = {now: START_MS};
  const cache = new SystemTableCache();
  for (const nodeId of [SELF_NODE_ID, PEER_NODE_ID]) {
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT,
      nodeRow(nodeId, START_MS - HEARTBEAT_AGE_MS));
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      [COLUMN.SERVICE_ID]: `p1-${nodeId}`,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      partition_id: 'p1',
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/p1`,
    });
  }
  await macrotask();
  const service = new ControlPlaneReadinessService({
    nodeId: SELF_NODE_ID,
    systemTableCache: cache,
    now: () => clock.now,
    nodesOwner: {
      listNodes,
      getNodeFromCache: async (nodeId) =>
        ({rows: [cache.get(TABLES.NODES, nodeId)]}),
      listNodesFromCache: async () => ({rows: cache.getAll(TABLES.NODES)}),
    },
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics: () => ({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: new Date(START_MS).toISOString(),
        recentTransitions: [],
      }),
    },
  });
  return {cache, clock, service};
}

function read(service, nodeId, participationKind) {
  return service.getNodeReadinessSync(nodeId, {
    participationKind,
    decisionDimension: DIMENSION,
  });
}

async function warm(service) {
  for (let round = 0; round < WARM_ROUNDS; round += 1) {
    const deferred = [SELF_NODE_ID, PEER_NODE_ID].some((nodeId) =>
      PARTICIPATION_KINDS.some((kind) =>
        isDeferredReadinessPlanningSnapshot(read(service, nodeId, kind))));
    if (!deferred) return true;
    await macrotask();
  }
  return false;
}

function captureIdentity(service) {
  const owner = service.readinessPlanningSnapshotOwner;
  return {
    globalPlanningGeneration:
      owner.semanticGenerationTracker.globalPlanningGeneration,
    livenessGenerations: [SELF_NODE_ID, PEER_NODE_ID].map((nodeId) =>
      service.getNodeLivenessSemanticIdentity(nodeId, START_MS).generation),
  };
}

const NON_SOURCE_ROW_CASES = [
  ['the authoritative node read is unavailable', () => async () =>
    UNAVAILABLE_AUTHORITATIVE_READ],
  ['the authoritative node read returns rows older than the cache\'s', () =>
    async () => ({
      success: true,
      rows: [SELF_NODE_ID, PEER_NODE_ID].map((nodeId) =>
        nodeRow(nodeId, START_MS - LEASE_MS)),
    })],
];

for (const [label, listNodes] of NON_SOURCE_ROW_CASES) {
  test('an evaluation over a non-source row never rotates the planning ' +
    `identity nor defers any read kind (${label})`, async (t) => {
    const {service} = await createRig(listNodes());
    t.teardown(() => service.shutdown());
    t.equal(await warm(service), true,
      'precondition: every read kind of both nodes is served a completed ' +
      'snapshot');
    const before = captureIdentity(service);

    await service.getAllNodeReadiness({allowAuthoritativeRefresh: true});

    t.same(captureIdentity(service), before,
      'neither the shared liveness projection nor the planning identity moved');
    for (const nodeId of [SELF_NODE_ID, PEER_NODE_ID]) {
      const routed = isDeferredReadinessPlanningSnapshot(
        read(service, nodeId, CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ));
      for (const kind of PARTICIPATION_KINDS) {
        const deferred = isDeferredReadinessPlanningSnapshot(
          read(service, nodeId, kind));
        t.equal(deferred, false,
          `${kind} read of ${nodeId} is served the completed snapshot`);
        t.equal(deferred, routed,
          `${kind} and routed reads of ${nodeId} agree`);
      }
    }
  });
}
