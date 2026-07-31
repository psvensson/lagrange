#!/usr/bin/env node
/**
 * ci-failure-triage.js — identify exactly which tests failed in a GitHub CI
 * run without hand-grepping logs.
 *
 * Usage:
 *   node scripts/ci-failure-triage.js [run-id]
 *   node scripts/ci-failure-triage.js            # latest run on main
 *   node scripts/ci-failure-triage.js --repro    # also emit a local repro cmd
 *
 * How it works:
 *   1. Resolves the run (explicit id or newest on --branch).
 *   2. Fetches the run's FULL logs via the API zip — `gh run view --log`
 *      truncates large logs, silently dropping the lines that name failing
 *      tests; the per-step zip files are complete.
 *   3. Extracts every `# test-files total=N pass=P fail=F` shard summary.
 *   4. For shards with fail > 0, collects the runner's `not ok <file>` lines
 *      between the previous shard summary and the failing one. If the CI
 *      receipt dump truncated those lines away, the tool says so honestly
 *      instead of guessing from shard membership (local find/sort batching
 *      does not reproduce CI's batches).
 *   5. Prints failing test file(s) and (with --repro) the local command to
 *      rerun them.
 *
 * Exit codes: 0 = triage completed (failures may or may not exist, see
 * output), 2 = could not resolve run or log.
 */

import {execFileSync, execSync} from 'node:child_process';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_TWO = 2;
const LOCAL_NUM_SHA_PREFIX = 8;
const LOCAL_NUM_KIB = 1024;
const LOCAL_NUM_MAX_BUFFER_MB = 256;
const LOCAL_STR_BRANCH_DEFAULT = 'main';
const LOCAL_STR_REPRO_FLAG = '--repro';
const LOCAL_STR_BRANCH_PREFIX = '--branch=';
const LOCAL_STR_CAT = 'cat';
const LOCAL_STR_ENCODING_UTF8 = 'utf8';
const LOCAL_STR_NEWLINE = '\n';
const LOCAL_MSG_NO_SUMMARIES =
  'ci-triage: no test-shard summaries found in the run log.';
const LOCAL_MSG_FAILING_FILES = '  failing test file(s):';
const LOCAL_MSG_REPRO = '  repro locally:';
const LOCAL_MSG_UNRECOVERABLE =
  '  FAILING TEST NOT RECOVERABLE from the dumped log: the gate\n' +
  '  receipt dump tails only the end of the captured output, and the\n' +
  '  runner\'s `not ok <file>` line was truncated away. Rerun the\n' +
  '  fast-tests shard locally to identify it:\n' +
  '    npm run test:fast\n' +
  '  (A workflow fix that greps failure lines before tailing is in\n' +
  '  .github/workflows/ci.yml — future failures will name the file.)';
const SHARD_SUMMARY_PATTERN =
  /# test-files total=(\d+) pass=(\d+) fail=(\d+) assertions=(\d+)/;
const OK_LINE_PATTERN = /^ok (test\/\S+\.test\.js)/;
const NOT_OK_LINE_PATTERN = /^not ok .*(test\/\S+\.test\.js)/;

function parseArgs(argv) {
  const args = {runId: null, branch: LOCAL_STR_BRANCH_DEFAULT, repro: false};
  for (const arg of argv) {
    if (arg === LOCAL_STR_REPRO_FLAG) {
      args.repro = true;
    } else if (arg.startsWith(LOCAL_STR_BRANCH_PREFIX)) {
      args.branch = arg.slice(LOCAL_STR_BRANCH_PREFIX.length);
    } else if (/^\d+$/.test(arg)) {
      args.runId = arg;
    }
  }
  return args;
}

function resolveRunId(args) {
  if (args.runId) {
    return args.runId;
  }
  const out = execFileSync('gh', [
    'run', 'list',
    '--branch', args.branch,
    '--limit', String(LOCAL_NUM_ONE),
    '--json', 'databaseId,conclusion,headSha,displayTitle',
  ], {encoding: 'utf8'});
  const runs = JSON.parse(out);
  if (runs.length === LOCAL_NUM_ZERO) {
    console.error(`ci-triage: no CI runs found on branch ${args.branch}`);
    process.exit(LOCAL_NUM_TWO);
  }
  const run = runs[LOCAL_NUM_ZERO];
  console.error(
    `ci-triage: run ${run.databaseId} (${run.conclusion}) ` +
    `${run.headSha.slice(LOCAL_NUM_ZERO, LOCAL_NUM_SHA_PREFIX)} — ` +
    `${run.displayTitle}`,
  );
  return String(run.databaseId);
}

/**
 * Fetch the run's full logs via the API zip. `gh run view --log` truncates
 * large logs, silently dropping the lines that name failing tests; the
 * per-step zip files are complete.
 * @return {string} concatenated step logs
 */
