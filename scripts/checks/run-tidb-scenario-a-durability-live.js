#!/usr/bin/env node

import {createHash, randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  TIDB_REFERENCE_DEFAULTS,
  buildTiDbReferenceReadinessSql,
  startTiDbReferenceCluster,
  stopTiDbReferenceCluster,
  waitForTiDbReferenceSqlReady,
} from '../../test/distributed/harness/tidb-reference-lifecycle.js';
import {
  executePairedOltpTransactionWithRetry,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
  buildScenarioADurabilityCase,
  evaluateScenarioADurabilityObservation,
} from '../../test/distributed/harness/oltp-scenario-a-durability-case.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-gate.js';
import {
  buildScenarioAPaymentCase,
} from '../../test/distributed/harness/oltp-scenario-a-payment-case.js';
import {
  createTiDbOltpAdapter,
} from '../../test/distributed/reference-client/tidb-oltp-adapter.js';
import {
  observeTiDbOltpStateSnapshot,
} from '../../test/distributed/reference-client/tidb-oltp-state-snapshot.js';
import {
  observeTiDbPaymentState,
} from '../../test/distributed/reference-client/tidb-payment-observer.js';

const ZERO = 0;
const ONE = 1;
const TIKV_STORE_COUNT = 3;
const READINESS_TIMEOUT_MS = 120000;
const READINESS_POLL_INTERVAL_MS = 1000;
const READINESS_KEEPALIVE_SECONDS = '300';
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_DURABILITY_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-durability-tidb.json';
const LABELS = Object.freeze({
  'lagrange.benchmark': 'scenario-a-durability-tidb',
});
const DATABASE_RESOURCE_LIMITS = Object.freeze({memory: '2g', cpus: '2.0'});
const CLIENT_RESOURCE_LIMITS = Object.freeze({memory: '256m', cpus: '0.5'});

function uniqueRunId() {
  return `lagrange-tidb-durability-${process.pid}-${randomUUID().slice(0, 8)}`;
}

