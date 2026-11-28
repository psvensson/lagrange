import {splitDescriptorIntentFields} from '../query/split-descriptor-delivery-fields.js';
import {carriesSplitDescriptorIntent} from '../partition/partition-split-descriptor-command.js';
/**
 * The bootstrap-mode path of the CDC integration service (the seed's
 * registration window): reads on the local partition replica, writes through
 * raft on the local leader. Every hop to a partition passes the owner's
 * terminal gate (submitRoutedMutationHop).
 */

import {deriveParticipantEntryId} from '../query/distributed/distributed-write-coordinator.js';
import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {CDC_TERMINAL_STAGE} from './cdc-constants.js';
import {
  normalizeLocalSystemTableWriteResult,
} from './cdc-integration-service-authoritative-read-flow.js';
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

// The local partition a bootstrap-mode statement runs on: its table's initial
// partition, else the services declaring the table; the leader first.
function resolveBootstrapDirectPartition(service, sql) {
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
  return {tableName, partitionService};
}

async function executeBootstrapDirectSql(service, sql, params = [], options = {}) {
  if (!service.bootstrapMode || !service.localPartitionServices) {
    throw new Error(CDC_LOG_MSG.BOOTSTRAP_MODE_REQUIRED_FOR_DIRECT_SQL);
  }

  const {tableName, partitionService} = resolveBootstrapDirectPartition(service, sql);
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
  // A write rides raft only: the local leader carries the append (or the
  // first candidate, whose proposal forwards to the known leader), and its
  // answer - applied, or a typed failure - is the write's answer, with the
  // partition's `changes` count rendered to the CDC boundary's `affectedRows`
  // by the same normalizer the local-leader leg uses. No statement is
  // executed outside raft: a replica absent from such an execution diverges
  // for good, and a statement whose raft entry still commits would apply
  // twice (R11: no fallback).
  return normalizeLocalSystemTableWriteResult(
    await submitRoutedMutationHop(service, CDC_TERMINAL_STAGE.BOOTSTRAP_DIRECT,
      () => carriesSplitDescriptorIntent(options) ?
        partitionService.executeQuery(sql, params, {
          ...splitDescriptorIntentFields(options), idempotencyKey: options.idempotencyKey,
          entryId: deriveParticipantEntryId(options.idempotencyKey, partitionService.partitionId),
        }) : partitionService.executeQuery(sql, params)));
}

export {executeBootstrapDirectSql};
