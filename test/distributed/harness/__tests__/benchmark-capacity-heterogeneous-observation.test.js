import assert from 'node:assert/strict';
import test from 'node:test';

import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  createBenchmarkCapacityRunSample,
} from '../benchmark-capacity-run-sample.js';
import {
  buildBenchmarkResultSetEvidence,
  buildBenchmarkSemanticReceipt,
} from '../benchmark-workload-semantics.js';
import {
  assertBenchmarkCapacityHeterogeneousOperationEvidence,
  assertBenchmarkCapacityHeterogeneousOperationReceipt,
  createBenchmarkCapacityAdapterIdentity,
  createBenchmarkCapacityAdapterOwnerReceipt,
  createBenchmarkCapacityHeadroomReceipt,
  createBenchmarkCapacityHeterogeneousOperationReceipt,
  inspectBenchmarkCapacityHeterogeneousOperationReceipt,
} from '../benchmark-capacity-heterogeneous-observation.js';
import {
  replacePrototypeProperty,
  withHostileIntrinsics,
} from '../../../helpers/hostile-intrinsics.js';
import {
  createBenchmarkCapacityWindowReceipt,
} from '../benchmark-capacity-window-receipt.js';
import {
  getBenchmarkCapacitySamplingWindow,
  sealBenchmarkCapacityPreregistration,
} from '../benchmark-capacity-preregistration.js';
import {
  BENCHMARK_CAPACITY_PHASE,
} from '../benchmark-capacity-protocol-constants.js';
import {
  preregistrationInput,
  semanticReceiptForCounts,
  SIDE_LAGRANGE,
  inputFromSample,
  successfulRunSample,
} from './benchmark-capacity-protocol-test-fixture.js';

const POSTGRESQL_QUERY_SQL = 'SELECT grouped_reduce FROM ratings';

function operationManifest(datasetDigest) {
  return {
    version: 'movielens-capacity-operation-manifest-v2',
    datasetDigest,
    lagrangePublicRequest: {
      method: 'POST',
      path: '/benchmarks/movielens/grouped-reduce',
    },
    postgresqlQuerySqlDigest:
      digestBenchmarkSemanticData(POSTGRESQL_QUERY_SQL),
    result: 'confidence_adjusted_top_ten',
    durability:
      'input_preserved_and_result_visible_after_completion',
  };
}

