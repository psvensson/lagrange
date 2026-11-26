import {readCommittedStatementOutcome, committedStatementEntryKey} from './partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE as RECORD} from './partition-committed-statement-outcome-constants.js';
import {CHILD_DESCRIPTOR_ACTION as ACTION, CHILD_DESCRIPTOR_DISPOSITION as DISPOSITION,
  canonicalChildDescriptorIntent, childSourceForward} from './partition-child-descriptor-effect.js';
import {buildRecipientChildForward, descriptorRefusal, isSplitDescriptorDigest, retainedSplitDescriptorAnswer,
  splitDescriptorProofLocator, splitDescriptorStageId, SPLIT_DESCRIPTOR_ERROR as ERROR} from './partition-split-descriptor-command.js';
import {runCommittedPartitionStatement} from './partition-statement-admission.js';

const collision = () => ({refusal: descriptorRefusal(ERROR.COLLISION)});
const unresolved = () => ({refusal: descriptorRefusal(ERROR.UNRESOLVED, true)});
const finalized = () => ({refusal: descriptorRefusal(ERROR.FINALIZED)});
const noChanges = Object.freeze({changes: 0, lastInsertRowid: null});

// A locator is an address, never authority. Reconstruct the held command from
// its receipt and verify the complete key, digest, result and commit position.
function heldChildStage(service, entryId) {
  const recorded = readCommittedStatementOutcome(service, committedStatementEntryKey({entryId}));
  if (recorded.state === RECORD.UNSETTLED) return null;
  if (!isSplitDescriptorDigest(recorded.commandDigest)) return collision();
  const {disposition, ...body} = JSON.parse(recorded.ownerResultText);
  const intent = canonicalChildDescriptorIntent(body);
  if (!intent) return collision();
  const locator = splitDescriptorProofLocator(intent);
  if (locator.entryId !== entryId || locator.commandDigest !== recorded.commandDigest) return collision();
  const verified = retainedSplitDescriptorAnswer({intent, digest: locator.commandDigest}, recorded);
  return {intent, receipt: verified.splitDescriptorReceipt, locator};
}

function validateIncoming(service, forward) {
  if (forward.incomingProof === null) return {owned: false};
  const proof = heldChildStage(service, forward.incomingProof.entryId);
  if (!proof) return unresolved();
  if (proof.refusal) return proof;
  if (proof.intent.action !== ACTION.TRANSFER ||
      proof.locator.commandDigest !== forward.incomingProof.commandDigest) return collision();
  const recipient = buildRecipientChildForward(proof.intent, proof.receipt);
  if (JSON.stringify(recipient) !== JSON.stringify(forward)) return collision();
  return {owned: proof.receipt.disposition === DISPOSITION.TRANSFERRED};
}

// SQLite compares the immutable descriptor operands with their column
// affinities in the same transaction as the mutation. Replica count, leader
// and size may change after admission and do not identify a split boundary.
function readChild(service, intent) {
  const row = intent.row;
  return service.db.prepare('SELECT table_id, split_descriptor_attempt, ' +
    '(table_name = ? AND partition_key_type = ? AND partition_version = ? AND created_at = ? ' +
    'AND partition_key_start IS ? AND partition_key_end IS ?) AS matches_plan ' +
    'FROM partitions WHERE partition_id = ?').get(row.table_name, row.partition_key_type,
    row.partition_version, row.created_at, row.partition_key_start, row.partition_key_end, intent.partitionId);
}

function complete(intent, disposition, result = noChanges) {
  return {receipt: Object.freeze({...intent, disposition}), result};
}

function applyExpectedRow(service, command, intent, disposition) {
  const result = runCommittedPartitionStatement(service, command);
  // A checked physical preimage in this application transaction authorized
  // one change. Roll back on a discrepancy rather than retaining a receipt.
  if (result.changes !== 1) throw Object.assign(new Error(ERROR.UNRESOLVED), {code: ERROR.UNRESOLVED});
  return complete(intent, disposition, result);
}

function readPriorClosure(service, forward, excludeAction) {
  for (const action of [ACTION.TRANSFER, ACTION.FINALIZE]) {
    if (action === excludeAction) continue;
    const prior = heldChildStage(service, splitDescriptorStageId(forward, action));
    if (!prior) continue;
    if (prior.refusal) return prior;
    if (prior.intent.action !== action ||
        JSON.stringify(childSourceForward(prior.intent)) !== JSON.stringify(forward)) return collision();
    return finalized();
  }
  return null;
}

function applyChildDescriptorStatement(service, command, {intent}) {
  const terminal = intent.action === ACTION.FINALIZE || intent.action === ACTION.TRANSFER;
  const forward = terminal ? childSourceForward(intent) : intent;
  const priorClosure = readPriorClosure(service, forward, terminal ? intent.action : null);
  if (priorClosure) return priorClosure;
  const incoming = validateIncoming(service, forward);
  if (incoming.refusal) return incoming;
  const row = readChild(service, intent);
  const ownRow = row?.table_id === intent.tableId && row.split_descriptor_attempt === intent.workflowAttempt &&
    row.matches_plan === 1;

  if (!terminal) {
    const canAcquire = intent.action === ACTION.CREATE ? !row : ownRow && incoming.owned;
    return canAcquire ? applyExpectedRow(service, command, intent, DISPOSITION.ACQUIRED) : unresolved();
  }
  const acquired = heldChildStage(service, splitDescriptorStageId(forward, forward.action));
  if (acquired?.refusal) return acquired;
  if (acquired && JSON.stringify(acquired.intent) !== JSON.stringify(forward)) return collision();
  const owned = acquired !== null || incoming.owned;
  if (!row) return owned ? unresolved() : complete(intent, DISPOSITION.ABSENT);
  if (intent.action === ACTION.FINALIZE && row.table_id === intent.tableId &&
      Number.isSafeInteger(row.split_descriptor_attempt) && row.split_descriptor_attempt > intent.workflowAttempt) {
    return complete(intent, DISPOSITION.SUPERSEDED);
  }
  if (!owned || !ownRow) return unresolved();
  return applyExpectedRow(service, command, intent, intent.action === ACTION.TRANSFER ?
    DISPOSITION.TRANSFERRED : DISPOSITION.DELETED);
}

export {applyChildDescriptorStatement};
