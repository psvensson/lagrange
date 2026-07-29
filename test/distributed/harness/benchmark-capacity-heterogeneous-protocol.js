import {
  BENCHMARK_CAPACITY_PHASE,
} from './benchmark-capacity-protocol-constants.js';
import {
  benchmarkCapacitySamplingHasWarmup,
  getBenchmarkCapacitySamplingWindow,
} from './benchmark-capacity-preregistration.js';
import {
  createBenchmarkCapacityCacheResetReceipt,
} from './benchmark-capacity-cache-reset-receipt.js';
import {
  assertBenchmarkCapacityHeterogeneousOperationEvidence,
  assertBenchmarkCapacityHeterogeneousWindowReplay,
  createBenchmarkCapacityHeadroomReceipt,
  createBenchmarkCapacityHeterogeneousOperationReceipt,
} from './benchmark-capacity-heterogeneous-observation.js';
import {
  runBenchmarkCapacityOpenLoopWindow,
} from './benchmark-capacity-open-loop.js';
import {
  runBenchmarkCapacityProtocol,
} from './benchmark-capacity-protocol.js';
import {
  createBenchmarkCapacityWindowReceipt,
} from './benchmark-capacity-window-receipt.js';
import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isSha256Digest,
} from './benchmark-semantic-integrity.js';

const OPERATION_EVIDENCE_ENCODING_VERSION =
  'benchmark-capacity-operation-evidence-dictionary-v2';
const LAGRANGE_RUNTIME = 'wasm_component';
const POSTGRES_RUNTIME = 'postgresql_16';
const OPERATION_EVIDENCE_ENCODING_KEYS = Object.freeze([
  'version',
  'dictionary',
  'operations',
]);
const OPERATION_EVIDENCE_DICTIONARY_ENTRY_KEYS = Object.freeze([
  'digest',
  'value',
]);
const OPERATION_EVIDENCE_REFERENCE_KEYS = Object.freeze(['digest']);
const LAGRANGE_COMPACT_EVIDENCE_KEYS = Object.freeze([
  'sharedEvidence',
  'requestWitness',
  'invocationJournal',
  'durableResult',
  'durabilityDigest',
  'durabilityPassed',
  'semanticObservation',
]);
const LAGRANGE_COMPACT_REQUEST_KEYS = Object.freeze([
  'idempotencyKey',
  'intentDigest',
  'invocationIdentity',
  'requestDigest',
  'resultKeyOffset',
]);
const LAGRANGE_COMPACT_JOURNAL_KEYS = Object.freeze([
  'command',
  'created_at',
  'idempotency_key',
  'operation_id',
  'updated_at',
]);
const LAGRANGE_SHARED_EVIDENCE_KEYS = Object.freeze([
  'executableDigest',
  'requestWitness',
  'invocationJournal',
  'httpStatus',
  'semanticOracleReceipt',
  'semanticOracleDigest',
]);
const LAGRANGE_SHARED_REQUEST_KEYS = Object.freeze([
  'bindingVersionId',
  'normalizedRequest',
  'routeServiceId',
  'tenantId',
]);
const LAGRANGE_SHARED_NORMALIZED_REQUEST_KEYS = Object.freeze([
  'body',
  'headers',
  'method',
  'path',
  'query',
]);
const LAGRANGE_SHARED_REQUEST_BODY_KEYS = Object.freeze([
  'datasetDigest',
  'workloadVersion',
]);
const LAGRANGE_SHARED_JOURNAL_KEYS = Object.freeze([
  'error',
  'result',
  'state',
  'tenant_id',
]);
const LAGRANGE_SHARED_ORACLE_KEYS = Object.freeze([
  'observed',
  'passed',
  'version',
]);
const localText = Object.freeze({
  ADAPTER_PAIR_AND_OBSERVER_REQUIRED:
    'exact adapter pair and headroom observer required',
  CORRECT: 'correct',
  NOT_CONFIGURED: 'not_configured',
  OPERATION_EVIDENCE_INVALID: 'receipt:operation_evidence_invalid',
});
const delay = (durationMs) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));
const mathMax = Math.max;

function fail(reason) {
  throw new TypeError(
    `heterogeneous capacity protocol failed: ${reason}`,
  );
}

function adapterForSide(adapters, sideId) {
  for (let index = 0; index < adapters.length; index += 1) {
    if (adapters[index]?.adapterIdentity?.sideId === sideId) {
      return adapters[index];
    }
  }
  fail(`adapter missing for side ${sideId}`);
}

