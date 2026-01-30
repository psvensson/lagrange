import {BOOTSTRAP_PHASE, BOOTSTRAP_SUBSYSTEM} from './bootstrap-constants.js';
import {STRING} from '../constants/index.js';

const BOOTSTRAP_TRACKER_SUBSYSTEM = BOOTSTRAP_SUBSYSTEM.TRACKER;

const BOOTSTRAP_TRACKER_EVENT = Object.freeze({
  TRACKING_STARTED: 'trackingStarted',
  PHASE_TRANSITION: 'phaseTransition',
  SERVICE_CREATED: 'serviceCreated',
  ERROR: 'error',
  TRACKING_COMPLETE: 'trackingComplete',
  RAFT_STATE_CHANGE: 'raftStateChange',
});

const BOOTSTRAP_TRACKER_LOG_MSG = Object.freeze({
  TRACKING_STARTED: 'Bootstrap tracking started',
  PHASE_TRANSITION: 'Bootstrap phase transition',
  RAFT_STATE_CHANGE: 'Raft state change',
  SERVICE_CREATED: 'Service created during bootstrap',
  ERROR: 'Bootstrap error',
  TRACKING_COMPLETE: 'Bootstrap completed successfully',
  TRACKING_FAILED: 'Bootstrap failed',
});

const BOOTSTRAP_TRACKER_PHASE_DESCRIPTION = Object.freeze({
  [BOOTSTRAP_PHASE.NOT_STARTED]: 'Bootstrap not started',
  [BOOTSTRAP_PHASE.INFRASTRUCTURE]: 'Setting up infrastructure (config, transport)',
  [BOOTSTRAP_PHASE.MESSAGE_GROUPS]: 'Creating message group replicas',
  [BOOTSTRAP_PHASE.PARTITIONS]: 'Creating system table partitions',
  [BOOTSTRAP_PHASE.REGISTRATION]: 'Registering services in system tables',
  [BOOTSTRAP_PHASE.COMPLETE]: 'Bootstrap completed successfully',
  [BOOTSTRAP_PHASE.FAILED]: 'Bootstrap failed',
});

const BOOTSTRAP_TRACKER_ERROR_MSG = Object.freeze({
  LOGGER_UNAVAILABLE: 'Logging not available',
  UNKNOWN_NODE_ID: STRING.UNKNOWN,
});

export {
  BOOTSTRAP_TRACKER_SUBSYSTEM,
  BOOTSTRAP_TRACKER_EVENT,
  BOOTSTRAP_TRACKER_LOG_MSG,
  BOOTSTRAP_TRACKER_PHASE_DESCRIPTION,
  BOOTSTRAP_TRACKER_ERROR_MSG,
};
