/**
 * Message Group Service - runtime raft timing reconfiguration through the
 * operation port, and committed-entry application to the local state
 * machine (the system-table cache).
 * Requirements: 6.1, 6.2, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4
 */
import {CONFIG_KEY} from '../config/config-constants.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {RAFT_ELECTION_TIMING} from '../raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {computeReplicaElectionTimeouts} from
  '../raft/replica-election-timeouts.js';
import {normalizeCauseId} from '../utils/cause-id.js';
import {
  MESSAGE_GROUP_COMMAND_TYPE,
  MESSAGE_GROUP_SERVICE_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_LOG_MSG,
} from './constants.js';
import {isMessageGroupCommandType} from
  './message-group-committed-command-admission.js';
import {MESSAGE_GROUP_SERVICE_LITERAL} from
  './message-group-service-runtime-support.js';

/**
 * The replica's timing at initialization: the configured heartbeat and
 * election window, with this replica's election jitter applied.
 * @param {Object} service - The message-group replica.
 * @return {Object} {heartbeatMs, baseElectionMinMs, baseElectionMaxMs,
 *   electionMinMs, electionMaxMs, tickIntervalMs}.
 */
function resolveMessageGroupRaftTiming(service) {
  const config = ConfigurationManager.getInstance();
  const heartbeatMs =
    config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) ||
    RAFT_ELECTION_TIMING.HEARTBEAT_DEFAULT_MS;
  const baseElectionMinMs =
    config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) ||
    RAFT_ELECTION_TIMING.ELECTION_MIN_DEFAULT_MS;
  const baseElectionMaxMs =
    config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) ||
    RAFT_ELECTION_TIMING.ELECTION_MAX_DEFAULT_MS;
  const tickIntervalMs = config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS);
  const {electionMinMs, electionMaxMs} = computeReplicaElectionTimeouts({
    replicaId: service.replicaId,
    replicaIds: service.replicaIds,
    baseElectionMinMs,
    baseElectionMaxMs,
    electionJitterPerReplicaMs: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
  });
  return {
    heartbeatMs,
    baseElectionMinMs,
    baseElectionMaxMs,
    electionMinMs,
    electionMaxMs,
    tickIntervalMs: Number.isFinite(tickIntervalMs) ? tickIntervalMs : null,
  };
}

function isValidTimingConfig(timingConfig, hasTickInterval) {
  const tickIntervalMs = timingConfig.tickIntervalMs;
  return Number.isFinite(timingConfig.heartbeatIntervalMs) &&
    Number.isFinite(timingConfig.electionTimeoutMinMs) &&
    Number.isFinite(timingConfig.electionTimeoutMaxMs) &&
    (!hasTickInterval ||
      (Number.isFinite(tickIntervalMs) && tickIntervalMs > 0)) &&
    timingConfig.electionTimeoutMinMs <= timingConfig.electionTimeoutMaxMs;
}

// One committed CDC change applied to the system-table cache. Its applied
// announcement runs once the entry's transaction has committed, and reports
// its own failure: an announcement cannot reverse what committed.
function applyCommittedCdcChange(service, change, {index, effects},
  announcement) {
  service.cdcHandler.applyImmediate(change, {skipSubscriptionCheck: true});
  effects.afterCommit.push(() => {
    try {
      service.emit(MESSAGE_GROUP_SERVICE_LITERAL.CDCAPPLIED, announcement);
    } catch (error) {
      service.logger.error(
        MESSAGE_GROUP_SERVICE_LOG_MSG.COMMITTED_ENTRY_EFFECT_FAILED,
        {groupId: service.groupId, logIndex: index, error: error.message},
      );
    }
  });
}

const COMMITTED_COMMAND_APPLICATION = Object.freeze({
  // A message is tracked by its pending delivery; its entry is the record.
  [MESSAGE_GROUP_COMMAND_TYPE.MESSAGE]: () => {},
  [MESSAGE_GROUP_COMMAND_TYPE.CDC]: (service, committed) => {
    const command = committed.command;
    applyCommittedCdcChange(service, {
      tableName: command.tableName,
      operation: command.operation,
      data: command.data,
      timestamp: command.timestamp || service.hlcClock.now().toString(),
      causeId: normalizeCauseId(command.causeId),
    }, committed, command);
  },
  [MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH]: (service, committed) => {
    const events = service.normalizeCDCBatchEvents(committed.command.events);
    for (const event of events) {
      const causeId = normalizeCauseId(event.causeId);
      applyCommittedCdcChange(service, {
        tableName: event.tableName,
        operation: event.operation,
        data: event.data,
        timestamp: event.timestamp,
        causeId,
      }, committed, {
        tableName: event.tableName,
        operation: event.operation,
        data: event.data,
        logIndex: committed.index,
        causeId,
      });
    }
  },
  [MESSAGE_GROUP_COMMAND_TYPE.ACK]: (service, {command}) => {
    service.acknowledgedMessages.add(command.messageId);
  },
});

