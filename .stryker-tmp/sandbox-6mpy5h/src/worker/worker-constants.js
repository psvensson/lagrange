/**
 * Worker process isolation constants for replica worker management.
 *
 * This module defines constants for worker process operations, status values,
 * events, and error messages used by ReplicaWorkerManager, WorkerMessageBridge,
 * and the worker entry point (replica-worker.js).
 *
 * @module worker/worker-constants
 * @see Requirements 5.1, 5.2, 5.3 - Worker Process Lifecycle Management
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM, SUBSYSTEM, TIME_MS } from '../constants/index.js';

/**
 * Subsystem identifier for worker process logging.
 * @type {string}
 * @see src/constants/subsystems.js - Centralized subsystem identifiers
 */
const WORKER_SUBSYSTEM = SUBSYSTEM.WORKER;

/**
 * Worker operation types sent to worker processes.
 * These operations are handled by the replica-worker.js entry point.
 *
 * @type {Readonly<Object>}
 * @see Requirements 5.2, 5.3, 5.4, 5.5
 */
const WORKER_OPERATION = Object.freeze(stryMutAct_9fa48("166252") ? {} : (stryCov_9fa48("166252"), {
  /** Create a new partition replica in the worker process */
  CREATE_PARTITION_REPLICA: stryMutAct_9fa48("166253") ? "" : (stryCov_9fa48("166253"), 'CREATE_PARTITION_REPLICA'),
  /** Create a new message group replica in the worker process */
  CREATE_MESSAGE_GROUP_REPLICA: stryMutAct_9fa48("166254") ? "" : (stryCov_9fa48("166254"), 'CREATE_MESSAGE_GROUP_REPLICA'),
  /** Stop and cleanup a replica in the worker process */
  STOP_REPLICA: stryMutAct_9fa48("166255") ? "" : (stryCov_9fa48("166255"), 'STOP_REPLICA'),
  /** Deliver a message to a replica in the worker process */
  DELIVER_MESSAGE: stryMutAct_9fa48("166256") ? "" : (stryCov_9fa48("166256"), 'DELIVER_MESSAGE'),
  /** Health check request to verify worker is responsive */
  HEALTH_CHECK: stryMutAct_9fa48("166257") ? "" : (stryCov_9fa48("166257"), 'HEALTH_CHECK')
}));

/**
 * Worker process status values.
 * Tracks the lifecycle state of a worker process.
 *
 * @type {Readonly<Object>}
 * @see Requirements 5.6
 */
const WORKER_STATUS = Object.freeze(stryMutAct_9fa48("166258") ? {} : (stryCov_9fa48("166258"), {
  /** Worker process is being spawned */
  STARTING: stryMutAct_9fa48("166259") ? "" : (stryCov_9fa48("166259"), 'starting'),
  /** Worker process is running and ready */
  RUNNING: stryMutAct_9fa48("166260") ? "" : (stryCov_9fa48("166260"), 'running'),
  /** Worker process is shutting down */
  STOPPING: stryMutAct_9fa48("166261") ? "" : (stryCov_9fa48("166261"), 'stopping'),
  /** Worker process has terminated */
  STOPPED: stryMutAct_9fa48("166262") ? "" : (stryCov_9fa48("166262"), 'stopped')
}));

/**
 * Worker lifecycle event names.
 * Emitted by ReplicaWorkerBase during state transitions.
 *
 * @type {Readonly<Object>}
 * @see Requirements 6.5
 */