function dictionaryReference(dictionary, value) {
  const digest = digestBenchmarkSemanticData(value);
  for (let index = 0; index < dictionary.length; index += 1) {
    if (dictionary[index].digest === digest) return {digest};
  }
  appendOwnArrayValue(dictionary, {digest, value});
  return {digest};
}

function lagrangeSharedEvidence(evidence) {
  return {
    executableDigest: evidence.executableDigest,
    requestWitness: {
      bindingVersionId: evidence.requestWitness.bindingVersionId,
      normalizedRequest: {
        body: {
          datasetDigest:
            evidence.requestWitness.normalizedRequest.body.datasetDigest,
          workloadVersion:
            evidence.requestWitness.normalizedRequest.body.workloadVersion,
        },
        headers: evidence.requestWitness.normalizedRequest.headers,
        method: evidence.requestWitness.normalizedRequest.method,
        path: evidence.requestWitness.normalizedRequest.path,
        query: evidence.requestWitness.normalizedRequest.query,
      },
      routeServiceId: evidence.requestWitness.routeServiceId,
      tenantId: evidence.requestWitness.tenantId,
    },
    invocationJournal: {
      error: evidence.invocationJournal.error,
      result: evidence.invocationJournal.result,
      state: evidence.invocationJournal.state,
      tenant_id: evidence.invocationJournal.tenant_id,
    },
    httpStatus: evidence.httpStatus,
    semanticOracleReceipt: evidence.semanticOracleReceipt,
    semanticOracleDigest: evidence.semanticOracleDigest,
  };
}

function encodeLagrangeOperation(operation, dictionary) {
  const evidence = operation.evidence;
  const durableResult =
    dictionaryReference(dictionary, evidence.durableResult);
  const sharedEvidence =
    dictionaryReference(dictionary, lagrangeSharedEvidence(evidence));
  return {
    ...operation,
    evidence: {
      sharedEvidence,
      requestWitness: {
        idempotencyKey: evidence.requestWitness.idempotencyKey,
        intentDigest: evidence.requestWitness.intentDigest,
        invocationIdentity: evidence.requestWitness.invocationIdentity,
        requestDigest: evidence.requestWitness.requestDigest,
        resultKeyOffset:
          evidence.requestWitness.normalizedRequest.body.resultKeyOffset,
      },
      invocationJournal: {
        command: evidence.invocationJournal.command,
        created_at: evidence.invocationJournal.created_at,
        idempotency_key: evidence.invocationJournal.idempotency_key,
        operation_id: evidence.invocationJournal.operation_id,
        updated_at: evidence.invocationJournal.updated_at,
      },
      durableResult,
      durabilityDigest: evidence.durabilityDigest,
      durabilityPassed: evidence.durabilityPassed,
      semanticObservation: evidence.semanticObservation,
    },
  };
}

function encodePostgresqlOperation(operation, dictionary) {
  const evidence = operation.evidence;
  return {
    ...operation,
    evidence: {
      ...evidence,
      durableResultJson:
        dictionaryReference(dictionary, evidence.durableResultJson),
      topMovies: dictionaryReference(dictionary, evidence.topMovies),
    },
  };
}

export function encodeBenchmarkCapacityHeterogeneousOperationEvidence(
  operations,
  runtimeKind,
) {
  const dictionary = [];
  const encoded = [];
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    let value = operation;
    if (operation.status === localText.CORRECT) {
      if (runtimeKind === LAGRANGE_RUNTIME) {
        value = encodeLagrangeOperation(operation, dictionary);
      } else if (runtimeKind === POSTGRES_RUNTIME) {
        value = encodePostgresqlOperation(operation, dictionary);
      } else {
        fail(localText.OPERATION_EVIDENCE_INVALID);
      }
    }
    appendOwnArrayValue(encoded, value);
  }
  return {
    version: OPERATION_EVIDENCE_ENCODING_VERSION,
    dictionary,
    operations: encoded,
  };
}

function operationEvidenceDictionary(encoding) {
  if (
    !hasExactOwnDataKeys(encoding, OPERATION_EVIDENCE_ENCODING_KEYS) ||
    encoding.version !== OPERATION_EVIDENCE_ENCODING_VERSION ||
    !isDenseDataArray(encoding.dictionary) ||
    !isDenseDataArray(encoding.operations)
  ) {
    fail(localText.OPERATION_EVIDENCE_INVALID);
  }
  const used = new Array(encoding.dictionary.length);
  for (let index = 0; index < encoding.dictionary.length; index += 1) {
    const entry = encoding.dictionary[index];
    if (
      !hasExactOwnDataKeys(
        entry,
        OPERATION_EVIDENCE_DICTIONARY_ENTRY_KEYS,
      ) ||
      !isSha256Digest(entry.digest) ||
      digestBenchmarkSemanticData(entry.value) !== entry.digest
    ) {
      fail(localText.OPERATION_EVIDENCE_INVALID);
    }
    used[index] = false;
  }
  return used;
}

