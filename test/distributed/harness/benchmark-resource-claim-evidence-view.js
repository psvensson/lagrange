import {
  BENCHMARK_RESOURCE_CELL_STATE,
} from './benchmark-resource-contract-constants.js';
import {
  BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE,
} from './benchmark-resource-evidence-root-constants.js';
import {
  benchmarkResourceAcceptedMeasurementOutcome,
  benchmarkResourceRejectedMeasurementOutcome,
} from './benchmark-resource-measurement-outcome.js';

const structuredCloneValue = globalThis.structuredClone;
const mapGetMethod = Map.prototype.get;
const mapSetMethod = Map.prototype.set;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectKeys = Object.keys;
const reflectApply = Reflect.apply;
const localText = Object.freeze({
  PRICE_VALID: 'valid',
  PRICE_INVALID: 'invalid',
});

export {
  BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE,
  benchmarkResourceRejectedMeasurementOutcome,
};

export const BENCHMARK_RESOURCE_CLAIM_MEASUREMENT_STATE = Object.freeze({
  MEASURING: BENCHMARK_RESOURCE_CELL_STATE.MEASURING,
  NON_MEASURING: BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING,
});

function appendOwnArrayValue(values, value) {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  objectFreeze(value);
  const keys = objectKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    deepFreeze(value[keys[index]]);
  }
  return value;
}

function mapGet(map, key) {
  return reflectApply(mapGetMethod, map, [key]);
}

function mapSet(map, key, value) {
  reflectApply(mapSetMethod, map, [key, value]);
}

function dimensionsByCellId(matrix) {
  const dimensions = new Map();
  for (let index = 0; index < matrix.cells.length; index += 1) {
    const cell = matrix.cells[index];
    mapSet(dimensions, cell.cellId, cell.dimensions);
  }
  return dimensions;
}

function measuringCell(payload, dimensions) {
  return {
    cellId: payload.cellId,
    dimensions: structuredCloneValue(dimensions),
    measurement: {
      state: BENCHMARK_RESOURCE_CLAIM_MEASUREMENT_STATE.MEASURING,
      capacityEffect: structuredCloneValue(payload.capacityEffect),
      costEffect: structuredCloneValue(payload.costEffect),
    },
  };
}

function nonMeasuringCell(payload, dimensions) {
  return {
    cellId: payload.cellId,
    dimensions: structuredCloneValue(dimensions),
    measurement: {
      state: BENCHMARK_RESOURCE_CLAIM_MEASUREMENT_STATE.NON_MEASURING,
      reasonCodes: structuredCloneValue(payload.reasonCodes),
    },
  };
}

function claimCells(matrix, cellPayloads) {
  const dimensions = dimensionsByCellId(matrix);
  const payloadByCellId = new Map();
  for (let index = 0; index < cellPayloads.length; index += 1) {
    const payload = cellPayloads[index];
    mapSet(payloadByCellId, payload.cellId, payload);
  }
  const cells = [];
  for (let index = 0; index < matrix.cells.length; index += 1) {
    const matrixCell = matrix.cells[index];
    const payload = mapGet(payloadByCellId, matrixCell.cellId);
    appendOwnArrayValue(
      cells,
      payload.state === BENCHMARK_RESOURCE_CELL_STATE.MEASURING ?
        measuringCell(payload, mapGet(dimensions, payload.cellId)) :
        nonMeasuringCell(payload, mapGet(dimensions, payload.cellId)),
    );
  }
  return cells;
}

export function createBenchmarkResourceClaimEvidenceView(input) {
  return deepFreeze({
    rootDigest: input.rootDigest,
    claimEligible: input.claimEligible,
    measurementOutcome:
      benchmarkResourceAcceptedMeasurementOutcome(input.claimEligible),
    matrixId: input.owners.matrix.matrixId,
    sideIds: structuredCloneValue(input.owners.matrix.sideIds),
    sourceRevision: input.root.sourceRevision,
    producedAt: input.root.producedAt,
    validUntil: input.root.validUntil,
    profile: structuredCloneValue(input.owners.profile),
    priceSheet: input.owners.priceValidAtProduction ? {
      state: localText.PRICE_VALID,
      digest: input.owners.priceDigest,
      validFrom: input.owners.price.validFrom,
      validUntil: input.owners.price.validUntil,
    } : {
      state: localText.PRICE_INVALID,
      digest: input.owners.priceDigest,
      validFrom: null,
      validUntil: null,
    },
    cells: claimCells(input.owners.matrix, input.cellPayloads),
  });
}
