import {authoritativeRecordOf, acknowledgeMirrorCustodyRelease} from './managed-workflow-record-store.js';
import {parseTablePartitionTransition} from './partition-transition-row.js';
import {TABLES} from '../constants/tables.js';
import {endsSourceExecutionAttempt, PARTITION_TRANSITION_STATE, WORKFLOW_FAMILY} from './partition-constants.js';
import {sameMirrorCustody} from './partition-mirror-custody-codec.js';
import {
  readDurableMirrorRetentionCustodyIn, releaseSourceMirrorRetentionCustody,
} from './partition-mirror-effect-retention.js';

function terminalGrantForSource(row, partitionId) {
  const transition = parseTablePartitionTransition(row);
  if (!transition) return null;
  const metadata = transition.metadata;
  const grants = metadata.mirrorCustodyGrants?.filter((grant) =>
    grant.partitionId === partitionId &&
    (grant.release ||
    (metadata.mirrorExecutionEnded && endsSourceExecutionAttempt(transition.state))));
  if (!grants?.length) return null;
  const family = metadata.sourcePartitionId === partitionId ? WORKFLOW_FAMILY.SPLIT :
    metadata.sourcePartitionIds?.includes(partitionId) ? WORKFLOW_FAMILY.MERGE : null;
  return family ? {metadata, grants, family} : null;
}

const pending = new WeakMap();

async function releaseTerminalGrant(service, pin, family) {
  const owner = family === WORKFLOW_FAMILY.SPLIT ? service.sqlQueryEngine?.managedSplitWorkflow :
    service.sqlQueryEngine?.managedMergeWorkflow;
  if (!owner) return;
  const row = await authoritativeRecordOf(owner, service.tableId);
  const grant = terminalGrantForSource(row, service.partitionId);
  if (row?.table_id !== service.tableId || grant?.family !== family) return;
  const fence = pin?.workflowFenceToken ?? grant.grants[0].fence;
  const metadata = {...grant.metadata, workflowFenceToken: fence, family};
  if (!grant.grants.some((item) => item.fence === fence) ||
      (pin && !sameMirrorCustody(pin, metadata))) return;
  const receipt = await releaseSourceMirrorRetentionCustody(service, metadata, {
    family, barrierIndex: pin?.barrierIndex ?? 0,
  });
  await acknowledgeMirrorCustodyRelease(owner, row, receipt);
  return true;
}

export async function reconcileFailedMirrorCustody(service) {
  if (pending.has(service)) return pending.get(service);
  const pin = readDurableMirrorRetentionCustodyIn(service.db);
  const row = service.systemTableCache?.get?.(TABLES.TABLES, service.tableId);
  const family = pin?.family ?? terminalGrantForSource(row, service.partitionId)?.family;
  if (!family) return;
  const work = releaseTerminalGrant(service, pin, family).finally(() => pending.delete(service));
  pending.set(service, work);
  return work;
}

// A failed local run can finish draining while its durable grant remains live.
export function isStoppedSplitWorker(handle) {
  return handle?.phase === PARTITION_TRANSITION_STATE.FAILED &&
    (handle.failedPhase === PARTITION_TRANSITION_STATE.SPLIT_CATCHUP ||
      handle.failedPhase === PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE) &&
    handle.terminal === true && handle.quiesced === true;
}

// A terminal row is held by the record owner until all grants have a durable
// release acknowledgement. Its projection is only a wake hint.
export function redriveFailedMirrorRelease(service) {
  if (!service.isLeader || service.isShutdown || pending.has(service)) return;
  const row = service.systemTableCache?.get?.(TABLES.TABLES, service.tableId);
  if (!terminalGrantForSource(row, service.partitionId)) {
    const transition = parseTablePartitionTransition(row);
    const metadata = transition?.metadata;
    if ((!service.splitReplication || isStoppedSplitWorker(service.splitReplication)) &&
        !service.mergeReplication &&
        metadata?.mirrorCustodyGrants?.some((grant) => grant.partitionId === service.partitionId &&
          grant.fence === metadata.workflowFenceToken && !grant.release) &&
          !metadata.mirrorExecutionEnded) {
      service.resumeDurableMirrorReplicationWorkers();
    }
    return;
  }
  reconcileFailedMirrorCustody(service).catch((error) => service.logger.warn(
    'Source mirror release awaiting redelivery', {partitionId: service.partitionId, error},
  ));
}
