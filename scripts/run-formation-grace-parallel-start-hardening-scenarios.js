#!/usr/bin/env node

import {runQuestGuardScenarios} from './run-quest-guard-scenarios.js';

// Deterministic guard retained for the historical quest name. Formation now
// consumes only the startup-authority verdict; the old reader-local placement
// grace no longer exists.
const SCENARIO = 'formation-grace-parallel-start-hardening';
const PRODUCER = 'formation-grace-parallel-start-hardening-proof';
const GUARD_FILES = Object.freeze([
  'test/bootstrap/formation-readiness-owner-single-form.test.js',
  'test/control-plane/readiness-owner-authority-contract.test.js',
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
