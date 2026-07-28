import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createMovielensGroupedReduceMatrixDatasets,
  selectMovielensGroupedReduceMatrixDataset,
} from '../../../../examples/service-data-affinity/movielens-grouped-reduce-matrix-dataset.js';
import {
  replacePrototypeProperty,
  withHostileIntrinsics,
} from '../../../helpers/hostile-intrinsics.js';
import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  createBenchmarkResourceMemoryResolver,
} from '../benchmark-resource-evidence-data.js';
import {
  createBenchmarkResourceEvidenceRoot,
  createBenchmarkResourceNonMeasuringCellEvidence,
  createBenchmarkResourceSourceArtifact,
} from '../benchmark-resource-evidence-root.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_COMPONENT_ROLE,
} from '../benchmark-resource-contract-constants.js';
import {
  BENCHMARK_RESOURCE_P0_PRICE_SHEET,
} from '../benchmark-resource-price-sheet-p0-constants.js';
import {
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_REASON,
  createComparativeMovielensGroupedReduceEvidence,
  inspectComparativeMovielensGroupedReduceEvidence,
} from '../comparative-efficiency-movielens-grouped-reduce.js';

const LAGRANGE = 'lagrange';
const POSTGRESQL = 'postgresql';
const PRODUCED_AT = '2026-07-28T02:00:00.000Z';
const VALID_UNTIL = '2026-08-28T02:00:00.000Z';
const SOURCE_REVISION =
  'git-delta:0123456789012345678901234567890123456789:' +
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REASONS = Object.freeze([
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_REASON,
  'whole_topology_resource_window_absent',
  'comparative_effects_absent',
]);
const descriptorNames = Object.freeze([
  'movielens-input-bytes',
  'movielens-component-executable',
  'movielens-component-source',
  'raw-live-observation',
  'postgres-logs',
  'source-state',
  'evidence-index',
]);

function shaIdentity(value) {
  return digestBenchmarkSemanticData(value);
}

function shaBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function descriptor(index, name, digest, byteLength) {
  return {
    byteLength,
    digest,
    mediaType:
      name === 'movielens-component-executable' ?
        'application/wasm' :
        name === 'movielens-input-bytes' ?
          'application/octet-stream' :
          'application/json',
    name,
    path: `/retained/${index}/${digest.slice(7)}.blob`,
  };
}

function fakeLiveEvidence(cell, index) {
  const datasetDigest = shaIdentity(['dataset', index]);
  const executableDigest = shaIdentity(['executable', index]);
  const componentSourceDigest = shaIdentity(['component-source', index]);
  const oracleDigest = shaIdentity(['oracle', index]);
  const artifacts = [];
  for (let descriptorIndex = 0;
    descriptorIndex < descriptorNames.length;
    descriptorIndex += 1) {
    const name = descriptorNames[descriptorIndex];
    let digest = shaIdentity([name, index]);
    let byteLength = 100 + descriptorIndex;
    if (descriptorIndex === 0) {
      digest = datasetDigest;
      byteLength = 1_024 + index;
    }
    if (descriptorIndex === 1) digest = executableDigest;
    if (descriptorIndex === 2) digest = componentSourceDigest;
    artifacts.push(descriptor(index, name, digest, byteLength));
  }
  return {
    version: 'comparative-movielens-grouped-reduce-live-evidence-v1',
    matrixCellIndex: index,
    dimensions: {
      datasetSize: cell.datasetSize,
      skew: cell.skew,
      topology: cell.topology,
    },
    dataset: {
      cardinality: cell.datasetSize,
      digest: datasetDigest,
      sizeBytes: artifacts[0].byteLength,
      source: `deterministic MovieLens ${cell.datasetSize}/${cell.skew}`,
      skew: cell.skew,
    },
    operation: {
      authenticatedHttp: true,
      method: 'POST',
      path: '/benchmarks/movielens/grouped-reduce',
      principal: 'request-binding-example-user',
      status: 200,
    },
    runtime: {
      bindingName: 'movielens-public-grouped-reduce',
      bindingVersionId: `binding-version-${index}`,
      componentSourceDigest,
      executableDigest,
      kind: 'wasm_component',
      packageId: `package-${index}`,
    },
    oracle: {
      expectedDigest: oracleDigest,
      observedDigest: oracleDigest,
      passed: true,
      rankCount: 10,
    },
    alternative: {
      engine: 'PostgreSQL 16',
      imageId: shaIdentity(['image', index]),
      inputDigest: datasetDigest,
      postgresVersion: 'PostgreSQL 16.10',
      postgresVersionSql: 'SELECT version()',
      querySqlDigest: shaIdentity(['query', index]),
      replicaCount: cell.replicationFactor - 1,
      replicationFactor: cell.replicationFactor,
      replicationReady: true,
      returnedAggregateRows: 10,
      totalRows: cell.datasetSize,
    },
    teardown: {
      cellAbsent: true,
      nodeStopped: true,
      postgresContainersAbsent: true,
      postgresNetworkAbsent: true,
      removedPostgresContainerCount: cell.replicationFactor,
      temporaryDirectoryAbsent: true,
    },
    content: {
      artifacts,
      indexDigest: artifacts[6].digest,
      replayPassed: true,
      validationPassed: true,
    },
  };
}

