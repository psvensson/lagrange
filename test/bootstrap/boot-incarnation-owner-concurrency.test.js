/**
 * The boot incarnation owner is the single writer of a data directory's
 * reservation even under concurrent in-process callers (D3, census W-1):
 * reservations and floor raises of one data directory are serialized per
 * canonical state-file identity, so no incarnation is issued twice and no
 * raise is lost. Without the serialization the read-derive-write of two
 * callers interleaves at its await and both return the same value.
 */
import {mkdir, mkdtemp, rm, symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {
  raiseBootIncarnationFloor,
  readIssuedBootIncarnation,
  reserveBootIncarnation,
} from '../../src/bootstrap/boot-incarnation-owner.js';

const CONCURRENT_RESERVATIONS = 8;
const RAISED_FLOOR = 10;

async function withDataDir(run) {
  const root = await mkdtemp(join(tmpdir(), 'boot-incarnation-concurrency-'));
  try {
    return await run(root);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

function reserveConcurrently(dataDirs) {
  return Promise.all(dataDirs.map((dataDir) => reserveBootIncarnation(dataDir)));
}

function isStrictlyIncreasing(values) {
  return values.every((value, index) =>
    index === 0 || value > values[index - 1]);
}

test('D3: N concurrent reservations on one data directory issue N ' +
  'distinct, strictly increasing incarnations; the state is their max',
async (t) => {
  await withDataDir(async (dataDir) => {
    const first = await reserveBootIncarnation(dataDir);
    const issued = await reserveConcurrently(
      Array.from({length: CONCURRENT_RESERVATIONS}, () => dataDir));
    t.equal(new Set(issued).size, CONCURRENT_RESERVATIONS,
      'no incarnation is issued twice');
    t.ok(isStrictlyIncreasing(issued),
      'issuance follows call order, strictly increasing');
    t.ok(issued.every((value) => value > first),
      'every concurrent reservation is above the earlier one');
    t.equal(await readIssuedBootIncarnation(dataDir), Math.max(...issued),
      'the persisted reservation is the highest issued value');
  });
});

test('D3: concurrent reservations on a virgin data directory never issue ' +
  '1 twice', async (t) => {
  await withDataDir(async (dataDir) => {
    const issued = await reserveConcurrently([dataDir, dataDir, dataDir]);
    t.same(issued, [1, 2, 3], 'the first reservation alone gets 1');
    t.equal(await readIssuedBootIncarnation(dataDir), 3);
  });
});

test('D3: a floor raise concurrent with a reservation is never lost',
  async (t) => {
    await withDataDir(async (dataDir) => {
      await reserveBootIncarnation(dataDir);
      const [raised, reserved] = await Promise.all([
        raiseBootIncarnationFloor(dataDir, RAISED_FLOOR),
        reserveBootIncarnation(dataDir),
      ]);
      t.equal(raised, RAISED_FLOOR, 'the raise records the floor');
      t.ok(reserved > RAISED_FLOOR,
        'the reservation queued behind the raise lands above the floor');
      const next = await reserveBootIncarnation(dataDir);
      t.ok(next > RAISED_FLOOR && next > reserved,
        'the next reservation is above the raised floor');
      t.equal(await readIssuedBootIncarnation(dataDir), next,
        'the persisted reservation never went below the floor');
    });
  });

test('D3: two spellings of one data directory (a symlink) share one ' +
  'issuance queue', async (t) => {
  await withDataDir(async (root) => {
    const dataDir = join(root, 'data');
    const alias = join(root, 'alias');
    await mkdir(dataDir);
    await symlink(dataDir, alias);
    const issued = await reserveConcurrently(
      [dataDir, alias, dataDir, alias]);
    t.equal(new Set(issued).size, issued.length,
      'no incarnation is issued twice across the two spellings');
    t.equal(await readIssuedBootIncarnation(dataDir), Math.max(...issued));
  });
});

test('D3: a refused issuance never stalls the data directory queue',
  async (t) => {
    await withDataDir(async (dataDir) => {
      const crash = new Error('simulated death after the durable replace');
      const [crashed, reserved] = await Promise.allSettled([
        reserveBootIncarnation(dataDir, {afterDirectorySync() {
          throw crash;
        }}),
        reserveBootIncarnation(dataDir),
      ]);
      t.equal(crashed.status, 'rejected');
      t.equal(crashed.reason, crash);
      t.equal(reserved.status, 'fulfilled',
        'the queued reservation runs after the refused one settled');
      t.equal(reserved.value, 2,
        'the crashed reservation burned 1; the queued one continues above it');
    });
  });