function fixture() {
  const preregistration =
    sealBenchmarkCapacityPreregistration(preregistrationInput({
      offeredLoadPerSecond: [100],
      repetitions: {minimum: 3, maximum: 3},
    }));
  const baseSample = successfulRunSample({
    sideId: SIDE_LAGRANGE,
    phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
    blockIndex: 0,
    offeredLoadPerSecond: 100,
    windowDurationMs: getBenchmarkCapacitySamplingWindow(
      preregistration,
      100,
    ).measuredMs,
    p99LatencyMs: 20,
    preregistration,
  });
  const ranking = Array.from({length: 10}, (_, index) => ({
    movieId: index + 1,
    rank: index + 1,
    scoreMicros: 5_000_000 - index * 100_000,
  }));
  const semanticOracleDigest = digestBenchmarkSemanticData(ranking);
  const observations = Array.from(
    {length: baseSample.counts.correct},
    (_, operationId) => ({
      operationId,
      operation: 'SELECT',
      outcome: Number.parseInt(
        semanticOracleDigest.slice(7, 19),
        16,
      ),
    }),
  );
  const semanticReceipt = buildBenchmarkSemanticReceipt({
    dialect: baseSample.semanticDialect,
    compiledOperations: baseSample.counts.dispatched,
    validatedOperations: baseSample.counts.correct,
    successfulOperations: baseSample.counts.correct,
    oracleFailures: 0,
    resultSet: buildBenchmarkResultSetEvidence(observations),
    accounting: {
      ...baseSample.counts,
      rejectedByReason: {...baseSample.rejectedByReason},
    },
    durability: {
      status: 'pass',
      expected: baseSample.counts.correct,
      observed: baseSample.counts.correct,
      missingIds: [],
      reason: null,
    },
  });
  const sample = createBenchmarkCapacityRunSample(
    inputFromSample(baseSample, {semanticReceipt}),
  );
  const datasetDigest =
    digestBenchmarkSemanticData({dataset: 'fixture'});
  const runtimeOwnerEvidence = {
    version: 'movielens-lagrange-runtime-owner-evidence-v2',
    bindingName: 'movielens-public-grouped-reduce',
    bindingVersionId: 'binding-version-v1',
    datasetDigest,
    executableDigest: digestBenchmarkSemanticData({wasm: 'fixture'}),
    routeServiceId: 'service-v1',
    runtimeKind: 'wasm_component',
    semanticOracleExpected: ranking,
    operationManifest: operationManifest(datasetDigest),
  };
  const adapterIdentity = createBenchmarkCapacityAdapterIdentity({
    adapterId: 'movielens-lagrange-public-request',
    adapterVersion: 'v1',
    sideId: SIDE_LAGRANGE,
    runtimeKind: 'wasm_component',
    invocationBoundary: 'authenticated_http_request_binding',
    operationManifestDigest:
      digestBenchmarkSemanticData(
        runtimeOwnerEvidence.operationManifest,
      ),
    executableDigest: runtimeOwnerEvidence.executableDigest,
    ownerEvidenceDigest:
      digestBenchmarkSemanticData(runtimeOwnerEvidence),
  });
  const operationIds = [];
  const operationEvidence = [];
  for (let index = 0; index < sample.counts.correct; index += 1) {
    operationIds.push(`request-${index}`);
    const tenantId = 'fixture';
    const body = {
      datasetDigest: runtimeOwnerEvidence.datasetDigest,
      resultKeyOffset: index * 10,
      workloadVersion: 'movielens-public-request-workload-v1',
    };
    const normalizedRequest = {
      body,
      headers: {
        'accept': '*/*',
        'content-type': 'application/json',
      },
      method: 'POST',
      path: '/benchmarks/movielens/grouped-reduce',
      query: {},
    };
    const invocationIdentity =
      `request-invocation-${digestBenchmarkSemanticData({
        requestKey: operationIds[index],
        tenantId,
      }).slice(7)}`;
    const requestDigest =
      digestBenchmarkSemanticData(normalizedRequest);
    const intentDigest = digestBenchmarkSemanticData({
      bindingVersionId: runtimeOwnerEvidence.bindingVersionId,
      method: normalizedRequest.method,
      path: normalizedRequest.path,
      requestDigest,
      tenantId,
    });
    const journalOperationId =
      `request-cell-operation-${digestBenchmarkSemanticData([
        tenantId,
        invocationIdentity,
      ]).slice(7)}`;
    const journalCommand =
      `invoke:${runtimeOwnerEvidence.routeServiceId}:${intentDigest}`;
    const invocationJournal = {
      command: journalCommand,
      created_at: '2026-07-28T00:00:00.000Z',
      error: '{}',
      idempotency_key: invocationIdentity,
      operation_id: journalOperationId,
      result: JSON.stringify(JSON.stringify({
        body: 'MovieLens grouped reduce completed',
        headers: [[
          'x-lagrange-cell',
          runtimeOwnerEvidence.bindingName,
        ]],
        status: 200,
      })),
      state: 'completed',
      tenant_id: tenantId,
      updated_at: '2026-07-28T00:00:00.001Z',
    };
    const durableResult = {
      movieRows: ranking.map((row) => ({
        key: row.rank,
        value: row.movieId,
      })),
      scoreRows: ranking.map((row) => ({
        key: row.rank,
        value: row.scoreMicros,
      })),
    };
    operationEvidence.push({
      status: 'correct',
      operationIndex: index,
      operationId: operationIds[index],
      evidence: {
        executableDigest: runtimeOwnerEvidence.executableDigest,
        requestWitness: {
          bindingVersionId: runtimeOwnerEvidence.bindingVersionId,
          idempotencyKey: operationIds[index],
          intentDigest,
          invocationIdentity,
          normalizedRequest,
          requestDigest,
          routeServiceId: runtimeOwnerEvidence.routeServiceId,
          tenantId,
        },
        invocationJournal,
        httpStatus: 200,
        durableResult,
        semanticOracleReceipt: {
          observed: ranking,
          passed: true,
          version: 'confidence-adjusted-top-ten-v1',
        },
        semanticOracleDigest,
        durabilityPassed: true,
        durabilityDigest: digestBenchmarkSemanticData({
          datasetDigest: runtimeOwnerEvidence.datasetDigest,
          durableResult,
          invocationJournal,
        }),
        semanticObservation: observations[index],
      },
    });
  }
  const blockedOrderIndex =
    preregistration.blockedPairOrders[0].indexOf(SIDE_LAGRANGE);
  const window = {
    blockedOrderIndex,
    startedAt: 1_800_000_000_000,
    endedAt: 1_800_000_001_000,
  };
  const ownerReceipt = createBenchmarkCapacityAdapterOwnerReceipt({
    adapterIdentity,
    operationIds,
    evidenceDigest: digestBenchmarkSemanticData({
      adapterIdentityDigest: adapterIdentity.adapterIdentityDigest,
      coordinate: {
        blockIndex: sample.blockIndex,
        blockedOrderIndex,
        sideId: sample.sideId,
        offeredLoadPerSecond: sample.offeredLoadPerSecond,
        phase: sample.phase,
      },
      semanticOracleDigest,
      operations: operationEvidence,
    }),
    semanticOracleDigest,
  });
  const headroom = createBenchmarkCapacityHeadroomReceipt({
    minimumRequiredRatio: 0.1,
    observerCpu: {capacity: 100, observedPeak: 5},
    hostCpu: {capacity: 16, observedPeak: 4},
    hostMemory: {capacity: 64_000, observedPeak: 16_000},
    sharedNetwork: {capacity: 10_000, observedPeak: 2_000},
    sharedStorage: {capacity: 10_000, observedPeak: 1_000},
  }, sample);
  const receipt = createBenchmarkCapacityHeterogeneousOperationReceipt({
    preregistration,
    sample,
    adapterIdentity,
    ownerReceipt,
    window,
    headroom,
  });
  const windowReceipt = createBenchmarkCapacityWindowReceipt(
    {
      blockIndex: 0,
      blockedOrderIndex,
      sideId: SIDE_LAGRANGE,
      phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
      offeredLoad: 100,
      startedAt: 1_800_000_000_000,
      endedAt: 1_800_000_001_000,
      capacitySampleDigest: sample.sampleDigest,
      semanticReceiptDigest: sample.semanticReceiptDigest,
      liveEngagementDigest: receipt.receiptDigest,
      resourceWindowDigest: null,
    },
    sample,
    preregistration,
  );
  return {
    preregistration,
    sample,
    adapterIdentity,
    ownerReceipt,
    operationEvidence,
    runtimeOwnerEvidence,
    receipt,
    window,
    windowReceipt,
    headroom,
  };
}

