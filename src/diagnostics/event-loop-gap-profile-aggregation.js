/**
 * Pure aggregation for V8 CPU-profile windows retained by the event-loop gap
 * watchdog. Caller-owned profile objects are canonicalized exactly once before
 * graph analysis so diagnostics remain stable under accessor traps or mutated
 * JavaScript intrinsics.
 */

const NativeMap = Map;
const NativeSet = Set;
const arrayIsArray = Array.isArray;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const mathRound = Math.round;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const reflectApply = Reflect.apply;
const stringConstructor = String;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const setAdd = Function.call.bind(Set.prototype.add);
const setDelete = Function.call.bind(Set.prototype.delete);
const setHas = Function.call.bind(Set.prototype.has);
const arrayPush = Function.call.bind(Array.prototype.push);
const arrayPop = Function.call.bind(Array.prototype.pop);
const arrayReverse = Function.call.bind(Array.prototype.reverse);
const arraySort = Function.call.bind(Array.prototype.sort);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arrayJoin = Function.call.bind(Array.prototype.join);
const stringLastIndexOf = Function.call.bind(String.prototype.lastIndexOf);
const stringSlice = Function.call.bind(String.prototype.slice);

const PROFILE_META_FRAME_NAMES = new NativeSet([
  '(root)',
  '(program)',
  '(idle)',
  '(garbage collector)',
]);

const DEFAULT_CALLER_TARGET_FUNCTIONS = objectFreeze([
  'getNodeReadinessSync',
  'executeAuthoritativeSystemTableRead',
  'executeAuthoritativeOwnerRpcRead',
]);

const DEFAULT_CALL_PATH_DEPTH = 8;
const MAX_CALL_PATH_DEPTH = 64;
const MAX_PROFILE_NODES = 100000;
const MAX_PROFILE_EDGES = 200000;
const PROFILE_ANONYMOUS_FRAME = '(anonymous)';
const PROFILE_MILLISECONDS_PER_SECOND = 1000;
const PROFILE_SHARE_SCALE = 1000;
const PROFILE_INCLUSIVE_HITS_FIELD = 'inclusiveHits';
const PROPERTY_DESCRIPTOR_GET_FIELD = 'get';
const PROPERTY_DESCRIPTOR_VALUE_FIELD = 'value';
const PROFILE_OPTION_FIELD = objectFreeze({
  SAMPLING_INTERVAL_US: 'samplingIntervalUs',
  TOP_FRAMES: 'topFrames',
  MAX_CALL_PATH_DEPTH: 'maxCallPathDepth',
  TARGET_FUNCTIONS: 'targetFunctions',
});
const MAX_SAFE_INTEGER = 9007199254740991;
const INVALID_CANONICAL_PROFILE_VALUE = Symbol(
  'invalid_canonical_profile_value',
);

function readOwnDescriptor(record, key) {
  try {
    return objectGetOwnPropertyDescriptor(record, key);
  } catch {
    return INVALID_CANONICAL_PROFILE_VALUE;
  }
}

function readOwnValue(record, key) {
  if (!record || typeof record !== 'object') {
    return undefined;
  }
  const descriptor = readOwnDescriptor(record, key);
  if (descriptor === INVALID_CANONICAL_PROFILE_VALUE) {
    return INVALID_CANONICAL_PROFILE_VALUE;
  }
  if (!descriptor) {
    return undefined;
  }
  try {
    if (objectHasOwn(descriptor, PROPERTY_DESCRIPTOR_GET_FIELD)) {
      return typeof descriptor.get === 'function' ?
        reflectApply(descriptor.get, record, []) :
        undefined;
    }
    return objectHasOwn(descriptor, PROPERTY_DESCRIPTOR_VALUE_FIELD) ?
      descriptor.value :
      INVALID_CANONICAL_PROFILE_VALUE;
  } catch {
    return INVALID_CANONICAL_PROFILE_VALUE;
  }
}

function isArray(value) {
  try {
    return arrayIsArray(value);
  } catch {
    return false;
  }
}

