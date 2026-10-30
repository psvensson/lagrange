import assert from 'node:assert/strict';

import {
  computeSourceFingerprint,
} from '../../src/diagnostics/source-fingerprint.js';
import {
  projectPgWireExecutionResult,
} from '../../src/query/pg/postgres-wire-adapter.js';
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

const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const PASS_PREFIX = 'oltp-scenario-a-lagrange-public-pg-context-guard: PASS ';
const NEWLINE = '\n';

const runPublicPgContextGuard = async () => {
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
  const scaleCalls = [];
  const seedNode = {
    id: 'seed-1',
    role: 'seed',
    ip: '10.0.0.1',
    async scalePostgresWireListener(desiredState) {
      scaleCalls.push(desiredState);
      return {
        success: true,
        outcome: 'applied',
        serviceId: 'sys-postgres-wire',
        scaleState: 'desired_state_persisted',
      };
    },
    async query(sql) {
      if (stringIncludes(sql, 'UPDATE service_definitions')) {
        throw new Error(
          `Forbidden UPDATE service_definitions SQL in public PG context: ${sql}`,
        );
      }
      queries.push(sql);
      if (stringStartsWith(sql, 'SELECT service_id')) {
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
  assert.equal(scaleCalls.length, 1);
  assert.deepEqual(scaleCalls[0], {
    replicaCount: 1,
    runtimeConfig: {
      host: '0.0.0.0',
      authMode: 'password',
      tlsMode: 'disable',
    },
  });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /FROM service_endpoints/u);
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

  const projectedConflict = projectPgWireExecutionResult({
    success: false,
    errorCode: 'WRITE_CONFLICT',
  });
  assert.equal(projectedConflict.sqlState, '40001');

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

  const refusingSeedNode = {
    id: 'seed-refusing',
    role: 'seed',
    ip: '10.0.0.1',
    async scalePostgresWireListener() {
      return {
        success: false,
        outcome: 'refused',
        errorCode: 'POSTGRES_WIRE_SCALE_REQUEST_INVALID',
        error: 'refused',
      };
    },
    async query() {
      return {rows: []};
    },
  };
  const refusingCluster = {
    getNodes() {
      return [refusingSeedNode, workerNode];
    },
    async waitForConvergence() {},
  };
  await assert.rejects(
    prepareLagrangeScenarioAPublicPgContext({
      cluster: refusingCluster,
      admission,
    }),
    /public PG wire scale failed/u,
  );

  return {queries: queries.length, endpoint: context.endpoint};
};

const result = await runPublicPgContextGuard();

process.stdout.write(PASS_PREFIX + JSON.stringify(result) + NEWLINE);
