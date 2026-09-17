#!/usr/bin/env node
/**
 * Owner-clock DT6 regression probe (`rebalancer-owner-clock-dt6-regression`
 * quest, epic formation-seed-decoupling).
 *
 *   node scripts/checks/rebalancer-owner-clock-dt6.js
 *
 * Prints the number of UNMET witness files (target 0): the two DT6
 * formation falsifiers, the managed-split admission falsifier, and the
 * red-on-revert unit witnesses of the repairs that made them green on this
 * branch - the repository waits sleeping on the clock their deadline reads,
 * the recent-self-move lease exempting the ledger's own quorum-spread cure,
 * and the membership candidate carrying the AVAILABLE planning answer.
 */
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const NODE_BIN = process.execPath;
const TEST_RUNNER = 'scripts/run-test-files.js';
const WITNESSES = [
  'test/rebalancer/replica-operation-repository-owner-clock-waits.test.js',
  'test/rebalancer/recent-completed-replace-target-visibility.test.js',
  'test/control-plane/membership-publication-candidate-planning-surface.test.js',
  'test/convergence/dt6-formation-ledger-quorum-spread-first.test.js',
  'test/convergence/dt6-voter-surplus-promotion-drain-livelock.test.js',
  'test/integration/managed-split-admission-reliability.integration.test.js',
];
const UTF8 = 'utf8';
const PIPE = 'pipe';
const EXIT_OK = 0;
const ZERO = 0;
const ONE = 1;
const NEWLINE = '\n';

let unmet = ZERO;
for (const witness of WITNESSES) {
  const result = spawnSync(NODE_BIN, [TEST_RUNNER, witness], {
    encoding: UTF8,
    stdio: PIPE,
  });
  if (result.status !== EXIT_OK) {
    unmet += ONE;
    process.stdout.write(`${witness}${NEWLINE}${result.stdout}${NEWLINE}`);
  }
}
process.stdout.write(`${unmet}${NEWLINE}`);
process.exit(unmet === ZERO ? EXIT_OK : ONE);
