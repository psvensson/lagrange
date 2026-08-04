#!/usr/bin/env node

/**
 * Fail-slow aggregate runner for the static audit corpus.
 *
 * The previous `a && b && c && ...` npm chain surfaced ONE failure per
 * full gate cycle - the 2026-08-04 retrospective paid five ~15-minute
 * push cycles to discover five independent audit failures serially.
 * This runner executes every audit, reports EVERY failure in one pass,
 * and exits non-zero if any failed, so a red gate enumerates the whole
 * remaining work list at once.
 *
 * The audit list mirrors test:static:postpush; `--fast-fail` restores
 * the old behavior for callers that want the first failure only.
 */

import {spawnSync} from 'node:child_process';
import process from 'node:process';

// Module-load intrinsic captures (adversarial-js-intrinsics guideline).
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);

const NPM_BINARY = 'npm';
const NPM_RUN_ARGUMENTS = Object.freeze(['run', '-s']);
const FAST_FAIL_FLAG = '--fast-fail';
const STATUS_LABEL = Object.freeze({FAIL: 'FAIL', PASS: 'PASS'});
const SUMMARY_HEADER = '\nstatic-audits summary:\n';
const FAILURE_TAIL =
  'every failure above is independently fixable before the next run\n';

const STATIC_AUDIT_SCRIPTS = Object.freeze([
  'test:unused:prod',
  'test:deps',
  'test:complexity',
  'test:complexity:cognitive',
  'test:metadata-gateway:audit',
  'audit:runtime-grammar',
  'audit:service-portability-claims',
  'audit:current-capabilities',
  'audit:cli-docs',
  'audit:closure-ledger',
  'audit:no-kiro',
  'audit:no-legacy-naming',
  'audit:shards',
  'audit:guidelines',
  'audit:doc-audience',
  'audit:doc-ascii',
  'audit:documentation-current',
  'audit:roadmap-authority',
  'steering:check',
]);

function runAudit(scriptName) {
  const result = spawnSync(
    NPM_BINARY,
    [...NPM_RUN_ARGUMENTS, scriptName],
    {encoding: 'utf8', stdio: 'inherit'},
  );
  return {
    exitCode: result.status ?? 1,
    scriptName,
  };
}

function main() {
  const fastFail = arrayIncludes(process.argv, FAST_FAIL_FLAG);
  const results = [];
  for (const scriptName of STATIC_AUDIT_SCRIPTS) {
    const result = runAudit(scriptName);
    results.push(result);
    if (fastFail && result.exitCode !== 0) {
      break;
    }
  }
  const failures = arrayFilter(
    results, (result) => result.exitCode !== 0);
  process.stdout.write(SUMMARY_HEADER);
  for (const result of results) {
    const label = result.exitCode === 0 ?
      STATUS_LABEL.PASS :
      STATUS_LABEL.FAIL;
    process.stdout.write(`  ${label}  ${result.scriptName}\n`);
  }
  if (failures.length > 0) {
    process.stdout.write(
      `static-audits: ${failures.length}/${results.length} audits FAILED - ` +
        FAILURE_TAIL);
    process.exit(1);
  }
  process.stdout.write(
    `static-audits: all ${results.length} audits passed\n`);
}

main();