function zeroCorrectFixture() {
  const value = fixture();
  const counts = {
    ...value.sample.counts,
    correct: 0,
    errored: value.sample.counts.dispatched,
  };
  const sample = createBenchmarkCapacityRunSample(inputFromSample(
    value.sample,
    {
      counts,
      endToEndLatencyMs: [],
      clientQueueDelayMs: value.sample.clientQueueDelayMs,
      semanticReceipt: null,
    },
  ));
  const operationEvidence = Array.from(
    {length: sample.counts.dispatched},
    (_unused, operationIndex) => ({
      status: 'errored',
      operationIndex,
      operationId: `request-${operationIndex}`,
      failure: {name: 'Error', message: 'fixture operation failed'},
    }),
  );
  const ownerReceipt = createBenchmarkCapacityAdapterOwnerReceipt({
    adapterIdentity: value.adapterIdentity,
    operationIds: [],
    evidenceDigest: digestBenchmarkSemanticData({
      adapterIdentityDigest:
        value.adapterIdentity.adapterIdentityDigest,
      coordinate: {
        blockIndex: sample.blockIndex,
        blockedOrderIndex: value.window.blockedOrderIndex,
        sideId: sample.sideId,
        offeredLoadPerSecond: sample.offeredLoadPerSecond,
        phase: sample.phase,
      },
      semanticOracleDigest:
        value.ownerReceipt.semanticOracleDigest,
      operations: operationEvidence,
    }),
    semanticOracleDigest: value.ownerReceipt.semanticOracleDigest,
  });
  const headroom = createBenchmarkCapacityHeadroomReceipt({
    minimumRequiredRatio: 0.1,
    observerCpu: {capacity: 100, observedPeak: 5},
    hostCpu: {capacity: 16, observedPeak: 4},
    hostMemory: {capacity: 64_000, observedPeak: 16_000},
    sharedNetwork: {capacity: 10_000, observedPeak: 2_000},
    sharedStorage: {capacity: 10_000, observedPeak: 1_000},
  }, sample);
  const receipt = createBenchmarkCapacityHeterogeneousOperationReceipt({
    preregistration: value.preregistration,
    sample,
    adapterIdentity: value.adapterIdentity,
    ownerReceipt,
    window: value.window,
    headroom,
  });
  return {
    ...value,
    sample,
    operationEvidence,
    ownerReceipt,
    headroom,
    receipt,
  };
}