function component(componentId, role) {
  return {
    componentId,
    role,
    billingTreatment:
      BENCHMARK_RESOURCE_BILLING_TREATMENT.SYMMETRICALLY_EXCLUDED,
    provisioned: {
      cpuCores: 0,
      memoryBytes: 0,
      storageBytes: 0,
      iops: 0,
      networkBytesPerSecond: 0,
    },
    minimumFootprint: {
      instances: 0,
      cpuCores: 0,
      memoryBytes: 0,
      storageBytes: 0,
    },
    reservedHeadroomRatio: 0,
    exclusionReason: 'whole_topology_resource_window_absent',
  };
}

function inputFixture() {
  const attempts = [];
  for (let index = 0;
    index < COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length;
    index += 1) {
    attempts.push({
      matrixCellIndex: index,
      runId: `movielens-grouped-reduce-cell-${index}`,
      candidateEngaged: false,
      alternativeEngaged: true,
      reasonCodes: [...REASONS],
      liveEvidence: fakeLiveEvidence(
        COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS[index],
        index,
      ),
    });
  }
  return {
    matrixId: 'comparative-movielens-grouped-reduce-matrix-v1',
    pairId: 'lagrange-vs-postgresql-movielens-grouped-reduce',
    sideIds: [LAGRANGE, POSTGRESQL],
    sourceRevision: SOURCE_REVISION,
    producedAt: PRODUCED_AT,
    validUntil: VALID_UNTIL,
    inventoryId: 'comparative-movielens-grouped-reduce-inventory-v1',
    inventorySides: [
      {
        sideId: LAGRANGE,
        components: [
          component('lagrange-node', BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE),
        ],
      },
      {
        sideId: POSTGRESQL,
        components: [
          component(
            'postgresql-database',
            BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
          ),
          component(
            'postgresql-client',
            BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
          ),
        ],
      },
    ],
    priceSheet: BENCHMARK_RESOURCE_P0_PRICE_SHEET,
    attempts,
  };
}

function receiptFor(artifacts, root) {
  return {
    rootDigest: root.digest,
    resolver: createBenchmarkResourceMemoryResolver([...artifacts, root]),
  };
}

