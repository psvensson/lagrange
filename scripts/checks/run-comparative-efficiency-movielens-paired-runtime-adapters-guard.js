#!/usr/bin/env node

import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

import {
  runGuardTestScenarios,
} from './guard-test-scenario-runner.js';

const execFileAsync = promisify(execFile);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const stringIncludes = Function.call.bind(String.prototype.includes);
const C3_SCENARIO =
  'comparative-efficiency-movielens-heterogeneous-capacity-observation';
const C4_SCENARIO =
  'comparative-efficiency-movielens-paired-resource-observation';
const TERMINAL_SCENARIO =
  'comparative-efficiency-movielens-paired-runtime-adapters';
const GUARD_FIDELITY =
  'deterministic-contract-guard-backed-by-one-live-adapter-root';
const PRECHANGE_RED_FLAG = '--prechange-red';
const PRECHANGE_RED_SCENARIO =
  'comparative-efficiency-movielens-paired-runtime-adapters-prechange-red';
const PREDECESSOR_TEST =
  'test/distributed/harness/__tests__/' +
  'comparative-efficiency-movielens-grouped-reduce.test.js';
const PREDECESSOR_ASSERTION =
  'admits the exact eight-cell public semantic matrix without a claim';
const PRECHANGE_BASE_REVISION =
  '6d284fbc3fc03cdc9b997fd6a74428ebc7def92c';
const PRECHANGE_ADAPTER_MODULE =
  'test/distributed/harness/benchmark-capacity-heterogeneous-protocol.js';
const REPORT_DIRECTORY = 'test-output/reports';
const EXECUTION_BUFFER_BYTES = 4 * 1_024 * 1_024;
const EXPECTED_MEASURING_CELL_COUNT = 1;
const PREDECESSOR_NON_MEASURING_CELL_COUNT = 8;
const PROBE_MISSING_EXIT_CODE = 17;
const localText = Object.freeze({
  DIRECTED_FAILURE:
    'heterogeneous Lagrange capacity/resource observation adapter absent',
  GIT: 'git',
  GIT_WORKTREE_ADD: 'add',
  GIT_WORKTREE_DETACH: '--detach',
  GIT_WORKTREE_FORCE: '--force',
  GIT_WORKTREE_REMOVE: 'remove',
  GIT_WORKTREE: 'worktree',
  INPUT_TYPE_MODULE: '--input-type=module',
  MODULE_NOT_FOUND: 'ERR_MODULE_NOT_FOUND',
  NODE_TEST: '--test',
  NODE_MODULES: 'node_modules',
  NODE_MODULES_TYPE: 'dir',
  PRECHANGE_WORKTREE_PREFIX: 'lagrange-m2-prechange-',
  PROOF_AND_CLEANUP_FAILED: 'prechange proof and cleanup both failed',
  PROBE_UNEXPECTED_FAILURE:
    'prechange adapter probe failed for an ineligible reason',
  SETUP_UNEXPECTED_PASS: 'prechange assertion unexpectedly passed',
  UTF8: 'utf8',
  WRITE_EXCLUSIVE: 'wx',
});
const PRECHANGE_ADAPTER_PROBE_SOURCE = arrayJoin([
  `const target = ${jsonStringify(`./${PRECHANGE_ADAPTER_MODULE}`)};`,
  'try {',
  '  const loaded = await import(target);',
  '  const present = typeof ' +
    'loaded.runBenchmarkCapacityHeterogeneousProtocol === "function";',
  '  process.stdout.write(JSON.stringify({',
  '    measuringCellCount: present ? 1 : 0,',
  '    moduleLoaded: true,',
  '    ownerExportPresent: present,',
  '  }));',
  '} catch (error) {',
  '  process.stdout.write(JSON.stringify({',
  '    measuringCellCount: 0,',
  '    moduleLoaded: false,',
  '    ownerExportPresent: false,',
  '    failureCode: error?.code ?? null,',
  '    failureMessage: error?.message ?? String(error),',
  '  }));',
  `  process.exitCode = ${PROBE_MISSING_EXIT_CODE};`,
  '}',
], '\n');
const C3_TESTS = Object.freeze([
  'test/distributed/harness/__tests__/' +
    'benchmark-capacity-heterogeneous-observation.test.js',
  'test/distributed/harness/__tests__/' +
    'benchmark-capacity-heterogeneous-protocol.test.js',
  'test/examples/movielens-capacity-runtime-adapters.test.js',
  'test/examples/' +
    'comparative-efficiency-movielens-public-request-workload.test.js',
  'test/scripts/systemd-capacity-adapter-controller.test.js',
]);
const C4_TESTS = Object.freeze([
  'test/distributed/harness/__tests__/' +
    'benchmark-resource-capacity-protocol-evidence.test.js',
  'test/distributed/harness/__tests__/' +
    'benchmark-resource-live-observation-authority.test.js',
  'test/distributed/harness/__tests__/' +
    'benchmark-resource-mixed-provider.test.js',
  'test/distributed/harness/__tests__/' +
    'benchmark-whole-topology-resource-accounting-adversarial.test.js',
  'test/distributed/harness/__tests__/' +
    'benchmark-whole-topology-resource-accounting.test.js',
  'test/scripts/benchmark-resource-source-provenance.test.js',
]);