function isNonNegativeSafeInteger(value) {
  return typeof value === 'number' &&
    numberIsFinite(value) &&
    numberIsSafeInteger(value) &&
    !objectIs(value, -0) &&
    value >= 0;
}

function normalizeNonNegativeSafeInteger(value) {
  return isNonNegativeSafeInteger(value) ? value : 0;
}

function normalizePositiveSafeInteger(value, fallback = 0) {
  const normalized = normalizeNonNegativeSafeInteger(value);
  return normalized > 0 ? normalized : fallback;
}

function normalizeBoundedPositiveSafeInteger(value, fallback, maximum) {
  const normalized = normalizePositiveSafeInteger(value, fallback);
  return normalized > maximum ? maximum : normalized;
}

function safeAdd(left, right) {
  const sum = left + right;
  return numberIsSafeInteger(sum) && sum >= 0 ? sum : MAX_SAFE_INTEGER;
}

function safeMilliseconds(hits, samplingIntervalUs) {
  const value = (hits / PROFILE_MILLISECONDS_PER_SECOND) * samplingIntervalUs;
  if (!numberIsFinite(value) || value >= MAX_SAFE_INTEGER) {
    return MAX_SAFE_INTEGER;
  }
  return mathRound(value);
}

function compactProfileUrl(url) {
  if (typeof url !== 'string') {
    return '';
  }
  const sourceIndex = stringLastIndexOf(url, '/src/');
  if (sourceIndex >= 0) {
    return stringSlice(url, sourceIndex + 1);
  }
  const nodeModulesIndex = stringLastIndexOf(url, '/node_modules/');
  if (nodeModulesIndex >= 0) {
    return stringSlice(url, nodeModulesIndex + 1);
  }
  return url;
}

function canonicalizeStringArray(value) {
  if (!isArray(value)) {
    return [];
  }
  const lengthDescriptor = readOwnDescriptor(value, 'length');
  if (lengthDescriptor === INVALID_CANONICAL_PROFILE_VALUE) {
    return [];
  }
  const length = lengthDescriptor && objectHasOwn(lengthDescriptor, 'value') ?
    lengthDescriptor.value :
    null;
  if (!numberIsSafeInteger(length) || length < 0 || length > MAX_PROFILE_NODES) {
    return [];
  }
  const result = [];
  for (let index = 0; index < length; index++) {
    const item = readOwnValue(value, stringConstructor(index));
    if (typeof item === 'string') {
      arrayPush(result, item);
    }
  }
  return result;
}

function canonicalizeChildIds(value, remainingEdgeBudget) {
  if (value === undefined || value === null) {
    return objectFreeze([]);
  }
  if (!isArray(value)) return INVALID_CANONICAL_PROFILE_VALUE;
  const lengthDescriptor = readOwnDescriptor(value, 'length');
  if (lengthDescriptor === INVALID_CANONICAL_PROFILE_VALUE) {
    return INVALID_CANONICAL_PROFILE_VALUE;
  }
  const length = lengthDescriptor && objectHasOwn(lengthDescriptor, 'value') ?
    lengthDescriptor.value :
    null;
  if (!numberIsSafeInteger(length) || length < 0 ||
      length > MAX_PROFILE_NODES || length > remainingEdgeBudget.value) {
    return INVALID_CANONICAL_PROFILE_VALUE;
  }
  remainingEdgeBudget.value -= length;
  const childIds = [];
  for (let index = 0; index < length; index++) {
    const childId = readOwnValue(value, stringConstructor(index));
    if (!isNonNegativeSafeInteger(childId)) {
      return INVALID_CANONICAL_PROFILE_VALUE;
    }
    arrayPush(childIds, childId);
  }
  return objectFreeze(childIds);
}

