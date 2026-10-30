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
  OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
  OLTP_SCENARIO_A_DELIVERY_WORKLOAD,
  buildScenarioADeliveryCase,
  evaluateScenarioADeliveryObservation,
} from '../../test/distributed/harness/oltp-scenario-a-delivery-case.js';
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
  observeTiDbDeliveryState,
} from '../../test/distributed/reference-client/tidb-delivery-observer.js';

const ZERO = 0;
const ONE = 1;
const TIKV_STORE_COUNT = 3;
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_DELIVERY_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-delivery-tidb.json';
const LABELS = Object.freeze({
  'lagrange.benchmark': 'scenario-a-delivery-tidb',
});
const DATABASE_RESOURCE_LIMITS = Object.freeze({memory: '2g', cpus: '2.0'});
const CLIENT_RESOURCE_LIMITS = Object.freeze({memory: '256m', cpus: '0.5'});

function uniqueRunId() {
  return `lagrange-tidb-delivery-${process.pid}-${randomUUID().slice(0, 8)}`;
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
    throw new AggregateError(failures, 'TiDB delivery proof cleanup failed');
  }
}

async function runTiDbDeliveryProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || uniqueRunId();
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioADeliveryCase();
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
    if (!host) throw new Error('TiDB delivery proof requires TiDB container IP');
    const endpoint = {host, port: TIDB_REFERENCE_DEFAULTS.tidbPort};
    const databaseName =
      `lagrange_tidb_delivery_${randomUUID().replace(/-/gu, '').slice(0, 12)}`;
    state.adapter = await createTiDbOltpAdapter({
      endpoint,
      databaseName,
      workload: OLTP_SCENARIO_A_DELIVERY_WORKLOAD,
    });
    if (state.adapter.datasetSha256 !== definition.identity.datasetSha256) {
      throw new Error('TiDB delivery proof dataset identity mismatch');
    }

    const setupRetryEvidence = [];
    for (const setupOperation of definition.identity.setupOperations) {
      const setupOutcome = await executePairedOltpTransactionWithRetry({
        executeAttempt: () => state.adapter.executeTransaction(setupOperation),
      });
      const expectedDistrict = definition.identity.expected.districts.find(
        ({districtId}) => districtId === setupOperation.districtId,
      );
      if (!expectedDistrict ||
          Number(setupOutcome.result?.orderId) !== expectedDistrict.orderId) {
        throw new Error(
          'TiDB delivery setup allocated unexpected order id for district ' +
          `${setupOperation.districtId}`,
        );
      }
      setupRetryEvidence.push(setupOutcome.evidence);
    }

    const deliveryOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () =>
        state.adapter.executeTransaction(definition.identity.operation),
    });
    const observed = await observeTiDbDeliveryState({
      endpoint,
      databaseName: state.adapter.databaseName,
      warehouseId: definition.identity.operation.warehouseId,
      districts: definition.identity.expected.districts,
    });
    const observation = Object.freeze({
      deliveredOrders: Number(deliveryOutcome.result?.deliveredOrders),
      districts: observed.districts,
    });
    const evaluation = evaluateScenarioADeliveryObservation(observation);
    const payload = Object.freeze({
      schemaVersion: ONE,
      evidenceId: 'tidb-delivery-v1',
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      setupOperations: definition.identity.setupOperations,
      operation: definition.identity.operation,
      setupRetryEvidence: Object.freeze(setupRetryEvidence),
      deliveryRetryEvidence: deliveryOutcome.evidence,
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
        proofIds: OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
      }),
      artifactSha256,
    });
    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    if (!evaluation.passed) {
      throw new Error(
        `TiDB delivery semantic proof failed: ${evaluation.failures.join(',')}`,
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
      'TiDB delivery proof and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return evidence;
}

async function main() {
  const evidence = await runTiDbDeliveryProof();
  process.stdout.write(
    'tidb-scenario-a-delivery-live: PASS ' +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      setupRetries: evidence.setupRetryEvidence.map(
        (entry) => Number(entry?.retries || ZERO),
      ),
      deliveryRetries: Number(evidence.deliveryRetryEvidence?.retries || ZERO),
      deliveredOrders: evidence.observation.deliveredOrders,
    }) + '\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});

export {
  runTiDbDeliveryProof,
};