async function runPredecessorProof(predecessorRoot) {
  return execFileAsync(
    process.execPath,
    [
      localText.NODE_TEST,
      `--test-name-pattern=${PREDECESSOR_ASSERTION}`,
      PREDECESSOR_TEST,
    ],
    {
      cwd: predecessorRoot,
      encoding: localText.UTF8,
      maxBuffer: EXECUTION_BUFFER_BYTES,
    },
  );
}

async function runPredecessorAdapterProbe(predecessorRoot) {
  try {
    const result = await execFileAsync(
      process.execPath,
      [
        localText.INPUT_TYPE_MODULE,
        '--eval',
        PRECHANGE_ADAPTER_PROBE_SOURCE,
      ],
      {
        cwd: predecessorRoot,
        encoding: localText.UTF8,
        maxBuffer: EXECUTION_BUFFER_BYTES,
      },
    );
    return {
      ...jsonParse(result.stdout),
      exitCode: 0,
    };
  } catch (error) {
    let observation;
    try {
      observation = jsonParse(error.stdout);
    } catch {
      throw new Error(
        `${localText.PROBE_UNEXPECTED_FAILURE}: ${error.message}`,
      );
    }
    if (
      error.code !== PROBE_MISSING_EXIT_CODE ||
      observation.failureCode !== localText.MODULE_NOT_FOUND ||
      !stringIncludes(
        observation.failureMessage,
        PRECHANGE_ADAPTER_MODULE,
      )
    ) {
      throw new Error(
        `${localText.PROBE_UNEXPECTED_FAILURE}: ` +
        `${jsonStringify(observation)}`,
      );
    }
    return {
      ...observation,
      exitCode: error.code,
    };
  }
}

async function createPredecessorCheckout() {
  const predecessorRoot = await mkdtemp(path.join(
    tmpdir(),
    localText.PRECHANGE_WORKTREE_PREFIX,
  ));
  let registered = false;
  try {
    await execFileAsync(
      localText.GIT,
      [
        localText.GIT_WORKTREE,
        localText.GIT_WORKTREE_ADD,
        localText.GIT_WORKTREE_DETACH,
        predecessorRoot,
        PRECHANGE_BASE_REVISION,
      ],
      {
        cwd: process.cwd(),
        encoding: localText.UTF8,
        maxBuffer: EXECUTION_BUFFER_BYTES,
      },
    );
    registered = true;
    await symlink(
      path.resolve(localText.NODE_MODULES),
      path.join(predecessorRoot, localText.NODE_MODULES),
      localText.NODE_MODULES_TYPE,
    );
    return {
      predecessorRoot,
      async cleanup() {
        await execFileAsync(
          localText.GIT,
          [
            localText.GIT_WORKTREE,
            localText.GIT_WORKTREE_REMOVE,
            localText.GIT_WORKTREE_FORCE,
            localText.GIT_WORKTREE_FORCE,
            predecessorRoot,
          ],
          {
            cwd: process.cwd(),
            encoding: localText.UTF8,
            maxBuffer: EXECUTION_BUFFER_BYTES,
          },
        );
      },
    };
  } catch (error) {
    if (registered) {
      await execFileAsync(
        localText.GIT,
        [
          localText.GIT_WORKTREE,
          localText.GIT_WORKTREE_REMOVE,
          localText.GIT_WORKTREE_FORCE,
          localText.GIT_WORKTREE_FORCE,
          predecessorRoot,
        ],
        {
          cwd: process.cwd(),
          encoding: localText.UTF8,
          maxBuffer: EXECUTION_BUFFER_BYTES,
        },
      ).catch(() => {});
    }
    await rm(predecessorRoot, {recursive: true, force: true});
    throw error;
  }
}

