// One complete, valid execution report of a fixture checkout, shaped by the
// report owner (scripts/test-execution-report.js), for the tests that record
// receipts through the proof authority. A falsifier breaks one thing in a
// copy of it.
import {describeCandidate} from '../../scripts/proof-authority.js';
import {buildExecutionReport} from '../../scripts/test-execution-report.js';

export const REPORT_FILE_A = 'test/a.test.js';
export const REPORT_FILE_B = 'test/b.test.js';

export function passingResult(file, assertions = 3) {
  return {file, ok: true, assertions,
    attempts: [{attempt: 1, ok: true, assertions, reasons: []}]};
}

/**
 * @param {{sha: string, tree: string, identity?: Object|null}} candidate
 * @return {Object}
 */
export function validExecutionReport({sha, tree, identity = null}) {
  const files = [REPORT_FILE_A, REPORT_FILE_B];
  return buildExecutionReport({
    candidate: {sha, tree, clean: true, identity},
    producer: {kind: 'test-fixture', id: 'report-run'},
    commands: [{label: 'corpus', argv: ['npm', 'run', 'test:all'], exitStatus: 0}],
    planned: files,
    runs: [{runId: 'run-1', complete: true, checkout: {head: sha, tree, clean: true},
      argv: files, planned: files, results: files.map((file) => passingResult(file)),
      exitStatus: 0}],
  });
}

/**
 * A valid report of the clean checkout at cwd, its candidate described by
 * the authority itself.
 * @param {string} cwd
 * @return {Object}
 */
export function checkoutExecutionReport(cwd) {
  return validExecutionReport(describeCandidate({cwd}));
}
