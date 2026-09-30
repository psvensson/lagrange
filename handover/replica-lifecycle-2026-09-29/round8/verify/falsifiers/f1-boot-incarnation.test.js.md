# Verifier falsifier (round 8): `f1-boot-incarnation.test.js`

Reconstruction of verify/falsifiers/boot-incarnation-mint-falsifier.test.js against the round-8 owner API, plus hint/owner attacks. Copy the block to test/verify-scratch/ to re-run. Result on 0996d7576: 24/24 GREEN; 15/17 (2 red) under revert R1.

````js
// Verifier falsifier (round 8, reconstructed from verify/falsifiers/boot-incarnation-mint-falsifier.test.js.md)
import {test} from '../../src/test-helpers/tap.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reserveBootIncarnation, readIssuedBootIncarnation, raiseBootIncarnationFloor, BOOT_INCARNATION_FILENAME} from '../../src/bootstrap/boot-incarnation-owner.js';
import {REJOIN_HINTS_FILENAME} from '../../src/bootstrap/rejoin-hints-constants.js';
import {persistJoinSeedRejoinHints} from '../../src/entrypoint-runtime-join-decision.js';
import {persistBootstrapRejoinHints, RejoinHintsPersistenceService} from '../../src/bootstrap/rejoin-hints.js';

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'verif-inc-'));
const hintsPath = (d) => path.join(d, REJOIN_HINTS_FILENAME);

test('F1 original falsifier: monotonic across joiner startup hint write', async (t) => {
  const dataDir = mk();
  try {
    fs.writeFileSync(hintsPath(dataDir), JSON.stringify({localNodeId: 'n1', bootIncarnation: 4}));
    const g1 = await reserveBootIncarnation(dataDir);
    t.equal(g1, 5, 'G1 migrates from legacy hints floor 4 -> 5');
    await persistJoinSeedRejoinHints({dataDir, nodeId: 'n1', nodeAddress: 'h:1', peerAddresses: ['s:1'], clusterId: 'c', bootIncarnation: g1, logger: {warn() {}}});
    const g2 = await reserveBootIncarnation(dataDir);
    t.ok(g2 > g1, `G2 (${g2}) newer than G1 (${g1})`);
    // hints writer without incarnation (old defect shape) must not matter now
    let threw = null; let warned = null;
    try { await persistJoinSeedRejoinHints({dataDir, nodeId: 'n1', nodeAddress: 'h:1', peerAddresses: ['s:1'], clusterId: 'c', logger: {warn(m, d) { warned = d?.error; }}}); } catch (e) { threw = e; }
    t.match(warned, /boot incarnation/i, 'inner builder refused the missing incarnation: ' + warned);
    t.equal(threw, null, 'join-seed wrapper swallows (logs) the refusal by design');
    const g3 = await reserveBootIncarnation(dataDir);
    t.equal(g3, g2 + 1, 'G3 continues after a refused hints write');
  } finally { fs.rmSync(dataDir, {recursive: true, force: true}); }
});