function canonicalizeProfileFrame(callFrame) {
  const functionName = readOwnValue(callFrame, 'functionName');
  const url = readOwnValue(callFrame, 'url');
  const lineNumber = readOwnValue(callFrame, 'lineNumber');
  if (
    functionName === INVALID_CANONICAL_PROFILE_VALUE ||
    url === INVALID_CANONICAL_PROFILE_VALUE ||
    lineNumber === INVALID_CANONICAL_PROFILE_VALUE
  ) {
    return INVALID_CANONICAL_PROFILE_VALUE;
  }
  return objectFreeze({
    fn:
      typeof functionName === 'string' && functionName.length > 0 ?
        functionName :
        PROFILE_ANONYMOUS_FRAME,
    url: compactProfileUrl(url),
    line:
      isNonNegativeSafeInteger(lineNumber) &&
        lineNumber < MAX_SAFE_INTEGER ?
        lineNumber + 1 :
        null,
  });
}

function canonicalizeProfile(profile) {
  const sourceNodes = readOwnValue(profile, 'nodes');
  if (!isArray(sourceNodes)) {
    return objectFreeze([]);
  }
  const lengthDescriptor = readOwnDescriptor(sourceNodes, 'length');
  if (lengthDescriptor === INVALID_CANONICAL_PROFILE_VALUE) {
    return objectFreeze([]);
  }
  const length = lengthDescriptor && objectHasOwn(lengthDescriptor, 'value') ?
    lengthDescriptor.value :
    null;
  if (!numberIsSafeInteger(length) || length < 0 || length > MAX_PROFILE_NODES) {
    return objectFreeze([]);
  }
  const nodes = [];
  const remainingEdgeBudget = {value: MAX_PROFILE_EDGES};
  for (let index = 0; index < length; index++) {
    const sourceNode = readOwnValue(sourceNodes, stringConstructor(index));
    if (!sourceNode || typeof sourceNode !== 'object' ||
      sourceNode === INVALID_CANONICAL_PROFILE_VALUE) {
      return objectFreeze([]);
    }
    const id = readOwnValue(sourceNode, 'id');
    const children = readOwnValue(sourceNode, 'children');
    const hitCount = readOwnValue(sourceNode, 'hitCount');
    const callFrame = readOwnValue(sourceNode, 'callFrame');
    if (
      id === INVALID_CANONICAL_PROFILE_VALUE ||
      children === INVALID_CANONICAL_PROFILE_VALUE ||
      hitCount === INVALID_CANONICAL_PROFILE_VALUE ||
      callFrame === INVALID_CANONICAL_PROFILE_VALUE ||
      !isNonNegativeSafeInteger(id)
    ) {
      return objectFreeze([]);
    }
    const childIds = canonicalizeChildIds(children, remainingEdgeBudget);
    if (childIds === INVALID_CANONICAL_PROFILE_VALUE) {
      return objectFreeze([]);
    }
    const frame = canonicalizeProfileFrame(callFrame);
    if (frame === INVALID_CANONICAL_PROFILE_VALUE) {
      return objectFreeze([]);
    }
    arrayPush(nodes, objectFreeze({
      id,
      children: childIds,
      hitCount: normalizeNonNegativeSafeInteger(hitCount),
      frame,
    }));
  }
  return objectFreeze(nodes);
}

function profileFrameKey(frame) {
  const line = frame.line === null ? 'n' : `i${frame.line}`;
  return `${frame.fn.length}:${frame.fn}${frame.url.length}:${frame.url}${line}`;
}

function buildSubtreeHitsReader(nodeById) {
  const subtreeHitsById = new NativeMap();
  return (rootId) => {
    const visiting = new NativeSet();
    const stack = [{nodeId: rootId, expanded: false}];
    while (stack.length > 0) {
      const stackFrame = stack[stack.length - 1];
      if (mapHas(subtreeHitsById, stackFrame.nodeId)) {
        arrayPop(stack);
        continue;
      }
      const node = mapGet(nodeById, stackFrame.nodeId);
      if (!node) {
        mapSet(subtreeHitsById, stackFrame.nodeId, 0);
        arrayPop(stack);
        continue;
      }
      if (!stackFrame.expanded) {
        stackFrame.expanded = true;
        setAdd(visiting, stackFrame.nodeId);
        for (let index = 0; index < node.children.length; index++) {
          const childId = node.children[index];
          if (!mapHas(subtreeHitsById, childId) && !setHas(visiting, childId)) {
            arrayPush(stack, {nodeId: childId, expanded: false});
          }
        }
        continue;
      }
      let hits = node.hitCount;
      for (let index = 0; index < node.children.length; index++) {
        hits = safeAdd(hits, mapGet(subtreeHitsById, node.children[index]) || 0);
      }
      mapSet(subtreeHitsById, stackFrame.nodeId, hits);
      setDelete(visiting, stackFrame.nodeId);
      arrayPop(stack);
    }
    return mapGet(subtreeHitsById, rootId) || 0;
  };
}

