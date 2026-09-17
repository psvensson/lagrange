#!/usr/bin/env node
/**
 * Charged production-composed seed host probe
 * (`formation-sim-charged-production-seed-host` quest, epic
 * formation-seed-decoupling).
 *
 *   node scripts/checks/formation-sim-charged-seed-host.js
 *
 * Prints the number of UNMET witnesses (target 0).
 *
 * The witness runs the production-composed seed host charged under the
 * current live calibration lineage and asserts four semantic claims: the
 * charged scenario reaches the "Cluster formed" counterpart and then rest with
 * no ambient seam reached; the charged run is a pure function of the scenario;
 * charging moves the schedule and never the ownership (identical provenance
 * charged and uncharged); and charging is off unless a calibration is
 * supplied. No count, millisecond, gap or rate is a target.
 */
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const NODE_BIN = process.execPath;
const TEST_RUNNER = 'scripts/run-test-files.js';
const WITNESS = 'test/simulation/formation-sim-charged-seed-host.test.js';
const UTF8 = 'utf8';
const PIPE = 'pipe';
const EXIT_OK = 0;
const ONE_UNMET = 1;
const NEWLINE = '\n';

const result = spawnSync(NODE_BIN, [TEST_RUNNER, WITNESS], {
  encoding: UTF8,
  stdio: PIPE,
});
const unmet = result.status === EXIT_OK ? EXIT_OK : ONE_UNMET;
if (unmet !== EXIT_OK) process.stdout.write(`${result.stdout}${NEWLINE}`);
process.stdout.write(`${unmet}${NEWLINE}`);
process.exit(unmet === EXIT_OK ? EXIT_OK : ONE_UNMET);
