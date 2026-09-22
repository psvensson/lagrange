const ASYNC_APPLICATION_CALLBACK_ERROR =
  'a committed-entry callback must complete inside its SQLite transaction';

function applyCommittedEntryTransaction({store, groupId, entry, confState,
  applyCommittedEntry}) {
  return store.transaction(() => {
    if (entry.data !== undefined && typeof applyCommittedEntry === 'function') {
      const applied = applyCommittedEntry(Buffer.from(entry.data, 'base64'));
      if (applied && typeof applied.then === 'function') {
        throw new TypeError(ASYNC_APPLICATION_CALLBACK_ERROR);
      }
    }
    store.putAppliedState(groupId, entry.index, confState);
  });
}

function applyPartitionApplicationAndProgress({service, command, effects}) {
  return service.db.transaction(() => {
    service.applyCommittedEntry(command, effects);
    service.storage.recordAppliedAdvance();
  })();
}

export {
  applyCommittedEntryTransaction,
  applyPartitionApplicationAndProgress,
};
