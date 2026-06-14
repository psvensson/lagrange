/**
 * Message Group Service - runtime raft timing reconfiguration and committed
 * log-entry application to the local state machine.
 * Requirements: 6.1, 6.2, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4
 */
import {NUM, TYPEOF} from '../constants/index.js';
import {
  RAFT_ELECTION_TIMING,
} from '../raft/constants.js';
import {
  applyRuntimeRaftTiming,
  computeReplicaElectionTimeouts,
} from '../raft/raft-timing-utils.js';
import {normalizeCauseId} from '../utils/cause-id.js';
import {
  CDC_BATCH_COMMAND_TYPE,
  MESSAGE_GROUP_SERVICE_LITERAL,
} from './message-group-service-runtime-support.js';

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
      const heartbeatMs = timingConfig.heartbeatIntervalMs;
      const baseElectionMinMs = timingConfig.electionTimeoutMinMs;
      const baseElectionMaxMs = timingConfig.electionTimeoutMaxMs;
      const previousTickIntervalMs =
        this.raftTimingConfig?.tickIntervalMs || null;
      const hasTickInterval = Object.prototype.hasOwnProperty.call(
        timingConfig,
        'tickIntervalMs',
      );
      const tickIntervalMs = timingConfig.tickIntervalMs;
      if (
        !Number.isFinite(heartbeatMs) ||
        !Number.isFinite(baseElectionMinMs) ||
        !Number.isFinite(baseElectionMaxMs) ||
        (hasTickInterval &&
          (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= NUM.ZERO)) ||
        baseElectionMinMs > baseElectionMaxMs
      ) {
        return false;
      }
      const {electionMinMs, electionMaxMs, jitterMs} =
        computeReplicaElectionTimeouts({
          replicaId: this.replicaId,
          replicaIds: this.replicaIds,
          baseElectionMinMs,
          baseElectionMaxMs,
          electionJitterPerReplicaMs:
            RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
        });
      this.raftTimingConfig = {
        heartbeatMs,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionMinMs,
        electionMaxMs,
        tickIntervalMs: hasTickInterval ?
          tickIntervalMs :
          this.raftTimingConfig?.tickIntervalMs || null,
      };
      const shouldRearmTimer =
        this.replicaIds.length > NUM.ONE &&
        (!this.deferElection || this.electionStarted);
      const applied = applyRuntimeRaftTiming({
        raft: this.raft,
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
     * Apply raft provider tick interval when supported by the active provider.
     * @param {number} tickIntervalMs
     * @return {boolean} True when applied to a live raft instance.
     */
    applyRuntimeTickInterval(tickIntervalMs) {
      if (
        !this.raft ||
        !Number.isFinite(tickIntervalMs) ||
        tickIntervalMs <= NUM.ZERO
      ) {
        return false;
      }
      if (typeof this.raft.setTickInterval === TYPEOF.FUNCTION) {
        this.raft.setTickInterval(tickIntervalMs);
        return true;
      }
      if (typeof this.raft.configureTickInterval === TYPEOF.FUNCTION) {
        this.raft.configureTickInterval(tickIntervalMs);
        return true;
      }
      if (
        Object.prototype.hasOwnProperty.call(
          this.raft,
          MESSAGE_GROUP_SERVICE_LITERAL.TICKINTERVALMS,
        )
      ) {
        this.raft.tickIntervalMs = tickIntervalMs;
        return true;
      }
      return false;
    },
    /**
     * Apply a committed entry to the state machine.
     * This is called by liferaft when an entry is committed.
     * Requirements: 6.1, 6.2, 6.4, 6.5
     * @param {Object} command - The committed command
     */
    applyCommittedEntry(command) {
      if (!command || !command.type) {
        return;
      }
      switch (command.type) {
      case MESSAGE_GROUP_SERVICE_LITERAL.MESSAGE:
        // Handle message persistence - already tracked in pendingMessages
        break;
      case MESSAGE_GROUP_SERVICE_LITERAL.CDC:
        this.cdcHandler.applyImmediate(
          {
            tableName: command.tableName,
            operation: command.operation,
            data: command.data,
            timestamp: command.timestamp || this.hlcClock.now().toString(),
            causeId: normalizeCauseId(command.causeId),
          },
          {skipSubscriptionCheck: true},
        );
        this.emit(MESSAGE_GROUP_SERVICE_LITERAL.CDCAPPLIED, command);
        break;
      case CDC_BATCH_COMMAND_TYPE:
        for (const event of this.normalizeCDCBatchEvents(command.events)) {
          this.cdcHandler.applyImmediate(
            {
              tableName: event.tableName,
              operation: event.operation,
              data: event.data,
              timestamp: event.timestamp,
              causeId: normalizeCauseId(event.causeId),
            },
            {skipSubscriptionCheck: true},
          );
          this.emit(MESSAGE_GROUP_SERVICE_LITERAL.CDCAPPLIED, {
            tableName: event.tableName,
            operation: event.operation,
            data: event.data,
            logIndex: command.index || null,
            causeId: normalizeCauseId(event.causeId),
          });
        }
        break;
      case MESSAGE_GROUP_SERVICE_LITERAL.ACK:
        // Handle acknowledgment
        this.acknowledgedMessages.add(command.messageId);
        break;
      }
    },
  });
}

export {assignRaftTiming};
