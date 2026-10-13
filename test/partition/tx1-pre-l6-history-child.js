// Pinned to pre-L6 source 2a21e39cec4bbba941dafc2034b1bc038d9e31db.
// A genuine old request-wire BEGIN, write and LOCAL_STAGING PREPARE stay live
// until the parent kills this process. There is no orderly shutdown.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PARTITION_SERVICE_OPERATION as OP} from
  '../../src/partition/partition-service-constants.js';
import {INSERT_SQL, send, startLeader} from
  '../test-helpers/participant-transaction-fixture.js';

const [markerPath, dbPath] = process.argv.slice(2);
assert.ok(markerPath && dbPath);
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
LoggingService.getInstance().initialize({level: 'error'});
const {leader, proposed} = await startLeader({generationOrigin: false, dbPath});
const sessionId = 'historical-pre-l6-session';
const begin = await send(leader, {type: 'TRANSACTION',
  operation: OP.BEGIN_TRANSACTION, sessionId, transactionEpoch: 7});
assert.equal(begin.success, true);
assert.equal(leader.db.inTransaction, true);
assert.equal(leader.activeTransactions.size, 1);
const write = await send(leader, {type: 'QUERY',
  sql: INSERT_SQL, params: ['historical-key', 'historical-value'], sessionId});
assert.equal(write.success, true);
const prepared = await send(leader, {type: 'TRANSACTION',
  operation: OP.PREPARE_TRANSACTION, sessionId});
assert.equal(prepared.success, true);
assert.equal(prepared.preparedState, 'local-staging');
assert.equal(leader.activeTransactions.size, 0);
assert.equal(leader.preparedTransactions.size, 1);
assert.equal(leader.db.inTransaction, true);
assert.deepEqual(leader.db.prepare('SELECT id, value FROM test_table WHERE id = ?')
  .get('historical-key'), {id: 'historical-key', value: 'historical-value'});
assert.equal(proposed.length, 0, 'legacy PREPARE does not propose a Raft marker');
const marker = {kind: 'TX1_PRE_L6_LOCAL_STAGING', pid: process.pid,
  sourceSha: '2a21e39cec4bbba941dafc2034b1bc038d9e31db',
  sessionId, dbPath, beginAdmitted: true, writeStaged: true,
  prepareAcknowledged: true, preparedState: prepared.preparedState,
  openSqliteTransaction: leader.db.inTransaction,
  legacyPreparedSessions: leader.preparedTransactions.size,
  consensusProposals: proposed.length};
const draft = markerPath + '.writing';
const fd = fs.openSync(draft, 'wx', 0o600);
try {
  fs.writeFileSync(fd, JSON.stringify(marker) + '\n');
  fs.fsyncSync(fd);
} finally {
  fs.closeSync(fd);
}
fs.renameSync(draft, markerPath);
const dirFd = fs.openSync(new URL('file://' + markerPath).pathname.replace(/\/[^/]*$/, '') || '/', 'r');
try {
  fs.fsyncSync(dirFd);
} finally {
  fs.closeSync(dirFd);
}
await new Promise(() => setInterval(() => {}, 1000));