const WORKER_EVENT = Object.freeze(stryMutAct_9fa48("166263") ? {} : (stryCov_9fa48("166263"), {
  /** Worker has completed initialization */
  INITIALIZED: stryMutAct_9fa48("166264") ? "" : (stryCov_9fa48("166264"), 'initialized'),
  /** Worker has started and is ready to process messages */
  STARTED: stryMutAct_9fa48("166265") ? "" : (stryCov_9fa48("166265"), 'started'),
  /** Worker has stopped gracefully */
  STOPPED: stryMutAct_9fa48("166266") ? "" : (stryCov_9fa48("166266"), 'stopped'),
  /** Worker has failed with an error */
  FAILED: stryMutAct_9fa48("166267") ? "" : (stryCov_9fa48("166267"), 'failed'),
  /** A replica has been created in a worker process */
  REPLICA_CREATED: stryMutAct_9fa48("166268") ? "" : (stryCov_9fa48("166268"), 'replica_created'),
  /** A replica has been stopped in a worker process */
  REPLICA_STOPPED: stryMutAct_9fa48("166269") ? "" : (stryCov_9fa48("166269"), 'replica_stopped'),
  /** A replica has failed in a worker process */
  REPLICA_FAILED: stryMutAct_9fa48("166270") ? "" : (stryCov_9fa48("166270"), 'replica_failed')
}));

/**
 * Worker health status values.
 * Used by ReplicaWorkerManager for health monitoring.
 *
 * @type {Readonly<Object>}
 * @see Requirements 5.6
 */
const WORKER_HEALTH_STATUS = Object.freeze(stryMutAct_9fa48("166271") ? {} : (stryCov_9fa48("166271"), {
  /** Worker is responding to health checks */
  HEALTHY: stryMutAct_9fa48("166272") ? "" : (stryCov_9fa48("166272"), 'healthy'),
  /** Worker is not responding or has errors */
  UNHEALTHY: stryMutAct_9fa48("166273") ? "" : (stryCov_9fa48("166273"), 'unhealthy'),
  /** Worker health status is not yet determined */
  UNKNOWN: stryMutAct_9fa48("166274") ? "" : (stryCov_9fa48("166274"), 'unknown')
}));

/**
 * Worker message types for IPC communication.
 * Used by WorkerMessageBridge for message envelope typing.
 *
 * @type {Readonly<Object>}
 * @see Requirements 7.1, 7.2, 7.3
 */
const WORKER_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("166275") ? {} : (stryCov_9fa48("166275"), {
  /** Request message expecting a response */
  REQUEST: stryMutAct_9fa48("166276") ? "" : (stryCov_9fa48("166276"), 'request'),
  /** Response to a previous request */
  RESPONSE: stryMutAct_9fa48("166277") ? "" : (stryCov_9fa48("166277"), 'response'),
  /** One-way event notification */
  EVENT: stryMutAct_9fa48("166278") ? "" : (stryCov_9fa48("166278"), 'event')
}));

/**
 * Worker entity types for unified address format.
 *
 * @type {Readonly<Object>}
 * @see Requirements 7.4
 */
const WORKER_ENTITY_TYPE = Object.freeze(stryMutAct_9fa48("166279") ? {} : (stryCov_9fa48("166279"), {
  /** Partition replica entity */
  PARTITION: stryMutAct_9fa48("166280") ? "" : (stryCov_9fa48("166280"), 'partition'),
  /** Message group replica entity */
  MESSAGE_GROUP: stryMutAct_9fa48("166281") ? "" : (stryCov_9fa48("166281"), 'message-group')
}));

/**
 * Cache message types for SystemCacheProxy communication.
 * Used for querying system cache data from message group workers.
 *
 * @type {Readonly<Object>}
 * @see Requirements 9.1, 9.2
 */