function graphHasCycle(nodes, nodeById, parentById) {
  const roots = [];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (!mapHas(parentById, node.id)) {
      arrayPush(roots, node.id);
    }
  }
  let visitedCount = 0;
  for (let rootIndex = 0; rootIndex < roots.length; rootIndex++) {
    const stack = [roots[rootIndex]];
    while (stack.length > 0) {
      const nodeId = arrayPop(stack);
      visitedCount += 1;
      const node = mapGet(nodeById, nodeId);
      for (let childIndex = 0; childIndex < node.children.length; childIndex++) {
        arrayPush(stack, node.children[childIndex]);
      }
    }
  }
  return visitedCount !== nodes.length;
}

function validateCanonicalGraph(nodes) {
  const nodeById = new NativeMap();
  const parentById = new NativeMap();
  let totalSamples = 0;
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (mapHas(nodeById, node.id)) {
      return INVALID_CANONICAL_PROFILE_VALUE;
    }
    mapSet(nodeById, node.id, node);
    totalSamples = safeAdd(totalSamples, node.hitCount);
  }
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    const childIds = new NativeSet();
    for (let childIndex = 0; childIndex < node.children.length; childIndex++) {
      const childId = node.children[childIndex];
      if (!mapHas(nodeById, childId) || setHas(childIds, childId) ||
          mapHas(parentById, childId)) {
        return INVALID_CANONICAL_PROFILE_VALUE;
      }
      setAdd(childIds, childId);
      mapSet(parentById, childId, node.id);
    }
  }
  if (graphHasCycle(nodes, nodeById, parentById)) {
    return INVALID_CANONICAL_PROFILE_VALUE;
  }
  return {nodeById, parentById, totalSamples};
}

function emptyProfileTree() {
  const nodeById = new NativeMap();
  return {
    nodes: objectFreeze([]),
    nodeById,
    parentById: new NativeMap(),
    subtreeHits: buildSubtreeHitsReader(nodeById),
    totalSamples: 0,
  };
}

function buildProfileTree(profile) {
  const nodes = canonicalizeProfile(profile);
  const validated = validateCanonicalGraph(nodes);
  if (validated === INVALID_CANONICAL_PROFILE_VALUE) {
    return emptyProfileTree();
  }
  const {nodeById, parentById, totalSamples} = validated;
  return {
    nodes,
    nodeById,
    parentById,
    subtreeHits: buildSubtreeHitsReader(nodeById),
    totalSamples,
  };
}

function withSampleTiming(entry, hitsKey, samplingIntervalUs, totalSamples) {
  const hits = normalizeNonNegativeSafeInteger(entry[hitsKey]);
  return {
    ...entry,
    [hitsKey]: hits,
    inclusiveMs: safeMilliseconds(hits, samplingIntervalUs),
    inclusiveShare: totalSamples > 0 ?
      mathRound((hits / totalSamples) * PROFILE_SHARE_SCALE) /
        PROFILE_SHARE_SCALE :
      0,
  };
}

function rankEntries(entries, hitsKey, topFrames, mapEntry) {
  arraySort(entries, (left, right) => right[hitsKey] - left[hitsKey]);
  const limited = arraySlice(entries, 0, topFrames);
  const result = [];
  for (let index = 0; index < limited.length; index++) {
    arrayPush(result, mapEntry(limited[index]));
  }
  return result;
}

