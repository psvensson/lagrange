/**
 * Scenario producer for the release-0-2-verification-v3 quest (epic G4-G6).
 *
 * Derives the three sealed frontier scenarios plus the aggregate doneWhen
 * scenario from recorded facts, fail-closed, and writes each as a
 * scenario-harness report under test-output/reports/:
 *  - release-0-2-verification-v3-memory-soak: the newest (or --soak-report)
 *    release-0-2-memory-soak report passed, every node was analyzed with at
 *    least 30 samples, no insufficient-* reason, no detected leak, and the
 *    report's srcFingerprint equals the current computed fingerprint.
 *  - release-0-2-verification-v3-local-artifacts: every required gate
 *    receipt (test-gate, test-ci, release-workflow-contracts, package-npm,
 *    build-all, docker-smoke, helm-package) written by
 *    record-release-gate-receipt.js records exit 0 on the current HEAD and
 *    source fingerprint.
 *  - release-0-2-verification-v3-remote-exact-sha: the GitHub receipt
 *    written by record-github-gate-receipt.js records `ci / gate` success
 *    for the exact current HEAD. An absent receipt is FAIL, never skipped.
 * The aggregate passes iff all three pass. Every report is provenance-bound
 * to the frozen release identity (HEAD sha, src fingerprint, 0.2.0 version
 * in package.json/CLI/entrypoint/chart). This runner loads facts and writes
 * reports; the verdicts are owned by release-0-2-verification-derivation.js.
 *
 *   node scripts/checks/run-release-0-2-verification-scenarios.js \
 *     [--soak-report <path>] [--receipt-dir <dir>] \
 *     [--gate-receipt <name>=<path>]... [--local-receipts <name-to-path.json>] \
 *     [--remote-receipt <path>] [--report-dir <dir>]
 */

import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

import {
  REPO_ROOT,
  resolveReleaseCandidateIdentity,
} from './release-candidate-identity.js';
import {
  deriveVerificationReports,
} from './release-0-2-verification-derivation.js';
import {
  GITHUB_GATE_RECEIPT_FILENAME,
  RECEIPT_FILE_EXTENSION,
  RELEASE_GATE_RECEIPT_DIR,
  REPORT_FILE_EXTENSION,
  REQUIRED_GATE_RECEIPTS,
  SOAK_REPORT_PREFIX,
  VERIFICATION_ARG,
  VERIFICATION_REPORT_DIR,
} from './release-0-2-verification-constants.js';

// Ambient intrinsics captured at module load (adversarial-js-intrinsics
// guideline item 6) so replaced prototypes cannot invert report admission.
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);

const TEXT_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HEX_ENCODING = 'hex';
const ARGV_COMMAND_OFFSET = 2;
const ASSIGNMENT_SEPARATOR = '=';
const NOT_FOUND = -1;
const EMPTY_PATH = '';
const ABSENT_RECEIPT = Object.freeze({present: false, path: EMPTY_PATH});
const VERDICT_LINE_SEPARATOR = ' ';
const REPORT_LINE_PREFIX = 'report: ';
const REPORT_NAME_SEPARATOR = '-';
const NEWLINE = '\n';
const EXIT_OK = 0;
const EXIT_FAILED = 1;

function parseArgs(argv) {
  const parsed = {
    soakReport: EMPTY_PATH,
    receiptDir: RELEASE_GATE_RECEIPT_DIR,
    gateReceipts: {},
    localReceipts: EMPTY_PATH,
    remoteReceipt: EMPTY_PATH,
    reportDir: VERIFICATION_REPORT_DIR,
  };
  const assign = {
    [VERIFICATION_ARG.SOAK_REPORT]: (value) => {
      parsed.soakReport = value;
    },
    [VERIFICATION_ARG.RECEIPT_DIR]: (value) => {
      parsed.receiptDir = value;
    },
    [VERIFICATION_ARG.LOCAL_RECEIPTS]: (value) => {
      parsed.localReceipts = value;
    },
    [VERIFICATION_ARG.REMOTE_RECEIPT]: (value) => {
      parsed.remoteReceipt = value;
    },
    [VERIFICATION_ARG.REPORT_DIR]: (value) => {
      parsed.reportDir = value;
    },
    [VERIFICATION_ARG.GATE_RECEIPT]: (value) => {
      const separator = stringIndexOf(value, ASSIGNMENT_SEPARATOR);
      if (separator !== NOT_FOUND) {
        parsed.gateReceipts[value.slice(0, separator)] =
          value.slice(separator + 1);
      }
    },
  };
  for (let index = 0; index < argv.length; index += 1) {
    const handler = assign[argv[index]];
    if (handler && index + 1 < argv.length) {
      handler(argv[index + 1]);
      index += 1;
    }
  }
  return parsed;
}

