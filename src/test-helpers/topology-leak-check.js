// Topology-leak check for values a public-seam consumer receives.
//
// The public Application Database surface must never hand an application the
// cluster's shape: no partition, node, replica, leader, term, epoch, read
// witness, participant, plan, routing target, address or similar, under any
// key and in any value. This walks EVERYTHING a consumer could observe - every
// own key (enumerable or not), recursively, including error `cause` chains -
// and reports each violation with its path. It accepts either a live value or
// an exposure snapshot (`{__kind: 'object', properties: {key: {value}}}`, the
// cross-process form produced by test/integration/helpers/
// embedded-node-protocol.js), so in-process and multi-process suites share
// one definition. Test-only: nothing under src/ outside test-helpers imports it.

// A key is a leak when a word of it STARTS one of these (see keyWords). This
// is the one list every public-seam suite uses (the in-process and
// multi-process Application Database suites, the Binding seam suites and the
// provider-neutral public-seam durability scenario); a legitimate
// application key that happens to match (plan_name, address_line1,
// terms_accepted) is exempted per call through `allowedKeys`. The fragments
// are deliberately broad: `hostname` is caught by `host` and `ownerId` by
// `owner`; a false positive costs a look at the report, a missed topology
// key costs the seam claim.
const TOPOLOGY_KEY_FRAGMENTS = Object.freeze([
  'address',
  'candidate',
  'election',
  'endpoint',
  'epoch',
  'follower',
  'holder',
  'host',
  'leader',
  'lease',
  'member',
  'node',
  'owner',
  'participant',
  'partition',
  'peer',
  'placement',
  'plan',
  'quorum',
  'replica',
  'role',
  'routedto',
  'shard',
  'term',
  'voter',
  'witness',
]);

const SESSION_KEY_FRAGMENT = 'session';

// Keys a service lifecycle failure legitimately carries that the broad
// fragments above would flag. `ownerCode` is the typed error code of the
// owner a lifecycle command delegated to (e.g. ROUTE_NOT_FOUND), set by
// describeFailure in src/service/service-lifecycle-command-failure.js; it
// names an outcome, not a place, so it is not topology. It is exempted
// explicitly where lifecycle errors are checked (pass as `allowedKeys`),
// never by default: an application result carrying `ownerCode` is still
// reported unless the application declared it.
const LIFECYCLE_ERROR_ALLOWED_KEYS = Object.freeze(['ownerCode']);
// What a reported leak matched: a topology-bearing KEY (match = the
// fragment) or a known identity inside a string VALUE (match = the value).
const LEAK_KIND = Object.freeze({
  KEY: 'key',
  VALUE: 'value',
});

const SNAPSHOT_OBJECT_KIND = 'object';
const SNAPSHOT_BYTES_KIND = 'bytes';
const PATH_ROOT = '$';
const WORD_BREAK_REPLACEMENT = '$1 $2';
const DATA_DESCRIPTOR_FIELD = 'value';

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
    .replace(/([a-z0-9])([A-Z])/g, WORD_BREAK_REPLACEMENT)
    .replace(/([A-Z]+)([A-Z][a-z])/g, WORD_BREAK_REPLACEMENT)
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

function isArrayLike(value) {
  return Array.isArray(value) ||
    (isSnapshotObject(value) && value.array === true);
}

// `$.rows[0].id` for an array element, `$.detail.code` for a property, the
// same for a live value and its exposure snapshot.
function childPath(parent, value, key) {
  return isArrayLike(value) ? `${parent}[${key}]` : `${parent}.${key}`;
}

function ownEntries(value) {
  if (isSnapshotObject(value)) {
    return Object.entries(value.properties)
      .map(([key, property]) => [key, property.value]);
  }
  return Reflect.ownKeys(value).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return [String(key), Object.hasOwn(descriptor, DATA_DESCRIPTOR_FIELD) ?
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
 * @return {{kind: string, match: string, path: string, reason: string}[]}
 *   kind is a LEAK_KIND; match is the fragment (KEY) or identity (VALUE).
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
        leaks.push({kind: LEAK_KIND.VALUE, match: forbidden, path,
          reason: `value contains ${forbidden}`});
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
      leaks.push({kind: LEAK_KIND.KEY, match: fragment, path,
        reason: `key contains ${fragment}`});
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
      const keyPath = childPath(path, current, key);
      visitKey(key, keyPath);
      visit(child, keyPath);
    }
    ancestors.delete(current);
  }

  visit(value, PATH_ROOT);
  return leaks;
}

export {
  LEAK_KIND,
  LIFECYCLE_ERROR_ALLOWED_KEYS,
  SESSION_KEY_FRAGMENT,
  TOPOLOGY_KEY_FRAGMENTS,
  findTopologyLeaks,
};
