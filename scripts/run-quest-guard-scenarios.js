/**
 * Shared deterministic-guard scenario runner: executes the quest's guard
 * files synchronously and emits the deterministic guard report bound to
 * the scenario/producer identity.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTestFileSync} from './run-test-files.js';
import {emitDeterministicGuardReport} from './deterministic-guard-report.js';

const GUARD_TIMEOUT_MS = 300000;

export function runQuestGuardScenarios({scenario, producer, guardFiles}) {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const guards = guardFiles.map((file) => ({
    file,
    ...runTestFileSync(file, {print: false, timeoutMs: GUARD_TIMEOUT_MS}),
  }));
  emitDeterministicGuardReport({
    root,
    scenario,
    producer,
    guards,
    deterministicPassed: guards.every((guard) => guard.ok === true),
  });
}
