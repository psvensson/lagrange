import {
  concatenateArraysByIndex,
  copyArrayByIndex,
  digest,
  joinArrayByIndex,
  replaceExactSuffixByIndex,
} from './comparative-efficiency-opportunity-input-integrity.js';
import {
  OPPORTUNITY_CALCULATOR_EVIDENCE_CLASS,
  OPPORTUNITY_CALCULATOR_FORMULA_VERSION,
  OPPORTUNITY_CALCULATOR_OUTPUT_SCHEMA_VERSION,
  OPPORTUNITY_CALIBRATION_STATE,
  OPPORTUNITY_PROJECTION_TEXT,
} from './comparative-efficiency-opportunity-constants.js';
import {
  validateOpportunityCalculatorInput,
} from './comparative-efficiency-opportunity-input-validation.js';

export {
  OPPORTUNITY_CALCULATOR_EVIDENCE_CLASS,
  OPPORTUNITY_CALCULATOR_FORMULA_VERSION,
  OPPORTUNITY_CALCULATOR_SCHEMA_VERSION,
} from './comparative-efficiency-opportunity-constants.js';
export {validateOpportunityCalculatorInput};

const numberIsFinite = Number.isFinite;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectIsFrozen = Object.isFrozen;
const objectKeys = Object.keys;
const structuredCloneValue = globalThis.structuredClone;
const MAX_SAFE_MAGNITUDE = Number.MAX_SAFE_INTEGER;
const ERROR_TEXT = objectFreeze({
  ERROR_SEPARATOR: ', ',
  INPUT_PREFIX: 'invalid opportunity input: ',
  OUTPUT_PREFIX: 'invalid opportunity output: ',
  FINITE_REQUIRED: 'finite_required',
  SAFE_NUMBER_REQUIRED: 'safe_number_required',
});
const OUTPUT_PATH = 'output';

function value(input, field) {
  return input.quantities[field].value;
}

function greaterOf(first, second) {
  return first > second ? first : second;
}

function estimate(
  input,
  valueNumber,
  unit,
  formula,
  assumptions = [],
  sensitivityOptions = {},
) {
  const low = value(input, 'lowMultiplier');
  const high = value(input, 'highMultiplier');
  const lowFloor = objectHasOwn(sensitivityOptions, 'lowFloor') ?
    sensitivityOptions.lowFloor :
    0;
  const sensitivityLow = greaterOf(
    valueNumber * low,
    lowFloor,
  );
  return {
    value: valueNumber,
    unit,
    formula,
    assumptions: concatenateArraysByIndex(input.assumptions, assumptions),
    sensitivity: {
      low: sensitivityLow,
      high: valueNumber * high,
      unit,
      lowMultiplier: low,
      highMultiplier: high,
    },
    uncertainty: input.uncertainty,
  };
}

function relativeError(predicted, measured) {
  return (predicted - measured) / measured;
}

function buildPredictionErrorQuantity(input, predicted, measured, unit) {
  const lowMultiplier = value(input, 'lowMultiplier');
  const highMultiplier = value(input, 'highMultiplier');
  const result = {
    predicted,
    measured,
    unit,
    relativeError: relativeError(predicted, measured),
    relativeErrorUnit: 'ratio',
    formula: '(predicted-measured)/measured',
    assumptions: copyArrayByIndex(input.assumptions),
    sensitivity: {
      low: relativeError(predicted * lowMultiplier, measured),
      high: relativeError(predicted * highMultiplier, measured),
      unit: 'ratio',
      lowMultiplier,
      highMultiplier,
    },
    uncertainty: input.uncertainty,
  };
  return result;
}

function buildPredictionError(input, networkBytes, cpuSeconds) {
  if (input.calibration.state === OPPORTUNITY_CALIBRATION_STATE.ABSENT) {
    const absent = {state: OPPORTUNITY_CALIBRATION_STATE.ABSENT};
    return absent;
  }
  const measuredNetwork =
    input.calibration.measuredNetworkBytesPerOperation.value;
  const measuredCpu =
    input.calibration.measuredCpuSecondsPerOperation.value;
  const measured = {
    state: OPPORTUNITY_CALIBRATION_STATE.MEASURED,
    artifactDigest: input.calibration.artifactDigest,
    networkBytesPerOperation: buildPredictionErrorQuantity(
      input,
      networkBytes,
      measuredNetwork,
      'byte/operation',
    ),
    cpuSecondsPerOperation: buildPredictionErrorQuantity(
      input,
      cpuSeconds,
      measuredCpu,
      'cpu_second/operation',
    ),
  };
  return measured;
}

