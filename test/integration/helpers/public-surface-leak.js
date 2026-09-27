// Topology-leak detector for values an application receives from Lagrange.
//
// The public Application Database surface must never hand an application the
// cluster's shape: no partition, node, replica, leader, term, epoch, read
// witness, participant, plan, routing target or address, under any key and in
// any value. This walks EVERYTHING a consumer could observe - every own key
// (enumerable or not), recursively, including error `cause` chains - and
// reports each violation with its path. It accepts either a live value or an
// exposure snapshot produced by embedded-node-worker.js (the cross-process
// form), so in-process and multi-process suites share one definition.

// A key is a leak when a word of it STARTS one of these (see keyWords).
const TOPOLOGY_KEY_FRAGMENTS = Object.freeze([
  'partition',
  'node',
  'replica',
  'leader',
  'term',
  'epoch',
  'witness',
  'participant',
  'plan',
  'routedto',
  'address',
]);

const SESSION_KEY_FRAGMENT = 'session';
const SNAPSHOT_OBJECT_KIND = 'object';
const SNAPSHOT_BYTES_KIND = 'bytes';
const PATH_ROOT = '$';

/**
 * Split a key into lower-case words at camelCase, snake_case, kebab and dot
 * boundaries, so a fragment matches only where a word starts: `nodeId`,
 * `servingReplicaId`, `partitions`, `routedToNode` match; `retryAfterMs`
 * does not match `term`.
 * @param {string} key
 * @return {string[]}
 */
function keyWords(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}

function isSnapshotObject(value) {
  return value !== null && typeof value === 'object' &&
    value.__kind === SNAPSHOT_OBJECT_KIND &&
    value.properties !== null && typeof value.properties === 'object';
}

function isSnapshotBytes(value) {
  return value !== null && typeof value === 'object' &&
    value.__kind === SNAPSHOT_BYTES_KIND;
}

function ownEntries(value) {
  if (isSnapshotObject(value)) {
    return Object.entries(value.properties)
      .map(([key, property]) => [key, property.value]);
  }
  return Reflect.ownKeys(value).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return [String(key), Object.hasOwn(descriptor, 'value') ?
      descriptor.value :
      undefined];
  });
}

/**
 * Find every topology leak in a value an application received.
 * @param {*} value - a live value or an exposure snapshot
 * @param {{forbiddenValues?: string[], extraKeyFragments?: string[],
 *   allowedKeys?: string[]}} [options] - forbiddenValues: identities the
 *   harness knows (node ids, partition ids, session ids) that must not appear
 *   inside any string; extraKeyFragments: further forbidden key fragments
 *   (e.g. 'session'); allowedKeys: exact keys the APPLICATION declared (its
 *   own column names) that are exempt from the key check.
 * @return {{path: string, reason: string}[]}
 */
function findTopologyLeaks(value, options = {}) {
  const fragments = [
    ...TOPOLOGY_KEY_FRAGMENTS,
    ...(options.extraKeyFragments ?? []),
  ];
  const forbiddenValues = (options.forbiddenValues ?? [])
    .filter((candidate) => typeof candidate === 'string' && candidate.length > 0);
  const allowedKeys = new Set(options.allowedKeys ?? []);
  const leaks = [];
  const ancestors = new Set();

  function visitString(current, path) {
    for (const forbidden of forbiddenValues) {
      if (current.includes(forbidden)) {
        leaks.push({path, reason: `value contains ${forbidden}`});
      }
    }
  }

  function isOpaque(current) {
    return current === null ||
      (typeof current !== 'object' && typeof current !== 'function') ||
      isSnapshotBytes(current) ||
      current instanceof Uint8Array ||
      ancestors.has(current);
  }

  function visitKey(key, path) {
    const words = keyWords(key);
    const fragment = fragments.find((candidate) =>
      words.some((_, index) => words.slice(index).join('').startsWith(candidate)));
    if (fragment && !allowedKeys.has(key)) {
      leaks.push({path, reason: `key contains ${fragment}`});
    }
  }

  function visit(current, path) {
    if (typeof current === 'string') {
      visitString(current, path);
      return;
    }
    if (isOpaque(current)) return;
    ancestors.add(current);
    for (const [key, child] of ownEntries(current)) {
      visitKey(key, `${path}.${key}`);
      visit(child, `${path}.${key}`);
    }
    ancestors.delete(current);
  }

  visit(value, PATH_ROOT);
  return leaks;
}

export {
  SESSION_KEY_FRAGMENT,
  findTopologyLeaks,
};