/**
 * Attach runtime raft-timing reconfiguration and committed-entry application
 * to the MessageGroupService prototype.
 * @param {Function} serviceClass - The MessageGroupService class.
 * @return {void}
 */
function assignRaftTiming(serviceClass) {
  Object.assign(serviceClass.prototype, {
    /**
     * Apply raft timing configuration to this live replica.
     * @param {Object} timingConfig
     * @param {number} timingConfig.heartbeatIntervalMs
     * @param {number} timingConfig.electionTimeoutMinMs
     * @param {number} timingConfig.electionTimeoutMaxMs
     * @param {number} [timingConfig.tickIntervalMs]
     * @return {boolean} True when applied to an initialized raft instance.
     */
    applyRaftTimingConfig(timingConfig = {}) {
      const previousTickIntervalMs =
        this.raftTimingConfig?.tickIntervalMs || null;
      const hasTickInterval = Object.prototype.hasOwnProperty.call(
        timingConfig,
        'tickIntervalMs',
      );
      if (!isValidTimingConfig(timingConfig, hasTickInterval)) {
        return false;
      }
      const heartbeatMs = timingConfig.heartbeatIntervalMs;
      const tickIntervalMs = timingConfig.tickIntervalMs;
      const {electionMinMs, electionMaxMs, jitterMs} =
        computeReplicaElectionTimeouts({
          replicaId: this.replicaId,
          replicaIds: this.replicaIds,
          baseElectionMinMs: timingConfig.electionTimeoutMinMs,
          baseElectionMaxMs: timingConfig.electionTimeoutMaxMs,
          electionJitterPerReplicaMs:
            RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
        });
      this.raftTimingConfig = {
        heartbeatMs,
        baseElectionMinMs: timingConfig.electionTimeoutMinMs,
        baseElectionMaxMs: timingConfig.electionTimeoutMaxMs,
        electionMinMs,
        electionMaxMs,
        tickIntervalMs: hasTickInterval ?
          tickIntervalMs :
          this.raftTimingConfig?.tickIntervalMs || null,
      };
      const shouldRearmTimer =
        this.replicaIds.length > 1 &&
        (!this.deferElection || this.electionStarted);
      const applied = this.raft?.configureTick?.({
        heartbeatMs,
        electionMinMs,
        electionMaxMs,
        rearmTimer: shouldRearmTimer,
      });
      if (!applied) {
        return false;
      }
      const tickChanged =
        hasTickInterval && tickIntervalMs !== previousTickIntervalMs;
      const tickRuntimeApplied =
        !tickChanged || this.applyRuntimeTickInterval(tickIntervalMs);
      this.logger.info(
        MESSAGE_GROUP_SERVICE_LITERAL.APPLIED_RUNTIME_RAFT_TIMING_CONFIGURATION,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          heartbeatMs,
          electionMinMs,
          electionMaxMs,
          tickIntervalMs: hasTickInterval ? tickIntervalMs : null,
          tickRuntimeApplied,
          jitterMs,
          rearmTimer: shouldRearmTimer,
        },
      );
      return tickRuntimeApplied;
    },
    /**
     * Apply a tick interval to the live port.
     * @param {number} tickIntervalMs
     * @return {boolean} True when the port took it.
     */
    applyRuntimeTickInterval(tickIntervalMs) {
      if (
        !this.raft ||
        !Number.isFinite(tickIntervalMs) ||
        tickIntervalMs <= 0
      ) {
        return false;
      }
      const result = this.raft.configureTick({tickIntervalMs});
      return result === true ||
        result?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK;
    },
    /**
     * Apply one committed entry to the state machine, inside the
     * transaction that advances the replica's applied state. Synchronous:
     * every announcement is an effect that runs after that transaction
     * commits. A committed type the committed-command owner never admits
     * fails the application (the group's host failure) rather than being
     * skipped.
     * Requirements: 6.1, 6.2, 6.4, 6.5
     * @param {Object} committed - {command, index, term, effects}.
     * @return {void}
     */
    applyCommittedEntry(committed) {
      const type = committed.command?.type;
      if (!isMessageGroupCommandType(type)) {
        throw new Error(
          `${MESSAGE_GROUP_SERVICE_ERROR_MSG.UNKNOWN_COMMITTED_COMMAND}: ` +
          `${JSON.stringify(type ?? null)} at index ${committed.index}`);
      }
      COMMITTED_COMMAND_APPLICATION[type](this, committed);
    },
  });
}

export {assignRaftTiming, resolveMessageGroupRaftTiming};
