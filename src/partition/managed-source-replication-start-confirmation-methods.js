import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
} from '../workflow/workflow-constants.js';
import {PARTITION_TRANSITION_METADATA_FIELD} from './partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from './split-ack-constants.js';
import {
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from './merge-ack-constants.js';

const FIELD = PARTITION_TRANSITION_METADATA_FIELD;

function accepted(result) {
  return result?.result === PARTICIPANT_ACK_RESULT.ACCEPTED ||
    result?.result === PARTICIPANT_ACK_RESULT.DUPLICATE;
}

function startAck(participantKey, status, metadata, now) {
  return {
    [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]: participantKey,
    [PARTICIPANT_ACK_FIELD.STATUS]: status,
    [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]:
      metadata[FIELD.WORKFLOW_FENCE_TOKEN],
    [PARTICIPANT_ACK_FIELD.ATTEMPT]:
      metadata[FIELD.WORKFLOW_ATTEMPT] ?? 0,
    [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: now,
  };
}

class ManagedSourceReplicationStartConfirmationMethods {
  async confirmSplitReplicationStart(metadata, tableId, tableName) {
    const result = await this.acknowledgeSourceParticipant(
      metadata[FIELD.WORKFLOW_ID],
      startAck(SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
        SPLIT_ACK_STATUS.SNAPSHOT_STARTED, metadata, this.now()),
      {metadata, tableId, tableName, confirmationOnly: true},
    );
    return accepted(result);
  }

  async confirmMergeReplicationStart(sourcePartitionId, metadata, tableId,
    tableName) {
    const result = await this.acknowledgeMergeSourceParticipant(
      metadata[FIELD.WORKFLOW_ID],
      startAck(buildMergeSourceParticipantKey(sourcePartitionId),
        MERGE_ACK_STATUS.SNAPSHOT_STARTED, metadata, this.now()),
      {metadata, tableId, tableName, confirmationOnly: true},
    );
    return accepted(result);
  }
}

export {ManagedSourceReplicationStartConfirmationMethods};