function resolveOperationEvidenceReference(reference, encoding, used) {
  if (
    !hasExactOwnDataKeys(reference, OPERATION_EVIDENCE_REFERENCE_KEYS) ||
    !isSha256Digest(reference.digest)
  ) {
    fail(localText.OPERATION_EVIDENCE_INVALID);
  }
  let value;
  let match = -1;
  for (let index = 0; index < encoding.dictionary.length; index += 1) {
    if (encoding.dictionary[index].digest === reference.digest) {
      if (match !== -1) fail(localText.OPERATION_EVIDENCE_INVALID);
      match = index;
      value = encoding.dictionary[index].value;
    }
  }
  if (match === -1) fail(localText.OPERATION_EVIDENCE_INVALID);
  used[match] = true;
  return value;
}

function assertEncodingRecord(value, keys) {
  if (!hasExactOwnDataKeys(value, keys)) {
    fail(localText.OPERATION_EVIDENCE_INVALID);
  }
}

function assertLagrangeSharedEvidence(shared) {
  assertEncodingRecord(shared, LAGRANGE_SHARED_EVIDENCE_KEYS);
  assertEncodingRecord(
    shared.requestWitness,
    LAGRANGE_SHARED_REQUEST_KEYS,
  );
  assertEncodingRecord(
    shared.requestWitness.normalizedRequest,
    LAGRANGE_SHARED_NORMALIZED_REQUEST_KEYS,
  );
  assertEncodingRecord(
    shared.requestWitness.normalizedRequest.body,
    LAGRANGE_SHARED_REQUEST_BODY_KEYS,
  );
  assertEncodingRecord(
    shared.invocationJournal,
    LAGRANGE_SHARED_JOURNAL_KEYS,
  );
  assertEncodingRecord(
    shared.semanticOracleReceipt,
    LAGRANGE_SHARED_ORACLE_KEYS,
  );
}

function decodeLagrangeOperation(operation, encoding, used) {
  const compact = operation.evidence;
  assertEncodingRecord(compact, LAGRANGE_COMPACT_EVIDENCE_KEYS);
  assertEncodingRecord(
    compact.requestWitness,
    LAGRANGE_COMPACT_REQUEST_KEYS,
  );
  assertEncodingRecord(
    compact.invocationJournal,
    LAGRANGE_COMPACT_JOURNAL_KEYS,
  );
  const shared = resolveOperationEvidenceReference(
    compact.sharedEvidence,
    encoding,
    used,
  );
  assertLagrangeSharedEvidence(shared);
  return {
    ...operation,
    evidence: {
      executableDigest: shared.executableDigest,
      requestWitness: {
        bindingVersionId: shared.requestWitness.bindingVersionId,
        idempotencyKey: compact.requestWitness.idempotencyKey,
        intentDigest: compact.requestWitness.intentDigest,
        invocationIdentity: compact.requestWitness.invocationIdentity,
        normalizedRequest: {
          body: {
            ...shared.requestWitness.normalizedRequest.body,
            resultKeyOffset: compact.requestWitness.resultKeyOffset,
          },
          headers: shared.requestWitness.normalizedRequest.headers,
          method: shared.requestWitness.normalizedRequest.method,
          path: shared.requestWitness.normalizedRequest.path,
          query: shared.requestWitness.normalizedRequest.query,
        },
        requestDigest: compact.requestWitness.requestDigest,
        routeServiceId: shared.requestWitness.routeServiceId,
        tenantId: shared.requestWitness.tenantId,
      },
      invocationJournal: {
        command: compact.invocationJournal.command,
        created_at: compact.invocationJournal.created_at,
        error: shared.invocationJournal.error,
        idempotency_key: compact.invocationJournal.idempotency_key,
        operation_id: compact.invocationJournal.operation_id,
        result: shared.invocationJournal.result,
        state: shared.invocationJournal.state,
        tenant_id: shared.invocationJournal.tenant_id,
        updated_at: compact.invocationJournal.updated_at,
      },
      httpStatus: shared.httpStatus,
      durableResult: resolveOperationEvidenceReference(
        compact.durableResult,
        encoding,
        used,
      ),
      semanticOracleReceipt: shared.semanticOracleReceipt,
      durabilityDigest: compact.durabilityDigest,
      durabilityPassed: compact.durabilityPassed,
      semanticObservation: compact.semanticObservation,
      semanticOracleDigest: shared.semanticOracleDigest,
    },
  };
}

