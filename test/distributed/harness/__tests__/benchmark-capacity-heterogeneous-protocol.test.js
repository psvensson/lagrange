import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBenchmarkCapacityAdapterIdentity,
  createBenchmarkCapacityAdapterOwnerReceipt,
  inspectBenchmarkCapacityHeterogeneousOperationReceipt,
} from '../benchmark-capacity-heterogeneous-observation.js';
import {
  runBenchmarkCapacityHeterogeneousProtocol,
} from '../benchmark-capacity-heterogeneous-protocol.js';
import {
  BENCHMARK_CAPACITY_OUTCOME,
} from '../benchmark-capacity-protocol-constants.js';
import {
  inspectBenchmarkCapacityProtocolReport,
} from '../benchmark-capacity-protocol.js';
import {
  sealBenchmarkCapacityPreregistration,
} from '../benchmark-capacity-preregistration.js';
import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  preregistrationInput,
  semanticReceiptForCounts,
} from './benchmark-capacity-protocol-test-fixture.js';

function adapter(sideId, dialect) {
  const semanticOracleDigest =
    digestBenchmarkSemanticData({oracle: 'movielens-top-ten'});
  const runtimeOwnerEvidence = {sideId};
  const identity = createBenchmarkCapacityAdapterIdentity({
    adapterId: `${sideId}-fixture-adapter`,
    adapterVersion: 'v1',
    sideId,
    runtimeKind: `${sideId}-runtime`,
    invocationBoundary: `${sideId}-public-boundary`,
    operationManifestDigest:
      digestBenchmarkSemanticData({operation: 'grouped_reduce'}),
    executableDigest: digestBenchmarkSemanticData({sideId}),
    ownerEvidenceDigest:
      digestBenchmarkSemanticData(runtimeOwnerEvidence),
  });
  let operations = null;
  let ownerReceipt = null;
  let coordinate = null;
  return {
    adapterIdentity: identity,
    beginWindow(context) {
      operations = [];
      ownerReceipt = null;
      coordinate = context;
    },
    async executeOperation({operationIndex}) {
      const operationId = `${sideId}-${operationIndex}`;
      operations[operationIndex] = {
        status: BENCHMARK_CAPACITY_OUTCOME.CORRECT,
        operationIndex,
        operationId,
        evidence: {
          operationId,
          semanticOracleDigest,
          durabilityPassed: true,
          durabilityDigest:
            digestBenchmarkSemanticData({durable: operationId}),
          semanticObservation: {
            operationId: operationIndex,
            operation: 'INSERT',
            outcome: 'command_acknowledged',
          },
        },
      };
      return {status: BENCHMARK_CAPACITY_OUTCOME.CORRECT};
    },
    finalizeSemanticReceipt({
      counts,
      rejectedByReason,
      correctOperationIndexes,
    }) {
      const operationIds = correctOperationIndexes.map(
        (index) => operations[index].operationId,
      );
      ownerReceipt = createBenchmarkCapacityAdapterOwnerReceipt({
        adapterIdentity: identity,
        operationIds,
        evidenceDigest: digestBenchmarkSemanticData({
          adapterIdentityDigest: identity.adapterIdentityDigest,
          coordinate,
          semanticOracleDigest,
          operations,
        }),
        semanticOracleDigest,
      });
      return semanticReceiptForCounts(
        dialect,
        counts,
        rejectedByReason,
      );
    },
    completeWindow() {
      return {
        operationEvidence: operations,
        ownerReceipt,
        runtimeOwnerEvidence,
      };
    },
    async resetRunState(context) {
      const resetContext = {
        blockIndex: context.blockIndex,
        blockedOrderIndex: context.blockedOrderIndex,
        sideId: context.sideId,
        offeredLoadPerSecond: context.offeredLoadPerSecond,
      };
      return {
        version: 'fixture-reset-v1',
        adapterIdentityDigest: identity.adapterIdentityDigest,
        sideId,
        context: resetContext,
        ownerReceipt: {state: 'reset'},
        resetDigest: digestBenchmarkSemanticData({
          sideId,
          context: resetContext,
        }),
      };
    },
  };
}

test('heterogeneous protocol executes exact repeated side/window coordinates', async () => {
  const input = preregistrationInput({
    offeredLoadPerSecond: [1000],
    repetitions: {minimum: 3, maximum: 3},
  });
  input.sampling = {
    ...input.sampling,
    windows: [{
      offeredLoadPerSecond: 1000,
      warmupMs: 0,
      measuredMs: 100,
    }],
  };
  const preregistration = sealBenchmarkCapacityPreregistration(input);
  const adapters = preregistration.sideSemanticContracts.map(
    (contract) => adapter(contract.sideId, contract.dialect),
  );
  let cursor = 1_800_000_000_000;
  const result = await runBenchmarkCapacityHeterogeneousProtocol({
    preregistration,
    adapters,
    beginResourceObservation(context) {
      return {context, startedAt: cursor};
    },
    completeResourceObservation({resourceObservation, sample}) {
      const startedAt = resourceObservation.startedAt;
      const endedAt = startedAt + sample.observationDurationMs;
      cursor = endedAt + 1;
      return {
        startedAt,
        endedAt,
        headroom: {
          minimumRequiredRatio: 0.1,
          observerCpu: {capacity: 100, observedPeak: 5},
          hostCpu: {capacity: 16, observedPeak: 4},
          hostMemory: {capacity: 64_000, observedPeak: 16_000},
          sharedNetwork: {capacity: 10_000, observedPeak: 2_000},
          sharedStorage: {capacity: 10_000, observedPeak: 1_000},
        },
      };
    },
  });
  assert.equal(
    result.report.executionFailure,
    null,
    JSON.stringify(result.report.executionFailure),
  );
  assert.equal(result.report.completedBlocks, 3);
  assert.equal(result.windows.length, 6);
  assert.equal(result.resets.length, 6);
  assert.equal(
    inspectBenchmarkCapacityProtocolReport(
      result.report,
      preregistration,
    ).valid,
    true,
  );
  for (const window of result.windows) {
    assert.equal(
      inspectBenchmarkCapacityHeterogeneousOperationReceipt(
        window.engagement,
      ).valid,
      true,
    );
    assert.equal(
      window.receipt.liveEngagementDigest,
      window.engagement.receiptDigest,
    );
    assert.equal(window.headroom.eligible, true);
  }
});
