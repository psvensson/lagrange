const freezeObject = Object.freeze;

export const OPPORTUNITY_CALCULATOR_SCHEMA_VERSION =
  'comparative-opportunity-input-v1';
export const OPPORTUNITY_CALCULATOR_FORMULA_VERSION =
  'comparative-opportunity-formula-v1';
export const OPPORTUNITY_CALCULATOR_OUTPUT_SCHEMA_VERSION =
  'comparative-opportunity-output-v1';
export const OPPORTUNITY_CALCULATOR_EVIDENCE_CLASS = 'analytical_bound';

export const OPPORTUNITY_CALIBRATION_STATE = freezeObject({
  ABSENT: 'absent',
  MEASURED: 'measured',
});

export const OPPORTUNITY_UNCERTAINTY_CLASSES = freezeObject({
  high: true,
  low: true,
  medium: true,
});

export const OPPORTUNITY_QUANTITY_UNITS = freezeObject({
  averageDistanceKm: 'kilometer',
  baseIopsPerOperation: 'io_operation/operation',
  compactionAmplification: 'ratio',
  correctOperations: 'operation',
  cpuCoresPerNode: 'cpu_core/node',
  fixedCpuSecondsPerOperation: 'cpu_second/operation',
  groupingBytes: 'byte/operation',
  headroomFraction: 'ratio',
  highMultiplier: 'ratio',
  invalidationBytes: 'byte/operation',
  ioBlockBytes: 'byte/io_operation',
  localCpuSecondsPerByte: 'cpu_second/byte',
  lookupBytes: 'byte/lookup',
  lookupsPerOperation: 'lookup/operation',
  lowMultiplier: 'ratio',
  materializedBytes: 'byte/operation',
  memoryBytesPerNode: 'byte/node',
  minimumNodes: 'node',
  mutationBytes: 'byte/operation',
  operationRate: 'operation/second',
  rebuildFraction: 'ratio',
  remoteCpuSecondsPerByte: 'cpu_second/byte',
  remoteFraction: 'ratio',
  replicationFactor: 'replica',
  requestBytes: 'byte/operation',
  responseBytes: 'byte/operation',
  reuseRate: 'ratio',
  shuffleFraction: 'ratio',
  storageBytes: 'byte',
  storageBytesPerNode: 'byte/node',
  workingSetBytes: 'byte',
});

export const OPPORTUNITY_PROJECTION_TEXT = freezeObject({
  OPERATION_UNIT_SUFFIX: '/operation',
  TOTAL_ASSUMPTION:
    'Total projection scales the per-correct-operation estimate linearly.',
});
