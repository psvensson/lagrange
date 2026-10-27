import fs from 'node:fs';
// A genuine different Node process uses the same production port and file.
import {historyDb, openHistory, applicationRows, lifecycle} from './opening-history-native-fixture.js';
import {setActualCoreEntryObserver} from '../../../src/raft/raft-rs-runtime-owner.js';
const [file, marker, crashAt] = process.argv.slice(2);
const db = historyDb(file); let port; const entries = [];
const receipt = {pid: process.pid, entries, marker};
try {
  setActualCoreEntryObserver((entry) => {
    entries.push(entry);
    if ((crashAt === 'before-bootstrap' && entry.operation === 'conf_state') ||
        (crashAt === 'after-bootstrap' && entry.operation === 'status')) {
      fs.writeSync(1, `HISTORY_CRASH ${crashAt}\n`);
      process.kill(process.pid, 'SIGKILL');
    }
  });
  port = openHistory(db);
  receipt.initial = port.readStatus();
  receipt.campaign = await port.campaign();
  receipt.proposal = await port.propose(marker);
  receipt.rows = applicationRows(db); receipt.lifecycle = lifecycle(db);
} catch (error) {
  receipt.error = {message: error.message, consensus: error.consensus};
  receipt.rows = applicationRows(db); receipt.lifecycle = lifecycle(db);
} finally {
  if (port) port.close(); setActualCoreEntryObserver(null); db.close();
  console.log('OPENING_HISTORY ' + JSON.stringify(receipt));
}
