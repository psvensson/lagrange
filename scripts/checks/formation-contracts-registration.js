/**
 * Unbound invariant citations in the derived harness model.
 *
 *   node scripts/checks/formation-contracts-registration.js [--metric] [--json]
 *
 * Asks test/distributed/harness/owner-interaction-model.js how each
 * registered invariant binds and prints the citations the registry does not
 * know - each with its invariant id and owner - so the gap is a number.
 * The last stdout line is that number; exit 0 only when it is 0. This is the
 * `formation-contracts-registration` quest's probe and it derives from the
 * registry, so it moves only when a citation is registered or retired.
 */
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {invariantBindings} from '../../test/distributed/harness/owner-interaction-model.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARGV_OFFSET = 2;
const JSON_FLAG = '--json';
const METRIC_FLAG = '--metric';
const JSON_INDENT = 2;
const LINE_SEPARATOR = '\n';
const EXIT_OK = 0;
const EXIT_UNBOUND = 1;
const UNBOUND_MARK = 'UNBOUND';

async function main(argv) {
  const bindings = await invariantBindings(REPO_ROOT);
  const unbound = bindings.unbound.length;
  if (arrayIncludes(argv, JSON_FLAG)) {
    process.stdout.write(`${JSON.stringify(
      {bound: bindings.bound, unbound: bindings.unbound}, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  } else if (!arrayIncludes(argv, METRIC_FLAG)) {
    for (const entry of bindings.unbound) {
      process.stdout.write(
        `${UNBOUND_MARK} ${entry.owner} ${entry.id} -> ${entry.contractRef}${LINE_SEPARATOR}`);
    }
  }
  process.stdout.write(`${unbound}${LINE_SEPARATOR}`);
  return unbound === 0 ? EXIT_OK : EXIT_UNBOUND;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  process.exitCode = await main(process.argv.slice(ARGV_OFFSET));
}
