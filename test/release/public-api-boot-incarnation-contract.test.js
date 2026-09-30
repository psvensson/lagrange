// Public-surface contract for the boot incarnation: an external consumer of
// the package reserves this boot's incarnation through the one public
// reservation operation and hands it to the public lifecycle owners, which
// require it. Construction only; no node is started.
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  BOOT_INCARNATION_FILENAME,
  reserveBootIncarnation as ownerReserveBootIncarnation,
} from '../../src/bootstrap/boot-incarnation-owner.js';
import {BOOT_INCARNATION_REQUIRED} from
  '../../src/bootstrap/boot-incarnation-contract.js';

const CORRUPT_STATE = '{"reserved": "not-a-number"';
const STATE_UNREADABLE = 'BOOT_INCARNATION_STATE_UNREADABLE';

async function withDataDir(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'public-boot-incarnation-'));
  t.teardown(() => rm(dataDir, {recursive: true, force: true}));
  return dataDir;
}

test('an external consumer reserves a boot incarnation through the public ' +
  'surface and supplies it to BootstrapService and NodeJoiningService',
async (t) => {
  const lagrange = await import('lagrange-server');
  t.equal(lagrange.reserveBootIncarnation, ownerReserveBootIncarnation,
    'the public export IS the boot incarnation owner\'s operation, not a ' +
    'second issuer');
  t.same(Object.keys(lagrange).filter((name) => /ncarnation/u.test(name)),
    ['reserveBootIncarnation'],
    'the surface exposes the reservation operation only: no owner state, ' +
    'no floor raise, no configurable incarnation source');

  const dataDir = await withDataDir(t);
  const first = await lagrange.reserveBootIncarnation(dataDir);
  const second = await lagrange.reserveBootIncarnation(dataDir);
  t.ok(Number.isSafeInteger(first) && first >= 1,
    'a virgin data directory issues an incarnation >= 1, never 0');
  t.ok(second > first, 'each reservation is a new, strictly larger boot');

  const seed = new lagrange.BootstrapService({
    nodeId: 'public-seed',
    nodeAddress: 'ws://localhost:19401',
    bootIncarnation: second,
  });
  t.equal(seed.bootIncarnation, second,
    'BootstrapService holds exactly the reserved incarnation');
  const joiner = new lagrange.NodeJoiningService({
    nodeId: 'public-joiner',
    nodeAddress: 'ws://localhost:19402',
    seedNodeAddress: 'http://localhost:19401',
    bootIncarnation: second,
  });
  t.equal(joiner.bootIncarnation, second,
    'NodeJoiningService holds exactly the reserved incarnation');

  t.throws(() => new lagrange.BootstrapService({
    nodeId: 'public-seed', nodeAddress: 'ws://localhost:19401',
  }), {code: BOOT_INCARNATION_REQUIRED},
  'no constructor reserves or infers an incarnation for the caller');
  t.throws(() => new lagrange.NodeJoiningService({
    nodeId: 'public-joiner', nodeAddress: 'ws://localhost:19402',
    seedNodeAddress: 'http://localhost:19401',
  }), {code: BOOT_INCARNATION_REQUIRED},
  'no constructor reserves or infers an incarnation for the caller');
});

test('the public reservation fails closed on unreadable durable state and ' +
  'without a data directory', async (t) => {
  const lagrange = await import('lagrange-server');
  const dataDir = await withDataDir(t);
  await writeFile(join(dataDir, BOOT_INCARNATION_FILENAME), CORRUPT_STATE);
  await t.rejects(lagrange.reserveBootIncarnation(dataDir),
    {code: STATE_UNREADABLE},
    'a corrupt reservation is never collapsed to a fresh directory');
  await t.rejects(lagrange.reserveBootIncarnation(undefined),
    {code: 'BOOT_INCARNATION_DATA_DIR_REQUIRED'},
    'the reservation needs the node\'s data directory identity');
});
