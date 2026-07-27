import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  BENCHMARK_CAPACITY_CACHE_POLICY,
  BENCHMARK_CAPACITY_ESTIMATOR,
  BENCHMARK_CAPACITY_INTERVAL,
  BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
  BENCHMARK_CAPACITY_PHASE,
  BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
  BENCHMARK_CAPACITY_REJECT_POLICY,
  BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
  BENCHMARK_CAPACITY_STOPPING_RULE,
  BENCHMARK_CAPACITY_TIMEOUT_POLICY,
} from '../benchmark-capacity-protocol-constants.js';
import {
  inspectBenchmarkCapacityPreregistration,
  sealBenchmarkCapacityPreregistration,
} from '../benchmark-capacity-preregistration.js';
import {
  inspectBenchmarkCapacityArtifactPath,
} from '../benchmark-capacity-artifact-path-integrity.js';
import {
  BENCHMARK_SQL_DIALECT,
  getBenchmarkSemanticContract,
} from '../benchmark-workload-semantics.js';
import {
  beginBenchmarkCapacityLiveObservation,
  claimBenchmarkCapacityLiveObservationFinalization,
} from '../benchmark-capacity-live-observation-authority.js';
import {
  runBenchmarkCapacityOpenLoopWindow,
} from '../benchmark-capacity-open-loop.js';

const SIDE_IDS = ['left', 'right'];
const DIALECTS = [
  BENCHMARK_SQL_DIALECT.SQLITE,
  BENCHMARK_SQL_DIALECT.POSTGRESQL,
];

function preregistrationInput(overrides = {}) {
  return {
    studyId: 'capacity-adversarial-v1',
    sideIds: SIDE_IDS,
    sideSemanticContracts: SIDE_IDS.map((sideId, index) => ({
      sideId,
      dialect: DIALECTS[index],
      contractDigest:
        getBenchmarkSemanticContract(DIALECTS[index]).contractDigest,
    })),
    offeredLoadPerSecond: [100, 200],
    slo: {maxP99LatencyMs: 50, maxErrorRate: 0.05},
    repetitions: {minimum: 3, maximum: 5},
    statistics: {
      estimator: BENCHMARK_CAPACITY_ESTIMATOR,
      interval: BENCHMARK_CAPACITY_INTERVAL,
      confidenceLevel: 0.95,
      bootstrapResamples: 100,
      practicalSignificanceRatio: 0.05,
      targetRelativeCiWidth: 0.1,
      stoppingRule: BENCHMARK_CAPACITY_STOPPING_RULE,
      multipleComparisonTreatment: BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
    },
    sampling: {
      tailQuantile: 0.99,
      tailSampleMinimum: 100,
      warmupMs: 0,
      measuredMs: 1000,
      operationTimeoutMs: 100,
      semanticFinalizerTimeoutMs: 100,
      resetTimeoutMs: 100,
      maxReleaseLagMs: 100,
      clientMaxInFlight: 8,
      clientMaxQueueDepth: 16,
    },
    cachePolicy: BENCHMARK_CAPACITY_CACHE_POLICY,
    runOrderPolicy: BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
    timeoutPolicy: BENCHMARK_CAPACITY_TIMEOUT_POLICY,
    rejectPolicy: BENCHMARK_CAPACITY_REJECT_POLICY,
    artifactPolicy: BENCHMARK_CAPACITY_ARTIFACT_POLICY,
    randomization: {
      algorithm: BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
      seed: 1,
    },
    executionIdentity: {
      matrixId: 'adversarial-matrix',
      cellId: 'adversarial-cell',
      cellManifestDigest: digestBenchmarkSemanticData({cell: 1}),
      profileIdentity: digestBenchmarkSemanticData({profile: 1}),
      pairIdentity: digestBenchmarkSemanticData({pair: 1}),
      runId: 'adversarial-run',
      liveEnvironmentContractDigest:
        digestBenchmarkSemanticData({environment: 1}),
    },
    ...overrides,
  };
}

