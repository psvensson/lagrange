// Original effect observation has no opening capability, native proposal,
// migration, repair, application callback, publication or delivery side effect.
import {isDeepStrictEqual} from 'node:util';
import {SERVICE_TYPE} from '../constants/service.js';
import {deepFreeze} from '../raft/raft-operation-port.js';
import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {RAFT_RS_RETAINED_HISTORY_COVERAGE as COVERAGE,
  RAFT_RS_RETAINED_ENTRY_KIND as ENTRY_KIND,
  RAFT_RS_STORE_ERROR_CODE as STORE_ERROR} from '../raft/raft-rs-durable-store-constants.js';
import {retainedMessageGroupEvents} from
  '../message-group/message-group-committed-command-admission.js';
import {validateOriginalSeedDeclaration} from './seed-original-allocation-declaration.js';
import {observePartitionEffectsIn} from './seed-retained-partition-effects.js';
import {retainedFoundationEventMatches} from './seed-retained-foundation.js';
import {RETAINED_STORE_ERROR} from '../partition/partition-retained-store-observation.js';
import {SEED_RETAINED_EFFECT_STATE as STATE, SEED_RETAINED_EFFECT_REASON as REASON,
  SEED_RETAINED_EFFECT_KIND as KIND} from './seed-retained-effects-constants.js';

function observeMessageGroupEffects(history, declaration) {
  const entries = [];
  for (const entry of history.entries) {
    if (entry.kind === ENTRY_KIND.NOOP) {
      entries.push({entry, kind: KIND.NOOP});
      continue;
    }
    const events = retainedMessageGroupEvents(entry.command);
    if (events === null || !events.every((event) =>
      retainedFoundationEventMatches(event, declaration))) {
      return {state: STATE.CONTRARY, reason: REASON.COMMAND, entry, entries};
    }
    entries.push({entry, kind: KIND.CDC, events});
  }
  // Even metadata-complete events need the actual source owner's occurrence
  // and recipient committed-delivery contract. Matching content is not that.
  return entries.some(({kind}) => kind === KIND.CDC) ?
    {state: STATE.UNAVAILABLE, reason: REASON.MG_SOURCE, entries} :
    {state: STATE.ACCEPTED, entries};
}

function observeOriginalSeedEffectsIn(db, declaration, member) {
  const history = RaftRsDurableStore.readRetainedHistoryIn(db, member.groupId);
  if (history.coverage !== COVERAGE.COMPLETE) {
    return {history, state: STATE.UNAVAILABLE, reason: REASON.COVERAGE};
  } else if (history.entries.some(({kind}) => kind === ENTRY_KIND.CONFIGURATION)) {
    return {history, state: STATE.UNAVAILABLE, reason: REASON.CONFIGURATION};
  }
  const effects = member.serviceType === SERVICE_TYPE.PARTITION ?
    observePartitionEffectsIn(db, declaration, member, history) :
    observeMessageGroupEffects(history, declaration);
  return {history, ...effects};
}

function readOriginalSeedRetainedEffects({db, declaration, member}) {
  const identity = {groupId: member?.groupId, replicaId: member?.replicaId};
  if (db.inTransaction) {
    return deepFreeze({...identity, state: STATE.UNAVAILABLE, reason: REASON.TRANSACTION});
  }
  try {
    validateOriginalSeedDeclaration(declaration, declaration);
    if (!isDeepStrictEqual(member, declaration.members.find((candidate) =>
      candidate.replicaId === member?.replicaId))) {
      return deepFreeze({...identity, state: STATE.CONTRARY, reason: REASON.IDENTITY});
    }
  } catch {
    return deepFreeze({...identity, state: STATE.CONTRARY, reason: REASON.IDENTITY});
  }
  try {
    return deepFreeze({...identity,
      ...db.transaction(() => observeOriginalSeedEffectsIn(db, declaration, member))()});
  } catch (cause) {
    const invalidNative = cause.code === STORE_ERROR.RETAINED_HISTORY_INVALID;
    const invalidOwner = cause.code === RETAINED_STORE_ERROR.SCHEMA_CONTRARY ||
      cause.code === RETAINED_STORE_ERROR.ROW_CONTRARY;
    return deepFreeze({...identity,
      state: invalidNative || invalidOwner ? STATE.CONTRARY : STATE.UNAVAILABLE,
      reason: invalidNative ? REASON.NATIVE :
        invalidOwner ? REASON.OWNER_CONTRARY : REASON.OBSERVATION,
      cause});
  }
}

export {readOriginalSeedRetainedEffects};
