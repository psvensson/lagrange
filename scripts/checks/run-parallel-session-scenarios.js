#!/usr/bin/env node

// Scenario runners for the parallel-session-architecture epic's items 3–5
// quests (solve/epics/parallel-session-architecture.md). Each quest seals on
// a scenario-harness probe over 3 consecutive passing reports; the
// mechanisms themselves (machine evidence lock, quest leases, scope
// advisory) are proven by their committed deterministic guard tests, which
// these scenarios execute through the shared guard-test-scenario-runner.
//
// Scenarios:
//   parallel-evidence-machine-mutex  — item 4: the shared machine evidence
//     lock serializes live runs, steals dead holders loudly, bypass warns.
//   parallel-session-quest-leases    — item 3: one live session per quest
//     across worktrees; a second claimant is refused; the lease dies with
//     its worktree/heartbeat.
//   parallel-session-scope-advisory  — item 5: declared-scope overlaps with
//     other live sessions are surfaced before a first attempt seal.
//
// Deterministic and fast (no Docker, no machine lock): safe to run N times
// for each quest's `consecutive: 3` doneWhen gate.

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'parallel-evidence-machine-mutex': Object.freeze([
    'test/solve/machine-lock.test.js',
  ]),
  'parallel-session-quest-leases': Object.freeze([
    'test/solve/session-registry.test.js',
  ]),
  'parallel-session-scope-advisory': Object.freeze([
    // The advisory's overlap surface is owned and tested by the session
    // registry (declared-scope overlap is surfaced, not blocked); the
    // advisory renderer covers how surfaced signals are presented.
    'test/solve/session-registry.test.js',
    'test/solve/advisories.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