function deepFreeze(valueObject) {
  if (!valueObject || typeof valueObject !== 'object' ||
      objectIsFrozen(valueObject)) {
    return valueObject;
  }
  objectFreeze(valueObject);
  const fields = objectKeys(valueObject);
  for (let index = 0; index < fields.length; index += 1) {
    deepFreeze(valueObject[fields[index]]);
  }
  return valueObject;
}

function assertSafeDerivedNumbers(valueObject, path = OUTPUT_PATH) {
  if (typeof valueObject === 'number') {
    if (!numberIsFinite(valueObject) || objectIs(valueObject, -0)) {
      throw new TypeError(
        `${ERROR_TEXT.OUTPUT_PREFIX}${path}:${ERROR_TEXT.FINITE_REQUIRED}`,
      );
    }
    if (valueObject > MAX_SAFE_MAGNITUDE ||
        valueObject < -MAX_SAFE_MAGNITUDE) {
      throw new TypeError(
        `${ERROR_TEXT.OUTPUT_PREFIX}${path}:` +
          ERROR_TEXT.SAFE_NUMBER_REQUIRED,
      );
    }
    return;
  }
  if (!valueObject || typeof valueObject !== 'object') return;
  const fields = objectKeys(valueObject);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    assertSafeDerivedNumbers(valueObject[field], `${path}.${field}`);
  }
}

export function calculateComparativeOpportunity(input) {
  const validation = validateOpportunityCalculatorInput(input);
  if (!validation.valid) {
    throw new TypeError(
      `${ERROR_TEXT.INPUT_PREFIX}${joinArrayByIndex(
        validation.errors,
        ERROR_TEXT.ERROR_SEPARATOR,
      )}`,
    );
  }
  const immutableInput = structuredCloneValue(input);
  return calculateValidatedOpportunity(immutableInput);
}

