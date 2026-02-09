/**
 * Bootstrap Phases - Modular phase classes for bootstrap process.
 *
 * Seed Node Phases:
 * 1. InfrastructurePhase - NodeService and MessageRouter
 * 2. MessageGroupPhase - Initial message group replicas
 * 3. PartitionPhase - System table partitions
 * 4. RegistrationPhase - Service registration in system tables
 * 5. CacheHydrationPhase - Populate system cache and create SQLQueryEngine
 *
 * Joining Node Phases:
 * 1. ContactSeedPhase - Contact seed node via HTTP
 * 2. ConnectWebSocketPhase - Establish WebSocket connectivity
 * 3. JoinMessageGroupPhase - Create or join message group
 */

// Seed node phases
export {InfrastructurePhase, INFRASTRUCTURE_PHASE} from './infrastructure-phase.js';
export {MessageGroupPhase, MESSAGE_GROUP_PHASE} from './message-group-phase.js';
export {PartitionPhase, PARTITION_PHASE} from './partition-phase.js';
export {RegistrationPhase, REGISTRATION_PHASE} from './registration-phase.js';
export {CacheHydrationPhase, CACHE_HYDRATION_PHASE} from './cache-hydration-phase.js';

// Joining node phases
export {ContactSeedPhase, CONTACT_SEED_PHASE} from './contact-seed-phase.js';
export {ConnectWebSocketPhase, CONNECT_WEBSOCKET_PHASE} from './connect-websocket-phase.js';
export {JoinMessageGroupPhase, JOIN_MESSAGE_GROUP_PHASE} from './join-message-group-phase.js';
