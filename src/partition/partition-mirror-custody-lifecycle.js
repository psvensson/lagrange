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
const LOG_MIRROR_RELEASE_AWAITING_REDELIVERY = 'Source mirror release awaiting redelivery';

function mirrorWorkflowOwnerOf(service, family) {
  return family === WORKFLOW_FAMILY.SPLIT ? service.sqlQueryEngine?.managedSplitWorkflow :
    service.sqlQueryEngine?.managedMergeWorkflow;
}

// No grant of the record at the custody's fence, or a durable pin of this
// partition that names another custody.
function isGrantOutsideCustody(grant, fence, pin, metadata) {
  return !grant.grants.some((item) => item.fence === fence) ||
    (pin && !sameMirrorCustody(pin, metadata));
}

async function releaseTerminalGrant(service, pin, family) {
  const owner = mirrorWorkflowOwnerOf(service, family);
  if (!owner) return;
  const row = await authoritativeRecordOf(owner, service.tableId);
  const grant = terminalGrantForSource(row, service.partitionId);
  if (row?.table_id !== service.tableId || grant?.family !== family) return;
  const fence = pin?.workflowFenceToken ?? grant.grants[0].fence;
  const metadata = {...grant.metadata, workflowFenceToken: fence, family};
  if (isGrantOutsideCustody(grant, fence, pin, metadata)) return;
  const receipt = await releaseSourceMirrorRetentionCustody(service, metadata, {
    family, barrierIndex: pin?.barrierIndex ?? 0,
  });
  await acknowledgeMirrorCustodyRelease(owner, row, receipt);
  return true;
}

// The TABLES projection of the partition's table: only a wake hint. The
// record owner, which releaseTerminalGrant re-reads, decides every release.
function projectedTableRowOf(service) {
  return service.systemTableCache?.get?.(TABLES.TABLES, service.tableId);
}

export async function reconcileFailedMirrorCustody(service) {
  if (pending.has(service)) return pending.get(service);
  const pin = readDurableMirrorRetentionCustodyIn(service.db);
  const row = projectedTableRowOf(service);
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

// No mirror worker runs here (a stopped split worker counts as none) while the
// record still grants this partition live custody at the workflow's fence.
function isLiveCustodyUnworked(service, metadata) {
  return (!service.splitReplication || isStoppedSplitWorker(service.splitReplication)) &&
    !service.mergeReplication &&
    metadata?.mirrorCustodyGrants?.some((grant) => grant.partitionId === service.partitionId &&
      grant.fence === metadata.workflowFenceToken && !grant.release) &&
    !metadata.mirrorExecutionEnded;
}

// A terminal row is held by the record owner until all grants have a durable
// release acknowledgement. Its projection is only a wake hint.
export function redriveFailedMirrorRelease(service) {
  if (!service.isLeader || service.isShutdown || pending.has(service)) return;
  const row = projectedTableRowOf(service);
  if (!terminalGrantForSource(row, service.partitionId)) {
    const transition = parseTablePartitionTransition(row);
    const metadata = transition?.metadata;
    if (isLiveCustodyUnworked(service, metadata)) {
      service.resumeDurableMirrorReplicationWorkers();
    }
    return;
  }
  reconcileFailedMirrorCustody(service).catch((error) => service.logger.warn(
    LOG_MIRROR_RELEASE_AWAITING_REDELIVERY, {partitionId: service.partitionId, error},
  ));
}
