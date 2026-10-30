#!/usr/bin/env node

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  TIDB_REFERENCE_DEFAULTS,
  buildTiDbReferenceReadinessSql,
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
import {
  cleanupTiDbLive,
  createTiDbLiveDatabaseName,
  createTiDbLiveRunId,
  finalizeLiveExecution,
  recordLiveSemanticEvidence,
  runLiveMain,
  startTiDbLiveEnvironment,
} from '../../test/distributed/harness/tidb-scenario-a-live-harness.js';

const arrayMap = Function.call.bind(Array.prototype.map);
const stringTrim = Function.call.bind(String.prototype.trim);

const SCENARIO_NAME = 'durability';
const EVIDENCE_ID = 'tidb-durability-v1';
const BENCHMARK_LABEL_KEY = 'lagrange.benchmark';
const BENCHMARK_LABEL_VALUE = 'scenario-a-durability-tidb';
const LABELS = Object.freeze({
  [BENCHMARK_LABEL_KEY]: BENCHMARK_LABEL_VALUE,
});
const DEFAULT_OUTPUT_PATH =
  'test-output/tidb-reference/scenario-a-durability-tidb.json';
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_DURABILITY_EVIDENCE_PATH || DEFAULT_OUTPUT_PATH;
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';
const PASS_PREFIX = 'tidb-scenario-a-durability-live: PASS ';
const NEWLINE = '\n';
const READINESS_SUFFIX = '-restart-readiness';
const SLEEP_COMMAND = 'sleep';
const READINESS_KEEPALIVE_SECONDS = '300';
const FAULT_TARGET_NODE_ID = 'tikv-1';
const FAULT_TARGET_ROLE = 'tikv-data-store';
const STORAGE_CONTINUITY_PRESERVED = 'preserved';
const OBLIGATION_PAYMENT_ROWS = 'committed_payment_rows';
const OBLIGATION_STATE_SHA256 = 'full_oltp_state_sha256';
const RETAINED_OBLIGATIONS = Object.freeze([
  OBLIGATION_PAYMENT_ROWS,
  OBLIGATION_STATE_SHA256,
]);
const TIDB_ROLE = 'tidb';
const PD_ROLE = 'pd';
const TIKV_PREFIX = 'tikv-';
const READINESS_TIMEOUT_MS = 120000;
const READINESS_POLL_INTERVAL_MS = 1000;
const TIKV_STORE_COUNT = 3;
const CLIENT_RESOURCE_LIMITS = Object.freeze({memory: '256m', cpus: '0.5'});

function watchedTopology(cluster) {
  return [
    {role: PD_ROLE, containerId: cluster.containers.pd.containerId},
    ...arrayMap(cluster.containers.tikvStores, (tikv, index) => ({
      role: `${TIKV_PREFIX}${index + 1}`,
      containerId: tikv.containerId,
    })),
    {role: TIDB_ROLE, containerId: cluster.containers.tidb.containerId},
  ];
}

