import {test} from '../../../../src/test-helpers/tap.js';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  computeBenchmarkResourceWindowCost,
} from '../benchmark-resource-cost-and-effects.js';
import {
  createBenchmarkResourceArtifact,
  createBenchmarkResourceMemoryResolver,
  benchmarkResourceDigestBytes,
  parseBenchmarkResourceArtifact,
} from '../benchmark-resource-evidence-data.js';
import {
  persistBenchmarkResourceArtifacts,
} from '../benchmark-resource-durable-resolver.js';
import {
  sealBenchmarkCapacityPreregistration,
} from '../benchmark-capacity-preregistration.js';
import {
  createBenchmarkResourceEvidenceRoot,
  createBenchmarkResourceSourceArtifact,
  validateBenchmarkResourceEvidenceRoot,
} from '../benchmark-resource-evidence-root.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_CAPACITY_SOURCE,
} from '../benchmark-resource-contract-constants.js';
import {
  assertBenchmarkResourceCapacityProtocolSummary,
} from '../benchmark-resource-live-root-validation.js';
import {
  artifactFixtureReport,
  preregistrationInput,
} from './benchmark-capacity-protocol-test-fixture.js';
import {
  FIXTURE_RESOURCE_RUN_ID,
  FIXTURE_RESOURCE_SIDE_IDS,
  FIXTURE_RESOURCE_SOURCE_REVISION,
  FIXTURE_RESOURCE_VALID_UNTIL,
} from './benchmark-resource-evidence-test-fixture-constants.js';
import {
  createBenchmarkResourceEvidenceFixture,
} from './benchmark-resource-evidence-test-fixture.js';

function calibrationStats(timestamp, multiplier) {
  return {
    timestamp,
    cpuPercent: 10 * multiplier,
    cpuUsageNanoseconds: 1000 * multiplier,
    memoryUsageBytes: 100_000 * multiplier,
    memoryLimitBytes: 1_000_000,
    pids: 5,
    rxBytes: 100 * multiplier,
    txBytes: 200 * multiplier,
    blockReadBytes: 300 * multiplier,
    blockWriteBytes: 400 * multiplier,
    blockReadOperations: 3 * multiplier,
    blockWriteOperations: 4 * multiplier,
    storageUsageBytes: 10_000 * multiplier,
  };
}

function calibrationComponent(sideId, componentId) {
  const start = calibrationStats(
    Date.parse('2026-07-27T11:59:00.000Z'),
    1,
  );
  const end = calibrationStats(
    Date.parse('2026-07-27T12:00:00.000Z'),
    2,
  );
  return {
    componentId,
    sideId,
    containerId: `${sideId}-${componentId}-container`,
    start,
    end,
    delta: {
      durationMilliseconds: end.timestamp - start.timestamp,
      cpuUsageNanoseconds:
        end.cpuUsageNanoseconds - start.cpuUsageNanoseconds,
      networkBytes:
        end.rxBytes + end.txBytes - start.rxBytes - start.txBytes,
      blockReadBytes: end.blockReadBytes - start.blockReadBytes,
      blockWriteBytes: end.blockWriteBytes - start.blockWriteBytes,
      blockOperations:
        end.blockReadOperations + end.blockWriteOperations -
        start.blockReadOperations - start.blockWriteOperations,
    },
  };
}

function externallyObservedCalibration() {
  const components = [];
  for (const sideId of ['candidate', 'baseline']) {
    components.push(calibrationComponent(sideId, `${sideId}-database`));
    components.push(calibrationComponent(sideId, `${sideId}-client`));
  }
  return createBenchmarkResourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION,
    {
      version: 'benchmark-resource-live-calibration-v1',
      evidenceClass: 'externally_observed',
      runId: FIXTURE_RESOURCE_RUN_ID,
      networkId: 'fixture-network-id',
      networkName: 'fixture-network',
      sourceRevision: FIXTURE_RESOURCE_SOURCE_REVISION,
      cleanupVerified: true,
      components,
    },
  );
}

function customResolver(original, replacementDigest, replacementBytes) {
  return Object.freeze({
    resolve(digest) {
      if (digest === replacementDigest) return replacementBytes;
      return original.resolve(digest);
    },
  });
}

function replaceRoot(fixture, payload, references) {
  const root = createBenchmarkResourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.ROOT,
    payload,
    references,
  );
  return {
    root,
    receipt: {
      rootDigest: root.digest,
      resolver: createBenchmarkResourceMemoryResolver([
        ...fixture.artifacts,
        root,
      ]),
    },
  };
}

