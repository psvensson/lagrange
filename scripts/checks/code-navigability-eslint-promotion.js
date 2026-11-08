/**
 * ESLint promotion of a code-navigability pattern, read from ESLint itself.
 *
 * When a pattern reaches zero it is promoted to an ESLint
 * `no-restricted-syntax` selector whose message carries the marker
 * `navigability-rule:<pattern>` (epic code-navigability-and-mistake-
 * resistance, Mechanism). A pattern is promoted only when ESLint's resolved
 * configuration for a source file enables that rule at error severity with
 * such an entry, the marker a whole token: a comment or a string elsewhere
 * in eslint.config.js, a `warn` rule or a longer row name does not count. A promoted row's value is
 * the number of ESLint reports over `src` whose message carries the marker.
 *
 * ESLint runs through an injectable runner `(args, root) => {status,
 * stdout}` so the fixture tests never spawn it; the default runs this
 * checkout's own ESLint with stdin closed, reading and writing nothing in the
 * measured tree (R27).
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load.
 */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySome = Function.call.bind(Array.prototype.some);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ESLINT_BIN = path.join(REPO_ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
const TEXT_ENCODING = 'utf8';
const OUTPUT_LIMIT_BYTES = 512 * 1024 * 1024;
const CLOSED_STDIN = Object.freeze(['ignore', 'pipe', 'pipe']);
const PRINT_CONFIG_FLAG = '--print-config';
const FORMAT_FLAG = '--format';
const JSON_FORMAT = 'json';
const LINT_DIRECTORY = 'src';
const RESTRICTED_SYNTAX_RULE = 'no-restricted-syntax';
// The severities that promote: ESLint prints a resolved severity as a
// number (`2`); a hand-written config may say 'error'. `warn` (1) reports
// without failing the lint, so it ratchets nothing and promotes nothing.
const RULE_ERROR = Object.freeze(new Set([2, 'error']));
const MARKER_PREFIX = 'navigability-rule:';
// The marker is a whole token: no row-name or hyphen character on either
// side, so `navigability-rule:alias_exports` is neither a prefix of
// `navigability-rule:alias_exports_extra` nor inside `xnavigability-rule:…`.
const MARKER_START = '(?<![A-Za-z0-9_-])';
const MARKER_END = '(?![A-Za-z0-9_-])';
const MARKER_FLAGS = 'u';
const STRING_TYPE_NAME = 'string';
const LINT_EXIT_REPORTED = 1;

function defaultEslintRunner(args, root) {
  const result = spawnSync(process.execPath, [ESLINT_BIN, ...args], {
    cwd: root, encoding: TEXT_ENCODING, stdio: CLOSED_STDIN,
    maxBuffer: OUTPUT_LIMIT_BYTES,
  });
  return {status: result.status, stdout: result.stdout || ''};
}

function promotionMarker(pattern) {
  return new RegExp(`${MARKER_START}${MARKER_PREFIX}${pattern}${MARKER_END}`, MARKER_FLAGS);
}

function parseJsonOutput(stdout) {
  try {
    return {parsed: true, value: JSON.parse(stdout)};
  } catch (error) {
    return {parsed: false, value: error.message};
  }
}

// The messages of the no-restricted-syntax entries a resolved configuration
// enables at error severity; at `warn` or `off` there are none.
function restrictedSyntaxMessages(config) {
  const setting = config && config.rules ? config.rules[RESTRICTED_SYNTAX_RULE] : undefined;
  if (!Array.isArray(setting) || !RULE_ERROR.has(setting[0])) return [];
  const messages = [];
  for (const entry of setting.slice(1)) {
    if (entry && typeof entry.message === STRING_TYPE_NAME) messages.push(entry.message);
  }
  return messages;
}

/**
 * The patterns ESLint's resolved configuration for `sampleFile` promotes.
 * @param {string} root the checkout root
 * @param {Function} runner the ESLint runner
 * @param {string|undefined} sampleFile a source file to resolve the config for
 * @param {Array<string>} patterns the pattern names
 * @return {Set<string>} the promoted pattern names
 */
function promotedPatterns(root, runner, sampleFile, patterns) {
  if (!sampleFile) return new Set();
  const result = runner([PRINT_CONFIG_FLAG, sampleFile], root);
  const output = result.status === 0 ? parseJsonOutput(result.stdout) : {parsed: false};
  if (!output.parsed) return new Set();
  const messages = restrictedSyntaxMessages(output.value);
  return new Set(arrayFilter(patterns, (pattern) => {
    const marker = promotionMarker(pattern);
    return arraySome(messages, (message) => marker.test(message));
  }));
}

function lintReports(root, runner) {
  const result = runner([FORMAT_FLAG, JSON_FORMAT, LINT_DIRECTORY], root);
  const completed = result.status === 0 || result.status === LINT_EXIT_REPORTED;
  const output = completed ? parseJsonOutput(result.stdout) : {parsed: false};
  return output.parsed && Array.isArray(output.value) ? output.value : undefined;
}

/**
 * The ESLint report count of each promoted pattern over `src`, or null for
 * every promoted pattern when ESLint did not complete.
 * @param {string} root the checkout root
 * @param {Function} runner the ESLint runner
 * @param {Set<string>} promoted the promoted pattern names
 * @return {Map<string, number|null>} pattern -> report count
 */
function promotedReportCounts(root, runner, promoted) {
  const counts = new Map();
  if (promoted.size === 0) return counts;
  const results = lintReports(root, runner);
  for (const pattern of promoted) {
    counts.set(pattern, results ? markedReportCount(results, promotionMarker(pattern)) : null);
  }
  return counts;
}

function markedReportCount(results, marker) {
  let count = 0;
  for (const result of results) {
    for (const message of result.messages || []) {
      const marked = message.ruleId === RESTRICTED_SYNTAX_RULE &&
        typeof message.message === STRING_TYPE_NAME && marker.test(message.message);
      if (marked) count += 1;
    }
  }
  return count;
}

export {defaultEslintRunner, promotedPatterns, promotedReportCounts};