async function createRestartReadinessClient(provider, state) {
  return provider.createContainer({
    name: `${state.runId}${READINESS_SUFFIX}`,
    image: state.cluster.images.mysqlClient,
    network: state.networkName,
    resourceLimits: CLIENT_RESOURCE_LIMITS,
    hostConfigExtras: {NetworkMode: state.networkName},
    entrypoint: [SLEEP_COMMAND],
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

async function resolveContainerIncarnation(provider, containerId) {
  if (provider && typeof provider.inspectContainer === 'function') {
    try {
      const info = await provider.inspectContainer(containerId);
      const startedAt = stringTrim(String(info?.State?.StartedAt || ''));
      const pid = info?.State?.Pid != null ? String(info.State.Pid) : '';
      if (startedAt || pid) {
        return `${containerId}:${startedAt}:${pid}`;
      }
    } catch {
      return '';
    }
  }
  return '';
}

async function restartPersistentTiDbTopology(provider, state) {
  const readinessClient = await createRestartReadinessClient(provider, state);
  const checkpoints = [];
  let faultEvidence = null;
  try {
    for (let index = 0;
      index < state.cluster.containers.tikvStores.length;
      index += 1) {
      const tikv = state.cluster.containers.tikvStores[index];
      let beforeIncarnation = '';
      if (index === 0) {
        beforeIncarnation = await resolveContainerIncarnation(
          provider,
          tikv.containerId,
        );
      }
      await provider.restartContainer(tikv.containerId);
      const readiness = await waitForRestartReadiness(
        provider,
        state,
        readinessClient,
      );
      if (index === 0) {
        const afterIncarnation = await resolveContainerIncarnation(
          provider,
          tikv.containerId,
        );
        faultEvidence = Object.freeze({
          faultTarget: Object.freeze({
            nodeId: FAULT_TARGET_NODE_ID,
            role: FAULT_TARGET_ROLE,
            isDataReplica: true,
            pgHostOnly: false,
          }),
          beforeIncarnation,
          afterIncarnation,
          storageContinuity: STORAGE_CONTINUITY_PRESERVED,
          retainedObligations: RETAINED_OBLIGATIONS,
        });
      }
      checkpoints.push({role: `${TIKV_PREFIX}${index + 1}`, readiness});
    }
    await provider.restartContainer(state.cluster.containers.tidb.containerId);
    const readiness = await waitForRestartReadiness(
      provider,
      state,
      readinessClient,
    );
    checkpoints.push({role: TIDB_ROLE, readiness});
    return {
      checkpoints: Object.freeze(
        arrayMap(checkpoints, (checkpoint) => Object.freeze(checkpoint)),
      ),
      faultEvidence,
    };
  } finally {
    await stopTiDbReferenceCluster(provider, [readinessClient]);
  }
}

async function runTiDbDurabilityProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || createTiDbLiveRunId(SCENARIO_NAME);
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioADurabilityCase();
  const paymentDefinition = buildScenarioAPaymentCase();
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
    const {endpoint} = await startTiDbLiveEnvironment({
      provider,
      state,
      runId,
      labels: LABELS,
      databaseName: createTiDbLiveDatabaseName(SCENARIO_NAME),
      workload: paymentDefinition.identity.workload,
      expectedDatasetSha256: definition.identity.datasetSha256,
    });

    const setupOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () =>
        state.adapter.executeTransaction(paymentDefinition.identity.operation),
    });
    const before = await observeTiDbOltpStateSnapshot({
      endpoint,
      databaseName: state.adapter.databaseName,
    });
    const restart = await restartPersistentTiDbTopology(provider, state);

    await state.adapter.close();
    state.adapter = await createTiDbOltpAdapter({
      endpoint,
      databaseName: state.adapter.databaseName,
      workload: paymentDefinition.identity.workload,
    });

    const after = await observeTiDbOltpStateSnapshot({
      endpoint,
      databaseName: state.adapter.databaseName,
    });
    const paymentObservation = await observeTiDbPaymentState({
      endpoint,
      databaseName: state.adapter.databaseName,
      operation: paymentDefinition.identity.operation,
    });
    const observation = Object.freeze({
      commitAcknowledged: true,
      paymentObservation: Object.freeze({
        paidCents: Number(setupOutcome.result?.paidCents),
        ...paymentObservation,
      }),
      stateBeforeRestartSha256: before.stateSha256,
      stateAfterRestartSha256: after.stateSha256,
      faultEvidence: restart.faultEvidence,
    });
    const evaluation = evaluateScenarioADurabilityObservation(observation);
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: EVIDENCE_ID,
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      setupOperation: paymentDefinition.identity.operation,
      setupRetryEvidence: setupOutcome.evidence,
      before,
      after,
      checkpoints: restart.checkpoints,
      observation,
      evaluation,
      images: state.cluster.images,
      comparable: false,
      nonComparableReason: NON_COMPARABLE_REASON,
    });
    evidence = await recordLiveSemanticEvidence({
      outputPath,
      payload,
      evaluation,
      proofIds: OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
      scenarioName: SCENARIO_NAME,
    });
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    await cleanupTiDbLive(provider, state);
  } catch (error) {
    cleanupError = error;
  }

  finalizeLiveExecution({
    primaryError,
    cleanupError,
    scenarioName: SCENARIO_NAME,
  });
  return evidence;
}

async function main() {
  const evidence = await runTiDbDurabilityProof();
  process.stdout.write(
    PASS_PREFIX +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      retries: Number(evidence.setupRetryEvidence?.retries || 0),
      checkpoints: evidence.checkpoints ?
        arrayMap(evidence.checkpoints, (checkpoint) => checkpoint.role) : [],
      statePreserved:
        evidence.observation.stateBeforeRestartSha256 ===
        evidence.observation.stateAfterRestartSha256,
      faultTarget: evidence.observation.faultEvidence?.faultTarget?.nodeId || null,
      incarnationChanged:
        Boolean(evidence.observation.faultEvidence?.beforeIncarnation) &&
        evidence.observation.faultEvidence.beforeIncarnation !==
          evidence.observation.faultEvidence?.afterIncarnation,
    }) + NEWLINE,
  );
}

runLiveMain(main);

export {
  runTiDbDurabilityProof,
};
