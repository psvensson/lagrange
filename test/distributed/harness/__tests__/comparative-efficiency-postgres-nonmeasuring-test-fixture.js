import {
  replacePrototypeProperty,
  withHostileIntrinsics,
} from '../../../helpers/hostile-intrinsics.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_COMPONENT_ROLE,
} from '../benchmark-resource-contract-constants.js';
import {
  createBenchmarkResourceMemoryResolver,
} from '../benchmark-resource-evidence-data.js';
import {
  createBenchmarkResourceEvidenceRoot,
  createBenchmarkResourceNonMeasuringCellEvidence,
  createBenchmarkResourceSourceArtifact,
} from '../benchmark-resource-evidence-root.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from '../benchmark-resource-live-observation-authority.js';

const fixtureScalar = Object.freeze({
  BLOCK_READ_BYTES: 3_000,
  BLOCK_READ_OPERATIONS: 3,
  BLOCK_WRITE_BYTES: 4_000,
  BLOCK_WRITE_OPERATIONS: 4,
  CPU_LIMIT_NANO_CPUS: 1_000_000_000,
  CPU_PERCENT: 10,
  CPU_USAGE_NANOSECONDS: 10_000,
  MEMORY_LIMIT_BYTES: 1_000_000,
  MEMORY_USAGE_BYTES: 100_000,
  PIDS: 5,
  RX_BYTES: 1_000,
  SNAPSHOT_DURATION_MS: 60_000,
  STORAGE_LIMIT_BYTES: 1_000_000,
  STORAGE_USAGE_BYTES: 10_000,
  TX_BYTES: 2_000,
});
const localText = Object.freeze({
  ARRAY_FILTER: 'arrayFilter',
  ARRAY_ITERATOR: 'arrayIterator',
  ARRAY_MAP: 'arrayMap',
  CANDIDATE_COMPONENT: 'lagrange-node',
  CANDIDATE_SIDE: 'lagrange',
  CLIENT_COMPONENT: 'postgresql-client',
  DATABASE_COMPONENT: 'postgresql-database',
  FILTER: 'filter',
  FLOOR: 'floor',
  GET: 'get',
  JSON_STRINGIFY: 'jsonStringify',
  MAP: 'map',
  MAP_GET: 'mapGet',
  MAP_SET: 'mapSet',
  MATH_FLOOR: 'mathFloor',
  NONE: 'none',
  POSTGRES_SIDE: 'postgresql',
  SET: 'set',
  STRINGIFY: 'stringify',
});

function resourceStats(timestamp, multiplier) {
  return {
    timestamp,
    cpuPercent: fixtureScalar.CPU_PERCENT * multiplier,
    cpuUsageNanoseconds:
      fixtureScalar.CPU_USAGE_NANOSECONDS * multiplier,
    memoryUsageBytes: fixtureScalar.MEMORY_USAGE_BYTES * multiplier,
    memoryLimitBytes: fixtureScalar.MEMORY_LIMIT_BYTES,
    cpuLimitNanoCpus: fixtureScalar.CPU_LIMIT_NANO_CPUS,
    storageLimitBytes: fixtureScalar.STORAGE_LIMIT_BYTES,
    pids: fixtureScalar.PIDS,
    rxBytes: fixtureScalar.RX_BYTES * multiplier,
    txBytes: fixtureScalar.TX_BYTES * multiplier,
    blockReadBytes: fixtureScalar.BLOCK_READ_BYTES * multiplier,
    blockWriteBytes: fixtureScalar.BLOCK_WRITE_BYTES * multiplier,
    blockReadOperations:
      fixtureScalar.BLOCK_READ_OPERATIONS * multiplier,
    blockWriteOperations:
      fixtureScalar.BLOCK_WRITE_OPERATIONS * multiplier,
    storageUsageBytes: fixtureScalar.STORAGE_USAGE_BYTES * multiplier,
  };
}

export async function createComparativePostgresCalibrationFixture({
  sourceRevision,
  producedAt,
  fixtureName,
}) {
  const startedAt = Date.parse(producedAt);
  const endedAt = startedAt + fixtureScalar.SNAPSHOT_DURATION_MS;
  const networkId = `${fixtureName}-network`;
  let calls = 0;
  let cleaned = false;
  const provider = {
    async inspectContainer() {
      return {State: {Running: true}};
    },
    async inspectContainerIfExists() {
      return cleaned ? null : {State: {Running: true}};
    },
    async getContainerResourceSnapshot() {
      calls += 1;
      return resourceStats(
        calls <= 2 ? startedAt : endedAt,
        calls <= 2 ? 1 : 2,
      );
    },
    async getNetworkByName() {
      return cleaned ? null : {id: networkId};
    },
  };
  const session = await beginBenchmarkResourceLiveObservation(provider, {
    runId: `${fixtureName}-live-fixture`,
    networkId,
    networkName: networkId,
    sourceRevision,
    components: [
      {
        componentId: 'postgresql-database',
        sideId: localText.POSTGRES_SIDE,
        containerId: 'postgresql-container',
        storagePath: '/var/lib/postgresql/data',
      },
      {
        componentId: 'postgresql-client',
        sideId: localText.POSTGRES_SIDE,
        containerId: 'client-container',
        storagePath: '/tmp',
      },
    ],
  });
  await captureBenchmarkResourceLiveObservation(session);
  cleaned = true;
  const finalized = await finalizeBenchmarkResourceLiveObservation(session);
  return writeExternallyObservedBenchmarkResourceCalibration(
    finalized.receipt,
    finalized.authorization,
  );
}

