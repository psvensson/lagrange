import {
  BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON,
  BENCHMARK_RESOURCE_WINDOW_PHASE,
} from './benchmark-resource-contract-constants.js';

const dateParse = Date.parse;
const arrayJoinMethod = Array.prototype.join;
const arrayPushMethod = Array.prototype.push;
const mapGetMethod = Map.prototype.get;
const mapSetMethod = Map.prototype.set;
const reflectApply = Reflect.apply;
const setAddMethod = Set.prototype.add;
const setHasMethod = Set.prototype.has;
const setSizeGetter =
  Object.getOwnPropertyDescriptor(Set.prototype, 'size').get;

export {BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON};

const coordinateSeparator = '\u0000';

function fail(reason) {
  throw new TypeError(reason);
}

function sideAllowed(sideIds, sideId) {
  for (let index = 0; index < sideIds.length; index += 1) {
    if (sideIds[index] === sideId) return true;
  }
  return false;
}

function coordinateKey(window) {
  return reflectApply(arrayJoinMethod, [
    window.cellId,
    window.blockIndex,
    window.blockedOrderIndex,
    window.sideId,
    window.offeredLoad,
    window.loadIndex,
    window.phase,
  ], [coordinateSeparator]);
}

function pairedCoordinate(window) {
  return reflectApply(arrayJoinMethod, [
    window.cellId,
    window.blockIndex,
    window.offeredLoad,
    window.loadIndex,
    window.phase,
  ], [coordinateSeparator]);
}

function overlaps(left, right) {
  return dateParse(left.startedAt) < dateParse(right.endedAt) &&
    dateParse(right.startedAt) < dateParse(left.endedAt);
}

export function createBenchmarkResourceWindowCoordinateContext({
  allowCrossSideOverlap = false,
} = {}) {
  return {
    allowCrossSideOverlap,
    coordinateKeys: new Set(),
    pairedBlocks: new Map(),
    pairedBlockList: [],
    windows: [],
  };
}

export function appendBenchmarkResourceMeasuredWindowCoordinate(
  context,
  window,
  expected,
) {
  const reason = BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON;
  if (
    window.matrixManifestDigest !== expected.matrixManifestDigest ||
    window.matrixId !== expected.matrixId ||
    window.cellId !== expected.cellId ||
    window.pairId !== expected.pairId ||
    window.runId !== expected.runId ||
    window.profileIdentity !== expected.profileIdentity ||
    !sideAllowed(expected.sideIds, window.sideId)
  ) {
    fail(reason.MISMATCH);
  }
  if (window.phase !== BENCHMARK_RESOURCE_WINDOW_PHASE.MEASURED) {
    fail(reason.PHASE);
  }
  const key = coordinateKey(window);
  if (reflectApply(setHasMethod, context.coordinateKeys, [key])) {
    fail(reason.DUPLICATE);
  }
  reflectApply(setAddMethod, context.coordinateKeys, [key]);

  for (let index = 0; index < context.windows.length; index += 1) {
    const existing = context.windows[index];
    if (
      overlaps(existing, window) &&
      (
        !context.allowCrossSideOverlap ||
        existing.sideId === window.sideId
      )
    ) {
      fail(reason.OVERLAP);
    }
  }
  reflectApply(arrayPushMethod, context.windows, [window]);

  const paired =
    reflectApply(mapGetMethod, context.pairedBlocks, [window.pairedBlockId]);
  const pairedKey = pairedCoordinate(window);
  if (paired === undefined) {
    const sides = new Set();
    const orders = new Set();
    reflectApply(setAddMethod, sides, [window.sideId]);
    reflectApply(setAddMethod, orders, [window.blockedOrderIndex]);
    const record = {
      pairedKey,
      sides,
      orders,
    };
    reflectApply(mapSetMethod, context.pairedBlocks, [
      window.pairedBlockId,
      record,
    ]);
    reflectApply(arrayPushMethod, context.pairedBlockList, [record]);
    return;
  }
  if (
    paired.pairedKey !== pairedKey ||
    reflectApply(setHasMethod, paired.sides, [window.sideId]) ||
    reflectApply(setHasMethod, paired.orders, [window.blockedOrderIndex])
  ) {
    fail(reason.PAIRED_BLOCK_MISMATCH);
  }
  reflectApply(setAddMethod, paired.sides, [window.sideId]);
  reflectApply(setAddMethod, paired.orders, [window.blockedOrderIndex]);
}

export function assertBenchmarkResourceMeasuredWindowCoordinatesComplete(
  context,
  sideIds,
  expectedWindows = null,
) {
  for (let pairIndex = 0;
    pairIndex < context.pairedBlockList.length;
    pairIndex += 1) {
    const paired = context.pairedBlockList[pairIndex];
    if (reflectApply(setSizeGetter, paired.sides, []) !== sideIds.length) {
      fail(
        BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.PAIRED_BLOCK_INCOMPLETE,
      );
    }
    for (let index = 0; index < sideIds.length; index += 1) {
      if (!reflectApply(setHasMethod, paired.sides, [sideIds[index]])) {
        fail(
          BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.PAIRED_BLOCK_INCOMPLETE,
        );
      }
    }
  }
  if (expectedWindows === null) return;
  if (
    expectedWindows.length !==
      reflectApply(setSizeGetter, context.coordinateKeys, [])
  ) {
    fail(BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.EXPECTED_SET_MISMATCH);
  }
  const expectedKeys = new Set();
  for (let index = 0; index < expectedWindows.length; index += 1) {
    const key = coordinateKey(expectedWindows[index]);
    if (
      reflectApply(setHasMethod, expectedKeys, [key]) ||
      !reflectApply(setHasMethod, context.coordinateKeys, [key])
    ) {
      fail(BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.EXPECTED_SET_MISMATCH);
    }
    reflectApply(setAddMethod, expectedKeys, [key]);
  }
}
