#!/usr/bin/env node

import {runQuestGuardScenarios} from './run-quest-guard-scenarios.js';

// Deterministic guard for the formation grace + parallel-start hardening
// quest: the red-first placement-observation grace contract plus the
// sealed formation interlock and the node-joining suites the parallelized
// harness starts must not regress.
const SCENARIO = 'formation-grace-parallel-start-hardening';
const PRODUCER = 'formation-grace-parallel-start-hardening-proof';
const GUARD_FILES = Object.freeze([
  'test/bootstrap/formation-placement-observation-grace.test.js',
  'test/bootstrap/node-joining-service.test.js',
  'test/bootstrap/node-joining-service-join-lifecycle-resume.test.js',
  'test/rebalancer/formation-ledger-spread-voter-ready-readiness.test.js',
  'test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js',
  'test/convergence/dt6-formation-ledger-quorum-spread-first.test.js',
]);

runQuestGuardScenarios({
  scenario: SCENARIO,
  producer: PRODUCER,
  guardFiles: GUARD_FILES,
});