function fetchRunLog(runId) {
  const repo = execFileSync(
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    {encoding: 'utf8'},
  ).trim();
  const zipPath = `/tmp/lagrange-ci-logs-${runId}.zip`;
  const outDir = `/tmp/lagrange-ci-logs-${runId}`;
  execSync(
    `gh api repos/${repo}/actions/runs/${runId}/logs > ${zipPath}`,
    {maxBuffer: LOCAL_NUM_KIB * LOCAL_NUM_KIB * LOCAL_NUM_KIB},
  );
  execSync(
    `rm -rf ${outDir} && mkdir -p ${outDir} && ` +
    `unzip -o -q ${zipPath} -d ${outDir}`,
  );
  // The zip contains one aggregate file per job ("N_<job>.txt") plus one
  // file per step ("<job>/<step>.txt"); the aggregate duplicates the step
  // content. Keep only per-step files to avoid double-counting summaries.
  const files = execSync(
    `find ${outDir} -mindepth 2 -type f -name '*.txt' | sort`,
    {encoding: 'utf8'},
  ).trim().split('\n').filter(Boolean);
  return files
    .map((f) => execFileSync(LOCAL_STR_CAT, [f], {
      encoding: LOCAL_STR_ENCODING_UTF8,
      maxBuffer: LOCAL_NUM_MAX_BUFFER_MB * LOCAL_NUM_KIB * LOCAL_NUM_KIB,
    }))
    .join(LOCAL_STR_NEWLINE);
}

/**
 * Strip the GitHub Actions log prefix ("job\tstep\tTIMESTAMP ") so content
 * patterns match regardless of which step echoed them.
 */
function stripLogPrefix(line) {
  const match = line.match(/^\S+\t\S[^\t]*\t\d{4}-\d{2}-\d{2}T\S+Z (.*)$/);
  return match ? match[LOCAL_NUM_ONE] : line;
}

function parseShardSummaries(lines) {
  const summaries = [];
  lines.forEach((rawLine, index) => {
    const line = stripLogPrefix(rawLine);
    const match = line.match(SHARD_SUMMARY_PATTERN);
    if (match) {
      summaries.push({
        index,
        total: Number(match[LOCAL_NUM_ONE]),
        pass: Number(match[LOCAL_NUM_TWO]),
        fail: Number(match[LOCAL_NUM_TWO + LOCAL_NUM_ONE]),
      });
    }
  });
  return summaries;
}

/**
 * A failing shard's per-file lines sit between the previous shard's summary
 * and its own. The runner prints `not ok <file>` for failures — collect
 * those directly. When the CI dump truncated the shard's `not ok` line (the
 * receipt dump tails only the last ~200 lines of the artifact), the exact
 * file is unrecoverable from the log: say so instead of guessing.
 */
function collectShardFailures(lines, summaryLineIndex, previousSummaryIndex) {
  const start = previousSummaryIndex ?? LOCAL_NUM_ZERO;
  const notOk = new Set();
  const ok = new Set();
  for (let i = start; i < summaryLineIndex; i += 1) {
    const line = stripLogPrefix(lines[i]);
    const notOkMatch = line.match(NOT_OK_LINE_PATTERN);
    if (notOkMatch) {
      notOk.add(notOkMatch[LOCAL_NUM_ONE]);
    }
    const okMatch = line.match(OK_LINE_PATTERN);
    if (okMatch) {
      ok.add(okMatch[LOCAL_NUM_ONE]);
    }
  }
  return {notOk: [...notOk], okCount: ok.size};
}

function triage(runId, repro) {
  const log = fetchRunLog(runId);
  const lines = log.split('\n');
  const summaries = parseShardSummaries(lines);
  if (summaries.length === LOCAL_NUM_ZERO) {
    console.log(LOCAL_MSG_NO_SUMMARIES);
    return;
  }
  const failed = summaries.filter((s) => s.fail > LOCAL_NUM_ZERO);
  if (failed.length === LOCAL_NUM_ZERO) {
    console.log(
      `ci-triage: all ${summaries.length} dumped shard(s) passed.`,
    );
    return;
  }
  console.log(
    `ci-triage: ${failed.length}/${summaries.length} dumped shard(s) failed.`,
  );
  failed.forEach((shard) => {
    const shardPos = summaries.indexOf(shard);
    const previousSummaryIndex =
      shardPos > LOCAL_NUM_ZERO ? summaries[shardPos - LOCAL_NUM_ONE].index :
        null;
    const {notOk, okCount} = collectShardFailures(
      lines,
      shard.index,
      previousSummaryIndex,
    );
    console.log(
      `\nshard summary at log line ${shard.index}: ` +
      `pass=${shard.pass} fail=${shard.fail} ` +
      `(${okCount} ok-line(s) visible in the same window)`,
    );
    if (notOk.length > LOCAL_NUM_ZERO) {
      console.log(LOCAL_MSG_FAILING_FILES);
      for (const f of notOk) {
        console.log(`    ${f}`);
      }
      if (repro) {
        console.log(LOCAL_MSG_REPRO);
        for (const f of notOk) {
          console.log(`    node ${f}`);
        }
      }
    } else {
      console.log(LOCAL_MSG_UNRECOVERABLE);
    }
  });
}

const args = parseArgs(process.argv.slice(LOCAL_NUM_TWO));
const runId = resolveRunId(args);
triage(runId, args.repro);
