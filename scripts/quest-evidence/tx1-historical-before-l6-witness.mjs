// Exact pre-L6 historical execution witness. This file is COPIED into the
// pinned old source worktree and imports that version's public transaction
// fixture. It never inserts a session into a private map or bypasses fences.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  startLeader, send, shutdownAll, temporaryDbPath,
} from '../../test/test-helpers/participant-transaction-fixture.js';
import {
  PARTITION_SERVICE_MESSAGE_TYPE as MESSAGE,
  PARTITION_SERVICE_OPERATION as OP,
} from '../../src/partition/partition-service-constants.js';

const SOURCE_SHA = '2a21e39cec4bbba941dafc2034b1bc038d9e31db';
const SESSION_ID = 'tx1-genuine-historical-session';
const SESSION_MODE = 'public legacy TRANSACTION message';
const OUTPUT_PREFIX = 'TX1_HISTORICAL_BEFORE_L6 ';
const ASSERT_BEGIN_ACCEPTED =
  'historical source must accept a genuine public legacy BEGIN';
const ASSERT_PREPARE_REACHED =
  'historical source must reach its existing legacy PREPARE method';
const ASSERT_SESSION_OBSERVED =
  'historical PREPARE must be reflected in source-owned state';
const TRANSACTION_EPOCH = 17;
const {directory, dbPath} = temporaryDbPath();
let leader = null;
const receipt = {
  sourceSha: SOURCE_SHA,
  runOnPinnedSource: true,
  privateMapInjection: false,
  sessionId: SESSION_ID,
  admitted: false,
  prepared: false,
};
try {
  const started = await startLeader({dbPath, generationOrigin: false});
  leader = started.leader;
  receipt.initialized = leader.initialized === true;
  receipt.sessionMode = SESSION_MODE;
  const begin = await send(leader, {
    type: MESSAGE.TRANSACTION,
    operation: OP.BEGIN_TRANSACTION,
    sessionId: SESSION_ID,
    transactionEpoch: TRANSACTION_EPOCH,
  });
  receipt.begin = begin;
  receipt.admitted = begin?.acknowledged === true && begin?.success === true;
  if (receipt.admitted) {
    const prepare = await send(leader, {
      type: MESSAGE.TRANSACTION,
      operation: OP.PREPARE_TRANSACTION,
      sessionId: SESSION_ID,
    });
    receipt.prepare = prepare;
    receipt.prepared = prepare?.acknowledged === true && prepare?.success === true;
    receipt.connectionInTransaction = leader.db.inTransaction;
    receipt.sessionObserved = leader.preparedTransactions.has(SESSION_ID);
  }
  receipt.actualDatabasePath = dbPath;
  receipt.sqliteFileExists = fs.existsSync(dbPath);
  console.log(OUTPUT_PREFIX + JSON.stringify(receipt));
  assert.equal(receipt.admitted, true, ASSERT_BEGIN_ACCEPTED);
  assert.equal(receipt.prepared, true, ASSERT_PREPARE_REACHED);
  assert.equal(receipt.sessionObserved, true, ASSERT_SESSION_OBSERVED);
} finally {
  if (leader) await shutdownAll(leader);
  fs.rmSync(directory, {recursive: true, force: true});
}
