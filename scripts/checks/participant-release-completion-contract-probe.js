/**
 * Violations of the sealed participant-release completion contract.
 *
 *   node scripts/checks/participant-release-completion-contract-probe.js [--metric]
 *
 * A thin adapter over the structural audit the decision-boundary check
 * already loads for every run (scripts/participant-release-completion-audit.js,
 * sealed quest participant-release-completion-owner, bound in
 * architecture/contracts/authority-and-recovery.md). It runs that audit's own
 * whole-tree loader over this repository and reports the audit's violations:
 * it selects no files and holds no rule of its own. It reads the tree only
 * (R27). Without --metric each violation is listed before the count. The last
 * stdout line is the count; exit 0 only when it is 0. When the audit cannot
 * read its inputs nothing is printed on stdout and the exit code is 2. This is
 * the participant-release-completion-contract-restoration quest's probe.
 */
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {loadParticipantReleaseCompletionAudit} from '../participant-release-completion-audit.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayForEach = Function.call.bind(Array.prototype.forEach);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARGV_OFFSET = 2;
const METRIC_FLAG = '--metric';
const LINE_SEPARATOR = '\n';
const FIELD_SEPARATOR = ' ';
const REASON_SEPARATOR = ': ';
const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_UNMEASURED = 2;
const UNMEASURED_PREFIX =
  'participant-release completion audit could not read its inputs; no measurement: ';

/**
 * Measure the audit over `root` and write the report to `output`.
 * @param {string[]} argv command-line arguments after the script path
 * @param {string} root repository root the audit reads
 * @param {{stdout: function(string): void, stderr: function(string): void}} output
 * @return {Promise<number>} the process exit code
 */
async function runCompletionContractProbe(argv, root, output) {
  let violations;
  try {
    ({violations} = await loadParticipantReleaseCompletionAudit(root));
  } catch (error) {
    output.stderr(`${UNMEASURED_PREFIX}${error?.message ?? error}${LINE_SEPARATOR}`);
    return EXIT_UNMEASURED;
  }
  if (!arrayIncludes(argv, METRIC_FLAG)) {
    arrayForEach(violations, (violation) => output.stdout(
      `${violation.filePath}${FIELD_SEPARATOR}${violation.kind}` +
      `${REASON_SEPARATOR}${violation.reason}${LINE_SEPARATOR}`));
  }
  output.stdout(`${violations.length}${LINE_SEPARATOR}`);
  return violations.length === 0 ? EXIT_CLEAN : EXIT_VIOLATIONS;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  // The audit's loader resolves its scan entry against the working directory,
  // and the shared collector skips any path segment such as `data`: from a
  // directory outside the repository it would read no source at all. Run it
  // from the root, as the decision-boundary check and the solve probe do.
  process.chdir(REPO_ROOT);
  process.exitCode = await runCompletionContractProbe(process.argv.slice(ARGV_OFFSET),
    REPO_ROOT, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
}

export {runCompletionContractProbe};
