import BaseLifeRaft from '@markwylde/liferaft';

const RAFT_EVENT = Object.freeze({
  DATA: 'data',
});

const RAFT_PACKET_TYPE = Object.freeze({
  APPEND: 'append',
  APPEND_ACK: 'append ack',
  APPEND_FAIL: 'append fail',
});

function hasFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecoverableAppendEntry(entry) {
  return !!entry &&
    typeof entry === 'object' &&
    hasFiniteNumber(entry.index) &&
    hasFiniteNumber(entry.term) &&
    Object.prototype.hasOwnProperty.call(entry, 'command');
}

function getCommittedIndex(raft) {
  return hasFiniteNumber(raft?.log?.committedIndex) ?
    raft.log.committedIndex :
    NUMERIC_ZERO;
}

const NUMERIC_ZERO = 0;

function patchIncomingDataListener(raft) {
  const listeners = raft.listeners(RAFT_EVENT.DATA);
  const originalListener = Array.isArray(listeners) ? listeners[0] : null;

  if (typeof originalListener !== 'function' ||
      originalListener.__lagrangePatched === true) {
    return;
  }

  raft.removeListener(RAFT_EVENT.DATA, originalListener);

  const patchedListener = async (packet, write = () => {}) => {
    const committedIndexBefore = getCommittedIndex(raft);

    if (packet?.type === RAFT_PACKET_TYPE.APPEND_FAIL) {
      const recoveredEntry = await raft.log?.get?.(packet?.data?.index);
      if (!isRecoverableAppendEntry(recoveredEntry)) {
        return write();
      }
    }

    if (packet?.type === RAFT_PACKET_TYPE.APPEND) {
      const hasEntries = Array.isArray(packet?.data) &&
        packet.data.length > 0;
      const entry = hasEntries ? packet.data[0] : null;
      if (hasEntries && !isRecoverableAppendEntry(entry)) {
        return write();
      }
    }

    const result = await originalListener(packet, write);
    const committedIndexAfter = getCommittedIndex(raft);

    if (packet?.type === RAFT_PACKET_TYPE.APPEND_ACK &&
        raft.state === BaseLifeRaft.LEADER &&
        committedIndexAfter > committedIndexBefore) {
      const heartbeatPacket = await raft.packet(RAFT_PACKET_TYPE.APPEND);
      raft.message(BaseLifeRaft.FOLLOWER, heartbeatPacket);
    }

    return result;
  };

  patchedListener.__lagrangePatched = true;
  raft.on(RAFT_EVENT.DATA, patchedListener);
}

class LifeRaft extends BaseLifeRaft {
  constructor(address, options = {}) {
    super(address, options);
    patchIncomingDataListener(this);
  }
}

export default LifeRaft;
