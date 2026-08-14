import BaseLifeRaft from '@markwylde/liferaft';
import {RAFT_PACKET_TYPE} from './constants.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STRING = 'string';
const NUMERIC_ZERO = 0;
const DESCRIPTOR_VALUE = 'value';
const PACKET_FIELD = Object.freeze({
  ADDRESS: 'address',
  LEADER: 'leader',
  TERM: 'term',
});
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;

function ownDataValue(record, key) {
  const descriptor = record && objectGetOwnPropertyDescriptor(record, key);
  return descriptor && objectHasOwn(descriptor, DESCRIPTOR_VALUE) ?
    descriptor.value :
    undefined;
}

function isPacketAuthorityCurrent(raft, packet) {
  const address = ownDataValue(packet, PACKET_FIELD.ADDRESS);
  const leader = ownDataValue(packet, PACKET_FIELD.LEADER);
  const expectedLeader = typeof address === LOCAL_STR_STRING ? address : leader;
  return raft.term === ownDataValue(packet, PACKET_FIELD.TERM) &&
    typeof expectedLeader === LOCAL_STR_STRING &&
    expectedLeader.length > NUMERIC_ZERO &&
    raft.leader === expectedLeader;
}

async function doesPacketPrefixStillMatch(log, packet) {
  if (packet.last.index === NUMERIC_ZERO) {
    return true;
  }
  const entry = await log.get(packet.last.index);
  return entry?.term === packet.last.term;
}

async function saveRecoverableTail(
  raft,
  entries,
  isRecoverableAppendEntry,
  authorityIsCurrent,
) {
  const recoverable = [];
  for (const entry of entries) {
    if (!isRecoverableAppendEntry(entry)) {
      break;
    }
    recoverable.push(entry);
  }
  if (recoverable.length === NUMERIC_ZERO) {
    return recoverable;
  }
  if (typeof raft.log.saveCommands === LOCAL_STR_FUNCTION) {
    raft.log.saveCommands(recoverable);
    return recoverable;
  }
  const saved = [];
  for (const entry of recoverable) {
    if (!authorityIsCurrent()) {
      break;
    }
    await raft.log.saveCommand(entry.command, entry.term, entry.index);
    saved.push(entry);
    if (!authorityIsCurrent()) {
      break;
    }
  }
  return saved;
}

async function handleFollowerAppendBatchSerial(context) {
  const {
    raft,
    packet,
    write,
    originalListener,
    getCommittedIndex,
    isRecoverableAppendEntry,
    validateCommittedBatchEntries,
  } = context;
  const committedIndex = getCommittedIndex(raft);
  await validateCommittedBatchEntries(raft.log, packet.data, committedIndex);
  if (packet.last.index < getCommittedIndex(raft)) {
    write();
    return undefined;
  }
  const localLastInfo = await raft.log.getLastInfo();
  const willAccept =
    packet.last.index === localLastInfo.index ||
    packet.last.index === NUMERIC_ZERO ||
    (await raft.log.has(packet.last.index));
  const result = await originalListener(packet, write);
  if (!willAccept || !isPacketAuthorityCurrent(raft, packet)) {
    return result;
  }
  const prefixStillMatches = await doesPacketPrefixStillMatch(
    raft.log,
    packet,
  );
  if (!prefixStillMatches || !isPacketAuthorityCurrent(raft, packet)) {
    return result;
  }

  const savedTail = await saveRecoverableTail(
    raft,
    packet.data.slice(1),
    isRecoverableAppendEntry,
    () => isPacketAuthorityCurrent(raft, packet),
  );
  const lastSavedEntry = savedTail.findLast(
    (entry) => entry.index > committedIndex,
  ) || null;
  if (!lastSavedEntry || !isPacketAuthorityCurrent(raft, packet)) {
    return result;
  }
  const acknowledgement = await raft.packet(RAFT_PACKET_TYPE.APPEND_ACK, {
    term: lastSavedEntry.term,
    index: lastSavedEntry.index,
  });
  if (
    !isPacketAuthorityCurrent(raft, packet) ||
    acknowledgement?.term !== packet.term
  ) {
    return result;
  }
  raft.message(BaseLifeRaft.LEADER, acknowledgement);
  if (getCommittedIndex(raft) < packet.last.committedIndex) {
    const uncommitted = await raft.log.getUncommittedEntriesUpToIndex(
      packet.last.committedIndex,
      packet.last.term,
    );
    await raft.commitEntries(uncommitted);
  }
  return result;
}

/**
 * Serialize inbound follower batches and revalidate their term, leader, and
 * prefix after every await that precedes tail persistence or acknowledgement.
 * @param {Object} context
 * @return {Promise<*>}
 */
function handleFollowerAppendBatch(context) {
  const {raft} = context;
  const run = () => handleFollowerAppendBatchSerial(context);
  const prior = raft._followerAppendBatchTail || Promise.resolve();
  const current = prior.then(run, run);
  raft._followerAppendBatchTail = current.catch(() => undefined);
  return current;
}

export {handleFollowerAppendBatch};