function collectMapValues(map) {
  const values = [];
  mapForEach(map, (value) => arrayPush(values, value));
  return values;
}

function normalizeAggregationOptions(options = {}) {
  const maxCallPathDepth = readOwnValue(
    options,
    PROFILE_OPTION_FIELD.MAX_CALL_PATH_DEPTH,
  );
  return {
    samplingIntervalUs: normalizePositiveSafeInteger(
      readOwnValue(options, PROFILE_OPTION_FIELD.SAMPLING_INTERVAL_US),
    ),
    topFrames: normalizePositiveSafeInteger(
      readOwnValue(options, PROFILE_OPTION_FIELD.TOP_FRAMES),
    ),
    maxCallPathDepth: normalizeBoundedPositiveSafeInteger(
      maxCallPathDepth,
      DEFAULT_CALL_PATH_DEPTH,
      MAX_CALL_PATH_DEPTH,
    ),
    targetFunctions: canonicalizeStringArray(
      readOwnValue(options, PROFILE_OPTION_FIELD.TARGET_FUNCTIONS) ??
        DEFAULT_CALLER_TARGET_FUNCTIONS,
    ),
  };
}

function aggregateTopProfileFramesFromTree(tree, normalizedOptions) {
  const {samplingIntervalUs, topFrames} = normalizedOptions;
  const {nodes, totalSamples} = tree;
  const frameByKey = new NativeMap();
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.hitCount <= 0) {
      continue;
    }
    const key = profileFrameKey(node.frame);
    const existing = mapGet(frameByKey, key);
    const frame = existing || {...node.frame, hits: 0, stackNodes: 0};
    frame.hits = safeAdd(frame.hits, node.hitCount);
    frame.stackNodes = safeAdd(frame.stackNodes, 1);
    mapSet(frameByKey, key, frame);
  }
  const ranked = rankEntries(
    collectMapValues(frameByKey),
    'hits',
    topFrames,
    (frame) => ({
      ...frame,
      selfMs: safeMilliseconds(frame.hits, samplingIntervalUs),
      share: totalSamples > 0 ?
        mathRound((frame.hits / totalSamples) * PROFILE_SHARE_SCALE) /
          PROFILE_SHARE_SCALE :
        0,
    }),
  );
  return {totalSamples, topFrames: ranked};
}

function aggregateTopProfileFrames(profile, options = {}) {
  const normalizedOptions = normalizeAggregationOptions(options);
  return aggregateTopProfileFramesFromTree(
    buildProfileTree(profile),
    normalizedOptions,
  );
}

function aggregateTopInclusiveProfileFramesFromTree(tree, normalizedOptions) {
  const {samplingIntervalUs, topFrames} = normalizedOptions;
  const inclusiveByKey = new NativeMap();
  for (let index = 0; index < tree.nodes.length; index++) {
    const node = tree.nodes[index];
    if (setHas(PROFILE_META_FRAME_NAMES, node.frame.fn)) {
      continue;
    }
    const key = profileFrameKey(node.frame);
    const frame = mapGet(inclusiveByKey, key) || {
      ...node.frame,
      inclusiveHits: 0,
    };
    frame.inclusiveHits = safeAdd(
      frame.inclusiveHits,
      tree.subtreeHits(node.id),
    );
    mapSet(inclusiveByKey, key, frame);
  }
  return rankEntries(
    collectMapValues(inclusiveByKey),
    PROFILE_INCLUSIVE_HITS_FIELD,
    topFrames,
    (frame) => withSampleTiming(
      frame,
      PROFILE_INCLUSIVE_HITS_FIELD,
      samplingIntervalUs,
      tree.totalSamples,
    ),
  );
}

function aggregateTopInclusiveProfileFrames(profile, options = {}) {
  const normalizedOptions = normalizeAggregationOptions(options);
  return aggregateTopInclusiveProfileFramesFromTree(
    buildProfileTree(profile),
    normalizedOptions,
  );
}