function capacityProtocolSource(
  preregistration,
  report,
  mappedSideId,
  protocolSideId,
) {
  return {
    payload: {
      evidence: {
        protocol: {
          version: BENCHMARK_RESOURCE_CAPACITY_SOURCE.VERSION,
          evidenceClass: BENCHMARK_RESOURCE_CAPACITY_SOURCE.EVIDENCE_CLASS,
          mappedSideId,
          protocolSideId,
          artifactReceipt: {
            reportDigest: report.reportDigest,
            preregistrationDigest: preregistration.manifestDigest,
          },
          preregistration,
          report,
        },
      },
    },
  };
}

function capacityProtocolSummary(report, protocolSideId) {
  const capacity = report.summary.capacityBySide[protocolSideId];
  const curve = report.summary.capacityCurve.find(
    (entry) =>
      entry.offeredLoadPerSecond === capacity.maxSloOfferedLoadPerSecond,
  );
  const interval =
    curve.sides[protocolSideId].correctThroughputPerSecond;
  return {
    capacityCorrectOpsPerSecond: capacity.maxCorrectThroughputPerSecond,
    sampleCount: capacity.perBlock.length,
    confidenceInterval: {lower: interval.lower, upper: interval.upper},
  };
}

function receiptForRootInput(fixture, overrides = {}, artifacts) {
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest: fixture.matrix.digest,
    componentInventoryDigest: fixture.inventory.digest,
    priceSheetDigest: fixture.price.digest,
    cellEvidenceDigests: [fixture.cellEvidence.digest],
    sourceRevision: FIXTURE_RESOURCE_SOURCE_REVISION,
    producedAt: '2026-07-27T12:00:00.000Z',
    validUntil: FIXTURE_RESOURCE_VALID_UNTIL,
    artifacts: artifacts ?? fixture.artifacts,
    ...overrides,
  });
  return {
    rootDigest: root.digest,
    resolver: createBenchmarkResourceMemoryResolver([
      ...(artifacts ?? fixture.artifacts),
      root,
    ]),
  };
}

test('root rejects missing, tampered, oversized, and caller-shaped evidence',
  (t) => {
    const fixture = createBenchmarkResourceEvidenceFixture();
    const target = fixture.windows[0];
    const missing = {
      rootDigest: fixture.root.digest,
      resolver: customResolver(
        fixture.receipt.resolver,
        target.digest,
        undefined,
      ),
    };
    t.match(
      validateBenchmarkResourceEvidenceRoot(missing),
      {valid: false, claimEligible: false},
    );

    const tamperedBytes = Buffer.from(target.bytes);
    tamperedBytes[0] ^= 1;
    const tampered = {
      rootDigest: fixture.root.digest,
      resolver: customResolver(
        fixture.receipt.resolver,
        target.digest,
        tamperedBytes,
      ),
    };
    t.match(
      validateBenchmarkResourceEvidenceRoot(tampered),
      {valid: false, claimEligible: false},
    );

    const oversized = {
      rootDigest: fixture.root.digest,
      resolver: customResolver(
        fixture.receipt.resolver,
        target.digest,
        new Uint8Array(1_048_577),
      ),
    };
    t.match(
      validateBenchmarkResourceEvidenceRoot(oversized),
      {valid: false, claimEligible: false},
    );
    t.match(
      validateBenchmarkResourceEvidenceRoot({
        ...fixture.receipt,
        path: '/tmp/caller-selected-evidence.json',
      }),
      {valid: false, claimEligible: false},
    );
    t.match(
      validateBenchmarkResourceEvidenceRoot({
        ...fixture.receipt,
        alreadyValidated: true,
      }),
      {valid: false, claimEligible: false},
    );
    t.end();
  });

test('root rejects duplicate, relocated, and semantically unowned artifacts',
  (t) => {
    const fixture = createBenchmarkResourceEvidenceFixture();
    const duplicatePayload = structuredClone(fixture.root.artifact.payload);
    duplicatePayload.artifactManifest.push(
      structuredClone(duplicatePayload.artifactManifest[0]),
    );
    duplicatePayload.artifactManifestDigest =
      digestBenchmarkSemanticData(duplicatePayload.artifactManifest);
    const duplicate = replaceRoot(
      fixture,
      duplicatePayload,
      fixture.root.artifact.references,
    );
    t.match(
      validateBenchmarkResourceEvidenceRoot(duplicate.receipt),
      {valid: false, claimEligible: false},
    );

    const relocatedPayload = structuredClone(fixture.root.artifact.payload);
    relocatedPayload.artifactManifest[0].kind = 'relocated_artifact';
    relocatedPayload.artifactManifestDigest =
      digestBenchmarkSemanticData(relocatedPayload.artifactManifest);
    const relocated = replaceRoot(
      fixture,
      relocatedPayload,
      fixture.root.artifact.references,
    );
    t.match(
      validateBenchmarkResourceEvidenceRoot(relocated.receipt),
      {valid: false, claimEligible: false},
    );

    const orphan = createBenchmarkResourceSourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.SYNTHETIC_CALIBRATION,
      {version: 'orphan-v1', name: 'unowned'},
    );
    t.match(
      validateBenchmarkResourceEvidenceRoot(
        receiptForRootInput(
          fixture,
          {},
          [...fixture.artifacts, orphan],
        ),
      ),
      {valid: false, claimEligible: false},
    );
    t.end();
  });