function decodePostgresqlOperation(operation, encoding, used) {
  return {
    ...operation,
    evidence: {
      ...operation.evidence,
      durableResultJson: resolveOperationEvidenceReference(
        operation.evidence.durableResultJson,
        encoding,
        used,
      ),
      topMovies: resolveOperationEvidenceReference(
        operation.evidence.topMovies,
        encoding,
        used,
      ),
    },
  };
}

export function decodeBenchmarkCapacityHeterogeneousOperationEvidence(
  encoding,
  runtimeKind,
) {
  const used = operationEvidenceDictionary(encoding);
  const operations = [];
  for (let index = 0; index < encoding.operations.length; index += 1) {
    const operation = encoding.operations[index];
    let value = operation;
    if (operation?.status === localText.CORRECT) {
      if (runtimeKind === LAGRANGE_RUNTIME) {
        value = decodeLagrangeOperation(operation, encoding, used);
      } else if (runtimeKind === POSTGRES_RUNTIME) {
        value = decodePostgresqlOperation(operation, encoding, used);
      } else {
        fail(localText.OPERATION_EVIDENCE_INVALID);
      }
    }
    appendOwnArrayValue(operations, value);
  }
  for (let index = 0; index < used.length; index += 1) {
    if (!used[index]) fail(localText.OPERATION_EVIDENCE_INVALID);
  }
  return operations;
}

export function assertBenchmarkCapacityEncodedOperationEvidenceReplay(
  plan,
  window,
  liveEvidence,
) {
  if (plan === null) return;
  const operationEvidence =
    decodeBenchmarkCapacityHeterogeneousOperationEvidence(
      liveEvidence.encodedOperationEvidence,
      liveEvidence.heterogeneousOperationReceipt.adapterIdentity.runtimeKind,
    );
  assertBenchmarkCapacityHeterogeneousWindowReplay(
    plan,
    window,
    {...liveEvidence, operationEvidence},
  );
}

function semanticDialectForSide(preregistration, sideId) {
  for (let index = 0;
    index < preregistration.sideSemanticContracts.length;
    index += 1) {
    const contract = preregistration.sideSemanticContracts[index];
    if (contract.sideId === sideId) return contract.dialect;
  }
  fail(`semantic contract missing for side ${sideId}`);
}

async function coverWallWindow(startedAt, sample) {
  const remaining =
    sample.observationDurationMs - (Date.now() - startedAt);
  if (remaining > 0) await delay(remaining);
  let endedAt = Date.now();
  if (endedAt <= startedAt) {
    await delay(1);
    endedAt = Date.now();
  }
  return endedAt;
}

async function executeWindow({
  adapter,
  preregistration,
  context,
  phase,
  beginResourceObservation,
  completeResourceObservation,
}) {
  const samplingWindow = getBenchmarkCapacitySamplingWindow(
    preregistration,
    context.offeredLoadPerSecond,
  );
  const duration = phase === BENCHMARK_CAPACITY_PHASE.WARMUP ?
    samplingWindow.warmupMs :
    samplingWindow.measuredMs;
  const adapterContext = {
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    offeredLoadPerSecond: context.offeredLoadPerSecond,
    phase,
  };
  const resourceObservation =
    await beginResourceObservation(adapterContext);
  adapter.beginWindow(adapterContext);
  const wallStartedAt = Date.now();
  const sample = await runBenchmarkCapacityOpenLoopWindow({
    sideId: context.sideId,
    phase,
    blockIndex: context.blockIndex,
    offeredLoadPerSecond: context.offeredLoadPerSecond,
    windowDurationMs: duration,
    operationTimeoutMs:
      preregistration.sampling.operationTimeoutMs,
    semanticFinalizerTimeoutMs:
      preregistration.sampling.semanticFinalizerTimeoutMs,
    maxReleaseLagMs:
      preregistration.sampling.maxReleaseLagMs,
    clientMaxInFlight:
      preregistration.sampling.clientMaxInFlight,
    clientMaxQueueDepth:
      preregistration.sampling.clientMaxQueueDepth,
    semanticDialect:
      semanticDialectForSide(preregistration, context.sideId),
    signal: null,
    executeOperation: adapter.executeOperation,
    finalizeSemanticReceipt: adapter.finalizeSemanticReceipt,
  });
  await coverWallWindow(wallStartedAt, sample);
  const adapterEvidence = adapter.completeWindow();
  const observation = await completeResourceObservation({
    resourceObservation,
    adapterIdentity: adapter.adapterIdentity,
    adapterEvidence,
    context: adapterContext,
    sample,
  });
  const headroom = createBenchmarkCapacityHeadroomReceipt(
    observation.headroom,
    sample,
  );
  const engagement =
    createBenchmarkCapacityHeterogeneousOperationReceipt({
      adapterIdentity: adapter.adapterIdentity,
      sample,
      window: {
        blockedOrderIndex: context.blockedOrderIndex,
        startedAt: observation.startedAt,
        endedAt: observation.endedAt,
      },
      ownerReceipt: adapterEvidence.ownerReceipt,
      headroom,
      preregistration,
    });
  if (
    adapter.adapterIdentity.runtimeKind === LAGRANGE_RUNTIME ||
    adapter.adapterIdentity.runtimeKind === POSTGRES_RUNTIME
  ) {
    assertBenchmarkCapacityHeterogeneousOperationEvidence(
      engagement,
      adapterEvidence.operationEvidence,
      sample.semanticReceipt,
      adapterEvidence.runtimeOwnerEvidence,
    );
  }
  const receipt = createBenchmarkCapacityWindowReceipt(
    {
      blockIndex: context.blockIndex,
      blockedOrderIndex: context.blockedOrderIndex,
      sideId: context.sideId,
      phase,
      offeredLoad: context.offeredLoadPerSecond,
      startedAt: observation.startedAt,
      endedAt: observation.endedAt,
      capacitySampleDigest: sample.sampleDigest,
      semanticReceiptDigest: sample.semanticReceiptDigest,
      liveEngagementDigest: engagement.receiptDigest,
      resourceWindowDigest: null,
    },
    sample,
    preregistration,
  );
  return {
    sample,
    receipt,
    engagement,
    adapterEvidence,
    headroom,
    resourceObservation,
  };
}