const CACHE_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("166282") ? {} : (stryCov_9fa48("166282"), {
  /** Get a single record by key */
  CACHE_GET: stryMutAct_9fa48("166283") ? "" : (stryCov_9fa48("166283"), 'CACHE_GET'),
  /** Response to CACHE_GET */
  CACHE_GET_RESPONSE: stryMutAct_9fa48("166284") ? "" : (stryCov_9fa48("166284"), 'CACHE_GET_RESPONSE'),
  /** Execute SQL query on cache */
  CACHE_QUERY: stryMutAct_9fa48("166285") ? "" : (stryCov_9fa48("166285"), 'CACHE_QUERY'),
  /** Response to CACHE_QUERY */
  CACHE_QUERY_RESPONSE: stryMutAct_9fa48("166286") ? "" : (stryCov_9fa48("166286"), 'CACHE_QUERY_RESPONSE'),
  /** Filter records by predicate */
  CACHE_FILTER: stryMutAct_9fa48("166287") ? "" : (stryCov_9fa48("166287"), 'CACHE_FILTER'),
  /** Response to CACHE_FILTER */
  CACHE_FILTER_RESPONSE: stryMutAct_9fa48("166288") ? "" : (stryCov_9fa48("166288"), 'CACHE_FILTER_RESPONSE'),
  /** Get all records from a table */
  CACHE_GET_ALL: stryMutAct_9fa48("166289") ? "" : (stryCov_9fa48("166289"), 'CACHE_GET_ALL'),
  /** Response to CACHE_GET_ALL */
  CACHE_GET_ALL_RESPONSE: stryMutAct_9fa48("166290") ? "" : (stryCov_9fa48("166290"), 'CACHE_GET_ALL_RESPONSE')
}));

/**
 * Leadership status message types.
 * Used for querying Raft leadership status from workers.
 *
 * @type {Readonly<Object>}
 * @see Requirements 10.4
 */
const LEADERSHIP_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("166291") ? {} : (stryCov_9fa48("166291"), {
  /** Query leadership status */
  GET_LEADERSHIP_STATUS: stryMutAct_9fa48("166292") ? "" : (stryCov_9fa48("166292"), 'GET_LEADERSHIP_STATUS'),
  /** Response with leadership status */
  LEADERSHIP_STATUS: stryMutAct_9fa48("166293") ? "" : (stryCov_9fa48("166293"), 'LEADERSHIP_STATUS')
}));

/**
 * Facade message types for thin facade delegation.
 * Used by main-process facades (PartitionService, MessageGroupService)
 * to delegate operations to worker processes.
 *
 * @type {Readonly<Object>}
 * @see Requirements 4.1, 4.2, 4.3, 4.4
 */
const FACADE_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("166294") ? {} : (stryCov_9fa48("166294"), {
  /** Execute a SQL query on the worker */
  QUERY: stryMutAct_9fa48("166295") ? "" : (stryCov_9fa48("166295"), 'QUERY'),
  /** Legacy alias for query execution used by integration tests */
  EXECUTE_QUERY: stryMutAct_9fa48("166296") ? "" : (stryCov_9fa48("166296"), 'EXECUTE_QUERY'),
  /** Start Raft election on the worker */
  START_ELECTION: stryMutAct_9fa48("166297") ? "" : (stryCov_9fa48("166297"), 'START_ELECTION'),
  /** Forward a write operation to the worker */
  FORWARD_WRITE: stryMutAct_9fa48("166298") ? "" : (stryCov_9fa48("166298"), 'FORWARD_WRITE'),
  /** System table write operation */
  SYSTEM_TABLE_WRITE: stryMutAct_9fa48("166299") ? "" : (stryCov_9fa48("166299"), 'SYSTEM_TABLE_WRITE'),
  /** Send a message via the message group worker */
  SEND_MESSAGE: stryMutAct_9fa48("166300") ? "" : (stryCov_9fa48("166300"), 'SEND_MESSAGE'),
  /** Receive/handle a message via the message group worker */
  RECEIVE_MESSAGE: stryMutAct_9fa48("166301") ? "" : (stryCov_9fa48("166301"), 'RECEIVE_MESSAGE')
}));

/**
 * CDC subscription message types.
 * Used for message-based CDC subscription management.
 *
 * @type {Readonly<Object>}
 * @see Requirements 10.5, 10.6
 */
const CDC_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("166302") ? {} : (stryCov_9fa48("166302"), {
  /** Subscribe to CDC events from a partition */
  SUBSCRIBE_CDC: stryMutAct_9fa48("166303") ? "" : (stryCov_9fa48("166303"), 'SUBSCRIBE_CDC'),
  /** Unsubscribe from CDC events */
  UNSUBSCRIBE_CDC: stryMutAct_9fa48("166304") ? "" : (stryCov_9fa48("166304"), 'UNSUBSCRIBE_CDC'),
  /** CDC event notification */
  CDC_EVENT: stryMutAct_9fa48("166305") ? "" : (stryCov_9fa48("166305"), 'CDC_EVENT')
}));

