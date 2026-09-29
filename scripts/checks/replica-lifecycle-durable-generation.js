#!/usr/bin/env node
/**
 * Replica lifecycle durable-generation closure probe.
 *
 * Prints the number of lifecycle/cleanup witnesses that do not hold.
 * Target: zero.
 */
import {runWitnessTapProbe} from './witness-tap-probe.js';

const WITNESS_FILE =
  'test/node/replica-lifecycle-durable-generation.test.js';
const WITNESS_NOUN = 'replica-lifecycle durable-generation';

runWitnessTapProbe({
  witnessFile: WITNESS_FILE,
  noun: WITNESS_NOUN,
});
