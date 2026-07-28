import {types} from 'node:util';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceText,
} from './benchmark-resource-evidence-data.js';
import {appendOwnArrayValue} from './benchmark-semantic-integrity.js';
import {
  findBenchmarkResourceInventorySide,
} from './benchmark-resource-accounting.js';

const dateParse = Date.parse;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const dataValueKey = 'value';
const regexpTest = Function.call.bind(RegExp.prototype.test);
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export function assertBenchmarkResourceTimestamp(value, path) {
  if (
    typeof value !== 'string' ||
    !regexpTest(timestampPattern, value) ||
    !Number.isFinite(dateParse(value))
  ) {
    throw new TypeError(`${path}:iso_timestamp_required`);
  }
}

export function safeBenchmarkResourceValidationReason(error, fallback) {
  if (!error || typeof error !== 'object' || types.isProxy(error)) {
    return fallback;
  }
  const descriptor = objectGetOwnPropertyDescriptor(error, 'message');
  return (
    descriptor &&
    objectHasOwn(descriptor, dataValueKey) &&
    typeof descriptor.value === 'string'
  ) ? descriptor.value : fallback;
}

export function copyBenchmarkResourceSideIds(sideIds, path) {
  assertBenchmarkResourceArray(sideIds, path, 2);
  if (sideIds.length !== 2) {
    throw new TypeError(`${path}:exact_pair_required`);
  }
  const copy = [];
  for (let index = 0; index < sideIds.length; index += 1) {
    assertBenchmarkResourceText(sideIds[index], `${path}.${index}`);
    appendOwnArrayValue(copy, sideIds[index]);
  }
  if (copy[0] === copy[1]) throw new TypeError(`${path}:distinct_required`);
  return copy;
}

export function assertBenchmarkResourceEvidenceOwnerJoin(owners, reason) {
  if (owners.inventory.matrixId !== owners.matrix.matrixId) {
    throw new TypeError(reason);
  }
  for (let index = 0; index < owners.matrix.sideIds.length; index += 1) {
    if (
      findBenchmarkResourceInventorySide(
        owners.inventory,
        owners.matrix.sideIds[index],
      ) === undefined
    ) {
      throw new TypeError(reason);
    }
  }
}