function surrogateReceipt(evidence, index, mutateLive) {
  const originalSemantic = evidence.semantics[index];
  const liveEvidence = structuredClone(
    originalSemantic.artifact.payload.liveEvidence,
  );
  mutateLive(liveEvidence);
  const semantic = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.SEMANTIC_RECEIPT,
    {
      ...originalSemantic.artifact.payload,
      liveEvidence,
    },
    originalSemantic.artifact.references,
  );
  const originalEngagement = evidence.engagements[index];
  const engagement = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
    {
      ...originalEngagement.artifact.payload,
      semanticReceiptDigest: semantic.digest,
    },
    [
      semantic.digest,
      ...originalEngagement.artifact.references.slice(1),
    ],
  );
  const originalCell = evidence.cells[index];
  const cell = createBenchmarkResourceNonMeasuringCellEvidence({
    matrixManifestDigest:
      originalCell.artifact.payload.matrixManifestDigest,
    matrixId: originalCell.artifact.payload.matrixId,
    cellId: originalCell.artifact.payload.cellId,
    pairId: originalCell.artifact.payload.pairId,
    runId: originalCell.artifact.payload.runId,
    sideIds: originalCell.artifact.payload.sideIds,
    reasonCodes: originalCell.artifact.payload.reasonCodes,
    sourceDigests: [semantic.digest, engagement.digest],
    sourceRevision: originalCell.artifact.payload.sourceRevision,
    producedAt: originalCell.artifact.payload.producedAt,
    validUntil: originalCell.artifact.payload.validUntil,
  });
  const artifacts = [];
  for (let artifactIndex = 0;
    artifactIndex < evidence.artifacts.length;
    artifactIndex += 1) {
    const artifact = evidence.artifacts[artifactIndex];
    if (artifact.digest === originalSemantic.digest) {
      artifacts.push(semantic);
    } else if (artifact.digest === originalEngagement.digest) {
      artifacts.push(engagement);
    } else if (artifact.digest === originalCell.digest) {
      artifacts.push(cell);
    } else {
      artifacts.push(artifact);
    }
  }
  const cellEvidenceDigests = [...evidence.root.artifact.payload
    .cellEvidenceDigests];
  cellEvidenceDigests[index] = cell.digest;
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest:
      evidence.root.artifact.payload.matrixManifestDigest,
    componentInventoryDigest:
      evidence.root.artifact.payload.componentInventoryDigest,
    priceSheetDigest: evidence.root.artifact.payload.priceSheetDigest,
    cellEvidenceDigests,
    sourceRevision: evidence.root.artifact.payload.sourceRevision,
    producedAt: evidence.root.artifact.payload.producedAt,
    validUntil: evidence.root.artifact.payload.validUntil,
    artifacts,
  });
  return receiptFor(artifacts, root);
}

test('builds exact observed and 80/20 MovieLens matrix variants', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'lagrange-movielens-matrix-test-'),
  );
  try {
    const variants =
      await createMovielensGroupedReduceMatrixDatasets(directory);
    assert.equal(variants.length, 4);
    const hotspot = selectMovielensGroupedReduceMatrixDataset(
      variants,
      10_000,
      'movie_hotspot_80_20',
    );
    assert.equal(hotspot.bytes.length > 0, true);
    assert.equal(hotspot.digest, shaBytes(hotspot.bytes));
    const rows = hotspot.bytes.toString('utf8').trim().split('\n');
    assert.equal(rows.length, 10_000);
    let hotRows = 0;
    for (let index = 0; index < rows.length; index += 1) {
      if (Number(rows[index].split('\t')[1]) <= 410) hotRows += 1;
    }
    assert.equal(hotRows, 8_000);
  } finally {
    await rm(directory, {force: true, recursive: true});
  }
});

test('admits the exact eight-cell public semantic matrix without a claim', () => {
  const evidence = createComparativeMovielensGroupedReduceEvidence(
    inputFixture(),
  );
  const inspection =
    inspectComparativeMovielensGroupedReduceEvidence(evidence.receipt);
  assert.equal(inspection.valid, true, inspection.reason);
  assert.equal(inspection.complete, true);
  assert.equal(inspection.claimEligible, false);
  assert.equal(inspection.measuringCellCount, 0);
  assert.equal(inspection.nonMeasuringCellCount, 8);
  assert.equal(inspection.publicPathPassCount, 8);
  assert.equal(inspection.rawReplayPassCount, 8);
});

test('rejects omissions, reordering, and surrogate candidate engagement', () => {
  const omitted = inputFixture();
  omitted.attempts.pop();
  assert.throws(
    () => createComparativeMovielensGroupedReduceEvidence(omitted),
    /exact_matrix_required/u,
  );

  const reordered = inputFixture();
  [reordered.attempts[0], reordered.attempts[1]] =
    [reordered.attempts[1], reordered.attempts[0]];
  assert.throws(
    () => createComparativeMovielensGroupedReduceEvidence(reordered),
    /matrix_cell_order_mismatch/u,
  );

  const surrogate = inputFixture();
  surrogate.attempts[0].candidateEngaged = true;
  assert.throws(
    () => createComparativeMovielensGroupedReduceEvidence(surrogate),
    /false_required/u,
  );
});

