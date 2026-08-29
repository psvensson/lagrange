import {
  PARTICIPANT_ACK_FIELD,
} from '../workflow/workflow-constants.js';
import {
  SPLIT_ACK_OWNER_RECORDED_STATUSES,
} from './split-ack-constants.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';

const objectFreeze = Object.freeze;
const setHas = Function.call.bind(Set.prototype.has);

function normalizeSplitSourceParticipantAck(value) {
  const ack = copyStrictOwnDataRecord(value);
  const checkpointValue = ack?.[PARTICIPANT_ACK_FIELD.CHECKPOINT];
  const checkpoint = checkpointValue === undefined ||
    checkpointValue === null ? checkpointValue :
    copyStrictOwnDataRecord(checkpointValue);
  if (!ack ||
      (checkpointValue !== undefined && checkpointValue !== null &&
        !checkpoint)) return null;
  if (checkpoint) ack[PARTICIPANT_ACK_FIELD.CHECKPOINT] = checkpoint;
  const statusValue = ack[PARTICIPANT_ACK_FIELD.STATUS];
  const status = typeof statusValue === 'string' ? statusValue : '';
  return objectFreeze({
    ack,
    status,
    ownerRecorded: setHas(SPLIT_ACK_OWNER_RECORDED_STATUSES, status),
  });
}

export {normalizeSplitSourceParticipantAck};
