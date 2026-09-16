#!/usr/bin/env node
/**
 * Simulator attribution/runner isolation probe
 * (`formation-sim-attribution-runner-isolation` quest, epic
 * formation-seed-decoupling).
 *
 *   node scripts/checks/formation-sim-attribution-isolation.js [--explain]
 *
 * Prints the number of isolation witnesses that do not hold (the quest probe;
 * target 0). The witnesses live in
 * test/simulation/formation-sim-attribution-isolation.test.js and assert that
 * ambient host async ancestry - the test runner's, a caller's AsyncResource or
 * promise chain, or a resource left from a previous simulation generation -
 * never decides which simulated node production work is charged to, while an
 * active-generation segment that genuinely needs a node still fails closed.
 *
 * The probe starts one child `node --test` run and reads its TAP summary; it
 * measures nothing itself, so a witness can only be satisfied by repairing the
 * attribution boundary.
 */
import {runWitnessTapProbe} from './witness-tap-probe.js';

const WITNESS_FILE = 'test/simulation/formation-sim-attribution-isolation.test.js';
const WITNESS_NOUN = 'isolation';

runWitnessTapProbe({witnessFile: WITNESS_FILE, noun: WITNESS_NOUN});