function receiptInput(value, overrides = {}) {
  return {
    preregistration: value.preregistration,
    sample: value.sample,
    adapterIdentity: value.adapterIdentity,
    ownerReceipt: value.ownerReceipt,
    window: value.window,
    headroom: value.headroom,
    ...overrides,
  };
}

function resignReceipt(receipt) {
  const resigned = structuredClone(receipt);
  delete resigned.receiptDigest;
  resigned.receiptDigest = digestBenchmarkSemanticData(resigned);
  return resigned;
}

function resignOperationEvidence(
  value,
  operationEvidence,
  runtimeOwnerEvidence = value.runtimeOwnerEvidence,
) {
  const adapterIdentity = createBenchmarkCapacityAdapterIdentity({
    adapterId: value.adapterIdentity.adapterId,
    adapterVersion: value.adapterIdentity.adapterVersion,
    sideId: value.adapterIdentity.sideId,
    runtimeKind: runtimeOwnerEvidence.runtimeKind,
    invocationBoundary: value.adapterIdentity.invocationBoundary,
    operationManifestDigest:
      value.adapterIdentity.operationManifestDigest,
    executableDigest: runtimeOwnerEvidence.executableDigest,
    ownerEvidenceDigest:
      digestBenchmarkSemanticData(runtimeOwnerEvidence),
  });
  const ownerReceipt = createBenchmarkCapacityAdapterOwnerReceipt({
    adapterIdentity,
    operationIds: value.ownerReceipt.operationIds,
    evidenceDigest: digestBenchmarkSemanticData({
      adapterIdentityDigest: adapterIdentity.adapterIdentityDigest,
      coordinate: {
        blockIndex: value.sample.blockIndex,
        blockedOrderIndex: value.window.blockedOrderIndex,
        sideId: value.sample.sideId,
        offeredLoadPerSecond: value.sample.offeredLoadPerSecond,
        phase: value.sample.phase,
      },
      semanticOracleDigest:
        value.ownerReceipt.semanticOracleDigest,
      operations: operationEvidence,
    }),
    semanticOracleDigest: value.ownerReceipt.semanticOracleDigest,
  });
  return createBenchmarkCapacityHeterogeneousOperationReceipt({
    preregistration: value.preregistration,
    sample: value.sample,
    adapterIdentity,
    ownerReceipt,
    window: value.window,
    headroom: value.headroom,
  });
}

test('heterogeneous receipt joins C2, C3, adapter, and exact window identity', () => {
  const value = fixture();
  const receipt = value.receipt;
  assert.deepEqual(receipt.counts, {
    offered: value.sample.counts.offered,
    emitted:
      value.sample.counts.offered -
      value.sample.unreleasedOperations,
    dispatched: value.sample.counts.dispatched,
    correct: value.sample.counts.correct,
    rejected: value.sample.counts.rejected,
    timedOut: value.sample.counts.timedOut,
    errored: value.sample.counts.errored,
    queueOverflow: value.sample.counts.queueOverflow,
  });
  assert.equal(
    receipt.semanticReceiptDigest,
    value.sample.semanticReceipt.receiptDigest,
  );
  assert.equal(receipt.ownerReceiptDigest, value.ownerReceipt.receiptDigest);
  assert.equal(receipt.headroom.eligible, true);
  assert.equal(
    inspectBenchmarkCapacityHeterogeneousOperationReceipt(receipt).valid,
    true,
  );
  assert.equal(
    assertBenchmarkCapacityHeterogeneousOperationReceipt(
      receipt,
      value.sample,
      value.preregistration,
    ),
    true,
  );
  assert.equal(
    assertBenchmarkCapacityHeterogeneousOperationEvidence(
      receipt,
      value.operationEvidence,
      value.sample.semanticReceipt,
      value.runtimeOwnerEvidence,
    ),
    true,
  );
});

