#!/usr/bin/env node

import {createHash, randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  TIDB_REFERENCE_DEFAULTS,
  startTiDbReferenceCluster,
} from '../../test/distributed/harness/tidb-reference-lifecycle.js';
import {
  executePairedOltpTransactionWithRetry,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
  OLTP_SCENARIO_A_STOCK_LEVEL_WORKLOAD,
  buildScenarioAStockLevelCase,
  evaluateScenarioAStockLevelObservation,
} from '../../test/distributed/harness/oltp-scenario-a-stock-level-case.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-gate.js';
import {
  createTiDbOltpAdapter,
} from '../../test/distributed/reference-client/tidb-oltp-adapter.js';
import {
  observeTiDbOltpStateSnapshot,
} from '../../test/distributed/reference-client/tidb-oltp-state-snapshot.js';

const ZERO = 0;
const ONE = 1;
const TIKV_STORE_COUNT = 3;
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_STOCK_LEVEL_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-stock-level-tidb.json';
const LABELS = Object.freeze({
  'lagrange.benchmark': 'scenario-a-stock-level-tidb',
});
const DATABASE_RESOURCE_LIMITS = Object.freeze({memory: '2g', cpus: '2.0'});
const CLIENT_RESOURCE_LIMITS = Object.freeze({memory: '256m', cpus: '0.5'});

function uniqueRunId() {
  return `lagrange-tidb-stock-level-${process.pid}-${randomUUID().slice(0, 8)}`;
}

function canonicalPayloadDigest(payload) {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
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
    throw new AggregateError(failures, 'TiDB stock-level proof cleanup failed');
  }
}

async function runTiDbStockLevelProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || uniqueRunId();
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioAStockLevelCase();
  const state = {
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
    if (!host) throw new Error('TiDB stock-level proof requires TiDB container IP');
    const endpoint = {host, port: TIDB_REFERENCE_DEFAULTS.tidbPort};
    const databaseName =
      `lagrange_tidb_stock_level_${randomUUID().replace(/-/gu, '').slice(0, 12)}`;
    state.adapter = await createTiDbOltpAdapter({
      endpoint,
      databaseName,
      workload: OLTP_SCENARIO_A_STOCK_LEVEL_WORKLOAD,
    });
    if (state.adapter.datasetSha256 !== definition.identity.datasetSha256) {
      throw new Error('TiDB stock-level proof dataset identity mismatch');
    }

    const setupOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () =>
        state.adapter.executeTransaction(definition.identity.setupOperation),
    });
    if (Number(setupOutcome.result?.orderId) !==
        definition.identity.expected.setupOrderId) {
      throw new Error('TiDB stock-level setup allocated unexpected order id');
    }

    const before = await observeTiDbOltpStateSnapshot({
      endpoint,
      databaseName: state.adapter.databaseName,
    });
    const readOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () =>
        state.adapter.executeTransaction(definition.identity.operation),
    });
    const after = await observeTiDbOltpStateSnapshot({
      endpoint,
      databaseName: state.adapter.databaseName,
    });
    const observation = Object.freeze({
      lowStock: Number(readOutcome.result?.lowStock),
      stateBeforeSha256: before.stateSha256,
      stateAfterSha256: after.stateSha256,
    });
    const evaluation = evaluateScenarioAStockLevelObservation(observation);
    const payload = Object.freeze({
      schemaVersion: ONE,
      evidenceId: 'tidb-stock-level-v1',
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      setupOperation: definition.identity.setupOperation,
      operation: definition.identity.operation,
      setupRetryEvidence: setupOutcome.evidence,
      readRetryEvidence: readOutcome.evidence,
      before,
      after,
      observation,
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
        proofIds: OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
      }),
      artifactSha256,
    });
    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    if (!evaluation.passed) {
      throw new Error(
        `TiDB stock-level semantic proof failed: ${evaluation.failures.join(',')}`,
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
      'TiDB stock-level proof and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return evidence;
}

async function main() {
  const evidence = await runTiDbStockLevelProof();
  process.stdout.write(
    'tidb-scenario-a-stock-level-live: PASS ' +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      setupRetries: Number(evidence.setupRetryEvidence?.retries || ZERO),
      readRetries: Number(evidence.readRetryEvidence?.retries || ZERO),
      lowStock: evidence.observation.lowStock,
    }) + '\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});

export {
  runTiDbStockLevelProof,
};
