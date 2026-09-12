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
  OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
  buildScenarioARetryableConflictCase,
  evaluateScenarioARetryableConflictObservation,
} from '../../test/distributed/harness/oltp-scenario-a-retryable-conflict-case.js';
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
  induceTiDbRetryableConflict,
} from '../../test/distributed/reference-client/tidb-retryable-conflict-probe.js';

const ZERO = 0;
const ONE = 1;
const TIKV_STORE_COUNT = 3;
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_CONFLICT_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-retryable-conflict-tidb.json';
const LABELS = Object.freeze({
  'lagrange.benchmark': 'scenario-a-retryable-conflict-tidb',
});
const DATABASE_RESOURCE_LIMITS = Object.freeze({memory: '2g', cpus: '2.0'});
const CLIENT_RESOURCE_LIMITS = Object.freeze({memory: '256m', cpus: '0.5'});
const WORKLOAD = Object.freeze({
  seed: 20260912,
  workers: 1,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 1,
  warehouseCount: 1,
  districtsPerWarehouse: 1,
  customersPerDistrict: 1,
  itemCount: 15,
});

function uniqueRunId() {
  return `lagrange-tidb-conflict-${process.pid}-${randomUUID().slice(0, 8)}`;
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
    throw new AggregateError(failures, 'TiDB conflict proof cleanup failed');
  }
}

async function runTiDbRetryableConflictProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || uniqueRunId();
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioARetryableConflictCase();
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
    if (!host) throw new Error('TiDB conflict proof requires TiDB container IP');
    const endpoint = {host, port: TIDB_REFERENCE_DEFAULTS.tidbPort};
    const databaseName =
      `lagrange_tidb_conflict_${randomUUID().replace(/-/gu, '').slice(0, 12)}`;
    state.adapter = await createTiDbOltpAdapter({
      endpoint,
      databaseName,
      workload: WORKLOAD,
    });

    const probe = await induceTiDbRetryableConflict({
      endpoint,
      databaseName: state.adapter.databaseName,
    });
    const observation = Object.freeze({sqlState: probe.victim.sqlState});
    const evaluation = evaluateScenarioARetryableConflictObservation(observation);
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: 'tidb-retryable-conflict-v1',
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      observation,
      evaluation,
      victim: probe.victim,
      probeResults: probe.results,
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
        proofIds: OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
      }),
      artifactSha256,
    });
    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    if (!evaluation.passed) {
      throw new Error(
        `TiDB retryable conflict proof failed: ${evaluation.failures.join(',')}`,
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
      'TiDB conflict proof and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return evidence;
}

async function main() {
  const evidence = await runTiDbRetryableConflictProof();
  process.stdout.write(
    'tidb-scenario-a-retryable-conflict-live: PASS ' +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      sqlState: evidence.observation.sqlState,
      victimSide: evidence.victim.side,
    }) + '\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});

export {
  runTiDbRetryableConflictProof,
};
