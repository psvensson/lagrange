import Database from 'better-sqlite3';

import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {
  registerCommittedEntryImmutabilityContract,
} from './committed-entry-immutability-contract.js';

function memoryFixture() {
  const adapter = new InMemoryLogAdapter({address: 'memory-node', term: 1});
  return {adapter, close: () => adapter.end()};
}

function sqliteFixture() {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'sqlite-node', term: 1});
  return {adapter, close: () => db.close()};
}

registerCommittedEntryImmutabilityContract('in-memory adapter', memoryFixture);
registerCommittedEntryImmutabilityContract('SQLite adapter', sqliteFixture);
