#!/usr/bin/env node
/**
 * AddressManager peer-location authority probe
 * (`formation-address-manager-peer-location-authority` quest, epic
 * formation-seed-decoupling).
 *
 *   node scripts/checks/address-manager-peer-location-authority.js
 *
 * Prints the number of ways the process-global AddressManager registry was
 * able to change a node-local peer-location decision (target 0).
 *
 * The witness deliberately constructs conflicting authorities - the node's own
 * cache says the peer is at A, the process registry is poisoned toward B - and
 * drives the real production resolution on real PartitionService and
 * MessageGroupService runtimes. Its verdict comes from the destination a real
 * write actually reached, not from a returned string, because a resolver that
 * answers correctly while a later write consults the registry would still be a
 * leak. It also asserts that no production file outside AddressManager reads
 * the registry's state at all, so a future caller cannot quietly make it an
 * authority.
 */
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const NODE_BIN = process.execPath;
const TEST_RUNNER = 'scripts/run-test-files.js';
const WITNESS = 'test/address/address-manager-peer-location-authority.test.js';
const UTF8 = 'utf8';
const PIPE = 'pipe';
const EXIT_OK = 0;
const ONE_LEAK = 1;
const NEWLINE = '\n';

const result = spawnSync(NODE_BIN, [TEST_RUNNER, WITNESS], {
  encoding: UTF8,
  stdio: PIPE,
});
const leaks = result.status === EXIT_OK ? EXIT_OK : ONE_LEAK;
if (leaks !== EXIT_OK) process.stdout.write(`${result.stdout}${NEWLINE}`);
process.stdout.write(`${leaks}${NEWLINE}`);
process.exit(leaks === EXIT_OK ? EXIT_OK : ONE_LEAK);