test('preregistration rejects hostile records and cumulative bootstrap work',
  (t) => {
    let getterCalls = 0;
    const accessor = preregistrationInput();
    Object.defineProperty(accessor, 'studyId', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'hostile';
      },
    });
    t.throws(
      () => sealBenchmarkCapacityPreregistration(accessor),
      /plain_data_record/u,
    );
    t.equal(getterCalls, 0);
    t.throws(
      () => sealBenchmarkCapacityPreregistration(
        Object.create(preregistrationInput()),
      ),
      /plain_data_record/u,
    );
    const boxed = preregistrationInput();
    boxed.studyId = Object('boxed');
    t.throws(
      () => sealBenchmarkCapacityPreregistration(boxed),
      /primitive_identifier/u,
    );
    const symbolKey = preregistrationInput();
    symbolKey[Symbol('hostile')] = true;
    t.throws(
      () => sealBenchmarkCapacityPreregistration(symbolKey),
      /plain_data_record/u,
    );

    let proxyTrapCalls = 0;
    const countProxyTrap = () => {
      proxyTrapCalls += 1;
    };
    const trapHandler = {
      get: countProxyTrap,
      getOwnPropertyDescriptor: countProxyTrap,
      getPrototypeOf: countProxyTrap,
      ownKeys: countProxyTrap,
    };
    const proxiedRoot = new Proxy(preregistrationInput(), trapHandler);
    t.throws(
      () => sealBenchmarkCapacityPreregistration(proxiedRoot),
      /plain_data_record/u,
    );
    const proxiedNestedRecord = preregistrationInput();
    proxiedNestedRecord.sampling =
      new Proxy(proxiedNestedRecord.sampling, trapHandler);
    t.throws(
      () => sealBenchmarkCapacityPreregistration(proxiedNestedRecord),
      /plain_data_record/u,
    );
    const proxiedNestedArray = preregistrationInput();
    proxiedNestedArray.sideIds =
      new Proxy(proxiedNestedArray.sideIds, trapHandler);
    t.throws(
      () => sealBenchmarkCapacityPreregistration(proxiedNestedArray),
      /dense_identifiers/u,
    );
    t.equal(proxyTrapCalls, 0);

    const cumulative = preregistrationInput({
      offeredLoadPerSecond:
        Array.from({length: 5}, (_unused, index) => (index + 1) * 100000),
      repetitions: {minimum: 3, maximum: 100},
      sampling: {
        ...preregistrationInput().sampling,
        measuredMs: 1,
      },
    });
    t.throws(
      () => sealBenchmarkCapacityPreregistration(cumulative),
      /bootstrapDraws:exceeds_bound/u,
    );
    const sealed = sealBenchmarkCapacityPreregistration(
      preregistrationInput(),
    );
    t.equal(inspectBenchmarkCapacityPreregistration(sealed).valid, true);
    t.equal(
      inspectBenchmarkCapacityPreregistration(
        new Proxy(sealed, trapHandler),
      ).valid,
      false,
    );
    const nestedSealedProxy = structuredClone(sealed);
    nestedSealedProxy.blockedPairOrders[0] = new Proxy(
      nestedSealedProxy.blockedPairOrders[0],
      trapHandler,
    );
    t.equal(
      inspectBenchmarkCapacityPreregistration(nestedSealedProxy).valid,
      false,
    );
    t.equal(proxyTrapCalls, 0);
    t.end();
  });

test('artifact path integrity rejects a symlink in any parent component',
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'capacity-path-'));
    const outside = await mkdtemp(join(tmpdir(), 'capacity-outside-'));
    const realParent = join(root, 'real');
    const symlinkParent = join(root, 'linked');
    await mkdir(realParent);
    await writeFile(join(outside, 'artifact.raw.json'), '{}');
    await symlink(outside, symlinkParent, 'dir');
    t.equal(
      (await inspectBenchmarkCapacityArtifactPath(
        join(outside, 'artifact.raw.json'),
      )).valid,
      true,
    );
    t.same(
      await inspectBenchmarkCapacityArtifactPath(
        join(symlinkParent, 'artifact.raw.json'),
      ),
      {valid: false, reason: 'symlink_component_forbidden'},
    );
    await rm(root, {recursive: true, force: true});
    await rm(outside, {recursive: true, force: true});
    t.end();
  });

test('synthetic fixtures cannot mint live observation authority', async (t) => {
  await t.rejects(
    beginBenchmarkCapacityLiveObservation({
      provider: {
        inspectContainer: async () => ({
          Id: 'self-authored',
          State: {Running: true},
        }),
      },
      runId: 'self-authored-run',
      containerId: 'self-authored-container',
      networkId: 'self-authored-network',
      networkName: 'self-authored-network',
      liveEnvironmentContractDigest:
        digestBenchmarkSemanticData({environment: 'self-authored'}),
    }),
    /externally backed begin options required/u,
  );
  t.end();
});

test('live observation finalization admits exactly one synchronous claimant',
  (t) => {
    const state = {captured: true, finalizing: false};
    t.equal(
      claimBenchmarkCapacityLiveObservationFinalization(state),
      true,
    );
    t.equal(state.finalizing, true);
    t.equal(
      claimBenchmarkCapacityLiveObservationFinalization(state),
      false,
    );
    state.finalizing = false;
    t.equal(
      claimBenchmarkCapacityLiveObservationFinalization(state),
      true,
    );
    t.end();
  });

test('open-loop options and injected clocks reject every extra key',
  async (t) => {
    const options = {
      sideId: 'left',
      phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
      blockIndex: 0,
      offeredLoadPerSecond: 1,
      windowDurationMs: 1000,
      operationTimeoutMs: 100,
      semanticFinalizerTimeoutMs: 100,
      maxReleaseLagMs: 100,
      clientMaxInFlight: 1,
      clientMaxQueueDepth: 1,
      semanticDialect: BENCHMARK_SQL_DIALECT.SQLITE,
      finalizeSemanticReceipt: null,
      executeOperation: async () => ({status: 'correct'}),
      signal: null,
    };
    await t.rejects(
      runBenchmarkCapacityOpenLoopWindow({...options, extra: true}),
      /exact schema/u,
    );
    await t.rejects(
      runBenchmarkCapacityOpenLoopWindow(options, {
        now: () => 0,
        sleep: async () => {},
        extra: true,
      }),
      /clock must expose/u,
    );
    t.end();
  });