/**
 * Seed cache message types.
 * Used during seed node bootstrap to populate initial system cache
 * before partitions exist.
 *
 * @type {Readonly<Object>}
 * @see Requirements 12.4, 12.5, 12.6
 */
const SEED_CACHE_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("166306") ? {} : (stryCov_9fa48("166306"), {
  /** Seed cache request (sent to message group leader during bootstrap) */
  SEED_CACHE: stryMutAct_9fa48("166307") ? "" : (stryCov_9fa48("166307"), 'SEED_CACHE'),
  /** Seed cache response */
  SEED_CACHE_RESPONSE: stryMutAct_9fa48("166308") ? "" : (stryCov_9fa48("166308"), 'SEED_CACHE_RESPONSE'),
  /** Set bootstrap phase flag (sent after partitions are created) */
  SET_BOOTSTRAP_PHASE: stryMutAct_9fa48("166309") ? "" : (stryCov_9fa48("166309"), 'SET_BOOTSTRAP_PHASE')
}));

/**
 * Join message types for node joining bootstrap protocol.
 * Used when a new node joins the cluster via WebSocket connection to seed node.
 *
 * @type {Readonly<Object>}
 * @see Requirements 13.1, 13.2, 13.3, 13.7
 */
const JOIN_MESSAGE_TYPE = Object.freeze(stryMutAct_9fa48("166310") ? {} : (stryCov_9fa48("166310"), {
  /** Join request sent by joining node to seed node with nodeId and address */
  JOIN_REQUEST: stryMutAct_9fa48("166311") ? "" : (stryCov_9fa48("166311"), 'JOIN_REQUEST'),
  /** Join response from seed node with message group assignment and Raft peers */
  JOIN_RESPONSE: stryMutAct_9fa48("166312") ? "" : (stryCov_9fa48("166312"), 'JOIN_RESPONSE'),
  /** Join complete sent by joining node after message group replica is ready */
  JOIN_COMPLETE: stryMutAct_9fa48("166313") ? "" : (stryCov_9fa48("166313"), 'JOIN_COMPLETE'),
  /** Join complete acknowledgment from seed node with next steps */
  JOIN_COMPLETE_ACK: stryMutAct_9fa48("166314") ? "" : (stryCov_9fa48("166314"), 'JOIN_COMPLETE_ACK')
}));

/**
 * Worker log messages for consistent logging.
 *
 * @type {Readonly<Object>}
 */