// A candidate's recency is its own timestamp field; a report without a
// parseable timestamp falls back to its mtime. Never the filename: an
// undated release-0-2-memory-soak.report.json sorts lexically after every
// dated sibling.
function soakReportRecency(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, TEXT_ENCODING));
  const stamped = Date.parse(String(parsed?.timestamp || EMPTY_PATH));
  return Number.isFinite(stamped) ? stamped : fs.statSync(filePath).mtimeMs;
}

/**
 * Newest memory-soak report in a directory by report timestamp.
 * @param {string} dir directory holding <SOAK_REPORT_PREFIX>*.report.json
 * @return {string} absolute path, or '' when none exists
 */
function newestSoakReportPath(dir) {
  let newest = EMPTY_PATH;
  let newestRecency = Number.NEGATIVE_INFINITY;
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    if (!stringStartsWith(name, SOAK_REPORT_PREFIX) ||
        !stringEndsWith(name, REPORT_FILE_EXTENSION)) {
      continue;
    }
    const candidate = path.join(dir, name);
    const recency = soakReportRecency(candidate);
    if (recency >= newestRecency) {
      newest = candidate;
      newestRecency = recency;
    }
  }
  return newest;
}

function loadJsonFact(root, filePath) {
  const resolved = filePath === EMPTY_PATH ?
    EMPTY_PATH :
    path.resolve(root, filePath);
  if (resolved === EMPTY_PATH || !fs.existsSync(resolved)) {
    return {...ABSENT_RECEIPT, path: filePath};
  }
  const bytes = fs.readFileSync(resolved);
  return {
    present: true,
    path: path.relative(root, resolved),
    sha256: createHash(HASH_ALGORITHM).update(bytes).digest(HEX_ENCODING),
    value: JSON.parse(bytes.toString(TEXT_ENCODING)),
  };
}

function loadSoak(root, args) {
  const reportPath = args.soakReport === EMPTY_PATH ?
    newestSoakReportPath(path.join(root, VERIFICATION_REPORT_DIR)) :
    args.soakReport;
  const fact = loadJsonFact(root, reportPath);
  return {
    present: fact.present,
    reportPath: fact.path,
    reportSha256: fact.sha256 || EMPTY_PATH,
    report: fact.value || {},
  };
}

// Receipt path precedence: explicit --gate-receipt, then the
// --local-receipts name-to-path map, then <receipt-dir>/<name>.json (where
// record-release-gate-receipt.js writes).
function receiptPathFor(root, args, localMap, name) {
  const candidates = [
    args.gateReceipts[name],
    localMap[name],
    path.join(args.receiptDir, name + RECEIPT_FILE_EXTENSION),
  ];
  let chosen = EMPTY_PATH;
  for (const candidate of candidates) {
    if (chosen === EMPTY_PATH && typeof candidate === 'string') {
      chosen = candidate;
    }
  }
  return chosen;
}

function loadReceipts(root, args) {
  const localMap = loadJsonFact(root, args.localReceipts).value || {};
  const receipts = {};
  for (const name of REQUIRED_GATE_RECEIPTS) {
    const fact = loadJsonFact(root, receiptPathFor(root, args, localMap, name));
    receipts[name] = {
      present: fact.present,
      path: fact.path,
      receipt: fact.value || {},
    };
  }
  return receipts;
}

function loadRemote(root, args) {
  const remotePath = args.remoteReceipt === EMPTY_PATH ?
    path.join(args.receiptDir, GITHUB_GATE_RECEIPT_FILENAME) :
    args.remoteReceipt;
  const fact = loadJsonFact(root, remotePath);
  return {present: fact.present, path: fact.path, receipt: fact.value || {}};
}

function writeReport(root, reportDir, report) {
  const stamp = stringReplace(report.timestamp, /[:.]/g, '-');
  const dir = path.resolve(root, reportDir);
  fs.mkdirSync(dir, {recursive: true});
  const reportPath = path.join(
    dir,
    report.scenario + REPORT_NAME_SEPARATOR + stamp + REPORT_FILE_EXTENSION,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + NEWLINE);
  return path.relative(root, reportPath);
}

async function main() {
  const root = REPO_ROOT;
  const args = parseArgs(process.argv.slice(ARGV_COMMAND_OFFSET));
  const facts = {
    identity: await resolveReleaseCandidateIdentity(root),
    soak: loadSoak(root, args),
    receipts: loadReceipts(root, args),
    remote: loadRemote(root, args),
    timestamp: new Date().toISOString(),
  };
  const derived = deriveVerificationReports(facts);
  for (const report of derived.reports) {
    const written = writeReport(root, args.reportDir, report);
    const entry = report.standardSummary.scenarios[0];
    process.stdout.write(
      entry.current.verdict + VERDICT_LINE_SEPARATOR + entry.scenario +
        VERDICT_LINE_SEPARATOR + entry.current.verdictReasonDetail + NEWLINE,
    );
    process.stdout.write(REPORT_LINE_PREFIX + written + NEWLINE);
  }
  process.exitCode = derived.allPassed ? EXIT_OK : EXIT_FAILED;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

export {newestSoakReportPath};
