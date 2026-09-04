import {test} from '../../src/test-helpers/tap.js';
import {
  capturePositiveDecisionLiveVeto,
} from '../../src/control-plane/readiness-planning-publication-contract.js';

const VETO_NOW_MS = 1_700_000_000_000;
const OWNER_KEY = 'node-veto-owner';

function createVetoService(overrides = {}) {
  const heartbeatDiagnostics = {
    lastAttemptAt: VETO_NOW_MS - 1000,
    lastSuccessAt: VETO_NOW_MS - 2000,
    lastFailureAt: null,
    lastFailureStage: null,
    lastFailureReason: null,
    publicationPath: 'sql_direct',
    targetAddress: 'seed/partition/nodes-p1',
    targetNodeId: OWNER_KEY,
    targetServiceType: 'partition',
    targetServiceId: 'nodes-p1-r1',
    consecutiveFailures: 0,
    publicationMode: 'heartbeat_steady',
    ...overrides.heartbeatDiagnostics,
  };
  return {
    clusterMemberStaleHeartbeatMaxAgeMs: 30000,
    livenessGeneration: 1,
    livenessSignature: 'lease-valid',
    heartbeatService: {
      getHeartbeatPublicationDiagnostics: () => heartbeatDiagnostics,
      lastHeartbeatPublicationDecision: {
        publicationMode: overrides.decisionMode || 'heartbeat_steady',
      },
    },
    nodeLifecycleStateMachine: {getState: () => 'active'},
    storageAccountingService: {
      softPressurePercent: 70,
      hardPressurePercent: 85,
      minimumReplicaBytes: 1048576,
      partitionReplicaOverheadBytes: 10485760,
      messageGroupReplicaOverheadBytes: 1048576,
      serviceReplicaOverheadBytes: 5242880,
    },
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics: () => ({
        currentMode: 'grouped',
        reasonCode: null,
      }),
    },
    getNodeTransportState: () => ({
      connected: true,
      rowState: 'ready',
      routerState: 'connected',
    }),
    getNodeLivenessSemanticIdentity() {
      return {
        generation: this.livenessGeneration,
        semanticSignature: this.livenessSignature,
      };
    },
    getNodeRow: () => null,
    heartbeatDiagnostics,
  };
}

const SNAPSHOT = Object.freeze({
  nodeEvidence: Object.freeze({
    readyLeaseExpiresAt: VETO_NOW_MS + 60000,
    lastHeartbeat: VETO_NOW_MS - 1000,
  }),
});

function captureVeto(service) {
  return capturePositiveDecisionLiveVeto(
    service,
    OWNER_KEY,
    SNAPSHOT,
    VETO_NOW_MS - 500,
    VETO_NOW_MS,
  );
}

test('the positive-decision live veto ignores heartbeat attempt clocks and ' +
  'cadence-mode oscillation', async (t) => {
  const service = createVetoService();
  const before = captureVeto(service);

  // Routine heartbeat activity: attempt/success clocks advance, the failure
  // clock records a transient, the counter moves, and the cadence decision
  // oscillates steady <-> maintenance. None of this is a semantic readiness
  // transition, and each of these invalidating the completed planning
  // snapshot is exactly the formation livelock that starved a bootstrap
  // seed's query routing.
  service.heartbeatDiagnostics.lastAttemptAt = VETO_NOW_MS + 5000;
  service.heartbeatDiagnostics.lastSuccessAt = VETO_NOW_MS + 5000;
  service.heartbeatDiagnostics.lastFailureAt = VETO_NOW_MS + 4000;
  service.heartbeatDiagnostics.consecutiveFailures = 3;
  service.heartbeatDiagnostics.publicationMode = 'heartbeat_maintenance';
  service.heartbeatService.lastHeartbeatPublicationDecision.publicationMode =
    'heartbeat_maintenance';

  t.equal(captureVeto(service), before,
    'attempt clocks, failure counters, and cadence-mode flips never ' +
      'invalidate a completed planning snapshot');
  t.end();
});

test('the positive-decision live veto still trips on semantic transitions ' +
  'and expiry', async (t) => {
  const service = createVetoService();
  const before = captureVeto(service);

  service.heartbeatDiagnostics.publicationPath = 'transport_relay';
  const pathChanged = captureVeto(service);
  t.not(pathChanged, before,
    'a publication path change is a semantic transition and invalidates');
  service.heartbeatDiagnostics.publicationPath = 'sql_direct';

  service.heartbeatDiagnostics.lastFailureStage = 'ack';
  service.heartbeatDiagnostics.lastFailureReason = 'timeout';
  t.not(captureVeto(service), before,
    'a new failure kind is a semantic transition and invalidates');
  service.heartbeatDiagnostics.lastFailureStage = null;
  service.heartbeatDiagnostics.lastFailureReason = null;

  service.livenessGeneration += 1;
  service.livenessSignature = 'lease-expired';
  const expiredLease = captureVeto(service);
  t.not(expiredLease, before,
    'an owner-projected ready-lease expiry still vetoes the positive decision');
  t.end();
});