function calculateValidatedOpportunity(input) {
  const immutableInput = input;
  const requestBytes = value(input, 'requestBytes');
  const responseBytes = value(input, 'responseBytes');
  const lookupBytes = value(input, 'lookupBytes');
  const lookups = value(input, 'lookupsPerOperation');
  const mutationBytes = value(input, 'mutationBytes');
  const groupingBytes = value(input, 'groupingBytes');
  const materializedBytes = value(input, 'materializedBytes');
  const invalidationBytes = value(input, 'invalidationBytes');
  const remoteFraction = value(input, 'remoteFraction');
  const replicationFactor = value(input, 'replicationFactor');
  const reuseRate = value(input, 'reuseRate');

  const primaryLookupBytes =
    lookupBytes * (lookups < 1 ? lookups : 1);
  const accessedBytes =
    requestBytes + responseBytes + primaryLookupBytes + mutationBytes;
  const localBytes = accessedBytes * (1 - remoteFraction);
  const remoteBytes = accessedBytes * remoteFraction;
  const replicationBytes = mutationBytes * greaterOf(
    0,
    replicationFactor - 1,
  );
  const fanoutBytes = lookupBytes * greaterOf(0, lookups - 1);
  const shuffleBytes = groupingBytes * value(input, 'shuffleFraction');
  const rebuildBytes = mutationBytes * value(input, 'rebuildFraction');
  const compactionBytes =
    mutationBytes * value(input, 'compactionAmplification');
  const materializationAmplificationBytes =
    materializedBytes * (1 - reuseRate) + invalidationBytes;
  const networkBytes =
    remoteBytes + replicationBytes + fanoutBytes + shuffleBytes + rebuildBytes;
  const cpuSeconds =
    localBytes * value(input, 'localCpuSecondsPerByte') +
    networkBytes * value(input, 'remoteCpuSecondsPerByte') +
    value(input, 'fixedCpuSecondsPerOperation');
  const operationRate = value(input, 'operationRate');
  const headroomFraction = value(input, 'headroomFraction');
  const headroomDivisor = 1 - headroomFraction;
  const utilizedCpuCores = cpuSeconds * operationRate;
  const provisionedCpuCores = greaterOf(
    utilizedCpuCores / headroomDivisor,
    value(input, 'minimumNodes') * value(input, 'cpuCoresPerNode'),
  );
  const provisionedCpuSecondsPerOperation =
    provisionedCpuCores / operationRate;
  const provisionedMemoryBytes = greaterOf(
    value(input, 'workingSetBytes') / headroomDivisor,
    value(input, 'minimumNodes') * value(input, 'memoryBytesPerNode'),
  );
  const provisionedStorageBytes = greaterOf(
    value(input, 'storageBytes') / headroomDivisor,
    value(input, 'minimumNodes') * value(input, 'storageBytesPerNode'),
  );
  const memoryByteSecondsPerOperation =
    provisionedMemoryBytes / operationRate;
  const storageByteSecondsPerOperation =
    provisionedStorageBytes / operationRate;
  const storageTraffic =
    mutationBytes + compactionBytes + materializationAmplificationBytes;
  const iopsPerOperation =
    value(input, 'baseIopsPerOperation') +
    storageTraffic / value(input, 'ioBlockBytes');
  const networkByteDistance =
    networkBytes * value(input, 'averageDistanceKm');
  const correctOperations = value(input, 'correctOperations');

  const estimates = {
    localBytesPerCorrectOperation: estimate(
      input,
      localBytes,
      'byte/operation',
      '(request + response + lookup_bytes*min(lookups,1) + mutation) * ' +
        '(1-remote_fraction)',
    ),
    remoteBytesPerCorrectOperation: estimate(
      input,
      remoteBytes,
      'byte/operation',
      '(request + response + lookup_bytes*min(lookups,1) + mutation) * ' +
        'remote_fraction',
    ),
    replicationBytesPerCorrectOperation: estimate(
      input,
      replicationBytes,
      'byte/operation',
      'mutation_bytes * max(replication_factor-1, 0)',
    ),
    fanoutBytesPerCorrectOperation: estimate(
      input,
      fanoutBytes,
      'byte/operation',
      'lookup_bytes * max(lookups_per_operation-1, 0)',
    ),
    shuffleBytesPerCorrectOperation: estimate(
      input,
      shuffleBytes,
      'byte/operation',
      'grouping_bytes * shuffle_fraction',
    ),
    rebuildBytesPerCorrectOperation: estimate(
      input,
      rebuildBytes,
      'byte/operation',
      'mutation_bytes * rebuild_fraction',
    ),
    compactionBytesPerCorrectOperation: estimate(
      input,
      compactionBytes,
      'byte/operation',
      'mutation_bytes * compaction_amplification',
    ),
    materializationBytesPerCorrectOperation: estimate(
      input,
      materializationAmplificationBytes,
      'byte/operation',
      'materialized_bytes * (1-reuse_rate) + invalidation_bytes',
    ),
    utilizedCpuSecondsPerCorrectOperation: estimate(
      input,
      cpuSeconds,
      'cpu_second/operation',
      'local_bytes*local_cpu_per_byte + network_bytes*remote_cpu_per_byte + ' +
        'fixed_cpu_per_operation',
    ),
    provisionedCpuSecondsPerCorrectOperation: estimate(
      input,
      provisionedCpuSecondsPerOperation,
      'cpu_second/operation',
      'max(utilized_cpu_cores/(1-headroom), minimum_node_cpu) / operation_rate',
      ['Includes minimum deployable CPU footprint.'],
      {
        lowFloor:
          value(input, 'minimumNodes') *
          value(input, 'cpuCoresPerNode') /
          operationRate,
      },
    ),
    memoryByteSecondsPerCorrectOperation: estimate(
      input,
      memoryByteSecondsPerOperation,
      'byte_second/operation',
      'max(working_set/(1-headroom), minimum_node_memory) / operation_rate',
      ['Represents provisioned, not utilized, memory.'],
      {
        lowFloor:
          value(input, 'minimumNodes') *
          value(input, 'memoryBytesPerNode') /
          operationRate,
      },
    ),
    storageByteSecondsPerCorrectOperation: estimate(
      input,
      storageByteSecondsPerOperation,
      'byte_second/operation',
      'max(storage/(1-headroom), minimum_node_storage) / operation_rate',
      ['Represents provisioned, not utilized, storage.'],
      {
        lowFloor:
          value(input, 'minimumNodes') *
          value(input, 'storageBytesPerNode') /
          operationRate,
      },
    ),
    iopsPerCorrectOperation: estimate(
      input,
      iopsPerOperation,
      'io_operation/operation',
      'base_iops + (mutation + compaction + materialization) / io_block_bytes',
    ),
    networkByteDistancePerCorrectOperation: estimate(
      input,
      networkByteDistance,
      'byte_kilometer/operation',
      'network_bytes * average_distance_km',
    ),
  };
  const totals = {};
  const estimateKeys = objectKeys(estimates);
  for (let index = 0; index < estimateKeys.length; index += 1) {
    const key = estimateKeys[index];
    const item = estimates[key];
    const totalKey = replaceExactSuffixByIndex(
      key,
      'PerCorrectOperation',
      'ForCorrectOperations',
    );
    objectDefineProperty(totals, totalKey, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: estimate(
        input,
        item.value * correctOperations,
        replaceExactSuffixByIndex(
          item.unit,
          OPPORTUNITY_PROJECTION_TEXT.OPERATION_UNIT_SUFFIX,
          '',
        ),
        `${key} * correct_operations`,
        [OPPORTUNITY_PROJECTION_TEXT.TOTAL_ASSUMPTION],
        {lowFloor: item.sensitivity.low * correctOperations},
      ),
    });
  }
  const output = {
    schemaVersion: OPPORTUNITY_CALCULATOR_OUTPUT_SCHEMA_VERSION,
    formulaVersion: OPPORTUNITY_CALCULATOR_FORMULA_VERSION,
    evidenceClass: OPPORTUNITY_CALCULATOR_EVIDENCE_CLASS,
    fixtureId: immutableInput.fixtureId,
    inputDigest: digest(immutableInput),
    assumptions: copyArrayByIndex(immutableInput.assumptions),
    uncertainty: immutableInput.uncertainty,
    estimates,
    totals,
    provisioning: {
      headroomFraction: estimate(
        input,
        headroomFraction,
        'ratio',
        'declared_headroom_fraction',
      ),
      minimumNodes: estimate(
        input,
        value(input, 'minimumNodes'),
        'node',
        'declared_minimum_nodes',
        [],
        {lowFloor: value(input, 'minimumNodes')},
      ),
      provisionedCpuCores: estimate(
        input,
        provisionedCpuCores,
        'cpu_core',
        'max(utilized_cpu_cores/(1-headroom), minimum_node_cpu)',
        [],
        {
          lowFloor:
            value(input, 'minimumNodes') * value(input, 'cpuCoresPerNode'),
        },
      ),
      provisionedMemoryBytes: estimate(
        input,
        provisionedMemoryBytes,
        'byte',
        'max(working_set/(1-headroom), minimum_node_memory)',
        [],
        {
          lowFloor:
            value(input, 'minimumNodes') * value(input, 'memoryBytesPerNode'),
        },
      ),
      provisionedStorageBytes: estimate(
        input,
        provisionedStorageBytes,
        'byte',
        'max(storage/(1-headroom), minimum_node_storage)',
        [],
        {
          lowFloor:
            value(input, 'minimumNodes') * value(input, 'storageBytesPerNode'),
        },
      ),
    },
    predictionError: buildPredictionError(input, networkBytes, cpuSeconds),
    limitations: [
      'Analytical bound only; not measured throughput, latency, capacity, ' +
        'scale, or infrastructure cost.',
      'Sensitivity multipliers apply uniformly and do not imply a probability ' +
      'distribution.',
    ],
  };
  assertSafeDerivedNumbers(output);
  return deepFreeze(output);
}
