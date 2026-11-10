// One construction of hand-built partition contexts and partition
// collaborator fakes for tests.
//
// PartitionService is assembled by explicit context: every method is a
// delegator on its prototype to the module that owns it. A test that drives
// one responsibility over hand-written state builds its context here, so the
// context answers with the production method surface (the one version of
// every method), never a copied subset of it, and carries the owner-held
// stores its constructor creates through the same producer
// (initializePartitionAdmissionState). The caller's fields are carried as own
// properties of a derived object, accessors included, over those stores; the
// caller's object is never changed.
//
// The partition validates each collaborator it used to feature-detect where
// it is wired (src/partition/partition-service-collaborators.js). A test fake
// that states only the members its test exercises is completed here with the
// answer the partition gave when that member was absent before the
// validation: no row, no rows, no subscription, no refresh, nothing synced,
// nothing to re-assert. The completion is a derived object: the fake itself
// is never changed, its own members stay bound to it, and its state reads
// through.
import {PartitionService} from '../../src/partition/partition-service.js';
import {initializePartitionAdmissionState} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {
  PARTITION_SERVICE_COLLABORATOR as COLLABORATOR,
} from '../../src/partition/partition-service-collaborators.js';

const noop = () => {};
const answerNull = () => null;
const answerNone = () => [];
const answerFalse = () => false;
const answerFalseAsync = async () => false;
const answerNothingAsync = async () => undefined;
const answerUnappliedAsync = async () => ({success: false});

function hasMethod(target, member) {
  return typeof target[member] === 'function';
}

const NEUTRAL_COLLABORATOR_MEMBERS = Object.freeze({
  // The cache's filter, absent, read the rows the cache's getAll answered
  // (the deleted getCachedSystemTableRows fallback), else none.
  [COLLABORATOR.SYSTEM_TABLE_CACHE]: (fake) => ({
    get: answerNull,
    getAll: answerNone,
    filter: hasMethod(fake, 'getAll') ?
      (tableName, predicate) => (fake.getAll(tableName) || []).filter(predicate) :
      answerNone,
    onCacheChange: noop,
    offCacheChange: noop,
    // The local write channel, absent, was no projection and no strictly
    // newer successor: the completion applies nothing and answers not stale.
    applySystemTableChange: noop,
    isStaleForExistingRecord: answerFalse,
  }),
  [COLLABORATOR.CDC_INTEGRATION_SERVICE]: () => ({
    refreshAuthoritativeCacheRow: answerFalseAsync,
    executeAuthoritativeSystemTableRead: answerUnappliedAsync,
  }),
  [COLLABORATOR.REBALANCE_COORDINATOR]: () => ({
    syncOwnerDependencies: noop,
    initialize: noop,
    shutdown: answerNothingAsync,
  }),
  [COLLABORATOR.REPLICA_STATE_MACHINE]: () => ({
    reconcileLocalOnlyServiceRowsNow: noop,
  }),
  // The row owner's writer: an absent member was a write the owner skipped
  // (or refused before writing); the completion applies nothing.
  [COLLABORATOR.SYSTEM_TABLE_WRITER]: () => ({
    insertSystemTableRow: answerUnappliedAsync,
    updateSystemTableRow: answerUnappliedAsync,
  }),
});

function functionMemberNames(fake) {
  const names = new Set();
  for (let level = fake; level && level !== Object.prototype;
    level = Object.getPrototypeOf(level)) {
    for (const name of Object.getOwnPropertyNames(level)) {
      if (name !== 'constructor' && hasMethod(fake, name)) names.add(name);
    }
  }
  return names;
}

/**
 * Complete one partition collaborator fake with the production interface.
 * @param {string} collaborator - A PARTITION_SERVICE_COLLABORATOR name.
 * @param {*} fake - The test's fake (null and undefined pass through).
 * @return {*} The fake itself when complete, else a derived completion.
 */
function partitionCollaboratorFake(collaborator, fake) {
  const neutral = NEUTRAL_COLLABORATOR_MEMBERS[collaborator];
  if (!neutral || !fake || typeof fake !== 'object') {
    return fake;
  }
  const answers = Object.entries(neutral(fake))
    .filter(([member]) => !hasMethod(fake, member));
  if (answers.length === 0) {
    return fake;
  }
  const completed = Object.create(fake);
  for (const name of functionMemberNames(fake)) {
    completed[name] = fake[name].bind(fake);
  }
  for (const [member, answer] of answers) {
    completed[member] = answer;
  }
  return completed;
}

/**
 * PartitionService (or PartitionServiceRowOwner) construction options with
 * every named collaborator fake completed (see partitionCollaboratorFake); a
 * new object, the caller's options are never changed.
 * @param {Object} options - Construction options.
 * @return {Object} The options to construct with.
 */
function partitionCollaboratorOptions(options) {
  const completed = {...options};
  for (const collaborator of Object.keys(NEUTRAL_COLLABORATOR_MEMBERS)) {
    if (Object.hasOwn(completed, collaborator)) {
      completed[collaborator] =
        partitionCollaboratorFake(collaborator, completed[collaborator]);
    }
  }
  return completed;
}

/**
 * A context that answers with PartitionService's methods over the caller's
 * own state.
 * @param {Object} [fields] - The context's own state and overrides.
 * @return {Object} A new object deriving from PartitionService.prototype.
 */
function partitionServiceContext(fields = {}) {
  const context = Object.create(PartitionService.prototype);
  initializePartitionAdmissionState(context);
  return Object.defineProperties(context,
    Object.getOwnPropertyDescriptors(fields));
}

/**
 * The authoritative system-table read of a durable store that holds what the
 * given store holds (anything with get(tableName, key), e.g. a
 * SystemTableCache). A production CDC service always reads authoritatively,
 * so a partition's metadata publication confirms and guards its write from
 * the durable row; a test that publishes states that row here. A point read
 * answers the row of its key (the first parameter), else no row.
 * @param {{get: function(string, string): ?Object}} store - The durable rows.
 * @return {function(string, string, Array): Promise<Object>} The read.
 */
function authoritativeSystemTableRead(store) {
  return async (tableName, _sql, params = []) => {
    const row = store.get(tableName, params[0]) ?? null;
    return {success: true, rows: row ? [{...row}] : []};
  };
}

export {
  authoritativeSystemTableRead,
  partitionCollaboratorFake,
  partitionCollaboratorOptions,
  partitionServiceContext,
};
