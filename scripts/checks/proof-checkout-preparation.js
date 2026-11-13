/**
 * The generated state a proof checkout must have before any test in it starts
 * (clean-worktree-generated-import-graph). A fresh checkout of a commit lacks
 * every gitignored artifact its tests read; CI makes them in "Prepare
 * generated test metadata", and every local proof checkout makes them here:
 * the push-gate materializer (scripts/checks/push-gate-corpus-worktree.js
 * --gate) prepares each exact checkout it proves a command in - the pre-push
 * gate, the publisher's local and post-merge corpus, the local release proof -
 * and the lab placement prepares its remote checkout from the same list.
 *
 * Preparation generates; it never changes what is proven. A producer that
 * rewrites a tracked file (the import graph seal of a commit whose committed
 * metadata is stale) refuses the checkout, as CI refuses stale generated test
 * metadata: the commit must carry its regenerated metadata. A producer that
 * fails, or is killed, refuses it too: no command runs without its generated
 * material or on bytes that are not the commit's.
 */

import fs from 'node:fs';
import path from 'node:path';

import {execGit} from './git-invocation.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);
const stringSlice = Function.call.bind(String.prototype.slice);

const UTF8 = 'utf8';
const NEWLINE = '\n';
const NUL = '\0';
const EMPTY = '';
const LIST_SEPARATOR = ', ';
const STATUS_PATH_COLUMN = 3;
// NUL-separated and unquoted: a path with spaces or non-ASCII bytes is named
// as it is.
const GIT_TRACKED_CHANGES = Object.freeze(
  ['status', '--porcelain', '-z', '--untracked-files=no']);

// Required generated material, one producer each, in execution order. The
// exact commit must contain every declared producer before it can be proved.
const PROOF_CHECKOUT_GENERATORS = Object.freeze([
  Object.freeze({
    name: 'import-graph',
    producer: 'scripts/generate-global-owner-debt-inventory.js',
    args: Object.freeze(['--refresh-import-graph-only']),
  }),
]);

const TEXT = Object.freeze({
  PREFIX: '[proof-checkout] ',
  PREPARED: 'prepared ',
  ABSENT: ' required producer unavailable: ',
  FAILED: ' could not be generated: ',
  EXIT: 'exit ',
  SIGNAL: 'killed by ',
  INTERRUPTED: 'interrupted by ',
  STALE: ': the commit\'s generated metadata is stale; regenerate and commit ',
  REFRESH: ' (npm run -s test:metadata:refresh)',
});

// The tracked paths whose bytes are no longer the commit's.
function trackedChanges(checkout) {
  const entries = stringSplit(String(execGit([...GIT_TRACKED_CHANGES],
    {cwd: checkout, encoding: UTF8})), NUL);
  return arrayMap(arrayFilter(entries, (entry) => entry !== EMPTY),
    (entry) => stringSlice(entry, STATUS_PATH_COLUMN));
}

function failureOf(result) {
  if (result.interruption) return `${TEXT.INTERRUPTED}${result.interruption}`;
  if (result.error) return result.error.message;
  if (result.signal) return `${TEXT.SIGNAL}${result.signal}`;
  return `${TEXT.EXIT}${result.status}`;
}

function refusal(generator, detail) {
  return {ok: false, problem: `${TEXT.PREFIX}${generator.name}${detail}`};
}

/**
 * Generate every artifact in PROOF_CHECKOUT_GENERATORS inside a clean exact
 * checkout, with the node running this process.
 * @param {string} checkout
 * @param {{run: Function, env?: Object, write?: Function}} options
 * @return {Promise<{ok: boolean, prepared: string[], problem: string|null}>}
 */
async function prepareProofCheckout(checkout, {run, env = process.env,
  write = (line) => process.stdout.write(`${line}${NEWLINE}`)}) {
  const prepared = [];
  for (const generator of PROOF_CHECKOUT_GENERATORS) {
    if (!fs.existsSync(path.join(checkout, generator.producer))) {
      return {...refusal(generator, `${TEXT.ABSENT}${generator.producer}`), prepared};
    }
    const result = await run(process.execPath, [generator.producer, ...generator.args],
      {cwd: checkout, env, encoding: UTF8, stdio: ['ignore', 'ignore', 'inherit']});
    if (result.error || result.interruption || result.status !== 0) {
      return {...refusal(generator, `${TEXT.FAILED}${failureOf(result)}`), prepared};
    }
    const stale = trackedChanges(checkout);
    if (stale.length > 0) {
      return {...refusal(generator,
        `${TEXT.STALE}${arrayJoin(stale, LIST_SEPARATOR)}${TEXT.REFRESH}`), prepared};
    }
    write(`${TEXT.PREFIX}${TEXT.PREPARED}${generator.name}`);
    prepared.push(generator.name);
  }
  return {ok: true, prepared, problem: null};
}

export {PROOF_CHECKOUT_GENERATORS, prepareProofCheckout};