async function writeRedReport(assertionError, proof) {
  const timestamp = new Date().toISOString();
  const detail = {
    predecessorRevision: PRECHANGE_BASE_REVISION,
    predecessorAssertion: PREDECESSOR_ASSERTION,
    predecessorPublicPathPassed: true,
    predecessorPublicTestStdout: proof.publicTest.stdout,
    predecessorAdapterProbe: proof.adapterProbe,
    predecessorMeasuringCellCount:
      proof.adapterProbe.measuringCellCount,
    predecessorNonMeasuringCellCount:
      PREDECESSOR_NON_MEASURING_CELL_COUNT,
    expectedMeasuringCellCount: EXPECTED_MEASURING_CELL_COUNT,
    missingOwner:
      'heterogeneous Lagrange capacity/resource observation adapter',
    assertion: {
      name: assertionError.name,
      message: assertionError.message,
      operator: assertionError.operator,
      actual: assertionError.actual,
      expected: assertionError.expected,
    },
  };
  const scenario = {
    scenario: PRECHANGE_RED_SCENARIO,
    passed: false,
    current: {
      passed: false,
      verdict: 'FAIL',
      rootCauseClass: 'missing_heterogeneous_adapter',
      mechanism: 'measuring_admission_absent',
    },
    detail,
  };
  const report = {
    timestamp,
    scenario: PRECHANGE_RED_SCENARIO,
    producer: 'comparative-efficiency-movielens-prechange-red',
    fidelity: 'directed-prechange-assertion-after-public-c7-proof',
    summary: {total: 1, passed: 0, failed: 1},
    optimizationSummary: {
      totalPriorityItems: 1,
      items: [{
        priority: 'P0',
        owner: 'C3/C4 adapter seam',
        reason:
          'public operation passes but no heterogeneous measuring cell exists',
      }],
    },
    standardSummary: {scenarios: [scenario]},
  };
  await mkdir(REPORT_DIRECTORY, {recursive: true});
  const stamp = timestamp.replace(/[:.]/gu, '-');
  const reportPath = path.resolve(
    REPORT_DIRECTORY,
    `${PRECHANGE_RED_SCENARIO}-${stamp}.report.json`,
  );
  await writeFile(reportPath, jsonStringify(report, null, 2), {
    flag: localText.WRITE_EXCLUSIVE,
  });
  return reportPath;
}

async function runPrechangeRed() {
  const checkout = await createPredecessorCheckout();
  let proof;
  let proofError;
  try {
    const publicTest = await runPredecessorProof(
      checkout.predecessorRoot,
    );
    const adapterProbe = await runPredecessorAdapterProbe(
      checkout.predecessorRoot,
    );
    proof = {publicTest, adapterProbe};
  } catch (error) {
    proofError = error;
  }
  try {
    await checkout.cleanup();
  } catch (error) {
    if (proofError === undefined) {
      proofError = error;
    } else {
      proofError = new AggregateError(
        [proofError, error],
        localText.PROOF_AND_CLEANUP_FAILED,
      );
    }
  }
  if (proofError !== undefined) throw proofError;
  let directedFailure;
  try {
    assert.equal(
      proof.adapterProbe.measuringCellCount,
      EXPECTED_MEASURING_CELL_COUNT,
      localText.DIRECTED_FAILURE,
    );
  } catch (error) {
    directedFailure = error;
  }
  if (directedFailure === undefined) {
    throw new Error(localText.SETUP_UNEXPECTED_PASS);
  }
  const reportPath = await writeRedReport(directedFailure, proof);
  process.stderr.write(
    `PRECHANGE RED: ${directedFailure.message}\n` +
    `scenarioReport: ${reportPath}\n`,
  );
  process.exitCode = 1;
}

function runGuard() {
  runGuardTestScenarios({
    [C3_SCENARIO]: [...C3_TESTS],
    [C4_SCENARIO]: [...C4_TESTS],
    [TERMINAL_SCENARIO]: [...C3_TESTS, ...C4_TESTS],
  }, {
    fidelity: GUARD_FIDELITY,
  });
}

if (arrayIncludes(process.argv, PRECHANGE_RED_FLAG)) {
  runPrechangeRed().catch((error) => {
    process.stderr.write(`PRECHANGE RED SETUP FAILURE: ${error.stack}\n`);
    process.exitCode = 2;
  });
} else {
  runGuard();
}