test('F1 attacks: hints can never gate/raise/lower once owner exists', async (t) => {
  const dataDir = mk();
  try {
    const g1 = await reserveBootIncarnation(dataDir);
    t.equal(g1, 1, 'virgin dir issues 1');
    fs.writeFileSync(hintsPath(dataDir), JSON.stringify({localNodeId: 'n1', bootIncarnation: 99}));
    t.equal(await reserveBootIncarnation(dataDir), 2, 'higher hints counter does not raise');
    fs.writeFileSync(hintsPath(dataDir), JSON.stringify({localNodeId: 'n1', bootIncarnation: 0}));
    t.equal(await reserveBootIncarnation(dataDir), 3, 'lower hints counter does not lower');
    fs.writeFileSync(hintsPath(dataDir), '{not json');
    t.equal(await reserveBootIncarnation(dataDir), 4, 'corrupt hints ignored when owner present');
    fs.rmSync(hintsPath(dataDir));
    t.equal(await reserveBootIncarnation(dataDir), 5, 'deleted hints no effect');
    // raise floor: never lowers
    t.equal(await raiseBootIncarnationFloor(dataDir, 2), 5, 'raise below reservation is a no-op');
    t.equal(await raiseBootIncarnationFloor(dataDir, 9), 9, 'raise above reservation raises');
    t.equal(await reserveBootIncarnation(dataDir), 10, 'next reservation strictly above floor');
    // corrupt owner file fails closed, never falls to hints
    fs.writeFileSync(hintsPath(dataDir), JSON.stringify({localNodeId: 'n1', bootIncarnation: 1}));
    fs.writeFileSync(path.join(dataDir, BOOT_INCARNATION_FILENAME), '{"version":1,"reserved":"x"}');
    let err = null; try { await reserveBootIncarnation(dataDir); } catch (e) { err = e; }
    t.equal(err?.code, 'BOOT_INCARNATION_STATE_UNREADABLE', 'damaged owner fails closed');
    fs.writeFileSync(path.join(dataDir, BOOT_INCARNATION_FILENAME), '');
    err = null; try { await reserveBootIncarnation(dataDir); } catch (e) { err = e; }
    t.equal(err?.code, 'BOOT_INCARNATION_STATE_UNREADABLE', 'empty owner fails closed');
  } finally { fs.rmSync(dataDir, {recursive: true, force: true}); }
});

test('F1 attacks: owner absent + corrupt hints refuses; concurrency distinct', async (t) => {
  const dataDir = mk();
  try {
    fs.writeFileSync(hintsPath(dataDir), '{not json');
    let err = null; try { await reserveBootIncarnation(dataDir); } catch (e) { err = e; }
    t.equal(err?.code, 'BOOT_INCARNATION_STATE_UNREADABLE', 'corrupt legacy hints refuse');
    t.ok(!fs.existsSync(path.join(dataDir, BOOT_INCARNATION_FILENAME)), 'no owner write on refusal');
    fs.writeFileSync(hintsPath(dataDir), JSON.stringify({localNodeId: 'n1', bootIncarnation: -3}));
    err = null; try { await reserveBootIncarnation(dataDir); } catch (e) { err = e; }
    t.equal(err?.code, 'BOOT_INCARNATION_STATE_UNREADABLE', 'impossible legacy counter refuses');
    fs.writeFileSync(hintsPath(dataDir), JSON.stringify({localNodeId: 'n1'}));
    t.equal(await reserveBootIncarnation(dataDir), 1, 'hints without counter -> floor 0');
    const parallel = await Promise.all([1, 2, 3, 4, 5].map(() => reserveBootIncarnation(dataDir)));
    t.same([...parallel].sort((a, b) => a - b), [2, 3, 4, 5, 6], 'concurrent reservations distinct and dense');
    // symlinked spelling shares the queue
    const link = path.join(os.tmpdir(), 'verif-link-' + process.pid); try { fs.unlinkSync(link); } catch {}
    fs.symlinkSync(dataDir, link);
    const p2 = await Promise.all([reserveBootIncarnation(dataDir), reserveBootIncarnation(link), reserveBootIncarnation(dataDir + '/')]);
    t.same([...p2].sort((a, b) => a - b), [7, 8, 9], 'aliases serialize');
    fs.unlinkSync(link);
    t.equal(await readIssuedBootIncarnation(dataDir), 9, 'issued matches');
    // bootstrap hints builder & persistence service require the incarnation
    err = null; try { await persistBootstrapRejoinHints({dataDir, nodeId: 'n1', nodeAddress: 'h:1', peerAddresses: [], clusterId: 'c'}); } catch (e) { err = e; }
    t.ok(err, `bootstrap hints builder without incarnation refused (${err?.code})`);
    err = null; try { new RejoinHintsPersistenceService({dataDir, nodeId: 'n1', nodeAddress: 'h:1', getSystemTableCache: () => null, logger: {}}); } catch (e) { err = e; }
    t.ok(err, `persistence service without incarnation refused (${err?.code})`);
  } finally { fs.rmSync(dataDir, {recursive: true, force: true}); }
});
````