test('rejects public-boundary, oracle, and topology substitutions', () => {
  const status = inputFixture();
  status.attempts[0].liveEvidence.operation.status = 201;
  assert.throws(
    () => createComparativeMovielensGroupedReduceEvidence(status),
    /public_boundary_mismatch/u,
  );

  const oracle = inputFixture();
  oracle.attempts[1].liveEvidence.oracle.observedDigest =
    shaIdentity('wrong oracle');
  assert.throws(
    () => createComparativeMovielensGroupedReduceEvidence(oracle),
    /exact_top_ten_required/u,
  );

  const topology = inputFixture();
  topology.attempts[2].liveEvidence.alternative.replicationFactor = 3;
  assert.throws(
    () => createComparativeMovielensGroupedReduceEvidence(topology),
    /topology_or_input_mismatch/u,
  );
});

test('rejects content-index and retained-byte binding substitutions', () => {
  const input = inputFixture();
  input.attempts[0].liveEvidence.content.indexDigest =
    shaIdentity('wrong index');
  assert.throws(
    () => createComparativeMovielensGroupedReduceEvidence(input),
    /descriptor_binding_mismatch/u,
  );

  const evidence = createComparativeMovielensGroupedReduceEvidence(
    inputFixture(),
  );
  const receipt = surrogateReceipt(evidence, 0, (live) => {
    live.content.replayPassed = false;
  });
  const inspection = inspectComparativeMovielensGroupedReduceEvidence(receipt);
  assert.equal(inspection.valid, false);
  assert.match(inspection.reason, /true_required/u);
});

test('rejects root byte tampering before semantic admission', () => {
  const evidence = createComparativeMovielensGroupedReduceEvidence(
    inputFixture(),
  );
  const originalResolver = evidence.receipt.resolver;
  const inspection = inspectComparativeMovielensGroupedReduceEvidence({
    rootDigest: evidence.root.digest,
    resolver: {
      resolve(digest) {
        const bytes = originalResolver.resolve(digest);
        if (digest !== evidence.root.digest || bytes === undefined) {
          return bytes;
        }
        const tampered = Buffer.from(bytes);
        tampered[tampered.length - 2] ^= 1;
        return tampered;
      },
    },
  });
  assert.equal(inspection.valid, false);
  assert.match(inspection.reason, /root:invalid/u);
});

test('snapshots evidence before caller mutation', () => {
  const input = inputFixture();
  const evidence = createComparativeMovielensGroupedReduceEvidence(input);
  input.attempts[0].liveEvidence.operation.status = 500;
  input.attempts[0].reasonCodes[0] = 'mutated';
  const inspection =
    inspectComparativeMovielensGroupedReduceEvidence(evidence.receipt);
  assert.equal(inspection.valid, true, inspection.reason);
});

test('rejects accessors and proxies without invoking hostile hooks', () => {
  const accessor = inputFixture();
  let invoked = false;
  Object.defineProperty(accessor.attempts[0], 'runId', {
    enumerable: true,
    get() {
      invoked = true;
      throw new Error('hostile accessor');
    },
  });
  assert.throws(
    () => createComparativeMovielensGroupedReduceEvidence(accessor),
    /exact_record_required/u,
  );
  assert.equal(invoked, false);

  const proxied = inputFixture();
  proxied.attempts[0].liveEvidence = new Proxy(
    proxied.attempts[0].liveEvidence,
    {},
  );
  assert.throws(
    () => createComparativeMovielensGroupedReduceEvidence(proxied),
    /exact_record_required/u,
  );
});

test('producer and inspector survive poisoned mutable intrinsics', () => {
  const producerInput = inputFixture();
  const evidence = createComparativeMovielensGroupedReduceEvidence(
    inputFixture(),
  );
  let produced;
  let inspection;
  const poisoned = () => {
    throw new Error('poisoned mutable intrinsic');
  };
  withHostileIntrinsics([
    replacePrototypeProperty(Array.prototype, 'filter', poisoned),
    replacePrototypeProperty(Array.prototype, Symbol.iterator, poisoned),
    replacePrototypeProperty(Array.prototype, 'map', poisoned),
    replacePrototypeProperty(JSON, 'stringify', poisoned),
    replacePrototypeProperty(Map.prototype, 'get', poisoned),
    replacePrototypeProperty(Map.prototype, 'set', poisoned),
  ], () => {
    produced =
      createComparativeMovielensGroupedReduceEvidence(producerInput);
    inspection =
      inspectComparativeMovielensGroupedReduceEvidence(evidence.receipt);
  });
  assert.equal(produced.root.digest, evidence.root.digest);
  assert.equal(inspection.valid, true, inspection.reason);
});
