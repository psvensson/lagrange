import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  NODE_TRUST_STATE,
  buildNodeTrustState,
} from '../../src/control-plane/node-trust-state.js';

const NODE_ID = 'node-a';

function buildPublication(nodeIds = [NODE_ID], publicationEpoch = 7) {
  return {
    publicationEpoch,
    sourceSnapshotVersion: publicationEpoch + 10,
    status: 'PUBLISHED',
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: nodeIds,
  };
}

function buildReadiness(options = {}) {
  const capturedAtMs = options.capturedAtMs ?? 1000;
  return {
    nodeId: options.nodeId || NODE_ID,
    observedAt: new Date(capturedAtMs).toISOString(),
    membershipPublication:
      options.membershipPublication === undefined ?
        buildPublication() :
        options.membershipPublication,
    nodeEvidence: {
      status: options.status === undefined ? 'active' : options.status,
      lastHeartbeat: 100,
      heartbeatAgeMs: Object.hasOwn(options, 'heartbeatAgeMs') ?
        options.heartbeatAgeMs :
        900,
      staleHeartbeatLimitMs: Object.hasOwn(
        options,
        'staleHeartbeatLimitMs',
      ) ?
        options.staleHeartbeatLimitMs :
        500,
      readyLeaseExpiresAt: 1200,
      routerConnectionState: options.routerConnectionState ?? 'connected',
      transportConnected: options.transportConnected !== false,
      readyNow: options.readyNow === true,
      readyWhenWritten: options.readyWhenWritten === true,
    },
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]:
        options.processAlive !== false,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
        options.repairEligible !== false,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
        options.serveEligible === true,
    },
    reasons: options.reasons || [],
  };
}

function buildTrust(readiness, options = {}) {
  return buildNodeTrustState(readiness, {
    observerNodeId: 'observer-a',
    cacheWatermark: {
      state: 'known',
      nodesVersion: 11,
      servicesVersion: 12,
      nodesAppliedAtMs: 900,
      servicesAppliedAtMs: 901,
    },
    transport: {
      state: 'connected',
      observedAtMs: options.capturedAtMs ?? 1000,
    },
    graceStartedAtMs: 1000,
    ...options,
  });
}

test('W7 trust: stale cache plus fresh transport is bounded repair-only',
  (t) => {
    const duringGrace = buildTrust(buildReadiness({serveEligible: true}), {
      capturedAtMs: 1499,
    });
    const atExpiry = buildTrust(buildReadiness({serveEligible: true}), {
      capturedAtMs: 1500,
    });

    t.equal(duringGrace.membership.state, 'member');
    t.equal(duringGrace.membership.publicationEpoch, 7);
    t.equal(duringGrace.freshness.state, 'grace');
    t.equal(duringGrace.state, NODE_TRUST_STATE.REPAIR_ONLY);
    t.equal(duringGrace.repairEligible, true);
    t.equal(duringGrace.serveEligible, false,
      'transport never upgrades stale evidence to serve');
    t.equal(atExpiry.freshness.state, 'expired');
    t.equal(atExpiry.repairEligible, false,
      'grace flips off exactly at the bound');
    t.end();
  });

test('W7 trust: current published removal vetoes a stale connected socket',
  (t) => {
    const trust = buildTrust(buildReadiness({
      membershipPublication: buildPublication([], 8),
      heartbeatAgeMs: 100,
      serveEligible: true,
    }));

    t.equal(trust.membership.state, 'removed');
    t.equal(trust.transport.state, 'connected');
    t.equal(trust.state, NODE_TRUST_STATE.BLOCKED);
    t.equal(trust.repairEligible, false);
    t.equal(trust.serveEligible, false);
    t.end();
  });

test('W7 trust: unknown owner evidence fails closed', (t) => {
  const unknownMembership = buildTrust(buildReadiness({
    membershipPublication: null,
    heartbeatAgeMs: 100,
    serveEligible: true,
  }));
  const unknownCache = buildTrust(buildReadiness({heartbeatAgeMs: 100}), {
    cacheWatermark: {state: 'unknown'},
  });
  const unknownTransport = buildTrust(buildReadiness({heartbeatAgeMs: 100}), {
    transport: {state: 'unknown', observedAtMs: null},
  });
  const missingMembershipRevision = buildTrust(buildReadiness({
    heartbeatAgeMs: 100,
    membershipPublication: {
      status: 'PUBLISHED',
      publishedActiveNodeIds: [NODE_ID],
    },
    serveEligible: true,
  }));
  const emptyKnownCache = buildTrust(buildReadiness({heartbeatAgeMs: 100}), {
    cacheWatermark: {state: 'known'},
  });
  const nullMembershipRevision = buildTrust(buildReadiness({
    heartbeatAgeMs: 100,
    membershipPublication: {
      publicationEpoch: null,
      sourceSnapshotVersion: null,
      status: 'PUBLISHED',
      publishedActiveNodeIds: [NODE_ID],
    },
    serveEligible: true,
  }));
  const nullHeartbeat = buildTrust(buildReadiness({
    heartbeatAgeMs: null,
    serveEligible: true,
  }));

  t.equal(unknownMembership.state, NODE_TRUST_STATE.UNKNOWN);
  t.equal(unknownCache.state, NODE_TRUST_STATE.UNKNOWN);
  t.equal(unknownTransport.state, NODE_TRUST_STATE.UNKNOWN);
  t.equal(unknownMembership.repairEligible, false);
  t.equal(unknownCache.repairEligible, false);
  t.equal(unknownTransport.repairEligible, false);
  t.equal(missingMembershipRevision.state, NODE_TRUST_STATE.UNKNOWN);
  t.equal(emptyKnownCache.state, NODE_TRUST_STATE.UNKNOWN);
  t.equal(nullMembershipRevision.state, NODE_TRUST_STATE.UNKNOWN);
  t.equal(nullHeartbeat.freshness.state, 'unknown');
  t.equal(nullHeartbeat.serveEligible, false);
  t.end();
});

