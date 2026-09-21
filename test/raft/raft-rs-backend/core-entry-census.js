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
//   ENTRY METHODS - DISCOVER every callable member of those objects and call
//   each one, with every argument shape a caller could plausibly have,
//   against a RETIRED replica, watching production's own count of active
//   entries into that group's core. Nothing here knows what the methods are
//   for or what they are called: a member that takes part in the group moves
//   the counter, and on a retired replica that is the defect - however
//   deeply it delegates, and whether or not anyone remembered to declare it.
//   A future entry added without the gate is red the moment it exists.
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
  'raft-rs-partition-node.js',
]);
const FACADE_SOURCES = /\b(instantiateRaftRsCore|loadRaftRsCore)\s*\(/u;
// A value is a core facade when it answers to the BINDING's own primitive
// names - the ones only the generated glue has, so that an object offering
// semantic operations of its own is not mistaken for the thing it hides.
const CORE_PRIMITIVE_SAMPLE = Object.freeze([
  'has_ready', 'take_ready', 'persist_ready', 'advance_append',
  'advance_apply', 'conf_state', 'propose_conf_change_v2', 'create_node',
  'set_conf_state', 'export_persisted_state', 'decode_conf_change_entry',
]);
const CORE_PRIMITIVES_THAT_MAKE_IT_A_CORE = 3;
// A value is the runtime host when it answers to the host's own surface: it
// holds a facade, so reaching it is reaching the core one call later.
const RUNTIME_HOST_SURFACE = Object.freeze(['enter', 'openGroup']);
const WALK_DEPTH = 8;
const CENSUS_CLEAN = 'clean';

// The only names the census is told about: teardown is the one thing a
// retired replica is still allowed to do to its core, so calling it would
// move the counter for a reason that is not a defect. Everything else is
// discovered and driven.
const TEARDOWN_MEMBERS = Object.freeze(['free', 'end']);

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
 * Every callable member one object exposes, DISCOVERED rather than listed.
 * @param {Object} subject - The object.
 * @return {Array<string>} The method names.
 */
function callableMembers(subject) {
  const names = [];
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
    if (typeof member === 'function') {
      names.push(name);
    }
  }
  return names;
}

/**
 * Call every discovered member of a subject with each argument shape a
 * caller could plausibly have, and report which of them entered the core.
 *
 * Nothing here knows what the methods are FOR. It knows only what production
 * counts: an active entry into this group's core. A method that refuses,
 * throws, or does something harmless moves nothing; a method that takes part
 * in the group moves the counter, and on a retired replica that is the
 * defect - whatever the method is called, whoever added it, however deeply
 * it delegates.
 * @param {Object} options - The drive.
 * @param {Object} options.subject - The object whose members to call.
 * @param {string} options.label - What to call it in a finding.
 * @param {Object} options.group - The group, for its entry counter.
 * @param {Array<Array>} options.argumentShapes - Argument tuples to try.
 * @param {Array<string>} options.exceptNames - Members not to call.
 * @return {Array<string>} One line per member that entered the core.
 */
function membersThatEnterTheCore({
  subject, label, group, argumentShapes, exceptNames}) {
  const entered = [];
  for (const name of callableMembers(subject)) {
    if (exceptNames.includes(name)) {
      continue;
    }
    for (const args of argumentShapes) {
      const before = group.activeCoreEntries;
      try {
        subject[name](...args);
      } catch {
        // A call that cannot be made with these arguments made no entry.
      }
      if (group.activeCoreEntries !== before) {
        entered.push(`${label}.${name} entered the core`);
        break;
      }
    }
  }
  return entered;
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
  node, group, argumentShapes, teardownNames}) {
  return {
    reachable: reachableCoreEntries({node, group}),
    entered: [
      ...membersThatEnterTheCore({
        subject: group, label: 'group', group, argumentShapes,
        exceptNames: teardownNames}),
      ...membersThatEnterTheCore({
        subject: node, label: 'node', group, argumentShapes,
        exceptNames: teardownNames}),
    ],
    discovered: {
      group: callableMembers(group),
      node: callableMembers(node),
    },
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
    ...census.entered.map((line) => `on a retired replica, ${line}`),
    ...census.sources.map((file) => `module obtains a facade: ${file}`),
  ];
  return findings.length === 0 ? CENSUS_CLEAN : findings.join('\n');
}

export {
  CENSUS_CLEAN,
  TEARDOWN_MEMBERS,
  censusFindings,
  censusOfCoreEntrySites,
};