function component(componentId, role) {
  return {
    componentId,
    role,
    billingTreatment: BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED,
    provisioned: {
      cpuCores: 1,
      memoryBytes: fixtureScalar.MEMORY_LIMIT_BYTES,
      storageBytes: fixtureScalar.STORAGE_LIMIT_BYTES,
      iops: 0,
      networkBytesPerSecond: 0,
    },
    minimumFootprint: {
      instances: 1,
      cpuCores: 0,
      memoryBytes: 0,
      storageBytes: 0,
    },
    reservedHeadroomRatio: 0,
    exclusionReason: localText.NONE,
  };
}

export function comparativePostgresNonMeasuringInventorySides() {
  return [
    {
      sideId: localText.CANDIDATE_SIDE,
      components: [
        component(
          localText.CANDIDATE_COMPONENT,
          BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE,
        ),
      ],
    },
    {
      sideId: localText.POSTGRES_SIDE,
      components: [
        component(
          localText.DATABASE_COMPONENT,
          BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
        ),
        component(
          localText.CLIENT_COMPONENT,
          BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
        ),
      ],
    },
  ];
}

export function rebuildComparativeNonMeasuringSourceReceipt(
  evidence,
  mutate,
  options = {},
) {
  const normalizedOptions = typeof options === 'number' ?
    {index: options} :
    options;
  const targetIndex = normalizedOptions.index || 0;
  const originalSource = evidence.engagements[targetIndex];
  const originalCell = evidence.cells[targetIndex];
  const payload = JSON.parse(JSON.stringify(originalSource.artifact.payload));
  mutate(payload);
  const references =
    normalizedOptions.references || originalSource.artifact.references;
  const source = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
    payload,
    references,
  );
  const cellPayload = originalCell.artifact.payload;
  const cell = createBenchmarkResourceNonMeasuringCellEvidence({
    matrixManifestDigest: cellPayload.matrixManifestDigest,
    matrixId: cellPayload.matrixId,
    cellId: cellPayload.cellId,
    pairId: cellPayload.pairId,
    runId: cellPayload.runId,
    sideIds: cellPayload.sideIds,
    reasonCodes: cellPayload.reasonCodes,
    sourceDigests: [source.digest],
    sourceRevision: cellPayload.sourceRevision,
    producedAt: cellPayload.producedAt,
    validUntil: cellPayload.validUntil,
  });
  const artifacts = evidence.artifacts.filter((artifact) => (
    artifact.digest !== originalSource.digest &&
    artifact.digest !== originalCell.digest
  ));
  artifacts.push(source, cell);
  const rootPayload = evidence.root.artifact.payload;
  const cellDigests = [...rootPayload.cellEvidenceDigests];
  cellDigests[targetIndex] = cell.digest;
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest: rootPayload.matrixManifestDigest,
    componentInventoryDigest: rootPayload.componentInventoryDigest,
    priceSheetDigest: rootPayload.priceSheetDigest,
    cellEvidenceDigests: cellDigests,
    sourceRevision: rootPayload.sourceRevision,
    producedAt: rootPayload.producedAt,
    validUntil: rootPayload.validUntil,
    artifacts,
  });
  return {
    rootDigest: root.digest,
    resolver: createBenchmarkResourceMemoryResolver([...artifacts, root]),
  };
}

export function exerciseComparativeNonMeasuringHostileIntrinsics({
  input,
  evidence,
  firstCell,
  buildWitness,
  createEvidence,
  inspectEvidence,
}) {
  const calls = {
    arrayFilter: 0,
    arrayIterator: 0,
    arrayMap: 0,
    jsonStringify: 0,
    mapGet: 0,
    mapSet: 0,
    mathFloor: 0,
  };
  function poison(name) {
    return function poisonedIntrinsic() {
      calls[name] += 1;
      throw new Error(`mutable intrinsic invoked: ${name}`);
    };
  }
  let inspection;
  let produced;
  let witness;
  withHostileIntrinsics([
    replacePrototypeProperty(
      Array.prototype,
      localText.FILTER,
      poison(localText.ARRAY_FILTER),
    ),
    replacePrototypeProperty(
      Array.prototype,
      Symbol.iterator,
      poison(localText.ARRAY_ITERATOR),
    ),
    replacePrototypeProperty(
      Array.prototype,
      localText.MAP,
      poison(localText.ARRAY_MAP),
    ),
    replacePrototypeProperty(
      JSON,
      localText.STRINGIFY,
      poison(localText.JSON_STRINGIFY),
    ),
    replacePrototypeProperty(
      Map.prototype,
      localText.GET,
      poison(localText.MAP_GET),
    ),
    replacePrototypeProperty(
      Map.prototype,
      localText.SET,
      poison(localText.MAP_SET),
    ),
    replacePrototypeProperty(
      Math,
      localText.FLOOR,
      poison(localText.MATH_FLOOR),
    ),
  ], () => {
    witness = buildWitness(firstCell);
    produced = createEvidence(input);
    inspection = inspectEvidence(evidence.receipt);
  });
  return {calls, inspection, produced, witness};
}