test('W7 trust: null grace timestamps never normalize to epoch zero', (t) => {
  const trust = buildTrust(buildReadiness({capturedAtMs: 1}), {
    capturedAtMs: 1,
    graceStartedAtMs: null,
  });

  t.equal(trust.freshness.graceUntilMs, null);
  t.equal(trust.freshness.state, 'expired');
  t.equal(trust.repairEligible, false);
  t.end();
});

test('W7 trust: connected transport cannot rescue non-liveness failure',
  (t) => {
    const trust = buildTrust(buildReadiness({
      heartbeatAgeMs: 900,
      repairEligible: false,
      serveEligible: false,
    }));

    t.equal(trust.transport.state, 'connected');
    t.equal(trust.state, NODE_TRUST_STATE.BLOCKED);
    t.equal(trust.repairEligible, false);
    t.end();
  });

function createTrustViewFixture() {
  let nowMs = 1000;
  let publication = buildPublication();
  let readiness = buildReadiness();
  let transportState = 'connected';
  let nodesVersion = 11;
  let nodesAppliedAtMs = 900;
  const readinessCalls = [];
  const cache = {
    getAll(tableName) {
      if (tableName === 'nodes') {
        return [{node_id: NODE_ID}];
      }
      if (tableName === 'services') {
        return [{service_id: 'mg-a', node_id: NODE_ID}];
      }
      return [];
    },
    getAppliedSchemaVersion(tableName) {
      return tableName === 'nodes' ? nodesVersion : 12;
    },
    getLastAppliedAtMs(tableName) {
      return tableName === 'nodes' ? nodesAppliedAtMs : 901;
    },
  };
  const service = new ControlPlaneReadinessService({
    nodeId: 'observer-a',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return transportState;
      },
    },
    now: () => nowMs,
  });
  service.getMembershipPublicationDiagnosticsSync = () => publication;
  service.getNodeReadinessSync = (nodeId, options) => {
    readinessCalls.push({nodeId, options});
    return {
      ...readiness,
      nodeId,
      observedAt: new Date(nowMs).toISOString(),
      membershipPublication: publication,
    };
  };
  return {
    service,
    readinessCalls,
    setNow(value) {
      nowMs = value;
    },
    setPublication(value) {
      publication = value;
    },
    setReadiness(value) {
      readiness = value;
    },
    setTransport(value) {
      transportState = value;
    },
    advanceUnrelatedNodeWatermark() {
      nodesVersion += 1;
      nodesAppliedAtMs += 1;
    },
  };
}

test('W7 trust view: installed membership changes bypass readiness snapshots',
  (t) => {
    const fixture = createTrustViewFixture();
    const included = fixture.service.getProvisioningNodeTrustViewSync()
      .find((entry) => entry.nodeId === NODE_ID);
    fixture.setPublication(buildPublication([], 8));
    const removed = fixture.service.getProvisioningNodeTrustViewSync()
      .find((entry) => entry.nodeId === NODE_ID);

    t.equal(included.membership.state, 'member');
    t.equal(removed.membership.state, 'removed');
    t.equal(removed.membership.publicationEpoch, 8);
    t.equal(removed.repairEligible, false);
    t.equal(
      fixture.readinessCalls.filter((call) => call.nodeId === NODE_ID).length,
      2,
    );
    t.ok(fixture.readinessCalls.every((call) =>
      call.options.membershipPublicationPlanningSource ===
        'direct_publication_row'),
    'the provisioning view never invokes membership candidate derivation');
    t.end();
  });

test('W7 trust view: formation blocks SQL trust until membership is installed',
  (t) => {
    const fixture = createTrustViewFixture();
    fixture.setReadiness(buildReadiness({
      heartbeatAgeMs: 100,
      serveEligible: true,
    }));
    fixture.setPublication(null);
    const beforePublication =
      fixture.service.getProvisioningNodeTrustViewSync()
        .find((entry) => entry.nodeId === NODE_ID);
    fixture.setPublication(buildPublication([NODE_ID], 9));
    const afterPublication =
      fixture.service.getProvisioningNodeTrustViewSync()
        .find((entry) => entry.nodeId === NODE_ID);

    t.equal(beforePublication.state, NODE_TRUST_STATE.UNKNOWN);
    t.equal(beforePublication.serveEligible, false);
    t.equal(afterPublication.state, NODE_TRUST_STATE.SERVE);
    t.equal(afterPublication.serveEligible, true);
    t.end();
  });