test('heterogeneous receipt retains an all-error owner window', () => {
  const value = zeroCorrectFixture();
  assert.equal(value.receipt.semanticReceiptDigest, null);
  assert.equal(value.receipt.ownerReceipt.correctOperationCount, 0);
  assert.deepEqual(value.receipt.latencyQuantilesMs, {
    p50: null,
    p95: null,
    p99: null,
  });
  assert.equal(
    assertBenchmarkCapacityHeterogeneousOperationReceipt(
      value.receipt,
      value.sample,
      value.preregistration,
    ),
    true,
  );
  assert.equal(
    assertBenchmarkCapacityHeterogeneousOperationEvidence(
      value.receipt,
      value.operationEvidence,
      null,
      value.runtimeOwnerEvidence,
    ),
    true,
  );
});

test('heterogeneous receipt rejects caller assertion and cross-window joins', () => {
  const value = fixture();
  assert.throws(
    () => createBenchmarkCapacityHeterogeneousOperationReceipt({
      ...receiptInput(value),
      candidateEngaged: true,
    }),
    /exact_plain_data_record_required/u,
  );
  assert.throws(
    () => createBenchmarkCapacityHeterogeneousOperationReceipt({
      ...receiptInput(value),
      ownerReceipt: {
        ...value.ownerReceipt,
        correctOperationCount:
          value.ownerReceipt.correctOperationCount - 1,
      },
    }),
    /owner_sample_window_identity_mismatch|identity_or_count_mismatch/u,
  );
});

test('heterogeneous receipt rejects measurement-infrastructure saturation', () => {
  const value = fixture();
  const saturated = createBenchmarkCapacityHeadroomReceipt({
    minimumRequiredRatio: 0.2,
    observerCpu: {capacity: 100, observedPeak: 95},
    hostCpu: {capacity: 16, observedPeak: 4},
    hostMemory: {capacity: 64_000, observedPeak: 16_000},
    sharedNetwork: {capacity: 10_000, observedPeak: 2_000},
    sharedStorage: {capacity: 10_000, observedPeak: 1_000},
  }, value.sample);
  assert.equal(saturated.eligible, false);
  assert.throws(
    () => createBenchmarkCapacityHeterogeneousOperationReceipt({
      ...receiptInput(value),
      headroom: saturated,
    }),
    /headroom:ineligible_or_digest_mismatch/u,
  );
});

test('heterogeneous receipt rejects tampered derived headroom fields', () => {
  const value = fixture();
  const tampered = {
    ...value.headroom,
    externalEmitter: {
      ...value.headroom.externalEmitter,
      observedPeak: 0,
      headroomRatio: 1,
    },
    clientQueue: {
      ...value.headroom.clientQueue,
      observedPeak: 0,
      headroomRatio: 1,
    },
    minimumObservedRatio: 0,
  };
  assert.throws(
    () => createBenchmarkCapacityHeterogeneousOperationReceipt({
      ...receiptInput(value),
      headroom: tampered,
    }),
    /headroom:ineligible_or_digest_mismatch/u,
  );
});

test('bounded workload queue overflow remains an observed capacity outcome', () => {
  const value = fixture();
  const queueOverflow = 5;
  const counts = {
    ...value.sample.counts,
    dispatched: value.sample.counts.dispatched - queueOverflow,
    correct: value.sample.counts.correct - queueOverflow,
    rejected: queueOverflow,
    queueOverflow,
  };
  const rejectedByReason = {
    ...value.sample.rejectedByReason,
    queueFull: queueOverflow,
  };
  const sample = createBenchmarkCapacityRunSample(inputFromSample(
    value.sample,
    {
      counts,
      rejectedByReason,
      endToEndLatencyMs:
        value.sample.endToEndLatencyMs.slice(0, counts.correct),
      clientQueueDelayMs:
        value.sample.clientQueueDelayMs.slice(0, counts.dispatched),
      semanticReceipt: semanticReceiptForCounts(
        value.sample.semanticDialect,
        counts,
        rejectedByReason,
      ),
    },
  ));
  const headroom = createBenchmarkCapacityHeadroomReceipt({
    minimumRequiredRatio: 0.2,
    observerCpu: {capacity: 100, observedPeak: 5},
    hostCpu: {capacity: 16, observedPeak: 4},
    hostMemory: {capacity: 64_000, observedPeak: 16_000},
    sharedNetwork: {capacity: 10_000, observedPeak: 2_000},
    sharedStorage: {capacity: 10_000, observedPeak: 1_000},
  }, sample);

  assert.equal(headroom.eligible, true);
  assert.equal(sample.counts.queueOverflow, queueOverflow);
  assert.equal(sample.errorRate, queueOverflow / sample.counts.offered);
});

