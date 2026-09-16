#!/usr/bin/env node
/**
 * Production time-authority closure probe
 * (`formation-sim-production-time-authority-closure` quest, epic
 * formation-seed-decoupling).
 *
 *   node scripts/checks/formation-sim-production-time-authority.js [--explain]
 *
 * Prints the number of time-authority witnesses that do not hold (the quest
 * probe; target 0). The witnesses live in
 * test/simulation/formation-sim-production-time-authority.test.js and assert
 * that hosted production reads time only from the owning node or subsystem
 * TimeSource, and that the one deterministic-owner ambient-seam guard refuses
 * an ambient read from tagged production execution however many continuations
 * it took to reach it.
 *
 * The probe starts one child `node --test` run and reads its TAP summary; it
 * measures nothing itself.
 */
import {runWitnessTapProbe} from './witness-tap-probe.js';

const WITNESS_FILE = 'test/simulation/formation-sim-production-time-authority.test.js';
const WITNESS_NOUN = 'time-authority';

runWitnessTapProbe({witnessFile: WITNESS_FILE, noun: WITNESS_NOUN});
