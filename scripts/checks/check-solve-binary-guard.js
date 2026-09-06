/**
 * Pre-commit guard for the Solver evidence rule (solve-v2 phase 1):
 * nothing larger than 1 MB and no archive enters git under solve/. Binaries
 * belong in the evidence store (`solve evidence add`), referenced from a log
 * entry by sha256 and URL.
 *
 *   node scripts/checks/check-solve-binary-guard.js [<staged path>...]
 *
 * With no paths it reads the staged index (`git diff --cached --name-only
 * --diff-filter=ACMR`). Exits 1 naming every offending file. The single
 * allowlisted path is the one pre-v2 text log that exceeds the size rule and
 * must stay verbatim (non-negotiable 5: findings are never rewritten).
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..',
);
const TEXT_ENCODING = 'utf8';
const ARGV_OFFSET = 2;
const GIT_BINARY = 'git';
const GIT_STAGED_ARGUMENTS = Object.freeze([
  'diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z',
]);
const NUL = '\0';
const GIT_CAT_FILE_SIZE_ARGUMENTS = Object.freeze(['cat-file', '-s']);
const INDEX_STAGE_PREFIX = ':';
const LINE_SEPARATOR = '\n';
const SOLVE_PREFIX = 'solve/';
const MAX_BYTES = 1024 * 1024;
const ARCHIVE_SUFFIXES = Object.freeze([
  '.tar.gz', '.tgz', '.tar', '.gz', '.zip', '.7z', '.xz', '.bz2',
]);
// The one tracked text log over the rule, kept verbatim by decision of the
// solve-v2 epic (design note section 6); nothing else is exempt.
const ALLOWLIST = Object.freeze([
  'solve/quests/rolling-restart-core-stability/log.ndjson',
]);
const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const REASON_TOO_LARGE = 'larger than 1 MB';
const REASON_ARCHIVE = 'archive';
const REFUSAL_PREFIX = 'solve binary guard: refusing ';
const REFUSAL_SUFFIX =
  ' (upload with `node scripts/solve.js evidence add <path> --id <id>` ' +
  'and reference it from the log)';

function stagedPaths() {
  const out = execFileSync(GIT_BINARY, [...GIT_STAGED_ARGUMENTS], {
    cwd: REPO_ROOT, encoding: TEXT_ENCODING,
  });
  return arrayFilter(stringSplit(out, NUL), Boolean);
}

// The staged blob is what would be committed; fall back to the working-tree
// file when the path is not in the index (an explicit path argument).
function stagedOrTreeSize(relative) {
  try {
    const size = execFileSync(GIT_BINARY, [...GIT_CAT_FILE_SIZE_ARGUMENTS,
      `${INDEX_STAGE_PREFIX}${relative}`], {cwd: REPO_ROOT, encoding: TEXT_ENCODING});
    return Number(size);
  } catch (_error) {
    const absolute = path.join(REPO_ROOT, relative);
    return fs.existsSync(absolute) ? fs.statSync(absolute).size : 0;
  }
}

function offence(relative) {
  if (!stringStartsWith(relative, SOLVE_PREFIX)) return null;
  if (arrayIncludes(ALLOWLIST, relative)) return null;
  if (arraySome(ARCHIVE_SUFFIXES, (suffix) => stringEndsWith(relative, suffix))) {
    return REASON_ARCHIVE;
  }
  return stagedOrTreeSize(relative) > MAX_BYTES ? REASON_TOO_LARGE : null;
}

/**
 * Offending paths among `paths`, each with its reason. Pure over the tree.
 * @param {string[]} paths
 * @return {{path: string, reason: string}[]}
 */
function solveBinaryOffences(paths) {
  return arrayFilter(arrayMap(paths, (relative) =>
    ({path: relative, reason: offence(relative)})), (entry) => entry.reason);
}

function main(argv) {
  const paths = argv.length > 0 ? argv : stagedPaths();
  const offences = solveBinaryOffences(paths);
  for (const entry of offences) {
    process.stderr.write(
      `${REFUSAL_PREFIX}${entry.path}: ${entry.reason}${REFUSAL_SUFFIX}${LINE_SEPARATOR}`);
  }
  return offences.length === 0 ? EXIT_OK : EXIT_REFUSED;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {ALLOWLIST, MAX_BYTES, solveBinaryOffences};