test('heterogeneous receipt inspector rejects digest tampering', () => {
  const value = fixture();
  const receipt = value.receipt;
  assert.equal(
    inspectBenchmarkCapacityHeterogeneousOperationReceipt({
      ...receipt,
      offeredLoad: receipt.offeredLoad + 1,
    }).valid,
    false,
  );
});

test('heterogeneous replay derives counts and quantiles from the C3 sample', () => {
  const value = fixture();
  const wrongCounts = structuredClone(value.receipt);
  wrongCounts.counts.correct -= 1;
  assert.throws(
    () => assertBenchmarkCapacityHeterogeneousOperationReceipt(
      resignReceipt(wrongCounts),
      value.sample,
      value.preregistration,
    ),
    /counts_invalid/u,
  );
  const wrongQuantile = structuredClone(value.receipt);
  wrongQuantile.latencyQuantilesMs.p99 += 1;
  assert.throws(
    () => assertBenchmarkCapacityHeterogeneousOperationReceipt(
      resignReceipt(wrongQuantile),
      value.sample,
      value.preregistration,
    ),
    /digest_mismatch/u,
  );
});

test('heterogeneous replay rejects operation and durability tampering', () => {
  const value = fixture();
  const wrongOperation = structuredClone(value.operationEvidence);
  wrongOperation[0].operationId = 'forged-operation-id';
  assert.throws(
    () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
      value.receipt,
      wrongOperation,
      value.sample.semanticReceipt,
      value.runtimeOwnerEvidence,
    ),
    /operation_evidence_invalid|canonical benchmark semantic/u,
  );
  const wrongDurability = structuredClone(value.operationEvidence);
  wrongDurability[0].evidence.durabilityPassed = false;
  assert.throws(
    () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
      value.receipt,
      wrongDurability,
      value.sample.semanticReceipt,
      value.runtimeOwnerEvidence,
    ),
    /operation_evidence_invalid/u,
  );
  const wrongOracle = structuredClone(value.operationEvidence);
  wrongOracle[0].evidence.semanticOracleDigest =
    digestBenchmarkSemanticData({oracle: 'forged'});
  assert.throws(
    () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
      value.receipt,
      wrongOracle,
      value.sample.semanticReceipt,
      value.runtimeOwnerEvidence,
    ),
    /operation_evidence_invalid/u,
  );
});

