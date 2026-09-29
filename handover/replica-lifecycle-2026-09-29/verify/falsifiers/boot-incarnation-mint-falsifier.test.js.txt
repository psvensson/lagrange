// Verifier falsifier (scratch): the joiner startup hint write drops the
// persisted boot-incarnation counter, so the next mint in the same data dir
// is not monotonic.
import {test} from '../../src/test-helpers/tap.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {mintBootIncarnation, readPersistedBootIncarnation} from
  '../../src/bootstrap/rejoin-hints.js';
import {REJOIN_HINTS_FILENAME} from '../../src/bootstrap/rejoin-hints-constants.js';
import {persistJoinSeedRejoinHints} from
  '../../src/entrypoint-runtime-join-decision.js';

test('boot incarnation mint stays monotonic across a joiner startup',
  async (t) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verif-inc-'));
    try {
      fs.writeFileSync(path.join(dataDir, REJOIN_HINTS_FILENAME),
        JSON.stringify({localNodeId: 'n1', bootIncarnation: 4}));
      const hintsFile = fs.readdirSync(dataDir)[0];
      t.equal(await readPersistedBootIncarnation(dataDir), 4,
        `fixture hints file (${hintsFile}) is read`);
      const g1 = await mintBootIncarnation(dataDir);
      t.equal(g1, 5, 'G1 mints previous+1');
      await persistJoinSeedRejoinHints({dataDir, nodeId: 'n1',
        nodeAddress: 'h:1', peerAddresses: ['s:1'], clusterId: 'c',
        bootIncarnation: g1, logger: {warn() {}}});
      // G1 crashes (or its join fails and startJoinNode re-attempts) before
      // the 1 s cadence service persists the counter.
      const g2 = await mintBootIncarnation(dataDir);
      t.ok(g2 > g1, `G2 (${g2}) must be newer than G1 (${g1})`);
    } finally {
      fs.rmSync(dataDir, {recursive: true, force: true});
    }
  });
