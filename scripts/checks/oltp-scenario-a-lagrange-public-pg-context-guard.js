import assert from 'node:assert/strict';

import {
  computeSourceFingerprint,
} from '../../src/diagnostics/source-fingerprint.js';
import {
  CONVERGENCE_DEFAULTS,
  REQUEST_CELL_AUTH,
  TIMEOUTS,
} from '../../test/distributed/harness/constants.js';
import {
  buildLagrangeScenarioALiveAdmission,
} from '../../test/distributed/harness/oltp-scenario-a-lagrange-live-admission.js';
import {
  LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
} from '../../test/distributed/harness/oltp-scenario-a-lagrange-proof-plan.js';
import {
  prepareLagrangeScenarioAPublicPgContext,
  resolveHealthyPublicPgEndpoint,
} from '../../test/distributed/harness/oltp-scenario-a-lagrange-public-pg-context.js';

const CORE_HEAD_SHA = 'a'.repeat(40);
const ARTIFACT_SHA256 = 'b'.repeat(64);
const PORT = 5432;

const srcFingerprint = await computeSourceFingerprint('src');
const formationCertification = Object.freeze({
  ...LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
  status: 'passed',
  coreHeadSha: CORE_HEAD_SHA,
  srcFingerprint,
  artifactSha256: ARTIFACT_SHA256,
});
const admission = buildLagrangeScenarioALiveAdmission({
  proofCaseId: 'new-order-contention',
  formationCertification,
});

const queries = [];
const convergence = [];
const seedNode = {
  id: 'seed-1',
  role: 'seed',
  ip: '10.0.0.1',
  async query(sql) {
    queries.push(sql);
    if (sql.startsWith('SELECT service_id')) {
      return {
        rows: [{
          service_id: 'sys-postgres-wire',
          node_id: 'worker-1',
          protocol: 'postgresql',
          address: '0.0.0.0',
          port: PORT,
          health_status: 'healthy',
        }],
      };
    }
    return {rows: []};
  },
};
const workerNode = {
  id: 'worker-1',
  role: 'worker',
  ip: '10.0.0.2',
};
const cluster = {
  getNodes() {
    return [seedNode, workerNode];
  },
  async waitForConvergence(options) {
    convergence.push(options);
  },
};

const context = await prepareLagrangeScenarioAPublicPgContext({
  cluster,
  admission,
});
assert.deepEqual(context.admission, admission);
assert.equal(context.runtimePreflight.srcFingerprintMatches, true);
assert.equal(context.runtimePreflight.observedSrcFingerprint, srcFingerprint);
assert.deepEqual(context.endpoint, {host: workerNode.ip, port: PORT});
assert.deepEqual(context.serviceEndpoint, {
  serviceId: 'sys-postgres-wire',
  nodeId: workerNode.id,
  protocol: 'postgresql',
  advertisedAddress: '0.0.0.0',
  port: PORT,
  healthStatus: 'healthy',
});
assert.deepEqual(context.connection, {
  user: REQUEST_CELL_AUTH.USER,
  password: REQUEST_CELL_AUTH.PASSWORD,
  database: REQUEST_CELL_AUTH.DATABASE,
  ssl: false,
});
assert.deepEqual(convergence, [{
  targetVoterCount: 2,
  settleTimeoutMs: TIMEOUTS.SCENARIO_DEFAULT,
  quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
}]);
assert.equal(queries.length, 3);
assert.match(queries[0], /UPDATE service_definitions SET runtime_config/u);
assert.match(queries[0], /sys-postgres-wire/u);
assert.match(queries[1], /SET replica_count = 1/u);
assert.match(queries[2], /FROM service_endpoints/u);
assert.equal(Object.isFrozen(context), true);
assert.equal(Object.hasOwn(context, 'comparable'), false);

const unresolved = resolveHealthyPublicPgEndpoint(
  [{
    service_id: 'sys-postgres-wire',
    node_id: workerNode.id,
    protocol: 'mysql',
    port: PORT,
    health_status: 'healthy',
  }],
  [seedNode, workerNode],
  admission.publicExecutionContract,
);
assert.equal(unresolved, null);

let blockedConvergenceCalls = 0;
const blockedCluster = {
  getNodes() {
    return [seedNode];
  },
  async waitForConvergence() {
    blockedConvergenceCalls += 1;
  },
};
await assert.rejects(
  prepareLagrangeScenarioAPublicPgContext({
    cluster: blockedCluster,
    admission: {...admission, admissionSha256: '0'.repeat(64)},
  }),
  /content binding mismatch/u,
);
assert.equal(blockedConvergenceCalls, 0);

console.log(
  'oltp-scenario-a-lagrange-public-pg-context-guard: PASS ' +
  JSON.stringify({queries: queries.length, endpoint: context.endpoint}),
);
