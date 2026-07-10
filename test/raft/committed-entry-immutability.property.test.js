import Database from 'better-sqlite3';
import fc from 'fast-check';
import {test} from '../../src/test-helpers/tap.js';

import {
  isRaftCommittedEntryConflict,
} from '../../src/raft/committed-entry-guard.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';

const PROPERTY_SEED = 0x5a17c0de;
const PROPERTY_RUNS = 40;
const INITIAL_TERM = 1;
const INITIAL_ENTRY_COUNT = 5;
const INITIAL_COMMITTED_INDEX = 3;

function command(value) {
  return {type: 'property-command', value};
}

const operationArbitrary = fc.record({
  kind: fc.constantFrom('save', 'commit', 'truncate'),
  index: fc.integer({min: 1, max: 8}),
  term: fc.integer({min: 1, max: 4}),
  value: fc.integer({min: 0, max: 20}),
});

function memoryFixture() {
  const adapter = new InMemoryLogAdapter({address: 'memory-node', term: 1});
  return {adapter, close: () => adapter.end()};
}

function sqliteFixture() {
  const db = new Database(':memory:');
  const adapter = new SQLiteLogAdapter(db, {address: 'sqlite-node', term: 1});
  return {adapter, close: () => db.close()};
}

async function seed(adapter) {
  for (let index = 1; index <= INITIAL_ENTRY_COUNT; index += 1) {
    await adapter.saveCommand(command(index), INITIAL_TERM, index);
  }
  await adapter.commit(INITIAL_COMMITTED_INDEX);
}

function canCommitPrefix(model, committedIndex, targetIndex) {
  if (targetIndex <= committedIndex || !model.has(targetIndex)) return false;
  for (let index = committedIndex + 1; index <= targetIndex; index += 1) {
    if (!model.has(index)) return false;
  }
  return true;
}

async function applySave(adapter, model, committedIdentity, operation) {
  const incoming = {
    index: operation.index,
    term: operation.term,
    command: command(operation.value),
  };
  const committed = committedIdentity.get(operation.index);
  const sameIdentity = committed &&
    committed.term === incoming.term &&
    committed.command.value === incoming.command.value;
  try {
    await adapter.saveCommand(incoming.command, incoming.term, incoming.index);
    if (committed && !sameIdentity) return false;
    if (!committed) model.set(incoming.index, incoming);
  } catch (error) {
    if (!committed || sameIdentity || !isRaftCommittedEntryConflict(error)) {
      throw error;
    }
  }
  return true;
}

async function applyOperation(adapter, model, state, operation) {
  if (operation.kind === 'save') {
    return applySave(adapter, model, state.committedIdentity, operation);
  }
  if (operation.kind === 'commit' &&
    canCommitPrefix(model, state.committedIndex, operation.index)) {
    await adapter.commit(operation.index);
    for (let index = state.committedIndex + 1; index <= operation.index; index += 1) {
      state.committedIdentity.set(index, model.get(index));
    }
    state.committedIndex = operation.index;
  } else if (operation.kind === 'truncate') {
    await adapter.removeEntriesAfter(operation.index);
    const safeLast = Math.max(operation.index, state.committedIndex);
    for (const index of model.keys()) {
      if (index > safeLast) model.delete(index);
    }
  }
  return true;
}

async function committedIdentityStillHolds(adapter, state) {
  if (adapter.committedIndex !== state.committedIndex) return false;
  for (const [index, expected] of state.committedIdentity) {
    const actual = await adapter.get(index);
    if (!actual || actual.term !== expected.term ||
      actual.command?.value !== expected.command.value) {
      return false;
    }
  }
  return true;
}

function registerProperty(name, createFixture) {
  test(`${name} seeded operation sequences preserve committed identity`, async (t) => {
    try {
      await fc.assert(
        fc.asyncProperty(
          fc.array(operationArbitrary, {minLength: 1, maxLength: 80}),
          async (operations) => {
            const fixture = createFixture();
            const {adapter} = fixture;
            try {
              await seed(adapter);
              const model = new Map();
              const committedIdentity = new Map();
              for (let index = 1; index <= INITIAL_ENTRY_COUNT; index += 1) {
                const entry = {index, term: INITIAL_TERM, command: command(index)};
                model.set(index, entry);
                if (index <= INITIAL_COMMITTED_INDEX) {
                  committedIdentity.set(index, entry);
                }
              }
              const state = {
                committedIndex: INITIAL_COMMITTED_INDEX,
                committedIdentity,
              };
              for (const operation of operations) {
                if (!await applyOperation(adapter, model, state, operation)) return false;
                if (!await committedIdentityStillHolds(adapter, state)) return false;
              }
              return true;
            } finally {
              fixture.close();
            }
          },
        ),
        {seed: PROPERTY_SEED, numRuns: PROPERTY_RUNS, verbose: 2},
      );
      t.pass(`seed=${PROPERTY_SEED} runs=${PROPERTY_RUNS}`);
    } catch (error) {
      throw new Error(
        `${name} committed-entry property failed seed=${PROPERTY_SEED}: ${error.message}`,
        {cause: error},
      );
    }
  });
}

registerProperty('in-memory adapter', memoryFixture);
registerProperty('SQLite adapter', sqliteFixture);
