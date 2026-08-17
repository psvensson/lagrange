import {spawnSync} from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter, join} from 'node:path';

import {test} from '../../src/test-helpers/tap.js';

const PACKAGE_PATH = 'package.json';
const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml';
const TEST_CI_SCRIPT_PATH = 'scripts/run-test-ci-overlapped.sh';
const TEXT_ENCODING = 'utf8';
const OWNER_DEBT_PREPARE_SCRIPT =
  'node scripts/generate-global-owner-debt-inventory.js --refresh ' +
  '--output test-output/analysis/global-owner-debt-inventory.json';
const OWNER_DEBT_PREPARE_COMMAND = 'npm run test:owner-debt:prepare';
const AGGREGATE_SENSITIVE_PREPARE_COMMAND =
  'npm run test:aggregate-sensitive-pregate';
const FAIL_CLOSED_COMMAND_SUFFIX = ' || exit 1';
const ANALYSIS_LANE_COMMAND = 'nice -n 10 bash -c';
const MOVIELENS_DOWNLOAD_COMMAND =
  'node examples/service-data-affinity/download-movielens.js';
const FULL_RELEASE_GATE_COMMAND = 'run: npm run test:ci';
const AGGREGATE_SENSITIVE_TEST =
  'test/distributed/harness/__tests__/' +
  'comparative-efficiency-claim-projection.test.js';
const FAST_LANE_WORKER_BUDGET = '--jobs=4';
const UNSAFE_FAST_LANE_WORKER_BUDGET = '--jobs=8';
const SERIAL_WORKER_BUDGET = '--jobs=1';
const AGGREGATE_SENSITIVE_TIMEOUT = 'TAP_TIMEOUT=120';
const FAILURE_EXIT_CODE = 1;
const STUB_FAILURE_EXIT_CODE = '23';
const EXECUTABLE_FILE_MODE = 0o755;
const SHELL_BINARY = 'bash';
const NPM_COMMAND_PREFIX = 'npm ';
const OWNER_DEBT_PREPARE_SCRIPT_KEY = 'test:owner-debt:prepare';
const TEST_NAME = Object.freeze({
  AGGREGATE_BUDGET: 'clean CI uses the aggregate-proven TAP worker budget',
  FAIL_CLOSED: 'clean CI fails closed when either serial pregate fails',
  LANE_FAILURES: 'clean CI fails closed when an overlapped lane fails',
  INTERRUPT_CLEANUP: 'clean CI reaps the analysis lane on interrupt',
  MOVIELENS: 'tagged releases fetch MovieLens input before the full gate',
  OWNER_DEBT:
    'clean CI prepares ignored owner-debt inputs before concurrent readers',
});
const NPM_STUB = [
  '#!/usr/bin/env bash',
  'if [ "$*" = "$LAGRANGE_FAIL_COMMAND" ]; then',
  '  exit "$LAGRANGE_FAIL_EXIT_CODE"',
  'fi',
  'exit 0',
  '',
].join('\n');

function runOwnerWithFailingCommand(command) {
  const stubDirectory = mkdtempSync(join(tmpdir(), 'lagrange-ci-npm-stub-'));
  const stubPath = join(stubDirectory, 'npm');
  writeFileSync(stubPath, NPM_STUB);
  chmodSync(stubPath, EXECUTABLE_FILE_MODE);
  try {
    return spawnSync(SHELL_BINARY, [TEST_CI_SCRIPT_PATH], {
      cwd: process.cwd(),
      encoding: TEXT_ENCODING,
      env: {
        ...process.env,
        LAGRANGE_FAIL_COMMAND: command.replace(NPM_COMMAND_PREFIX, ''),
        LAGRANGE_FAIL_EXIT_CODE: STUB_FAILURE_EXIT_CODE,
        PATH: `${stubDirectory}${delimiter}${process.env.PATH}`,
      },
    });
  } finally {
    rmSync(stubDirectory, {recursive: true, force: true});
  }
}

test(TEST_NAME.OWNER_DEBT,
  (t) => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, TEXT_ENCODING));
    const script = readFileSync(TEST_CI_SCRIPT_PATH, TEXT_ENCODING);

    t.equal(
      packageJson.scripts[OWNER_DEBT_PREPARE_SCRIPT_KEY],
      OWNER_DEBT_PREPARE_SCRIPT,
    );
    t.ok(
      script.includes(
        `${OWNER_DEBT_PREPARE_COMMAND}${FAIL_CLOSED_COMMAND_SUFFIX}`,
      ),
    );
    t.ok(
      script.includes(
        `${AGGREGATE_SENSITIVE_PREPARE_COMMAND}${FAIL_CLOSED_COMMAND_SUFFIX}`,
      ),
    );
    t.ok(
      script.indexOf(OWNER_DEBT_PREPARE_COMMAND) <
        script.indexOf(ANALYSIS_LANE_COMMAND),
    );
    t.ok(
      script.indexOf(AGGREGATE_SENSITIVE_PREPARE_COMMAND) <
        script.indexOf(ANALYSIS_LANE_COMMAND),
    );
    t.end();
  });

