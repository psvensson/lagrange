/**
 * Historical evidence, NOT new-version compatibility approval: the genuine
 * pre-L6 partition request path acknowledges a volatile LOCAL_STAGING prepare.
 * Killing that process leaves neither the uncommitted write nor prepared state
 * for the old partition service to reconstruct. A live drain is mandatory.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {shutdownAll, startLeader} from
  '../test-helpers/participant-transaction-fixture.js';

const CHILD = fileURLToPath(new URL('./tx1-pre-l6-history-child.js', import.meta.url));
const WAIT_MS = 20000;

test('pinned pre-L6: acknowledged LOCAL_STAGING PREPARE disappears on process loss',
  {timeout: 45000}, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-pre-l6-history-'));
    const markerPath = path.join(directory, 'marker.json');
    const dbPath = path.join(directory, 'historical.db');
    let output = '';
    let exited = null;
    const child = spawn(process.execPath, [CHILD, markerPath, dbPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (bytes) => {
        output = (output + bytes.toString()).slice(-6000);
      });
    }
    const completion = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        exited = {code, signal};
        resolve(exited);
      });
    });
    try {
      const started = Date.now();
      while (exited === null && !fs.existsSync(markerPath) &&
          Date.now() - started < WAIT_MS) {
        await sleep(20);
      }
      assert.ok(fs.existsSync(markerPath), 'real legacy PREPARE never checkpointed: ' + output);
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      assert.equal(marker.kind, 'TX1_PRE_L6_LOCAL_STAGING');
      assert.equal(marker.sourceSha, '2a21e39cec4bbba941dafc2034b1bc038d9e31db');
      assert.equal(marker.pid, child.pid);
      assert.equal(marker.beginAdmitted, true);
      assert.equal(marker.writeStaged, true);
      assert.equal(marker.prepareAcknowledged, true);
      assert.equal(marker.preparedState, 'local-staging');
      assert.equal(marker.openSqliteTransaction, true);
      assert.equal(marker.legacyPreparedSessions, 1);
      assert.equal(marker.consensusProposals, 0);
      assert.equal(exited, null, 'the owning process still holds the connection');
      assert.equal(child.kill('SIGKILL'), true);
      assert.deepEqual(await completion, {code: null, signal: 'SIGKILL'});
      const disk = new Database(dbPath, {readonly: true, fileMustExist: true});
      try {
        assert.equal(disk.prepare('SELECT COUNT(*) AS c FROM test_table WHERE id = ?')
          .get('historical-key').c, 0,
        'the prepared but uncommitted write is absent after process loss');
      } finally {
        disk.close();
      }
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
      LoggingService.getInstance().initialize({level: 'error'});
      const {leader} = await startLeader({generationOrigin: false, dbPath});
      try {
        assert.equal(leader.preparedTransactions.size, 0,
          'a restarted legacy owner cannot reconstruct volatile PREPARE state');
        assert.equal(leader.activeTransactions.size, 0);
        assert.equal(leader.db.inTransaction, false);
        assert.equal(leader.db.prepare('SELECT COUNT(*) AS c FROM test_table WHERE id = ?')
          .get('historical-key').c, 0);
      } finally {
        await shutdownAll(leader);
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      }
      t.diagnostic(JSON.stringify({kind: 'TX1_PRE_L6_PROCESS_LOSS',
        sourceSha: marker.sourceSha,
        legacyBeginAdmitted: true, oldPrepareAcknowledged: true,
        preparedState: marker.preparedState,
        sqliteTransactionHeldUntilKill: true,
        preKillConsensusProposals: marker.consensusProposals,
        historicalPreparedReconstructed: false,
        uncommittedWriteSurvived: false,
        crossBuildMigrationCertified: false,
        requiredAction: 'quiesce and settle admitted legacy sessions before cutover'}));
    } finally {
      if (exited === null) {
        child.kill('SIGKILL');
        await completion;
      }
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
