// Executed in the SQLite transaction that owns the applied index. The two
// sibling commands use different entry keys; each consults the other's
// committed disposition before executing a first mutation on this subject.
import {deriveParticipantEntryId} from '../query/distributed/participant-entry-id.js';
import {committedStatementEntryKey, readCommittedStatementOutcome} from './partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE} from './partition-committed-statement-outcome-constants.js';
import {SIBLING_DESCRIPTOR_ACTION, siblingDescriptorDispositionIn} from './partition-sibling-descriptor-effect.js';
import {descriptorRefusal, finalizeChildReceipt, isSiblingDescriptorAction, retainedSplitDescriptorAnswer,
  SPLIT_DESCRIPTOR_ERROR, splitDescriptorCommandDigest, splitDescriptorWriteKey} from './partition-split-descriptor-command.js';
import {runCommittedPartitionStatement} from './partition-statement-admission.js';

function readDescriptorAnswer(service, intent) {
  const entryId = deriveParticipantEntryId(splitDescriptorWriteKey(intent), service.partitionId);
  const recorded = readCommittedStatementOutcome(service, committedStatementEntryKey({entryId}));
  if (recorded.state === PARTITION_COMMITTED_STATEMENT_RECORD_STATE.UNSETTLED) return null;
  return retainedSplitDescriptorAnswer({intent, digest: splitDescriptorCommandDigest(intent)}, recorded);
}

function withReceipt(result, receipt) {
  return receipt === null ? {refusal: descriptorRefusal(SPLIT_DESCRIPTOR_ERROR.UNRESOLVED, true)} :
    {result, receipt};
}

function applySplitDescriptorStatement(service, command, descriptor) {
  const {intent} = descriptor;
  if (!isSiblingDescriptorAction(intent.action)) {
    const result = runCommittedPartitionStatement(service, command);
    return withReceipt(result, finalizeChildReceipt(service.db, intent, result.changes));
  }

  const promote = intent.action === SIBLING_DESCRIPTOR_ACTION.PROMOTE;
  const opposite = readDescriptorAnswer(service, {...intent, action: promote ?
    SIBLING_DESCRIPTOR_ACTION.FINALIZE : SIBLING_DESCRIPTOR_ACTION.PROMOTE});
  if (opposite?.success === false) return {refusal: opposite};
  if (promote && opposite !== null) return {refusal: descriptorRefusal(SPLIT_DESCRIPTOR_ERROR.FINALIZED)};
  if (!promote && opposite === null) {
    // The destination never accepted a promotion of this plan. Observe the
    // untouched preimage for a cancellation; even a row matching the restore
    // predicate cannot authorize running an UPDATE in this case.
    return withReceipt({changes: 0, lastInsertRowid: null},
      siblingDescriptorDispositionIn(service.db, intent, 0, true));
  }
  const result = runCommittedPartitionStatement(service, command);
  return withReceipt(result, siblingDescriptorDispositionIn(service.db, intent, result.changes, false));
}

export {applySplitDescriptorStatement};