function canonicalPayloadDigest(payload) {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function watchedTopology(cluster) {
  return [
    {role: 'pd', containerId: cluster.containers.pd.containerId},
    ...cluster.containers.tikvStores.map((tikv, index) => ({
      role: `tikv-${index + ONE}`,
      containerId: tikv.containerId,
    })),
    {role: 'tidb', containerId: cluster.containers.tidb.containerId},
  ];
}

async function createRestartReadinessClient(provider, state) {
  return provider.createContainer({
    name: `${state.runId}-restart-readiness`,
    image: state.cluster.images.mysqlClient,
    network: state.networkName,
    resourceLimits: CLIENT_RESOURCE_LIMITS,
    hostConfigExtras: {NetworkMode: state.networkName},
    entrypoint: ['sleep'],
    command: [READINESS_KEEPALIVE_SECONDS],
  });
}

async function waitForRestartReadiness(provider, state, readinessClient) {
  return waitForTiDbReferenceSqlReady(
    provider,
    readinessClient.containerId,
    {
      host: state.cluster.names.tidb,
      port: TIDB_REFERENCE_DEFAULTS.tidbPort,
    },
    {
      timeoutMs: READINESS_TIMEOUT_MS,
      pollIntervalMs: READINESS_POLL_INTERVAL_MS,
      watchedContainers: watchedTopology(state.cluster),
      readinessSql: buildTiDbReferenceReadinessSql(TIKV_STORE_COUNT),
    },
  );
}

async function restartPersistentTiDbTopology(provider, state) {
  const readinessClient = await createRestartReadinessClient(provider, state);
  const checkpoints = [];
  try {
    for (let index = ZERO;
      index < state.cluster.containers.tikvStores.length;
      index += ONE) {
      const tikv = state.cluster.containers.tikvStores[index];
      await provider.restartContainer(tikv.containerId);
      const readiness = await waitForRestartReadiness(
        provider,
        state,
        readinessClient,
      );
      checkpoints.push({role: `tikv-${index + ONE}`, readiness});
    }
    await provider.restartContainer(state.cluster.containers.tidb.containerId);
    const readiness = await waitForRestartReadiness(
      provider,
      state,
      readinessClient,
    );
    checkpoints.push({role: 'tidb', readiness});
    return Object.freeze(checkpoints.map((checkpoint) => Object.freeze(checkpoint)));
  } finally {
    await stopTiDbReferenceCluster(provider, [readinessClient]);
  }
}

async function cleanup(provider, state) {
  const failures = [];
  if (state.adapter) {
    try {
      await state.adapter.close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (state.cluster) {
    try {
      await state.cluster.stop();
    } catch (error) {
      failures.push(error);
    }
  }
  if (state.networkId) {
    try {
      await provider.removeNetwork(state.networkId);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > ZERO) {
    throw new AggregateError(failures, 'TiDB durability proof cleanup failed');
  }
}

async function runTiDbDurabilityProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || uniqueRunId();
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioADurabilityCase();
  const payment = buildScenarioAPaymentCase();
  const state = {
    runId,
    networkName: `${runId}-net`,
    networkId: null,
    cluster: null,
    adapter: null,
  };
  let primaryError = null;
  let evidence = null;

  try {
    const network = await provider.createNetwork(state.networkName, LABELS);
    state.networkId = network.id;
    state.cluster = await startTiDbReferenceCluster({
      provider,
      network: state.networkName,
      namePrefix: runId,
      tikvStoreCount: TIKV_STORE_COUNT,
      resourceLimits: DATABASE_RESOURCE_LIMITS,
      readinessResourceLimits: CLIENT_RESOURCE_LIMITS,
    });
    const host = String(state.cluster.containers.tidb.ip || '').trim();
    if (!host) throw new Error('TiDB durability proof requires TiDB container IP');
    const endpoint = {host, port: TIDB_REFERENCE_DEFAULTS.tidbPort};
    const databaseName =
      `lagrange_tidb_durability_${randomUUID().replace(/-/gu, '').slice(0, 12)}`;
    state.adapter = await createTiDbOltpAdapter({
      endpoint,
      databaseName,
      workload: definition.identity.workload,
    });
    if (state.adapter.datasetSha256 !== definition.identity.datasetSha256) {
      throw new Error('TiDB durability proof dataset identity mismatch');
    }

    const retryOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () =>
        state.adapter.executeTransaction(definition.identity.operation),
    });
    const paymentBeforeRestart = await observeTiDbPaymentState({
      endpoint,
      databaseName: state.adapter.databaseName,
      operation: payment.identity.operation,
    });
    const stateBeforeRestart = await observeTiDbOltpStateSnapshot({
      endpoint,
      databaseName: state.adapter.databaseName,
    });

    await state.adapter.close({dropDatabase: false});
    const restartCheckpoints = await restartPersistentTiDbTopology(provider, state);

    const paymentAfterRestart = await observeTiDbPaymentState({
      endpoint,
      databaseName: databaseName,
      operation: payment.identity.operation,
    });
    const stateAfterRestart = await observeTiDbOltpStateSnapshot({
      endpoint,
      databaseName,
    });
    const paymentObservation = Object.freeze({
      paidCents: Number(retryOutcome.result?.paidCents),
      ...paymentAfterRestart,
    });
    const evaluation = evaluateScenarioADurabilityObservation({
      commitAcknowledged: true,
      paymentObservation,
      stateBeforeRestartSha256: stateBeforeRestart.stateSha256,
      stateAfterRestartSha256: stateAfterRestart.stateSha256,
    });
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: 'tidb-durable-commit-v1',
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      operation: definition.identity.operation,
      retryEvidence: retryOutcome.evidence,
      paymentBeforeRestart,
      paymentAfterRestart,
      stateBeforeRestartSha256: stateBeforeRestart.stateSha256,
      stateAfterRestartSha256: stateAfterRestart.stateSha256,
      restartCheckpoints,
      evaluation,
      images: state.cluster.images,
      comparable: false,
      nonComparableReason:
        'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.',
    });
    const artifactSha256 = canonicalPayloadDigest(payload);
    evidence = Object.freeze({
      ...payload,
      proofRecord: Object.freeze({
        evidenceId: payload.evidenceId,
        system: payload.system,
        status: evaluation.passed ?
          OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED :
          OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.FAILED,
        artifactSha256,
        proofIds: OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
      }),
      artifactSha256,
    });
    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    if (!evaluation.passed) {
      throw new Error(
        `TiDB durability proof failed: ${evaluation.failures.join(',')}`,
      );
    }
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    await cleanup(provider, state);
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'TiDB durability proof and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return evidence;
}

async function main() {
  const evidence = await runTiDbDurabilityProof();
  process.stdout.write(
    'tidb-scenario-a-durability-live: PASS ' +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      restartCount: evidence.restartCheckpoints.length,
      retries: Number(evidence.retryEvidence?.retries || ZERO),
    }) + '\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});

export {
  runTiDbDurabilityProof,
};