function createResetExecutor(preregistration, adapters, resets) {
  return async (context) => {
    const adapter = adapterForSide(adapters, context.sideId);
    const startedAt = Date.now();
    const reset = await adapter.resetRunState(context);
    const endedAt = mathMax(Date.now(), startedAt + 1);
    const receipt = createBenchmarkCapacityCacheResetReceipt(
      {
        blockIndex: context.blockIndex,
        blockedOrderIndex: context.blockedOrderIndex,
        sideId: context.sideId,
        offeredLoad: context.offeredLoadPerSecond,
        startedAt,
        endedAt,
        policy: preregistration.cachePolicy,
        liveEngagementDigest: reset.resetDigest,
      },
      preregistration,
    );
    appendOwnArrayValue(resets, {reset, receipt});
    return receipt;
  };
}

function createWindowExecutor({
  preregistration,
  adapters,
  windows,
  beginResourceObservation,
  completeResourceObservation,
}) {
  return async (context) => {
    const adapter = adapterForSide(adapters, context.sideId);
    let warmup = localText.NOT_CONFIGURED;
    if (benchmarkCapacitySamplingHasWarmup(preregistration)) {
      warmup = await executeWindow({
        adapter,
        preregistration,
        context,
        phase: BENCHMARK_CAPACITY_PHASE.WARMUP,
        beginResourceObservation,
        completeResourceObservation,
      });
      appendOwnArrayValue(windows, warmup);
    }
    const measured = await executeWindow({
      adapter,
      preregistration,
      context,
      phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
      beginResourceObservation,
      completeResourceObservation,
    });
    appendOwnArrayValue(windows, measured);
    return {
      warmup:
        warmup === localText.NOT_CONFIGURED ?
          localText.NOT_CONFIGURED :
          warmup.sample,
      measured: measured.sample,
      warmupWindowReceipt:
        warmup === localText.NOT_CONFIGURED ?
          localText.NOT_CONFIGURED :
          warmup.receipt,
      measuredWindowReceipt: measured.receipt,
    };
  };
}

export async function runBenchmarkCapacityHeterogeneousProtocol({
  preregistration,
  adapters,
  beginResourceObservation,
  completeResourceObservation,
}) {
  if (
    !isDenseDataArray(adapters) ||
    adapters.length !== preregistration.sideIds.length ||
    typeof beginResourceObservation !== 'function' ||
    typeof completeResourceObservation !== 'function'
  ) {
    fail(localText.ADAPTER_PAIR_AND_OBSERVER_REQUIRED);
  }
  const windows = [];
  const resets = [];
  const report = await runBenchmarkCapacityProtocol({
    preregistration,
    resetRunState:
      createResetExecutor(preregistration, adapters, resets),
    executeRun: createWindowExecutor({
      preregistration,
      adapters,
      windows,
      beginResourceObservation,
      completeResourceObservation,
    }),
  });
  return {report, windows, resets};
}