test('Cartesian closure accepts explicit non-measuring cells and rejects gaps',
  (t) => {
    const complete = createBenchmarkResourceEvidenceFixture({
      matrixSizeValues: ['small', 'large'],
    });
    t.match(
      validateBenchmarkResourceEvidenceRoot(complete.receipt),
      {valid: true, claimEligible: false, cellCount: 2},
    );

    const gap = createBenchmarkResourceEvidenceFixture({
      matrixSizeValues: ['small', 'large'],
      sealNonMeasuringCells: false,
    });
    t.match(
      validateBenchmarkResourceEvidenceRoot(gap.receipt),
      {valid: false, claimEligible: false},
    );
    t.end();
  });

test('price validity and network accounting fail closed without double count',
  (t) => {
    const fixture = createBenchmarkResourceEvidenceFixture();
    t.match(
      validateBenchmarkResourceEvidenceRoot(
        receiptForRootInput(fixture, {
          producedAt: '2026-07-30T00:00:00.000Z',
          validUntil: '2026-07-31T00:00:00.000Z',
        }),
      ),
      {valid: false, claimEligible: false},
    );

    const window = structuredClone(fixture.windows[0].artifact.payload);
    window.components[0].utilized.interZoneNetworkBytes =
      window.components[0].utilized.networkBytes + 1;
    t.throws(
      () => computeBenchmarkResourceWindowCost(
        window,
        fixture.inventory.artifact.payload,
        fixture.price.artifact.payload,
      ),
      /interZoneNetworkBytes:exceeds_network/u,
    );

    const original = computeBenchmarkResourceWindowCost(
      fixture.windows[0].artifact.payload,
      fixture.inventory.artifact.payload,
      fixture.price.artifact.payload,
    );
    const excludedChanged =
      structuredClone(fixture.windows[0].artifact.payload);
    excludedChanged.components[1].utilized.networkBytes = 9_000_000;
    excludedChanged.components[1].utilized.interZoneNetworkBytes = 1_000_000;
    const recalculated = computeBenchmarkResourceWindowCost(
      excludedChanged,
      fixture.inventory.artifact.payload,
      fixture.price.artifact.payload,
    );
    t.same(recalculated, original);
    t.end();
  });

test('admission rejects accessors and proxies without invoking traps', (t) => {
  const fixture = createBenchmarkResourceEvidenceFixture();
  let trapCalls = 0;
  const accessorReceipt = {rootDigest: fixture.root.digest};
  Object.defineProperty(accessorReceipt, 'resolver', {
    enumerable: true,
    get() {
      trapCalls += 1;
      return fixture.receipt.resolver;
    },
  });
  t.match(
    validateBenchmarkResourceEvidenceRoot(accessorReceipt),
    {valid: false, claimEligible: false},
  );
  t.equal(trapCalls, 0);

  const handler = {
    get() {
      trapCalls += 1;
      return undefined;
    },
    getOwnPropertyDescriptor() {
      trapCalls += 1;
      return undefined;
    },
    getPrototypeOf() {
      trapCalls += 1;
      return Object.prototype;
    },
    ownKeys() {
      trapCalls += 1;
      return [];
    },
  };
  const proxyReceipt =
    new Proxy(structuredClone({rootDigest: fixture.root.digest}), handler);
  t.match(
    validateBenchmarkResourceEvidenceRoot(proxyReceipt),
    {valid: false, claimEligible: false},
  );
  t.equal(trapCalls, 0);

  const proxyResolver = new Proxy(fixture.receipt.resolver, handler);
  t.match(
    validateBenchmarkResourceEvidenceRoot({
      rootDigest: fixture.root.digest,
      resolver: proxyResolver,
    }),
    {valid: false, claimEligible: false},
  );
  t.equal(trapCalls, 0);
  t.end();
});

