// Receipt: no-production-behaviour-outside-these-two-boundaries-changed
//
// This quest changes two things: where a failure is classified as having come
// from, and whether a retired local replica may be given an active call. The
// scope claim is that nothing else in production can observe either change,
// and it is measured two ways.
//
// STRUCTURALLY: the whole of src is parsed, and every production module that
// imports anything from the experimental backend's family is itself in that
// family or is the seam that selects it. A module outside the family cannot
// reach either boundary, so it cannot be changed by them.
//
// BEHAVIOURALLY: liferaft remains the default by name, and the liferaft
// provider driven through the seam does to a node exactly what the liferaft
// provider driven directly does - the same effects in the same order and the
// same returned values, compared rather than asserted one at a time.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  RAFT_BACKEND,
  RAFT_BACKEND_DEFAULT,
  RAFT_BACKEND_OPTION,
  RAFT_BACKEND_SELECTION_SOURCE,
} from '../../../src/raft/raft-backend-constants.js';
import {
  createRaftProvider,
  selectRaftBackend,
} from '../../../src/raft/raft-backend-selection.js';
import {LiferaftProvider} from '../../../src/raft/liferaft-provider.js';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCE_ROOT = path.join(REPOSITORY_ROOT, 'src');
const SOURCE_SUFFIX = '.js';
const TEXT_ENCODING = 'utf8';
// The experimental backend's family, by file name, and the one production
// module allowed to reach it: the seam whose whole job is selecting it.
const BACKEND_FAMILY_PREFIX = 'raft-rs-';
const SEAM_MODULE = 'raft-backend-selection.js';
const IMPORT_SPECIFIER = /^\s*(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/gmu;
const STUB_TIMEOUT_MS = 7;
const STUB_TERM = 4;
const STUB_COMMITTED_INDEX = 9;
const STUB_COMMAND = 'a-command';
const STUB_ADDRESS = 'an-address';
const STUB_TIMER = 'heartbeat';
const TIMER_CLEAR = 'timers.clear';
const TIMEOUT_CALL = 'timeout';
// What the liferaft provider calls on a node, by name.
const LIFERAFT_NODE_CALL = Object.freeze([
  'command', 'join', 'heartbeat', TIMEOUT_CALL, 'end']);

/**
 * Every JavaScript file under src.
 * @param {string} directory - Where to look.
 * @param {Array<string>} [collected] - The accumulator.
 * @return {Array<string>} Absolute paths.
 */
function sourceFiles(directory, collected = []) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(absolute, collected);
    } else if (entry.isFile() && entry.name.endsWith(SOURCE_SUFFIX)) {
      collected.push(absolute);
    }
  }
  return collected;
}

/**
 * Which modules one source file imports from, by file name.
 * @param {string} file - The source file.
 * @return {Array<string>} The imported file names.
 */
function importedFileNames(file) {
  const source = fs.readFileSync(file, TEXT_ENCODING);
  const names = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    names.push(path.basename(match[1]));
  }
  return names;
}

/**
 * A liferaft node that records what was done to it, so two drives can be
 * compared rather than described. Its methods are built from the list of
 * names the provider calls, so a method added to that surface appears here
 * as an absent recording rather than as a silently missing member.
 * @return {Object} The recording node.
 */
function recordingLiferaftNode() {
  const effects = [];
  const node = {
    effects,
    term: STUB_TERM,
    log: {committedIndex: STUB_COMMITTED_INDEX},
    timers: {clear: (name) => effects.push([TIMER_CLEAR, name])},
  };
  for (const name of LIFERAFT_NODE_CALL) {
    node[name] = (...args) => {
      effects.push([name, ...args]);
      return name === TIMEOUT_CALL ? STUB_TIMEOUT_MS : Promise.resolve();
    };
  }
  return node;
}

/**
 * Drive the liferaft surface production uses, recording what came back.
 * @param {Object} provider - The provider under drive.
 * @param {Object} node - Its node.
 * @return {Promise<Array>} What the reads returned.
 */
async function driveLiferaftSurface(provider, node) {
  await provider.propose(node, STUB_COMMAND);
  provider.joinPeer(node, STUB_ADDRESS);
  provider.startElectionTimer(node);
  provider.requestElectionNow(node);
  provider.clearTimers(node, STUB_TIMER);
  const returned = [
    provider.getCurrentTerm(node),
    provider.getCommittedIndex(node),
  ];
  provider.shutdownNode(node);
  return returned;
}

test('no production behaviour outside these two boundaries changed',
  async () => {
    // Structural: nothing outside the experimental backend's own family
    // imports it, so nothing outside it can observe either boundary.
    const reachers = [];
    for (const file of sourceFiles(SOURCE_ROOT)) {
      const importsTheFamily = importedFileNames(file)
        .some((name) => name.startsWith(BACKEND_FAMILY_PREFIX));
      const own = path.basename(file);
      if (importsTheFamily && !own.startsWith(BACKEND_FAMILY_PREFIX) &&
        own !== SEAM_MODULE) {
        reachers.push(path.relative(REPOSITORY_ROOT, file));
      }
    }
    assert.deepEqual(reachers, [],
      'only the experimental backend itself and the seam that selects it ' +
      'may reach these two boundaries');

    // Behavioural: liferaft is still the default, by name, from an absent
    // selection and from the seam's own recorded default.
    assert.deepEqual(selectRaftBackend({}), {
      backend: RAFT_BACKEND.LIFERAFT,
      source: RAFT_BACKEND_SELECTION_SOURCE.DEFAULT,
    });
    assert.equal(RAFT_BACKEND_DEFAULT, RAFT_BACKEND.LIFERAFT);
    assert.ok(createRaftProvider({}) instanceof LiferaftProvider,
      'an absent selection must still build the liferaft provider');

    // And what liferaft does to a node is the same through the seam as it is
    // directly: the same effects in the same order, the same values back.
    const throughTheSeam = recordingLiferaftNode();
    const directly = recordingLiferaftNode();
    const seamReturned = await driveLiferaftSurface(
      createRaftProvider({[RAFT_BACKEND_OPTION]: RAFT_BACKEND.LIFERAFT}),
      throughTheSeam);
    const directReturned = await driveLiferaftSurface(
      new LiferaftProvider(), directly);
    assert.deepEqual(throughTheSeam.effects, directly.effects,
      'routing liferaft through the seam must change nothing it does');
    assert.deepEqual(seamReturned, directReturned);
    assert.ok(throughTheSeam.effects.length > 0,
      'and the comparison must be of something that really happened');
  });
