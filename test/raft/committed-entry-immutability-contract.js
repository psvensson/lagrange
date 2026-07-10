import {test} from '../../src/test-helpers/tap.js';
import {
  RAFT_COMMITTED_ENTRY_CONFLICT_CODE,
} from '../../src/raft/committed-entry-guard.js';

const BASE_TERM = 7;
const INDEX = Object.freeze({
  COMMITTED: 3,
  UNCOMMITTED: 4,
  EXTENDED: 5,
});
const TEST_TEXT = Object.freeze({
  COMMAND_TYPE: 'contract-command',
  REJECT_CASE: 'committed identity rejects term and command replacement',
  REJECT_TERM: 'same index and command with a different term is rejected',
  DIFFERENT: 'different',
  REJECT_COMMAND: 'same index and term with a different command is rejected',
  TERM_UNCHANGED: 'committed term is unchanged',
  COMMAND_UNCHANGED: 'committed command is unchanged',
  WATERMARK_UNCHANGED: 'committed watermark is unchanged',
  REPLAY_CASE: 'same-identity committed replay is idempotent',
  REPLAY_ENTRY: 'replay returns the existing committed entry',
  REPLAY_WATERMARK: 'replay cannot move the watermark',
  REPLAY_COMMAND: 'replay preserves the canonical committed command',
  BELOW: 'below',
  EQUAL: 'equal',
  ABOVE: 'above',
  SUFFIX_REMOVED: 'only the permitted uncommitted suffix is removed',
  BOUNDARY_SURVIVES: 'committed boundary entry survives',
  WATERMARK_MONOTONIC: 'committed watermark never regresses',
  REPLACEMENT_CASE: 'ordinary uncommitted-tail replacement remains allowed',
  REPLACEMENT: 'replacement',
  TERM_REPLACED: 'uncommitted term is replaced',
  COMMAND_REPLACED: 'uncommitted command is replaced',
  REPLACEMENT_COMMIT: 'replacement does not move commit',
  MONOTONIC_CASE: 'commit watermark is monotonic',
  OLDER_COMMIT: 'older commit cannot lower watermark',
});

function command(value) {
  return {type: TEST_TEXT.COMMAND_TYPE, value};
}

async function seed(adapter, count) {
  for (let index = 1; index <= count; index += 1) {
    await adapter.saveCommand(command(index), BASE_TERM, index);
  }
}

async function expectCommittedConflict(t, action, message) {
  await t.rejects(
    Promise.resolve().then(action),
    {code: RAFT_COMMITTED_ENTRY_CONFLICT_CODE},
    message,
  );
}

function registerCommittedEntryImmutabilityContract(name, createAdapter) {
  test(`${name} committed-entry immutability contract`, async (t) => {
    await t.test(TEST_TEXT.REJECT_CASE, async (t) => {
      const fixture = createAdapter();
      const {adapter} = fixture;
      try {
        await seed(adapter, INDEX.UNCOMMITTED);
        await adapter.commit(INDEX.COMMITTED);
        const before = await adapter.get(2);

        await expectCommittedConflict(
          t,
          () => adapter.saveCommand(command(2), BASE_TERM + 1, 2),
          TEST_TEXT.REJECT_TERM,
        );
        await expectCommittedConflict(
          t,
          () => adapter.saveCommand(command(TEST_TEXT.DIFFERENT), BASE_TERM, 2),
          TEST_TEXT.REJECT_COMMAND,
        );

        const after = await adapter.get(2);
        t.equal(after.term, before.term, TEST_TEXT.TERM_UNCHANGED);
        t.same(after.command, before.command, TEST_TEXT.COMMAND_UNCHANGED);
        t.equal(adapter.committedIndex, INDEX.COMMITTED,
          TEST_TEXT.WATERMARK_UNCHANGED);
      } finally {
        fixture.close();
      }
    });

    await t.test(TEST_TEXT.REPLAY_CASE, async (t) => {
      const fixture = createAdapter();
      const {adapter} = fixture;
      try {
        await seed(adapter, INDEX.COMMITTED);
        await adapter.commit(INDEX.COMMITTED);
        const before = await adapter.get(2);
        const replay = await adapter.saveCommand(
          {value: 2, type: TEST_TEXT.COMMAND_TYPE},
          BASE_TERM,
          2,
        );
        t.same(replay, before, TEST_TEXT.REPLAY_ENTRY);
        t.equal(adapter.committedIndex, INDEX.COMMITTED,
          TEST_TEXT.REPLAY_WATERMARK);
        t.same((await adapter.get(2)).command, command(2),
          TEST_TEXT.REPLAY_COMMAND);
      } finally {
        fixture.close();
      }
    });

    for (const [label, truncateAfter, expectedLastIndex] of [
      [TEST_TEXT.BELOW, 1, INDEX.COMMITTED],
      [TEST_TEXT.EQUAL, INDEX.COMMITTED, INDEX.COMMITTED],
      [TEST_TEXT.ABOVE, INDEX.UNCOMMITTED, INDEX.UNCOMMITTED],
    ]) {
      await t.test(`truncation ${label} committed boundary preserves prefix`, async (t) => {
        const fixture = createAdapter();
        const {adapter} = fixture;
        try {
          await seed(adapter, INDEX.EXTENDED);
          await adapter.commit(INDEX.COMMITTED);
          const committed = await adapter.get(INDEX.COMMITTED);
          await adapter.removeEntriesAfter(truncateAfter);

          t.equal((await adapter.getLastInfo()).index, expectedLastIndex,
            TEST_TEXT.SUFFIX_REMOVED);
          t.same((await adapter.get(INDEX.COMMITTED)).command, committed.command,
            TEST_TEXT.BOUNDARY_SURVIVES);
          t.equal(adapter.committedIndex, INDEX.COMMITTED,
            TEST_TEXT.WATERMARK_MONOTONIC);
        } finally {
          fixture.close();
        }
      });
    }

    await t.test(TEST_TEXT.REPLACEMENT_CASE, async (t) => {
      const fixture = createAdapter();
      const {adapter} = fixture;
      try {
        await seed(adapter, INDEX.UNCOMMITTED);
        await adapter.commit(2);
        await adapter.saveCommand(
          command(TEST_TEXT.REPLACEMENT),
          BASE_TERM + 1,
          INDEX.UNCOMMITTED,
        );
        const replaced = await adapter.get(INDEX.UNCOMMITTED);
        t.equal(replaced.term, BASE_TERM + 1, TEST_TEXT.TERM_REPLACED);
        t.same(replaced.command, command(TEST_TEXT.REPLACEMENT),
          TEST_TEXT.COMMAND_REPLACED);
        t.equal(adapter.committedIndex, 2, TEST_TEXT.REPLACEMENT_COMMIT);
      } finally {
        fixture.close();
      }
    });

    await t.test(TEST_TEXT.MONOTONIC_CASE, async (t) => {
      const fixture = createAdapter();
      const {adapter} = fixture;
      try {
        await seed(adapter, INDEX.UNCOMMITTED);
        await adapter.commit(INDEX.COMMITTED);
        await adapter.commit(2);
        t.equal(adapter.committedIndex, INDEX.COMMITTED, TEST_TEXT.OLDER_COMMIT);
      } finally {
        fixture.close();
      }
    });
  });
}

export {registerCommittedEntryImmutabilityContract};