const WORKER_LOG_MSG = Object.freeze(stryMutAct_9fa48("166315") ? {} : (stryCov_9fa48("166315"), {
  // Lifecycle messages
  INITIALIZING: stryMutAct_9fa48("166316") ? "" : (stryCov_9fa48("166316"), 'Initializing worker process'),
  INITIALIZED: stryMutAct_9fa48("166317") ? "" : (stryCov_9fa48("166317"), 'Worker process initialized'),
  STARTING: stryMutAct_9fa48("166318") ? "" : (stryCov_9fa48("166318"), 'Starting worker process'),
  STARTED: stryMutAct_9fa48("166319") ? "" : (stryCov_9fa48("166319"), 'Worker process started'),
  STOPPING: stryMutAct_9fa48("166320") ? "" : (stryCov_9fa48("166320"), 'Stopping worker process'),
  STOPPED: stryMutAct_9fa48("166321") ? "" : (stryCov_9fa48("166321"), 'Worker process stopped'),
  FAILED: stryMutAct_9fa48("166322") ? "" : (stryCov_9fa48("166322"), 'Worker process failed'),
  // Operation messages
  OPERATION_RECEIVED: stryMutAct_9fa48("166323") ? "" : (stryCov_9fa48("166323"), 'Worker operation received'),
  OPERATION_COMPLETED: stryMutAct_9fa48("166324") ? "" : (stryCov_9fa48("166324"), 'Worker operation completed'),
  OPERATION_FAILED: stryMutAct_9fa48("166325") ? "" : (stryCov_9fa48("166325"), 'Worker operation failed'),
  // Health check messages
  HEALTH_CHECK_RECEIVED: stryMutAct_9fa48("166326") ? "" : (stryCov_9fa48("166326"), 'Health check received'),
  HEALTH_CHECK_PASSED: stryMutAct_9fa48("166327") ? "" : (stryCov_9fa48("166327"), 'Health check passed'),
  HEALTH_CHECK_FAILED: stryMutAct_9fa48("166328") ? "" : (stryCov_9fa48("166328"), 'Health check failed'),
  // Message bridge messages
  REGISTERING: stryMutAct_9fa48("166329") ? "" : (stryCov_9fa48("166329"), 'Registering worker with message router'),
  REGISTERED: stryMutAct_9fa48("166330") ? "" : (stryCov_9fa48("166330"), 'Worker registered with message router'),
  UNREGISTERING: stryMutAct_9fa48("166331") ? "" : (stryCov_9fa48("166331"), 'Unregistering worker from message router'),
  UNREGISTERED: stryMutAct_9fa48("166332") ? "" : (stryCov_9fa48("166332"), 'Worker unregistered from message router'),
  MESSAGE_RECEIVED: stryMutAct_9fa48("166333") ? "" : (stryCov_9fa48("166333"), 'Message received from main process'),
  MESSAGE_SENT: stryMutAct_9fa48("166334") ? "" : (stryCov_9fa48("166334"), 'Message sent to main process'),
  // Replica messages
  CREATING_PARTITION_REPLICA: stryMutAct_9fa48("166335") ? "" : (stryCov_9fa48("166335"), 'Creating partition replica in worker'),
  PARTITION_REPLICA_CREATED: stryMutAct_9fa48("166336") ? "" : (stryCov_9fa48("166336"), 'Partition replica created in worker'),
  CREATING_MESSAGE_GROUP_REPLICA: stryMutAct_9fa48("166337") ? "" : (stryCov_9fa48("166337"), 'Creating message group replica in worker'),
  MESSAGE_GROUP_REPLICA_CREATED: stryMutAct_9fa48("166338") ? "" : (stryCov_9fa48("166338"), 'Message group replica created in worker'),
  STOPPING_REPLICA: stryMutAct_9fa48("166339") ? "" : (stryCov_9fa48("166339"), 'Stopping replica in worker'),
  REPLICA_STOPPED: stryMutAct_9fa48("166340") ? "" : (stryCov_9fa48("166340"), 'Replica stopped in worker'),
  // Crash detection messages
  CRASH_DETECTED: stryMutAct_9fa48("166341") ? "" : (stryCov_9fa48("166341"), 'Worker process crash detected'),
  CRASH_CLEANUP: stryMutAct_9fa48("166342") ? "" : (stryCov_9fa48("166342"), 'Cleaning up after worker crash'),
  CRASH_NOTIFIED: stryMutAct_9fa48("166343") ? "" : (stryCov_9fa48("166343"), 'Rebalancer notified of worker crash')
}));

/**
 * Worker error messages for consistent error reporting.
 *
 * @type {Readonly<Object>}
 */