test('W7 trust view: repeated reads cannot renew stale-negative grace', (t) => {
  const fixture = createTrustViewFixture();
  const atStart = fixture.service.getProvisioningNodeTrustViewSync()
    .find((entry) => entry.nodeId === NODE_ID);
  fixture.setNow(1499);
  const beforeExpiry = fixture.service.getProvisioningNodeTrustViewSync()
    .find((entry) => entry.nodeId === NODE_ID);
  fixture.setNow(1500);
  const atExpiry = fixture.service.getProvisioningNodeTrustViewSync()
    .find((entry) => entry.nodeId === NODE_ID);

  t.equal(atStart.freshness.state, 'grace');
  t.equal(beforeExpiry.repairEligible, true);
  t.equal(atExpiry.freshness.state, 'expired');
  t.equal(atExpiry.repairEligible, false);
  t.end();
});

test('W7 trust view: unrelated node-cache churn cannot renew target grace',
  (t) => {
    const fixture = createTrustViewFixture();
    fixture.service.getProvisioningNodeTrustViewSync();
    fixture.setNow(1499);
    fixture.advanceUnrelatedNodeWatermark();
    const afterUnrelatedChurn = fixture.service
      .getProvisioningNodeTrustViewSync()
      .find((entry) => entry.nodeId === NODE_ID);
    fixture.setNow(1500);
    fixture.advanceUnrelatedNodeWatermark();
    const atOriginalExpiry = fixture.service
      .getProvisioningNodeTrustViewSync()
      .find((entry) => entry.nodeId === NODE_ID);

    t.equal(afterUnrelatedChurn.repairEligible, true);
    t.equal(atOriginalExpiry.freshness.state, 'expired');
    t.equal(atOriginalExpiry.repairEligible, false);
    t.end();
  });

test('W7 trust view: unrelated membership revisions cannot renew target grace',
  (t) => {
    const fixture = createTrustViewFixture();
    fixture.service.getProvisioningNodeTrustViewSync();
    fixture.setNow(1499);
    fixture.setPublication(buildPublication([NODE_ID], 8));
    const afterUnrelatedRevision = fixture.service
      .getProvisioningNodeTrustViewSync()
      .find((entry) => entry.nodeId === NODE_ID);
    fixture.setNow(1500);
    fixture.setPublication(buildPublication([NODE_ID], 9));
    const atOriginalExpiry = fixture.service
      .getProvisioningNodeTrustViewSync()
      .find((entry) => entry.nodeId === NODE_ID);

    t.equal(afterUnrelatedRevision.membership.publicationEpoch, 8);
    t.equal(afterUnrelatedRevision.repairEligible, true);
    t.equal(atOriginalExpiry.membership.publicationEpoch, 9);
    t.equal(atOriginalExpiry.repairEligible, false);
    t.end();
  });

test('W7 trust view: rowless formation self uses explicit bounded runtime ' +
  'grace only after installed membership', (t) => {
  const nodeId = 'seed';
  let publication = null;
  const serviceRows = [{
    service_id: 'mg-seed',
    node_id: nodeId,
    service_type: 'message_group',
    status: 'active',
    address: 'seed/message-group/mg-seed',
  }];
  const cache = {
    get() {
      return null;
    },
    getAll(tableName) {
      return tableName === 'services' ? serviceRows : [];
    },
    filter(tableName, predicate) {
      return this.getAll(tableName).filter(predicate);
    },
    getAppliedSchemaVersion() {
      return 1;
    },
    getLastAppliedAtMs() {
      return 900;
    },
  };
  const readinessService = new ControlPlaneReadinessService({
    nodeId,
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return null;
      },
      getQueryDataPlaneTransportReadiness() {
        return {ready: true};
      },
    },
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics() {
        return {currentMode: 'grouped'};
      },
    },
    membershipPublicationService: {
      getLatestClusterPublicationSync() {
        return publication;
      },
    },
    now: () => 1000,
  });

  const beforePublication = readinessService
    .getProvisioningNodeTrustViewSync()
    .find((entry) => entry.nodeId === nodeId);
  publication = {
    publicationEpoch: 2,
    sourceSnapshotVersion: 3,
    status: 'PUBLISHED',
    publishedActiveNodeIds: [nodeId],
    requiredAckNodeIds: [nodeId],
    acknowledgedNodeIds: [nodeId],
  };
  readinessService.membershipPublicationDiagnosticsMemo = null;
  const afterPublication = readinessService
    .getProvisioningNodeTrustViewSync()
    .find((entry) => entry.nodeId === nodeId);

  t.equal(beforePublication.repairEligible, false);
  t.equal(afterPublication.observerEvidence.selfRuntimeGrace, true);
  t.equal(afterPublication.membership.state, 'member');
  t.equal(afterPublication.state, NODE_TRUST_STATE.REPAIR_ONLY);
  t.equal(afterPublication.repairEligible, true);
  t.equal(afterPublication.serveEligible, false);
  t.end();
});
