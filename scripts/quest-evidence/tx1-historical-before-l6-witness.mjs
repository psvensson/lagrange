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

const SOURCE_SHA='2a21e39cec4bbba941dafc2034b1bc038d9e31db';
const sessionId='tx1-genuine-historical-session';
const {directory,dbPath}=temporaryDbPath();
let leader=null;
const receipt={sourceSha:SOURCE_SHA,runOnPinnedSource:true,
  privateMapInjection:false,sessionId,admitted:false,prepared:false};
try {
  const started=await startLeader({dbPath,generationOrigin:false});
  leader=started.leader;
  receipt.initialized=leader.initialized === true;
  receipt.sessionMode='public legacy TRANSACTION message';
  const begin=await send(leader,{
    type:MESSAGE.TRANSACTION,operation:OP.BEGIN_TRANSACTION,
    sessionId,transactionEpoch:17,
  });
  receipt.begin=begin;
  receipt.admitted=begin?.acknowledged===true && begin?.success===true;
  if(receipt.admitted){
    const prepare=await send(leader,{
      type:MESSAGE.TRANSACTION,operation:OP.PREPARE_TRANSACTION,sessionId,
    });
    receipt.prepare=prepare;
    receipt.prepared=prepare?.acknowledged===true && prepare?.success===true;
    receipt.connectionInTransaction=leader.db.inTransaction;
    receipt.sessionObserved=leader.preparedTransactions.has(sessionId);
  }
  receipt.actualDatabasePath=dbPath;
  receipt.sqliteFileExists=fs.existsSync(dbPath);
  console.log('TX1_HISTORICAL_BEFORE_L6 '+JSON.stringify(receipt));
  assert.equal(receipt.admitted,true,
    'historical source must accept a genuine public legacy BEGIN');
  assert.equal(receipt.prepared,true,
    'historical source must reach its existing legacy PREPARE method');
  assert.equal(receipt.sessionObserved,true,
    'historical PREPARE must be reflected in source-owned state');
}finally{
  if(leader) await shutdownAll(leader);
  fs.rmSync(directory,{recursive:true,force:true});
}
