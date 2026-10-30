import {createHash, randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  TIDB_REFERENCE_DEFAULTS,
  startTiDbReferenceCluster,
} from './tidb-reference-lifecycle.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
} from './oltp-scenario-a-semantic-gate.js';
import {
  createTiDbOltpAdapter,
} from '../reference-client/tidb-oltp-adapter.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringTrim = Function.call.bind(String.prototype.trim);

const DATABASE_RESOURCE_LIMITS = Object.freeze({memory: '2g', cpus: '2.0'});
const CLIENT_RESOURCE_LIMITS = Object.freeze({memory: '256m', cpus: '0.5'});
const TIKV_STORE_COUNT = 3;
const HASH_ALGORITHM = 'sha256';
const HASH_DIGEST_ENCODING = 'hex';
const FILE_ENCODING = 'utf8';
const JSON_INDENT = 2;
const ZERO = 0;
const ONE = 1;

function createTiDbLiveRunId(label) {
  const shortId = stringSlice(randomUUID(), ZERO, 8);
  return `lagrange-tidb-${label}-${process.pid}-${shortId}`;
}

function createTiDbLiveDatabaseName(label) {
  const cleanLabel = stringReplace(String(label || ''), /[^a-zA-Z0-9_]/gu, '_');
  const cleanId = stringSlice(stringReplace(randomUUID(), /-/gu, ''), ZERO, 12);
  return `lagrange_tidb_${cleanLabel}_${cleanId}`;
}

function canonicalPayloadDigest(payload) {
  return createHash(HASH_ALGORITHM)
    .update(JSON.stringify(payload))
    .digest(HASH_DIGEST_ENCODING);
}

async function cleanupTiDbLive(provider, state) {
  const cleanupErrors = [];
  if (state?.adapter) {
    try {
      await state.adapter.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (state?.cluster) {
    try {
      await state.cluster.stop();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (state?.networkId && provider) {
    try {
      await provider.removeNetwork(state.networkId);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length > ZERO) {
    throw new AggregateError(cleanupErrors, 'TiDB live cleanup failed');
  }
}

async function startTiDbLiveEnvironment({
  provider,
  state,
  runId,
  labels,
  databaseName,
  workload,
  expectedDatasetSha256,
}) {
  const network = await provider.createNetwork(state.networkName, labels);
  state.networkId = network.id;
  state.cluster = await startTiDbReferenceCluster({
    provider,
    network: state.networkName,
    namePrefix: runId,
    tikvStoreCount: TIKV_STORE_COUNT,
    resourceLimits: DATABASE_RESOURCE_LIMITS,
    readinessResourceLimits: CLIENT_RESOURCE_LIMITS,
  });

  const host = stringTrim(String(state.cluster.containers.tidb.ip || ''));
  if (!host) {
    throw new Error('TiDB live harness requires TiDB container IP');
  }
  const endpoint = Object.freeze({
    host,
    port: TIDB_REFERENCE_DEFAULTS.tidbPort,
  });
  state.adapter = await createTiDbOltpAdapter({
    endpoint,
    databaseName,
    workload,
  });

  if (expectedDatasetSha256 &&
      state.adapter.datasetSha256 !== expectedDatasetSha256) {
    throw new Error('TiDB live harness dataset identity mismatch');
  }

  return {endpoint, databaseName};
}

async function recordLiveSemanticEvidence({
  outputPath,
  payload,
  evaluation,
  proofIds,
  scenarioName,
}) {
  const artifactSha256 = canonicalPayloadDigest(payload);
  const evidence = Object.freeze({
    ...payload,
    proofRecord: Object.freeze({
      evidenceId: payload.evidenceId,
      system: payload.system,
      status: evaluation.passed ?
        OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED :
        OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.FAILED,
      artifactSha256,
      proofIds,
    }),
    artifactSha256,
  });

  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(
    outputPath,
    JSON.stringify(evidence, null, JSON_INDENT) + '\n',
    FILE_ENCODING,
  );

  if (!evaluation.passed) {
    const failureSummary = arrayJoin(evaluation.failures || [], ',');
    throw new Error(
      `TiDB ${scenarioName} semantic proof failed: ${failureSummary}`,
    );
  }

  return evidence;
}

function finalizeLiveExecution({primaryError, cleanupError, scenarioName}) {
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      `TiDB ${scenarioName} proof and cleanup both failed`,
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
}

function runLiveMain(main) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = ONE;
  });
}

export {
  cleanupTiDbLive,
  createTiDbLiveDatabaseName,
  createTiDbLiveRunId,
  finalizeLiveExecution,
  recordLiveSemanticEvidence,
  runLiveMain,
  startTiDbLiveEnvironment,
};