test('validation survives hostile mutable collection and date intrinsics',
  (t) => {
    const fixture = createBenchmarkResourceEvidenceFixture();
    const replacements = [
      [Set.prototype, 'has', () => false],
      [Set.prototype, 'add', () => {
        throw new Error('poisoned Set.add');
      }],
      [Set.prototype, 'delete', () => false],
      [Map.prototype, 'has', () => false],
      [Map.prototype, 'get', () => undefined],
      [Map.prototype, 'set', () => {
        throw new Error('poisoned Map.set');
      }],
      [Array.prototype, 'includes', () => false],
      [RegExp.prototype, 'test', () => false],
      [Date, 'parse', () => Number.NaN],
      [Math, 'max', () => 0],
    ];
    const originals = replacements.map(([target, key]) => [
      target,
      key,
      Object.getOwnPropertyDescriptor(target, key),
    ]);
    let validation;
    try {
      for (let index = 0; index < replacements.length; index += 1) {
        const [target, key, value] = replacements[index];
        Object.defineProperty(target, key, {
          configurable: true,
          writable: true,
          value,
        });
      }
      validation = validateBenchmarkResourceEvidenceRoot(fixture.receipt);
    } finally {
      for (let index = 0; index < originals.length; index += 1) {
        const [target, key, descriptor] = originals[index];
        Object.defineProperty(target, key, descriptor);
      }
    }
    t.match(validation, {valid: true, claimEligible: false});
    t.end();
  });

test('generic artifacts cannot mint externally observed live calibration',
  (t) => {
    t.throws(
      externallyObservedCalibration,
      /live_calibration_authority_required/u,
    );
    t.end();
  });

test('artifact parser rejects equal-length invalid UTF-8 substitutions', (t) => {
  const source = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST,
    {value: '\ufffd'},
  );
  const bytes = Buffer.from(source.bytes);
  const replacement = Buffer.from([0xef, 0xbf, 0xbd]);
  const offset = bytes.indexOf(replacement);
  Buffer.from([0xf0, 0x9f, 0x92]).copy(bytes, offset);
  t.throws(
    () => parseBenchmarkResourceArtifact(
      bytes,
      benchmarkResourceDigestBytes(bytes),
    ),
    /utf8_required/u,
  );
  t.end();
});

test('hostile resolver errors fail closed without reading accessors', (t) => {
  const fixture = createBenchmarkResourceEvidenceFixture();
  let getterCalls = 0;
  const hostile = {};
  Object.defineProperty(hostile, 'message', {
    get() {
      getterCalls += 1;
      throw new Error('message getter executed');
    },
  });
  const validation = validateBenchmarkResourceEvidenceRoot({
    rootDigest: fixture.root.digest,
    resolver: {
      resolve() {
        throw hostile;
      },
    },
  });
  t.match(validation, {valid: false, reason: 'validation:failed_closed'});
  t.equal(getterCalls, 0);
  t.end();
});

test('live capacity admission rejects reusing one C3 protocol side',
  async (t) => {
    const preregistration =
      sealBenchmarkCapacityPreregistration(preregistrationInput());
    const {report} = await artifactFixtureReport(preregistration);
    const resourcePreregistration = {
      sideIds: FIXTURE_RESOURCE_SIDE_IDS,
      capacityProtocolReportDigest: report.reportDigest,
      capacityProtocolPreregistrationDigest:
        preregistration.manifestDigest,
    };
    const firstProtocolSide = preregistration.sideIds[0];
    assertBenchmarkResourceCapacityProtocolSummary(
      capacityProtocolSummary(report, firstProtocolSide),
      capacityProtocolSource(
        preregistration,
        report,
        FIXTURE_RESOURCE_SIDE_IDS[0],
        firstProtocolSide,
      ),
      FIXTURE_RESOURCE_SIDE_IDS[0],
      0,
      resourcePreregistration,
    );
    t.throws(
      () => assertBenchmarkResourceCapacityProtocolSummary(
        capacityProtocolSummary(report, firstProtocolSide),
        capacityProtocolSource(
          preregistration,
          report,
          FIXTURE_RESOURCE_SIDE_IDS[1],
          firstProtocolSide,
        ),
        FIXTURE_RESOURCE_SIDE_IDS[1],
        1,
        resourcePreregistration,
      ),
      /c3_protocol_evidence_invalid/u,
    );
    t.end();
  });

test('durable resolver verifies content digest before writing', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'benchmark-resource-digest-'));
  try {
    const bytes = Buffer.from('not the claimed digest');
    await t.rejects(
      persistBenchmarkResourceArtifacts(directory, [{
        digest: `sha256:${'0'.repeat(64)}`,
        bytes,
        byteLength: bytes.length,
        artifact: {},
      }]),
      /digest_mismatch/u,
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
  t.end();
});