test(TEST_NAME.AGGREGATE_BUDGET, (t) => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, TEXT_ENCODING));
  const fastLane = packageJson.scripts['test:fast'];
  const sensitivePregate =
    packageJson.scripts['test:aggregate-sensitive-pregate'];

  // test:fast now dispatches to one lane per resource class, so the worker
  // budget lives on the lanes: ordinary keeps the aggregate-proven --jobs=4,
  // while external-toolchain is pinned to --jobs=1 because a single toolchain
  // test can consume ~3.7 cores and oversubscribes a 2-vCPU runner. The
  // aggregate-sensitive file is still kept out of the parallel lane, now by
  // explicit --exclude rather than by a shell `! -path` glob.
  const ordinaryLane = packageJson.scripts['test:fast:ordinary'];
  const toolchainLane = packageJson.scripts['test:fast:toolchain'];
  t.ok(fastLane.includes('test:fast:ordinary'));
  t.ok(fastLane.includes('test:fast:toolchain'));
  t.ok(ordinaryLane.includes(FAST_LANE_WORKER_BUDGET));
  t.notOk(ordinaryLane.includes(UNSAFE_FAST_LANE_WORKER_BUDGET));
  t.ok(toolchainLane.includes(SERIAL_WORKER_BUDGET));
  t.ok(ordinaryLane.includes(`--exclude ${AGGREGATE_SENSITIVE_TEST}`));
  t.ok(sensitivePregate.includes(SERIAL_WORKER_BUDGET));
  t.ok(sensitivePregate.includes(AGGREGATE_SENSITIVE_TIMEOUT));
  t.ok(sensitivePregate.includes(AGGREGATE_SENSITIVE_TEST));
  t.end();
});

test(TEST_NAME.FAIL_CLOSED, (t) => {
  const ownerDebtFailure = runOwnerWithFailingCommand(
    OWNER_DEBT_PREPARE_COMMAND,
  );
  const aggregateFailure = runOwnerWithFailingCommand(
    AGGREGATE_SENSITIVE_PREPARE_COMMAND,
  );

  t.equal(ownerDebtFailure.status, FAILURE_EXIT_CODE);
  t.equal(aggregateFailure.status, FAILURE_EXIT_CODE);
  t.end();
});

test(TEST_NAME.LANE_FAILURES, (t) => {
  const analysisLaneFailure = runOwnerWithFailingCommand('npm run test:static');
  const modelLaneFailure = runOwnerWithFailingCommand(
    'npm run model:contracts',
  );
  const tapLaneFailure = runOwnerWithFailingCommand(
    'npm run test:sharded:all',
  );
  const chartLaneFailure = runOwnerWithFailingCommand(
    'npm run test:chart:endpoint-sync',
  );

  t.equal(analysisLaneFailure.status, FAILURE_EXIT_CODE);
  t.equal(modelLaneFailure.status, FAILURE_EXIT_CODE);
  t.equal(tapLaneFailure.status, Number(STUB_FAILURE_EXIT_CODE));
  t.equal(chartLaneFailure.status, Number(STUB_FAILURE_EXIT_CODE));
  t.end();
});

test(TEST_NAME.INTERRUPT_CLEANUP, (t) => {
  const script = readFileSync(TEST_CI_SCRIPT_PATH, TEXT_ENCODING);

  t.ok(script.includes('cleanup_analysis_lane() {'));
  t.ok(script.includes('kill "$analysis_pid"'));
  t.ok(script.includes('wait "$analysis_pid" 2>/dev/null'));
  t.ok(script.includes(
    'trap \'cleanup_analysis_lane; exit 130\' INT TERM',
  ));
  t.ok(
    script.indexOf('analysis_pid=$!') <
      script.indexOf('trap \'cleanup_analysis_lane'),
  );
  t.end();
});

test(TEST_NAME.MOVIELENS, (t) => {
  const workflow = readFileSync(RELEASE_WORKFLOW_PATH, TEXT_ENCODING);

  t.ok(workflow.indexOf(MOVIELENS_DOWNLOAD_COMMAND) >= 0);
  t.ok(
    workflow.indexOf(MOVIELENS_DOWNLOAD_COMMAND) <
      workflow.indexOf(FULL_RELEASE_GATE_COMMAND),
  );
  t.end();
});