const WORKER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("166344") ? {} : (stryCov_9fa48("166344"), {
  // Initialization errors
  NOT_INITIALIZED: stryMutAct_9fa48("166345") ? "" : (stryCov_9fa48("166345"), 'Worker process not initialized'),
  ALREADY_INITIALIZED: stryMutAct_9fa48("166346") ? "" : (stryCov_9fa48("166346"), 'Worker process already initialized'),
  INITIALIZATION_FAILED: stryMutAct_9fa48("166347") ? "" : (stryCov_9fa48("166347"), 'Worker process initialization failed'),
  // Operation errors
  UNKNOWN_OPERATION: stryMutAct_9fa48("166348") ? "" : (stryCov_9fa48("166348"), 'Unknown worker operation'),
  OPERATION_TIMEOUT: stryMutAct_9fa48("166349") ? "" : (stryCov_9fa48("166349"), 'Worker operation timed out'),
  OPERATION_FAILED: stryMutAct_9fa48("166350") ? "" : (stryCov_9fa48("166350"), 'Worker operation failed'),
  // Message errors
  MESSAGE_SERIALIZATION_FAILED: stryMutAct_9fa48("166351") ? "" : (stryCov_9fa48("166351"), 'Failed to serialize message'),
  MESSAGE_DESERIALIZATION_FAILED: stryMutAct_9fa48("166352") ? "" : (stryCov_9fa48("166352"), 'Failed to deserialize message'),
  MESSAGE_DELIVERY_FAILED: stryMutAct_9fa48("166353") ? "" : (stryCov_9fa48("166353"), 'Failed to deliver message'),
  // Address errors
  ADDRESS_NOT_SET: stryMutAct_9fa48("166354") ? "" : (stryCov_9fa48("166354"), 'Worker unified address not set'),
  // Registration errors (legacy - kept for compatibility)
  REGISTRATION_FAILED: stryMutAct_9fa48("166355") ? "" : (stryCov_9fa48("166355"), 'Failed to register worker with message router'),
  UNREGISTRATION_FAILED: stryMutAct_9fa48("166356") ? "" : (stryCov_9fa48("166356"), 'Failed to unregister worker from message router'),
  ALREADY_REGISTERED: stryMutAct_9fa48("166357") ? "" : (stryCov_9fa48("166357"), 'Worker already registered'),
  NOT_REGISTERED: stryMutAct_9fa48("166358") ? "" : (stryCov_9fa48("166358"), 'Worker not registered'),
  // Replica errors
  REPLICA_CREATION_FAILED: stryMutAct_9fa48("166359") ? "" : (stryCov_9fa48("166359"), 'Failed to create replica in worker'),
  REPLICA_NOT_FOUND: stryMutAct_9fa48("166360") ? "" : (stryCov_9fa48("166360"), 'Replica not found in worker'),
  REPLICA_STOP_FAILED: stryMutAct_9fa48("166361") ? "" : (stryCov_9fa48("166361"), 'Failed to stop replica in worker'),
  REPLICA_ALREADY_EXISTS: stryMutAct_9fa48("166362") ? "" : (stryCov_9fa48("166362"), 'Replica already exists in worker'),
  // Health check errors
  HEALTH_CHECK_TIMEOUT: stryMutAct_9fa48("166363") ? "" : (stryCov_9fa48("166363"), 'Health check timed out'),
  // Timeout error message generators - Requirements 7.1, 7.2
  createReplicaTimeout: stryMutAct_9fa48("166364") ? () => undefined : (stryCov_9fa48("166364"), timeoutMs => stryMutAct_9fa48("166365") ? `` : (stryCov_9fa48("166365"), `CREATE_REPLICA timeout after ${timeoutMs}ms`)),
  operationTimeout: stryMutAct_9fa48("166366") ? () => undefined : (stryCov_9fa48("166366"), (operation, timeoutMs) => stryMutAct_9fa48("166367") ? `` : (stryCov_9fa48("166367"), `${operation} timeout after ${timeoutMs}ms`)),
  // Dynamic error message generators
  unknownOperation: stryMutAct_9fa48("166368") ? () => undefined : (stryCov_9fa48("166368"), operation => stryMutAct_9fa48("166369") ? `` : (stryCov_9fa48("166369"), `Unknown worker operation: ${operation}`)),
  replicaNotFound: stryMutAct_9fa48("166370") ? () => undefined : (stryCov_9fa48("166370"), replicaId => stryMutAct_9fa48("166371") ? `` : (stryCov_9fa48("166371"), `Replica not found: ${replicaId}`)),
  workerNotFound: stryMutAct_9fa48("166372") ? () => undefined : (stryCov_9fa48("166372"), workerId => stryMutAct_9fa48("166373") ? `` : (stryCov_9fa48("166373"), `Worker not found: ${workerId}`)),
  operationFailed: stryMutAct_9fa48("166374") ? () => undefined : (stryCov_9fa48("166374"), (operation, error) => stryMutAct_9fa48("166375") ? `` : (stryCov_9fa48("166375"), `Worker operation ${operation} failed: ${error}`)),
  crashDetected: stryMutAct_9fa48("166376") ? () => undefined : (stryCov_9fa48("166376"), (replicaId, error) => stryMutAct_9fa48("166377") ? `` : (stryCov_9fa48("166377"), `Worker crash detected for replica ${replicaId}: ${error}`))
}));

