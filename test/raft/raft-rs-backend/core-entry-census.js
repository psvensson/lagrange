// The census of RawNode entry sites: everything production can use to invoke
// this replica's core, enumerated BY REACHABILITY rather than by name.
//
// Two rejections found the same root one level deeper than the last repair
// looked: a guard applied at named paths while the raw runtime stayed
// reachable behind a property the receipt did not think to name. A check on
// two property names at depth one cannot catch that; a census can, because it
// asks a different question - what can be reached at all, and what does each
// reachable thing do when this replica is retired.
//
// It has three parts, and each is red for a different kind of hole:
//
//   REACHABILITY - walk the object graph from what the seam hands out (the
//   node, and the group it resolves) to every depth, through own properties,
//   prototypes and getters. Nothing reachable may be a core facade or the
//   runtime host that holds one: reaching either is reaching the RawNode
//   without passing the gate, whatever the property is called.
//
//   ENTRY METHODS - enumerate every method those objects expose, classify
//   each against a declared table, and refuse to pass on a method the table
//   does not mention. A future entry method is red until someone declares it,
//   and a method declared ACTIVE must be refused by the lifecycle gate when
//   the replica is retired - which is the invariant itself: every production
//   path that can invoke this RawNode first passes the same local lifecycle
//   eligibility owner.
//
//   SOURCE - the modules in src that obtain a core facade at all. Only the
//   loader that builds one and the runtime host that holds it may.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RAFT_SOURCE_ROOT = path.join(REPOSITORY_ROOT, 'src', 'raft');
const SOURCE_SUFFIX = '.js';
const TEXT_ENCODING = 'utf8';
// The modules allowed to obtain a core facade: the one that builds it and
// the one that holds it. Anything else that can name a facade has an entry
// site the gate does not see.
const FACADE_HOLDERS = Object.freeze([
  'raft-rs-core.js',
  'raft-rs-runtime-health.js',
  'raft-rs-provider.js',
]);
const FACADE_SOURCES = /\b(instantiateRaftRsCore|loadRaftRsCore)\s*\(/u;
// A value is a core facade when it answers to the core's own primitives.
const CORE_PRIMITIVE_SAMPLE = Object.freeze([
  'tick', 'step', 'propose', 'status', 'campaign', 'has_ready']);
const CORE_PRIMITIVES_THAT_MAKE_IT_A_CORE = 3;
// A value is the runtime host when it answers to the host's own surface: it
// holds a facade, so reaching it is reaching the core one call later.
const RUNTIME_HOST_SURFACE = Object.freeze(['run', 'openGroup']);
const WALK_DEPTH = 8;
const CENSUS_CLEAN = 'clean';

const ENTRY_CLASS = Object.freeze({
  // Takes part in the group: must be refused when this replica is retired.
  ACTIVE: 'active',
  // Reads the core without taking part: answers whatever the lifecycle says.
  READ: 'read',
  // Releases the handle: admitted by name even when retired, because
  // refusing would leak what retirement tells the host to release.
  TEARDOWN: 'teardown',
  // Cannot reach the core at all.
  INERT: 'inert',
});

/**
 * Whether a value answers to enough of the core's primitives to BE one.
 * @param {*} value - The value.
 * @return {boolean} Whether it is a core facade.
 */
function isCoreFacade(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  let answered = 0;
  for (const name of CORE_PRIMITIVE_SAMPLE) {
    try {
      if (typeof value[name] === 'function') {
        answered += 1;
      }
    } catch {
      // A member that refuses to be read is not a core primitive.
    }
  }
  return answered >= CORE_PRIMITIVES_THAT_MAKE_IT_A_CORE;
}

/**
 * Whether a value is the runtime host that holds a facade.
 * @param {*} value - The value.
 * @return {boolean} Whether it is the host.
 */
function isRuntimeHost(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return RUNTIME_HOST_SURFACE.every((name) => {
    try {
      return typeof value[name] === 'function';
    } catch {
      return false;
    }
  });
}

/**
 * Every property name a value carries, its own and its prototypes'.
 * @param {Object} value - The value.
 * @return {Array<string>} The names.
 */
function propertyNames(value) {
  const names = new Set();
  let current = value;
  while (current !== null && current !== Object.prototype &&
    current !== Function.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      names.add(name);
    }
    current = Object.getPrototypeOf(current);
  }
  return [...names];
}