test('Lagrange replay rejects re-signed raw owner-boundary tampering', () => {
  const value = fixture();
  const operationMutations = [
    ['request idempotency', (evidence) => {
      evidence.requestWitness.idempotencyKey = 'forged-request';
    }],
    ['request binding', (evidence) => {
      evidence.requestWitness.bindingVersionId = 'forged-binding';
    }],
    ['request service', (evidence) => {
      evidence.requestWitness.routeServiceId = 'forged-service';
    }],
    ['request digest', (evidence) => {
      evidence.requestWitness.requestDigest =
        digestBenchmarkSemanticData({forged: 'request'});
    }],
    ['request intent', (evidence) => {
      evidence.requestWitness.intentDigest =
        digestBenchmarkSemanticData({forged: 'intent'});
    }],
    ['request method', (evidence) => {
      evidence.requestWitness.normalizedRequest.method = 'GET';
    }],
    ['journal operation', (evidence) => {
      evidence.invocationJournal.operation_id = 'forged-operation';
    }],
    ['journal command', (evidence) => {
      evidence.invocationJournal.command = 'forged-command';
    }],
    ['journal result', (evidence) => {
      evidence.invocationJournal.result = '"forged-result"';
    }],
    ['durable rows', (evidence) => {
      evidence.durableResult.movieRows[0].value += 1;
    }],
    ['oracle result', (evidence) => {
      evidence.semanticOracleReceipt.observed[0].movieId += 1;
    }],
  ];
  for (const [label, mutate] of operationMutations) {
    const operations = structuredClone(value.operationEvidence);
    mutate(operations[0].evidence);
    const receipt = resignOperationEvidence(value, operations);
    assert.throws(
      () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
        receipt,
        operations,
        value.sample.semanticReceipt,
        value.runtimeOwnerEvidence,
      ),
      /operation_evidence_invalid/u,
      label,
    );
  }

  const ownerMutations = {
    version: (owner) => {
      owner.version = 'forged-owner-version';
    },
    bindingName: (owner) => {
      owner.bindingName = 'forged-binding-name';
    },
    bindingVersionId: (owner) => {
      owner.bindingVersionId = 'forged-binding-version';
    },
    datasetDigest: (owner) => {
      owner.datasetDigest = digestBenchmarkSemanticData({forged: 'dataset'});
    },
    executableDigest: (owner) => {
      owner.executableDigest =
        digestBenchmarkSemanticData({forged: 'executable'});
    },
    routeServiceId: (owner) => {
      owner.routeServiceId = 'forged-service';
    },
    runtimeKind: (owner) => {
      owner.runtimeKind = 'forged_runtime';
    },
    semanticOracleExpected: (owner) => {
      owner.semanticOracleExpected[0].movieId += 1;
    },
    operationManifest: (owner) => {
      owner.operationManifest.postgresqlQuerySqlDigest =
        digestBenchmarkSemanticData({forged: 'query'});
    },
  };
  for (const [label, mutate] of Object.entries(ownerMutations)) {
    const owner = structuredClone(value.runtimeOwnerEvidence);
    mutate(owner);
    const receipt = resignOperationEvidence(
      value,
      value.operationEvidence,
      owner,
    );
    assert.throws(
      () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
        receipt,
        value.operationEvidence,
        value.sample.semanticReceipt,
        owner,
      ),
      /operation_evidence_invalid/u,
      label,
    );
  }
});

test('heterogeneous producer and replay survive poisoned array intrinsics', () => {
  const value = fixture();
  const poison = () => {
    throw new Error('poisoned mutable intrinsic');
  };
  withHostileIntrinsics([
    replacePrototypeProperty(Array.prototype, 'filter', poison),
    replacePrototypeProperty(Array.prototype, 'find', poison),
    replacePrototypeProperty(Array.prototype, 'includes', poison),
    replacePrototypeProperty(Array.prototype, 'indexOf', poison),
    replacePrototypeProperty(Array.prototype, 'map', poison),
    replacePrototypeProperty(Array.prototype, 'slice', poison),
    replacePrototypeProperty(Array.prototype, 'sort', poison),
    replacePrototypeProperty(Array.prototype, Symbol.iterator, poison),
  ], () => {
    assert.equal(
      assertBenchmarkCapacityHeterogeneousOperationReceipt(
        value.receipt,
        value.sample,
        value.preregistration,
      ),
      true,
    );
    assert.equal(
      assertBenchmarkCapacityHeterogeneousOperationEvidence(
        value.receipt,
        value.operationEvidence,
        value.sample.semanticReceipt,
        value.runtimeOwnerEvidence,
      ),
      true,
    );
  });
});

test('heterogeneous replay rejects inherited and accessor evidence', () => {
  const value = fixture();
  const inherited = Object.create(value.operationEvidence[0]);
  assert.throws(
    () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
      value.receipt,
      [inherited, ...value.operationEvidence.slice(1)],
      value.sample.semanticReceipt,
      value.runtimeOwnerEvidence,
    ),
    /operation_evidence_invalid|canonical benchmark semantic/u,
  );
  const accessor = structuredClone(value.operationEvidence);
  Object.defineProperty(accessor[0], 'operationId', {
    enumerable: true,
    get() {
      return value.operationEvidence[0].operationId;
    },
  });
  assert.throws(
    () => assertBenchmarkCapacityHeterogeneousOperationEvidence(
      value.receipt,
      accessor,
      value.sample.semanticReceipt,
      value.runtimeOwnerEvidence,
    ),
    /operation_evidence_invalid|canonical benchmark semantic/u,
  );
});
