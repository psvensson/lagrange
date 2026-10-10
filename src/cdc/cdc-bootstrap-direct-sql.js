/**
 * The bootstrap-mode direct write path of the CDC integration service (the
 * seed's registration window): SQL executed on the local partition replicas.
 * Every hop to a partition passes the owner's terminal gate
 * (submitRoutedMutationHop).
 */

import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {CDC_TERMINAL_STAGE} from './cdc-constants.js';
import {submitRoutedMutationHop} from './cdc-terminal-gate.js';
import {
  classifyPartitionStatementHead,
  statementRefusalError,
} from '../partition/partition-statement-admission.js';
import {PARTITION_STATEMENT_KIND} from
  '../partition/partition-statement-admission-constants.js';

const {
  CDC_INTEGRATION_SERVICE_LITERAL,
  CDC_LOG_MSG,
  INITIAL_PARTITION_IDS,
  NUM,
} = CDC_INTEGRATION_SERVICE_SHARED;

// Candidates for direct bootstrap-mode SQL: when the table maps to an initial
// partition id, only that partition qualifies; otherwise any service declaring
// the table by name or id.
function selectDirectSqlCandidates(services, tableName, targetPartitionId) {
  const candidates = [];
  for (const service of services.values()) {
    if (!service) {
      continue;
    }
    if (targetPartitionId) {
      if (service.partitionId === targetPartitionId) {
        candidates.push(service);
      }
      continue;
    }
    if (service.tableName === tableName || service.tableId === tableName) {
      candidates.push(service);
    }
  }
  return candidates;
}

async function executeBootstrapDirectSql(service, sql, params = []) {
  if (!service.bootstrapMode || !service.localPartitionServices) {
    throw new Error(CDC_LOG_MSG.BOOTSTRAP_MODE_REQUIRED_FOR_DIRECT_SQL);
  }

  const tableNameResult = service.extractTableNameFromSQL(sql);
  if (
    tableNameResult.state !==
    CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND
  ) {
    throw new Error(`Could not extract table name from SQL: ${sql}`);
  }
  const tableName = tableNameResult.tableName;
  const targetPartitionId = INITIAL_PARTITION_IDS[tableName] || null;
  const candidates = selectDirectSqlCandidates(
    service.localPartitionServices, tableName, targetPartitionId);

  const initializedCandidates =
    candidates.length > 0 ? candidates : [];
  if (initializedCandidates.length === 0) {
    const partitionIds = candidates
      .map((candidate) => candidate?.partitionId)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Partition services not initialized for table: ${tableName}. ` +
        `Partitions: ${partitionIds}`,
    );
  }
  const leaderService = initializedCandidates.find(
    (candidate) => candidate.isLeader,
  );
  const partitionService =
    leaderService || initializedCandidates[0] || null;
  if (!partitionService) {
    const availablePartitions = Array.from(
      service.localPartitionServices.values(),
    )
      .map((candidate) => candidate?.partitionId)
      .filter(Boolean);
    throw new Error(
      `No local partition service found for table: ${tableName}. ` +
        `Available partitions: ${availablePartitions.join(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_2)}`,
    );
  }
  service.logger.debug(
    CDC_INTEGRATION_SERVICE_LITERAL.EXECUTING_SQL_DIRECTLY_ON_LOCAL_PARTITION_BOOTSTRAP_MODE,
    {
      nodeId: service.nodeId,
      tableName,
      partitionId: partitionService.partitionId,
      sql: sql.substring(0, Math.min(sql.length, NUM.HUNDRED)),
    },
  );
  // The statement-admission owner's head rule picks the lane: a SELECT head
  // reads locally; any other admitted head takes the write lanes, both of
  // which admit it through the same owner (a WITH is decided there by its
  // compiled flags); an unadmitted head is refused before any lane.
  const head = classifyPartitionStatementHead(sql);
  if (!head.admitted) {
    throw statementRefusalError(head);
  }
  if (head.kind === PARTITION_STATEMENT_KIND.READ) {
    const result = await submitRoutedMutationHop(service,
      CDC_TERMINAL_STAGE.BOOTSTRAP_DIRECT,
      () => partitionService.executeLocalQuery(sql, params));
    if (!result || result.success === false) {
      throw new Error(
        result?.error ||
          `Direct partition query failed for table: ${tableName}`,
      );
    }
    return result;
  }
  // Writes ride raft whenever any candidate can carry the append: the
  // per-replica direct loop lands only on the replica instances present
  // in this map at this instant (ONE per partition), OUTSIDE the raft
  // log, so every replica absent from the map diverges durably and
  // nothing ever heals it (round-11: the registration-era services rows
  // missing from the raft leader's db wedged serve-eligibility
  // permanently). proposeWrite on a follower forwards to the known
  // leader, and registration waits for partition leadership before
  // writing, so the raft lane is the normal path; the direct fan-out
  // remains only for the genuinely leaderless earliest-bootstrap window
  // where the raft lane itself fails.
  const raftLaneService =
    leaderService || initializedCandidates.find(
      (candidate) => typeof candidate.executeQuery === 'function',
    ) || null;
  const issuedLane = {};
  if (raftLaneService && typeof raftLaneService.executeQuery === 'function') {
    try {
      const result = await submitRoutedMutationHop(service,
        CDC_TERMINAL_STAGE.BOOTSTRAP_DIRECT,
        () => raftLaneService.executeQuery(sql, params));
      if (result && result.success !== false) {
        return result;
      }
      issuedLane.answer = result;
      service.logger.warn(CDC_LOG_MSG.BOOTSTRAP_RAFT_WRITE_LANE_FELL_BACK, {
        tableName,
        partitionId: raftLaneService.partitionId,
        error: result?.error || null,
      });
    } catch (error) {
      issuedLane.answer = error;
      service.logger.warn(CDC_LOG_MSG.BOOTSTRAP_RAFT_WRITE_LANE_FELL_BACK, {
        tableName,
        partitionId: raftLaneService.partitionId,
        error: error?.message || String(error),
      });
    }
  }
  const targets = initializedCandidates;
  const results = [];
  for (const target of targets) {
    const result = await submitRoutedMutationHop(service,
      CDC_TERMINAL_STAGE.BOOTSTRAP_DIRECT,
      () => target.executeLocalQuery(sql, params),
      results.at(-1) ?? issuedLane.answer);
    results.push(result);
    if (!result || result.success === false) {
      throw new Error(
        result?.error ||
          `Direct partition write failed for table: ${tableName}`,
      );
    }
  }
  return results[0];
}

export {executeBootstrapDirectSql};