function buildApplicationCallPath(nodeId, tree, maxDepth) {
  const frames = [];
  const visited = new NativeSet();
  let currentId = nodeId;
  while (currentId !== undefined && frames.length < maxDepth) {
    if (setHas(visited, currentId)) {
      return [];
    }
    setAdd(visited, currentId);
    const node = mapGet(tree.nodeById, currentId);
    if (!node) {
      break;
    }
    if (!setHas(PROFILE_META_FRAME_NAMES, node.frame.fn)) {
      arrayPush(frames, node.frame);
    }
    currentId = mapGet(tree.parentById, currentId);
  }
  return arrayReverse(frames);
}

function aggregateProfileCallerAttributionFromTree(tree, normalizedOptions) {
  const {
    samplingIntervalUs,
    topFrames,
    targetFunctions,
    maxCallPathDepth,
  } = normalizedOptions;
  const targetSet = new NativeSet();
  for (let index = 0; index < targetFunctions.length; index++) {
    setAdd(targetSet, targetFunctions[index]);
  }
  const edgeByKey = new NativeMap();
  const pathByKey = new NativeMap();
  for (let index = 0; index < tree.nodes.length; index++) {
    const node = tree.nodes[index];
    const callee = node.frame;
    if (!setHas(targetSet, callee.fn)) {
      continue;
    }
    const inclusiveHits = tree.subtreeHits(node.id);
    const parent = mapGet(tree.nodeById, mapGet(tree.parentById, node.id));
    if (parent && !setHas(PROFILE_META_FRAME_NAMES, parent.frame.fn)) {
      const edgeKey =
        `${profileFrameKey(parent.frame)}>${profileFrameKey(callee)}`;
      const edge = mapGet(edgeByKey, edgeKey) || {
        caller: parent.frame,
        callee,
        inclusiveHits: 0,
      };
      edge.inclusiveHits = safeAdd(edge.inclusiveHits, inclusiveHits);
      mapSet(edgeByKey, edgeKey, edge);
    }
    const frames = buildApplicationCallPath(
      node.id,
      tree,
      maxCallPathDepth,
    );
    const frameKeys = [];
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      arrayPush(frameKeys, profileFrameKey(frames[frameIndex]));
    }
    const pathKey = `${callee.fn}|${arrayJoin(frameKeys, '>')}`;
    const path = mapGet(pathByKey, pathKey) || {
      targetFn: callee.fn,
      frames,
      inclusiveHits: 0,
    };
    path.inclusiveHits = safeAdd(path.inclusiveHits, inclusiveHits);
    mapSet(pathByKey, pathKey, path);
  }
  const rank = (entries) => rankEntries(
    entries,
    PROFILE_INCLUSIVE_HITS_FIELD,
    topFrames,
    (entry) => withSampleTiming(
      entry,
      PROFILE_INCLUSIVE_HITS_FIELD,
      samplingIntervalUs,
      tree.totalSamples,
    ),
  );
  return {
    topCallerEdges: rank(collectMapValues(edgeByKey)),
    topCallPaths: rank(collectMapValues(pathByKey)),
  };
}

function aggregateProfileCallerAttribution(profile, options = {}) {
  const normalizedOptions = normalizeAggregationOptions(options);
  return aggregateProfileCallerAttributionFromTree(
    buildProfileTree(profile),
    normalizedOptions,
  );
}

function aggregateProfileWindow(profile, options = {}) {
  const normalizedOptions = normalizeAggregationOptions(options);
  const tree = buildProfileTree(profile);
  return {
    ...aggregateTopProfileFramesFromTree(tree, normalizedOptions),
    topInclusiveFrames: aggregateTopInclusiveProfileFramesFromTree(
      tree,
      normalizedOptions,
    ),
    ...aggregateProfileCallerAttributionFromTree(tree, normalizedOptions),
  };
}

export {
  aggregateProfileCallerAttribution,
  aggregateProfileWindow,
  aggregateTopInclusiveProfileFrames,
  aggregateTopProfileFrames,
  compactProfileUrl,
};