/**
 * Worker default configuration values.
 *
 * @type {Readonly<Object>}
 */
const WORKER_DEFAULT = Object.freeze(stryMutAct_9fa48("166378") ? {} : (stryCov_9fa48("166378"), {
  /** Default health check interval in milliseconds */
  HEALTH_CHECK_INTERVAL_MS: stryMutAct_9fa48("166379") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("166379"), TIME_MS.SECOND * NUM.FIVE),
  /** Default health check timeout in milliseconds */
  HEALTH_CHECK_TIMEOUT_MS: stryMutAct_9fa48("166380") ? TIME_MS.SECOND / NUM.TWO : (stryCov_9fa48("166380"), TIME_MS.SECOND * NUM.TWO),
  /** Maximum time to detect a crash in milliseconds */
  CRASH_DETECTION_THRESHOLD_MS: stryMutAct_9fa48("166381") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("166381"), TIME_MS.SECOND * NUM.FIVE),
  /** Default operation timeout in milliseconds */
  OPERATION_TIMEOUT_MS: stryMutAct_9fa48("166382") ? TIME_MS.SECOND / NUM.THIRTY : (stryCov_9fa48("166382"), TIME_MS.SECOND * NUM.THIRTY),
  /** Default shutdown timeout in milliseconds */
  SHUTDOWN_TIMEOUT_MS: stryMutAct_9fa48("166383") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("166383"), TIME_MS.SECOND * NUM.TEN)
}));

/**
 * Worker response status values.
 *
 * @type {Readonly<Object>}
 */
const WORKER_RESPONSE_STATUS = Object.freeze(stryMutAct_9fa48("166384") ? {} : (stryCov_9fa48("166384"), {
  /** Operation completed successfully */
  OK: stryMutAct_9fa48("166385") ? "" : (stryCov_9fa48("166385"), 'ok'),
  /** Operation failed with error */
  ERROR: stryMutAct_9fa48("166386") ? "" : (stryCov_9fa48("166386"), 'error')
}));

/**
 * Worker address format constants.
 *
 * @type {Readonly<Object>}
 * @see Requirements 7.4
 */
const WORKER_ADDRESS = Object.freeze(stryMutAct_9fa48("166387") ? {} : (stryCov_9fa48("166387"), {
  /** Separator for unified address format */
  SEPARATOR: stryMutAct_9fa48("166388") ? "" : (stryCov_9fa48("166388"), '/'),
  /** Build unified address from components */
  build: stryMutAct_9fa48("166389") ? () => undefined : (stryCov_9fa48("166389"), (nodeId, entityType, replicaId) => stryMutAct_9fa48("166390") ? `` : (stryCov_9fa48("166390"), `${nodeId}/${entityType}/${replicaId}`))
}));
export { CACHE_MESSAGE_TYPE, CDC_MESSAGE_TYPE, FACADE_MESSAGE_TYPE, JOIN_MESSAGE_TYPE, LEADERSHIP_MESSAGE_TYPE, SEED_CACHE_MESSAGE_TYPE, WORKER_ADDRESS, WORKER_DEFAULT, WORKER_ENTITY_TYPE, WORKER_ERROR_MSG, WORKER_EVENT, WORKER_HEALTH_STATUS, WORKER_LOG_MSG, WORKER_MESSAGE_TYPE, WORKER_OPERATION, WORKER_RESPONSE_STATUS, WORKER_STATUS, WORKER_SUBSYSTEM };