/**
 * Walk everything reachable from the seam's own objects and report what can
 * reach the core.
 * @param {Object} roots - {[name]: object} to start from.
 * @return {Array<string>} One line per reachable core facade or runtime host.
 */
function reachableCoreEntries(roots) {
  const found = [];
  const seen = new Set();
  const queue = Object.entries(roots)
    .map(([name, value]) => ({value, path: name, depth: 0}));
  while (queue.length > 0) {
    const {value, path: where, depth} = queue.shift();
    if (value === null || typeof value !== 'object' || seen.has(value) ||
      depth > WALK_DEPTH) {
      continue;
    }
    seen.add(value);
    if (isCoreFacade(value)) {
      found.push(`${where} is a core facade`);
      continue;
    }
    if (isRuntimeHost(value)) {
      found.push(`${where} is the runtime host, which holds one`);
      continue;
    }
    for (const name of propertyNames(value)) {
      let member = null;
      try {
        member = value[name];
      } catch {
        continue;
      }
      if (member !== null && typeof member === 'object') {
        queue.push({value: member, path: `${where}.${name}`, depth: depth + 1});
      }
    }
  }
  return found;
}

/**
 * Every method one object exposes, against what the declaration says it is.
 * @param {Object} subject - The object.
 * @param {Object} declared - name to ENTRY_CLASS.
 * @return {Array<string>} One line per method the declaration does not cover.
 */
function undeclaredEntryMethods(subject, declared) {
  const undeclared = [];
  for (const name of propertyNames(subject)) {
    if (name === 'constructor') {
      continue;
    }
    let member = null;
    try {
      member = subject[name];
    } catch {
      // A member that refuses to be read cannot be called either.
      continue;
    }
    if (typeof member !== 'function') {
      continue;
    }
    if (!Object.hasOwn(declared, name)) {
      undeclared.push(name);
    }
  }
  return undeclared;
}

/**
 * The modules in src that can obtain a core facade.
 * @return {Array<string>} One line per module that may not.
 */
function modulesThatObtainAFacade() {
  const offenders = [];
  for (const entry of fs.readdirSync(RAFT_SOURCE_ROOT)) {
    if (!entry.endsWith(SOURCE_SUFFIX) || FACADE_HOLDERS.includes(entry)) {
      continue;
    }
    const source = fs.readFileSync(
      path.join(RAFT_SOURCE_ROOT, entry), TEXT_ENCODING);
    if (FACADE_SOURCES.test(source)) {
      offenders.push(entry);
    }
  }
  return offenders;
}

/**
 * The whole census.
 * @param {Object} options - What to census.
 * @param {Object} options.node - The node the provider built.
 * @param {Object} options.group - What the seam resolves it to.
 * @param {Object} options.declaredNodeEntries - The node's entry table.
 * @param {Object} options.declaredGroupEntries - The group's entry table.
 * @return {Object} {reachable, undeclaredNode, undeclaredGroup, sources}.
 */
function censusOfCoreEntrySites({
  node, group, declaredNodeEntries, declaredGroupEntries}) {
  return {
    reachable: reachableCoreEntries({node, group}),
    undeclaredNode: undeclaredEntryMethods(node, declaredNodeEntries),
    undeclaredGroup: undeclaredEntryMethods(group, declaredGroupEntries),
    sources: modulesThatObtainAFacade(),
  };
}

/**
 * The census as one line per finding, for an assertion message.
 * @param {Object} census - What the census found.
 * @return {string} CENSUS_CLEAN, or the findings.
 */
function censusFindings(census) {
  const findings = [
    ...census.reachable.map((line) => `reachable: ${line}`),
    ...census.undeclaredNode.map((name) => `undeclared node entry: ${name}`),
    ...census.undeclaredGroup.map((name) => `undeclared group entry: ${name}`),
    ...census.sources.map((file) => `module obtains a facade: ${file}`),
  ];
  return findings.length === 0 ? CENSUS_CLEAN : findings.join('\n');
}

export {
  CENSUS_CLEAN,
  ENTRY_CLASS,
  censusFindings,
  censusOfCoreEntrySites,
};
