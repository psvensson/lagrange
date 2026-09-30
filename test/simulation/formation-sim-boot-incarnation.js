import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {reserveBootIncarnation} from
  '../../src/bootstrap/boot-incarnation-owner.js';

const SIMULATED_DATA_DIR_PREFIX = 'lagrange-sim-boot-incarnation-';

/**
 * A simulated node acquires its boot incarnation the way production does: the
 * boot incarnation owner (the one reservation authority) reserves it over the
 * node's data directory. A simulated node is virgin - it has no durable data
 * directory - so the reservation runs over a fresh, empty directory that is
 * discarded afterwards; the owner's own rule makes the result deterministic
 * (a virgin directory's first reservation). The simulator never manufactures
 * an incarnation and never bypasses the owner.
 * @return {Promise<number>} The incarnation the owner issued.
 */
async function reserveSimulatedBootIncarnation() {
  const dataDir = await mkdtemp(join(tmpdir(), SIMULATED_DATA_DIR_PREFIX));
  try {
    return await reserveBootIncarnation(dataDir);
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
}

export {reserveSimulatedBootIncarnation};
