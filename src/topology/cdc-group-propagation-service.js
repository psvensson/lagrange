/**
 * CDCGroupPropagationService - single owner for topology-aware CDC fanout.
 */

import { EventEmitter } from 'events';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { assertCritical } from '../utils/assert.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback } from
'../cache/system-cache-key-descriptor.js';
import { isTableInternalCachePropagationEnabled } from '../cache/cdc-table-policy.js';
import { COLUMN, NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES, TYPEOF } from '../constants/index.js';
import {
  PRESSURE_WORK_CLASS,
  PressureGovernor } from
'../control-plane/pressure-governor.js';
import { RAFT_ROLE } from '../raft/constants.js';
import {
  LATENCY_GROUP_STATE,
  LATENCY_PROPAGATION_MODE,
  LATENCY_TOPOLOGY_CONFIG_KEY,
  LATENCY_TOPOLOGY_MESSAGE_TYPE } from
'./latency-topology-constants.js';
import {
  CDC_GROUP_PUBLICATION_MODE,
  CDC_GROUP_PROPAGATION_ERROR_MSG,
  CDC_GROUP_PROPAGATION_EVENT,
  CDC_GROUP_PROPAGATION_LOG_MSG,
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PROPAGATION_RETRY,
  CDC_GROUP_PROPAGATION_STATE,
  CDC_GROUP_PROPAGATION_STRATEGY,
  CDC_GROUP_PROPAGATION_STATUS,
  CDC_GROUP_PROPAGATION_SUBSYSTEM } from
'./cdc-group-propagation-constants.js';const CDC_GROUP_PROPAGATION_SERVICE_LITERAL = Object.freeze({ BATCH:












































































































































































































































































































































































































































































































  'batch', VALUE:



















































































































  ',', VALUE_2: '|', CDC_RETRY:
































































































































































































































































































































































































































  'cdc:retry' });const CDC_GROUP_PROPAGATION_MESSAGE = Object.freeze({ STATUS_DELIVERED: 'delivered' });const MESSAGE_GROUP_REPLICA_SUFFIX = '-r';const DELIVERY_ERROR_UNKNOWN = 'unknown delivery error';const PUBLICATION_TRANSITION_HISTORY_LIMIT = 10;const BACKGROUND_RETRY_PENDING_ERROR = 'background_retry_pending';const IMMEDIATE_BATCH_DELAY_MS = NUM.TEN;const IMMEDIATE_BATCH_MAX_EVENTS = NUM.SIXTY_FOUR;function sortObjectKeys(value) {if (Array.isArray(value)) {return value.map((entry) => sortObjectKeys(entry));}if (!value || typeof value !== TYPEOF.OBJECT) {return value;}return Object.keys(value).sort().reduce((accumulator, key) => {accumulator[key] = sortObjectKeys(value[key]);return accumulator;}, {});}function stableSerialize(value) {return JSON.stringify(sortObjectKeys(value));}class CDCGroupPropagationService extends EventEmitter {/**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Object} options.messageRouter
   * @param {Object} options.latencyTreeService
   * @param {Function} options.nowFn
   */constructor(options = {}) {super();this.nodeId = options.nodeId || null;this.systemTableCache = options.systemTableCache || null;this.messageRouter = options.messageRouter || null;this.latencyTreeService = options.latencyTreeService || null;this.nowFn = options.nowFn || Date.now;this.config = ConfigurationManager.getInstance();this.propagationMode = this.config.get(LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE) === LATENCY_PROPAGATION_MODE.GROUPED ? LATENCY_PROPAGATION_MODE.GROUPED : LATENCY_PROPAGATION_MODE.SAFE;const loggingService = LoggingService.getInstance();this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(CDC_GROUP_PROPAGATION_SUBSYSTEM) : console;this.state = CDC_GROUP_PROPAGATION_STATE.CREATED;this.stats = { groupedCount: NUM.ZERO, safeCount: NUM.ZERO, fallbackCount: NUM.ZERO, groupedDeliveryFailureCount: NUM.ZERO, lastStrategy: null, lastMode: null, lastFallbackReason: null, lastPropagationAt: null, lastTargetGroupCount: NUM.ZERO };this.deliveryRetryMaxAttempts = this.resolvePositiveInteger(options.deliveryRetryMaxAttempts, CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS);this.backgroundRetryMaxAttempts = this.resolvePositiveInteger(options.backgroundRetryMaxAttempts, CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS);this.deliveryRetryDelayMs = this.resolvePositiveInteger(options.deliveryRetryDelayMs, CDC_GROUP_PROPAGATION_RETRY.INITIAL_DELAY_MS);this.deliveryRetryBackoffMultiplier = this.resolvePositiveNumber(options.deliveryRetryBackoffMultiplier, CDC_GROUP_PROPAGATION_RETRY.BACKOFF_MULTIPLIER);this.deliveryRetryMaxDelayMs = this.resolvePositiveInteger(options.deliveryRetryMaxDelayMs, CDC_GROUP_PROPAGATION_RETRY.MAX_DELAY_MS);this.backgroundRetryTimers = new Set();this.backgroundRetryEntriesByKey = new Map();this.immediateBatchTimers = new Set();this.immediateBatchEntriesByKey = new Map();this.immediateBatchDelayMs = this.resolvePositiveInteger(options.immediateBatchDelayMs, IMMEDIATE_BATCH_DELAY_MS);this.immediateBatchMaxEvents = this.resolvePositiveInteger(options.immediateBatchMaxEvents, IMMEDIATE_BATCH_MAX_EVENTS);this.publicationModeDiagnostics = this.freezePublicationModeDiagnostics({ currentMode: this.propagationMode === LATENCY_PROPAGATION_MODE.GROUPED ? CDC_GROUP_PUBLICATION_MODE.GROUPED : CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY, reasonCode: this.propagationMode === LATENCY_PROPAGATION_MODE.GROUPED ? null : CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE, enteredAt: this.toIsoTimestamp(this.now()), recentTransitions: [] });} /**
   * Initialize dependencies.
   * @param {Object} options
   */initialize(options = {}) {if (options.nodeId) {this.nodeId = options.nodeId;}if (options.systemTableCache) {this.systemTableCache = options.systemTableCache;}if (options.messageRouter) {this.messageRouter = options.messageRouter;}if (options.latencyTreeService) {this.latencyTreeService = options.latencyTreeService;}if (options.nowFn) {this.nowFn = options.nowFn;}this.nodeId = assertCritical(this.nodeId, CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_NODE_ID);this.systemTableCache = assertCritical(this.systemTableCache, CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CACHE);this.latencyTreeService = assertCritical(this.latencyTreeService, CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_TREE_SERVICE);this.refreshConfig();this.state = CDC_GROUP_PROPAGATION_STATE.INITIALIZED;this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.INITIALIZED, { nodeId: this.nodeId, propagationMode: this.propagationMode });} /**
   * Start propagation lifecycle.
   */start() {this.ensureInitialized();this.refreshConfig();this.state = CDC_GROUP_PROPAGATION_STATE.RUNNING;this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.STARTED, { nodeId: this.nodeId, propagationMode: this.propagationMode });} /**
   * Stop propagation lifecycle.
   */stop() {this.state = CDC_GROUP_PROPAGATION_STATE.STOPPED;this.clearBackgroundRetryTimers();this.clearImmediateBatchTimers();this.logger.info(CDC_GROUP_PROPAGATION_LOG_MSG.STOPPED, { nodeId: this.nodeId });} /**
   * Propagate one CDC event through grouped mode or safe mode.
   * @param {Object} options
   * @param {string} options.tableName
   * @param {string} options.operation
   * @param {Object} options.data
   * @param {Object} options.sourceMessageGroupService
   * @return {Promise<Object>}
   */async propagateCDCEvent(options = {}) {this.ensureInitialized();const tableName = options.tableName;const operation = options.operation;const data = options.data;const sourceMessageGroupService = options.sourceMessageGroupService;assertCritical(sourceMessageGroupService && typeof sourceMessageGroupService.applyCDCEvent === TYPEOF.FUNCTION, CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_MESSAGE_GROUP_SERVICE);assertCritical(tableName && operation && data, CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD);this.refreshConfig();if (this.propagationMode !== LATENCY_PROPAGATION_MODE.GROUPED) {this.setPublicationMode(CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY, CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE);return this.propagateSafe({ tableName, operation, data, sourceMessageGroupService, fallbackReason: CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE });}const groupedContext = this.buildGroupedContext();if (groupedContext.fallbackReason) {this.setPublicationMode(CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT, groupedContext.fallbackReason);return this.propagateSafe({ tableName, operation, data, sourceMessageGroupService, fallbackReason: groupedContext.fallbackReason });}await sourceMessageGroupService.applyCDCEvent(tableName, operation, data);const groupedDeliveryFailures = await this.deliverToTargetsWithRetry({ tableName, operation, data, sourceGroupId: groupedContext.sourceGroupId, targets: groupedContext.targets });const groupedFailureCount = groupedDeliveryFailures.length;const fallbackRecovery = groupedFailureCount > NUM.ZERO ? await this.recoverGroupedDeliveryFailuresWithSafeFanout({ tableName, operation, data, sourceGroupId: groupedContext.sourceGroupId, deliveryFailures: groupedDeliveryFailures }) : { deliveryFailures: groupedDeliveryFailures, fallbackUsed: false };const deliveryFailures = fallbackRecovery.deliveryFailures;const fallbackUsed = fallbackRecovery.fallbackUsed === true;const timestamp = this.now();this.stats.groupedCount += NUM.ONE;this.stats.lastStrategy = CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR;this.stats.lastMode = CDC_GROUP_PROPAGATION_STATUS.GROUPED;this.stats.lastFallbackReason = fallbackUsed ? CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE : null;this.stats.lastPropagationAt = timestamp;this.stats.lastTargetGroupCount = groupedContext.targets.length;if (groupedFailureCount > NUM.ZERO) {this.stats.groupedDeliveryFailureCount += groupedFailureCount;this.setPublicationMode(CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT, CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE);this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.GROUPED_DELIVERY_FAILED, { nodeId: this.nodeId, tableName, operation, failureCount: groupedFailureCount, recoveredCount: groupedFailureCount - deliveryFailures.length, unresolvedCount: deliveryFailures.length });} else {this.setPublicationMode(CDC_GROUP_PUBLICATION_MODE.GROUPED, CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_RECOVERED);}const result = { success: deliveryFailures.length === NUM.ZERO, strategy: CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR, mode: CDC_GROUP_PROPAGATION_STATUS.GROUPED, status: CDC_GROUP_PROPAGATION_MESSAGE.STATUS_DELIVERED, sourceGroupId: groupedContext.sourceGroupId, targetGroupCount: groupedContext.targets.length, deliveryFailures, fallbackReason: fallbackUsed ? CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE : null, fallbackStrategy: fallbackUsed ? CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT : null, timestamp };this.emit(CDC_GROUP_PROPAGATION_EVENT.PROPAGATED, result);this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.PROPAGATED_GROUPED, { nodeId: this.nodeId, tableName, operation, strategy: CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR, sourceGroupId: groupedContext.sourceGroupId, targetGroupCount: groupedContext.targets.length, deliveryFailureCount: deliveryFailures.length });return result;} /**
   * Apply canonical safe propagation path.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */async propagateSafe(options) {await options.sourceMessageGroupService.applyCDCEvent(options.tableName, options.operation, options.data);const sourceGroupId = this.resolveSourceMessageGroupId(options.sourceMessageGroupService);const safeTargets = this.buildSafeTargets(sourceGroupId);const deliveryFailures = await this.deliverToTargetsWithRetry({ tableName: options.tableName, operation: options.operation, data: options.data, sourceGroupId, targets: safeTargets });const timestamp = this.now();this.stats.safeCount += NUM.ONE;this.stats.lastStrategy = CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT;this.stats.lastMode = CDC_GROUP_PROPAGATION_STATUS.SAFE;this.stats.lastFallbackReason = options.fallbackReason || null;this.stats.lastPropagationAt = timestamp;this.stats.lastTargetGroupCount = safeTargets.length;if (options.fallbackReason) {this.recordSafeFallback(options.fallbackReason, { tableName: options.tableName, operation: options.operation });}this.logger.debug(CDC_GROUP_PROPAGATION_LOG_MSG.PROPAGATED_SAFE, { nodeId: this.nodeId, tableName: options.tableName, operation: options.operation, strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT });return { success: deliveryFailures.length === NUM.ZERO, strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT, mode: CDC_GROUP_PROPAGATION_STATUS.SAFE, status: CDC_GROUP_PROPAGATION_MESSAGE.STATUS_DELIVERED, sourceGroupId, targetGroupCount: safeTargets.length, deliveryFailures, fallbackReason: options.fallbackReason || null, timestamp };} /**
   * Deliver CDC payload to targets with bounded retry on failed destinations.
   * @param {Object} options
   * @return {Promise<Array<Object>>}
   * @private
   */async deliverToTargetsWithRetry(options) {const events = this.normalizeDeliveryEvents(options);const deliveryLabel = this.describeDeliveryEvents(events);const retryKey = !options?.events ? this.buildBackgroundRetryKey(options) : null;const allowDeferToExistingRetry = options?.allowDeferToExistingRetry !== false;if (allowDeferToExistingRetry && retryKey && this.backgroundRetryEntriesByKey.has(retryKey)) {this.scheduleDeferredDeliveryEvents(events, options, NUM.ONE);return this.buildDeferredFailures(options.targets);}if (this.shouldBatchImmediateDelivery(options)) {return this.enqueueImmediateBatch(options);}if (this.isLocalRouterBackpressured()) {this.scheduleDeferredDeliveryEvents(events, options, NUM.ONE);return this.buildDeferredFailures(options.targets);}let pendingTargets = Array.isArray(options.targets) ? [...options.targets] : [];let deliveryFailures = [];let attempt = NUM.ONE;const maxAttempts = Math.max(NUM.ONE, this.deliveryRetryMaxAttempts);while (pendingTargets.length > NUM.ZERO && attempt <= maxAttempts) {deliveryFailures = await this.deliverToTargets({ ...options, targets: pendingTargets });if (deliveryFailures.length === NUM.ZERO) {return [];}if (attempt >= maxAttempts) {break;}const retryDelayMs = this.computeRetryDelayMs(attempt);this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES, { nodeId: this.nodeId, tableName: deliveryLabel.tableName, operation: deliveryLabel.operation, eventCount: deliveryLabel.eventCount, attempt, retryDelayMs, failureCount: deliveryFailures.length });await this.sleep(retryDelayMs);pendingTargets = this.convertFailuresToRetryTargets(deliveryFailures);attempt += NUM.ONE;}if (deliveryFailures.length > NUM.ZERO) {this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, { nodeId: this.nodeId, tableName: deliveryLabel.tableName, operation: deliveryLabel.operation, eventCount: deliveryLabel.eventCount, attempts: maxAttempts, failureCount: deliveryFailures.length });const retryTargets = this.convertFailuresToRetryTargets(deliveryFailures);this.scheduleDeferredDeliveryEvents(events, { ...options, targets: retryTargets }, maxAttempts + NUM.ONE);}return deliveryFailures;} /**
   * Describe one delivery wave for diagnostics.
   * @param {Array<Object>} events
   * @return {{tableName:string|null, operation:string|null, eventCount:number}}
   * @private
   */describeDeliveryEvents(events) {const normalizedEvents = Array.isArray(events) ? events : [];if (normalizedEvents.length === NUM.ZERO) {return { tableName: null, operation: null, eventCount: NUM.ZERO };}if (normalizedEvents.length === NUM.ONE) {return { tableName: normalizedEvents[NUM.ZERO].tableName || null, operation: normalizedEvents[NUM.ZERO].operation || null, eventCount: NUM.ONE };}return { tableName: CDC_GROUP_PROPAGATION_SERVICE_LITERAL.BATCH, operation: CDC_GROUP_PROPAGATION_SERVICE_LITERAL.BATCH, eventCount: normalizedEvents.length };} /**
   * Schedule one or more failed delivery events onto the background retry owner.
   * @param {Array<Object>} events
   * @param {Object} options
   * @param {number} attempt
   * @private
   */scheduleDeferredDeliveryEvents(events, options, attempt) {for (const event of events) {this.scheduleBackgroundRetry({ tableName: event.tableName, operation: event.operation, data: event.data, sourceGroupId: options.sourceGroupId, targets: options.targets, attempt });}} /**
   * Return true when one propagation wave should use immediate batching.
   * @param {Object} options
   * @return {boolean}
   * @private
   */shouldBatchImmediateDelivery(options) {if (options?.allowBatching === false || options?.events) {return false;}if (typeof options?.tableName !== TYPEOF.STRING || options.tableName.length === NUM.ZERO) {return false;}if (!isTableInternalCachePropagationEnabled(options.tableName)) {return false;}return Array.isArray(options.targets) && options.targets.length > NUM.ZERO;} /**
   * Queue one immediate propagation wave into the canonical batch owner.
   * Repeated row updates for the same target wave collapse to the latest state.
   * @param {Object} options
   * @return {Promise<Array<Object>>}
   * @private
   */enqueueImmediateBatch(options) {const batchKey = this.buildImmediateBatchKey(options);if (!batchKey) {return this.deliverToTargetsWithRetry({ ...options, allowBatching: false });}let entry = this.immediateBatchEntriesByKey.get(batchKey);if (!entry) {entry = { pendingEventsByKey: new Map(), resolvers: [], sourceGroupId: options.sourceGroupId || null, targets: Array.isArray(options.targets) ? [...options.targets] : [], timer: null };this.immediateBatchEntriesByKey.set(batchKey, entry);this.armImmediateBatchEntry(batchKey, entry);}const eventKey = this.buildBackgroundRetryEventKey(options);entry.pendingEventsByKey.set(eventKey, { eventKey, tableName: options.tableName, operation: options.operation, data: options.data });if (entry.pendingEventsByKey.size >= this.immediateBatchMaxEvents && entry.timer) {clearTimeout(entry.timer);this.immediateBatchTimers.delete(entry.timer);entry.timer = null;void this.runImmediateBatchEntry(batchKey, entry);}return new Promise((resolve) => {entry.resolvers.push(resolve);});} /**
   * Build a canonical key for one immediate publication batch.
   * @param {Object} options
   * @return {string|null}
   * @private
   */buildImmediateBatchKey(options) {const targetGroupIds = Array.isArray(options?.targets) ? [...new Set(options.targets.map((target) => target?.groupId).filter((groupId) => typeof groupId === TYPEOF.STRING && groupId.length > NUM.ZERO))].sort() : [];if (targetGroupIds.length === NUM.ZERO) {return null;}const sourceGroupId = typeof options?.sourceGroupId === TYPEOF.STRING ? options.sourceGroupId : '';return [sourceGroupId, targetGroupIds.join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE)].join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE_2);} /**
   * Arm the timer for one immediate publication batch.
   * @param {string} batchKey
   * @param {Object} entry
   * @private
   */armImmediateBatchEntry(batchKey, entry) {if (entry?.timer) {return;}const timer = setTimeout(async () => {await this.runImmediateBatchEntry(batchKey, entry);}, this.immediateBatchDelayMs);entry.timer = timer;this.immediateBatchTimers.add(timer);} /**
   * Drain one immediate publication batch.
   * @param {string} batchKey
   * @param {Object} entry
   * @return {Promise<void>}
   * @private
   */async runImmediateBatchEntry(batchKey, entry) {if (entry?.timer) {this.immediateBatchTimers.delete(entry.timer);entry.timer = null;}if (this.immediateBatchEntriesByKey.get(batchKey) === entry) {this.immediateBatchEntriesByKey.delete(batchKey);}const events = [...entry.pendingEventsByKey.values()];entry.pendingEventsByKey.clear();if (events.length === NUM.ZERO) {this.resolveImmediateBatch(entry, []);return;}if (this.isLocalRouterBackpressured()) {for (const event of events) {this.scheduleBackgroundRetry({ tableName: event.tableName, operation: event.operation, data: event.data, sourceGroupId: entry.sourceGroupId, targets: entry.targets, attempt: NUM.ONE });}this.resolveImmediateBatch(entry, this.buildDeferredFailures(entry.targets));return;}const deliveryFailures = await this.deliverToTargetsWithRetry({ events, sourceGroupId: entry.sourceGroupId, targets: entry.targets, allowBatching: false });this.resolveImmediateBatch(entry, deliveryFailures);} /**
   * Resolve all waiters attached to one immediate batch entry.
   * @param {Object} entry
   * @param {Array<Object>} deliveryFailures
   * @private
   */resolveImmediateBatch(entry, deliveryFailures) {const resolvers = Array.isArray(entry?.resolvers) ? entry.resolvers : [];entry.resolvers = [];for (const resolve of resolvers) {resolve([...deliveryFailures]);}} /**
   * Continue delivery retries in background after bounded synchronous retries.
   * @param {Object} options
   * @param {string} options.tableName
   * @param {string} options.operation
   * @param {Object} options.data
   * @param {string|null} options.sourceGroupId
   * @param {Array<Object>} options.targets
   * @param {number} options.attempt
   * @private
   */scheduleBackgroundRetry(options) {if (this.state !== CDC_GROUP_PROPAGATION_STATE.RUNNING) {return;}if (!Array.isArray(options.targets) || options.targets.length === NUM.ZERO) {return;}const { tableName, operation, data, sourceGroupId, targets } = options;const retryKey = this.buildBackgroundRetryKey({ tableName, operation, sourceGroupId, targets });const eventKey = this.buildBackgroundRetryEventKey({ tableName, operation, data });const existingEntry = retryKey ? this.backgroundRetryEntriesByKey.get(retryKey) : null;if (existingEntry) {this.recordBackgroundRetryEvent(existingEntry, eventKey, data);if (!existingEntry.timer) {this.armBackgroundRetryEntry(retryKey, existingEntry);}return;}const attempt = Number.isFinite(options.attempt) && options.attempt > NUM.ZERO ? Math.floor(options.attempt) : NUM.ONE;options = null;const maxTotalAttempts = this.deliveryRetryMaxAttempts + this.backgroundRetryMaxAttempts;if (attempt >= maxTotalAttempts) {this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, { nodeId: this.nodeId, tableName, operation, attempt, maxTotalAttempts, failureCount: targets.length, background: true });return;}const retryDelayMs = this.computeRetryDelayMs(attempt);const entry = { attempt, operation, pendingEventsByKey: new Map(), sourceGroupId, tableName, targets: Array.isArray(targets) ? [...targets] : [], timer: null };this.recordBackgroundRetryEvent(entry, eventKey, data);this.armBackgroundRetryEntry(retryKey, entry);} /**
   * Arm the retry timer for one background entry.
   * @param {string|null} retryKey
   * @param {Object} entry
   * @private
   */armBackgroundRetryEntry(retryKey, entry) {if (entry?.timer) {return;}const attempt = Number.isFinite(entry?.attempt) && entry.attempt > NUM.ZERO ? Math.floor(entry.attempt) : NUM.ONE;const maxTotalAttempts = this.deliveryRetryMaxAttempts + this.backgroundRetryMaxAttempts;if (attempt >= maxTotalAttempts) {this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, { nodeId: this.nodeId, tableName: entry?.tableName, operation: entry?.operation, attempt, maxTotalAttempts, failureCount: entry?.pendingEventsByKey?.size || NUM.ZERO, background: true });if (retryKey) {this.backgroundRetryEntriesByKey.delete(retryKey);}return;}const retryDelayMs = this.computeRetryDelayMs(attempt);this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.RETRYING_DELIVERY_FAILURES, { nodeId: this.nodeId, tableName: entry.tableName, operation: entry.operation, attempt, retryDelayMs, failureCount: entry.pendingEventsByKey.size, background: true });const retryTimer = setTimeout(async () => {await this.runBackgroundRetryEntry(retryKey, retryTimer, entry);}, retryDelayMs);entry.timer = retryTimer;this.backgroundRetryTimers.add(retryTimer);if (retryKey) {this.backgroundRetryEntriesByKey.set(retryKey, entry);}} /**
   * Clear all pending background retry timers.
   * @private
   */clearBackgroundRetryTimers() {for (const retryTimer of this.backgroundRetryTimers) {clearTimeout(retryTimer);}this.backgroundRetryTimers.clear();this.backgroundRetryEntriesByKey.clear();} /**
   * Clear all pending immediate publication batch timers.
   * @private
   */clearImmediateBatchTimers() {for (const timer of this.immediateBatchTimers) {clearTimeout(timer);}this.immediateBatchTimers.clear();this.immediateBatchEntriesByKey.clear();} /**
   * Build a canonical key for one background retry wave.
   * @param {Object} options
   * @return {string|null}
   * @private
   */buildBackgroundRetryKey(options) {const targetGroupIds = Array.isArray(options.targets) ? [...new Set(options.targets.map((target) => target?.groupId).filter((groupId) => typeof groupId === TYPEOF.STRING && groupId.length > NUM.ZERO))].sort() : [];if (targetGroupIds.length === NUM.ZERO) {return null;}const tableName = typeof options.tableName === TYPEOF.STRING ? options.tableName : '';const operation = typeof options.operation === TYPEOF.STRING ? options.operation : '';const sourceGroupId = typeof options.sourceGroupId === TYPEOF.STRING ? options.sourceGroupId : '';return [tableName, operation, sourceGroupId, targetGroupIds.join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE)].join(CDC_GROUP_PROPAGATION_SERVICE_LITERAL.VALUE_2);} /**
   * Build a canonical event key for one deferred propagation payload.
   * Uses table primary key when available so repeated row updates collapse
   * to the latest state while preserving distinct rows under one retry wave.
   * @param {Object} options
   * @return {string}
   * @private
   */buildBackgroundRetryEventKey(options) {const tableName = typeof options?.tableName === TYPEOF.STRING ? options.tableName : '';const operation = typeof options?.operation === TYPEOF.STRING ? options.operation : '';const data = options?.data && typeof options.data === TYPEOF.OBJECT ? options.data : null;const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName, 'id');const pkValue = data?.[pkField] ?? data?.id ?? null;if (pkValue !== null && pkValue !== undefined) {return `${tableName}|${operation}|${String(pkValue)}`;}return `${tableName}|${operation}|${stableSerialize(data)}`;} /**
   * Record or replace the latest deferred payload for one retry entry.
   * @param {Object} entry
   * @param {string} eventKey
   * @param {Object} data
   * @private
   */recordBackgroundRetryEvent(entry, eventKey, data) {if (!entry || !eventKey) {return;}entry.pendingEventsByKey.set(eventKey, { data, eventKey });} /**
   * Execute one background retry entry, draining all queued row events and
   * rescheduling only the remaining misses.
   * @param {string|null} retryKey
   * @param {Object} retryTimer
   * @param {Object} entry
   * @return {Promise<void>}
   * @private
   */async runBackgroundRetryEntry(retryKey, retryTimer, entry) {this.backgroundRetryTimers.delete(retryTimer);if (retryKey) {const activeEntry = this.backgroundRetryEntriesByKey.get(retryKey);if (activeEntry === entry) {activeEntry.timer = null;}}if (this.state !== CDC_GROUP_PROPAGATION_STATE.RUNNING) {return;}if (this.isLocalRouterBackpressured()) {this.rescheduleBackgroundRetryEntry(retryKey, entry);return;}const pendingEvents = [...entry.pendingEventsByKey.values()];entry.pendingEventsByKey.clear();if (pendingEvents.length === NUM.ZERO) {if (retryKey) {this.backgroundRetryEntriesByKey.delete(retryKey);}return;}const deliveryFailures = await this.deliverToTargets({ events: pendingEvents.map((pendingEvent) => ({ tableName: entry.tableName, operation: entry.operation, data: pendingEvent.data })), sourceGroupId: entry.sourceGroupId, targets: entry.targets });if (deliveryFailures.length > NUM.ZERO) {for (const pendingEvent of pendingEvents) {this.recordBackgroundRetryEvent(entry, pendingEvent.eventKey, pendingEvent.data);}}if (entry.pendingEventsByKey.size === NUM.ZERO) {if (retryKey) {this.backgroundRetryEntriesByKey.delete(retryKey);}return;}entry.attempt += NUM.ONE;this.rescheduleBackgroundRetryEntry(retryKey, entry);} /**
   * Reschedule one existing retry entry if budget remains.
   * @param {string|null} retryKey
   * @param {Object} entry
   * @private
   */rescheduleBackgroundRetryEntry(retryKey, entry) {const maxTotalAttempts = this.deliveryRetryMaxAttempts + this.backgroundRetryMaxAttempts;if (entry.attempt >= maxTotalAttempts) {this.logger.warn(CDC_GROUP_PROPAGATION_LOG_MSG.DELIVERY_RETRY_EXHAUSTED, { nodeId: this.nodeId, tableName: entry.tableName, operation: entry.operation, attempt: entry.attempt, maxTotalAttempts, failureCount: entry.pendingEventsByKey.size, background: true });if (retryKey) {this.backgroundRetryEntriesByKey.delete(retryKey);}return;}this.armBackgroundRetryEntry(retryKey, entry);} /**
   * Determine whether the local router is currently backpressured.
   * @return {boolean}
   * @private
   */isLocalRouterBackpressured() {return PressureGovernor.getShared({ nodeId: this.nodeId, messageRouter: this.messageRouter }).isBackpressured({ workClass: PRESSURE_WORK_CLASS.BACKGROUND, resourceKeys: [CDC_GROUP_PROPAGATION_SERVICE_LITERAL.CDC_RETRY] });} /**
   * Build immediate deferred failures for a queued retry wave.
   * @param {Array<Object>} targets
   * @return {Array<Object>}
   * @private
   */buildDeferredFailures(targets) {return (Array.isArray(targets) ? targets : []).map((target) => ({ targetGroupId: target?.groupId || null, coordinatorNodeId: target?.coordinatorNodeId || null, address: target?.address || null, error: BACKGROUND_RETRY_PENDING_ERROR }));} /**
   * Convert delivery failures into retry targets.
   * @param {Array<Object>} deliveryFailures
   * @return {Array<Object>}
   * @private
   */convertFailuresToRetryTargets(deliveryFailures) {const targetsByGroupId = new Map();for (const failure of deliveryFailures) {const groupId = failure?.targetGroupId;if (typeof groupId !== TYPEOF.STRING || groupId.length === NUM.ZERO) {continue;}targetsByGroupId.set(groupId, { groupId, coordinatorNodeId: failure?.coordinatorNodeId || null, address: failure?.address || null });}return [...targetsByGroupId.values()];} /**
   * Re-drive grouped delivery misses through the conservative direct-fanout
   * path so control-plane metadata converges under coordinator instability.
   * @param {Object} options
   * @return {Promise<{deliveryFailures:Array<Object>, fallbackUsed:boolean}>}
   * @private
   */async recoverGroupedDeliveryFailuresWithSafeFanout(options) {const originalFailures = Array.isArray(options.deliveryFailures) ? options.deliveryFailures : [];let deliveryFailures = originalFailures;let fallbackUsed = false;if (originalFailures.length > NUM.ZERO) {const failedGroupIds = new Set();const unresolvedFailures = [];for (const failure of originalFailures) {const groupId = failure?.targetGroupId;if (typeof groupId === TYPEOF.STRING && groupId.length > NUM.ZERO) {failedGroupIds.add(groupId);continue;}unresolvedFailures.push(failure);}if (failedGroupIds.size > NUM.ZERO) {const safeTargets = this.buildSafeTargets(options.sourceGroupId).filter((target) => failedGroupIds.has(target.groupId));if (safeTargets.length > NUM.ZERO) {this.recordSafeFallback(CDC_GROUP_PROPAGATION_REASON.GROUPED_DELIVERY_FAILURE, { tableName: options.tableName, operation: options.operation, failedGroupCount: failedGroupIds.size });const recoveredFailures = await this.deliverToTargetsWithRetry({ tableName: options.tableName, operation: options.operation, data: options.data, sourceGroupId: options.sourceGroupId, targets: safeTargets, allowDeferToExistingRetry: false });const failuresByKey = new Map();let unkeyedCounter = NUM.ZERO;const targetedGroupIds = new Set(safeTargets.map((target) => target.groupId));for (const failure of unresolvedFailures) {failuresByKey.set(`unkeyed-${unkeyedCounter++}`, failure);}for (const failure of originalFailures) {const groupId = failure?.targetGroupId;if (typeof groupId === TYPEOF.STRING && groupId.length > NUM.ZERO && !targetedGroupIds.has(groupId)) {failuresByKey.set(groupId, failure);}}for (const failure of recoveredFailures) {const groupId = failure?.targetGroupId;if (typeof groupId === TYPEOF.STRING && groupId.length > NUM.ZERO) {failuresByKey.set(groupId, failure);} else {failuresByKey.set(`recovered-unkeyed-${unkeyedCounter++}`, failure);}}deliveryFailures = [...failuresByKey.values()];fallbackUsed = true;}}}return this.buildGroupedDeliveryRecoveryResult(deliveryFailures, fallbackUsed);}buildGroupedDeliveryRecoveryResult(deliveryFailures, fallbackUsed) {return { deliveryFailures, fallbackUsed };} /**
   * Emit diagnostics for one direct-fanout fallback decision.
   * @param {string} reason
   * @param {Object} context
   * @private
   */recordSafeFallback(reason, context = {}) {this.stats.fallbackCount += NUM.ONE;this.emit(CDC_GROUP_PROPAGATION_EVENT.SAFE_FALLBACK, { reason, tableName: context.tableName, operation: context.operation });const fallbackLogContext = { nodeId: this.nodeId, tableName: context.tableName, operation: context.operation, strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT, reason };if (Number.isInteger(context.failedGroupCount) && context.failedGroupCount > NUM.ZERO) {
      fallbackLogContext.failedGroupCount = context.failedGroupCount;
    }

    if (reason === CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE) {
      this.logger.debug(
        CDC_GROUP_PROPAGATION_LOG_MSG.SAFE_FALLBACK,
        fallbackLogContext
      );
      return;
    }
    this.logger.warn(
      CDC_GROUP_PROPAGATION_LOG_MSG.SAFE_FALLBACK,
      fallbackLogContext
    );
  }

  /**
   * Compute exponential backoff retry delay.
   * @param {number} attempt
   * @return {number}
   * @private
   */
  computeRetryDelayMs(attempt) {
    const safeAttempt = Number.isFinite(attempt) && attempt > NUM.ZERO ?
    attempt :
    NUM.ONE;
    const exponentialFactor = Math.pow(
      this.deliveryRetryBackoffMultiplier,
      safeAttempt - NUM.ONE
    );
    const delayMs = this.deliveryRetryDelayMs * exponentialFactor;
    return Math.min(this.deliveryRetryMaxDelayMs, Math.max(NUM.ONE, Math.floor(delayMs)));
  }

  /**
   * Sleep helper for retry delay.
   * @param {number} delayMs
   * @return {Promise<void>}
   * @private
   */
  async sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * Build grouped propagation routing context.
   * @return {Object}
   * @private
   */
  buildGroupedContext() {
    const localNode = this.systemTableCache.get(TABLES.NODES, this.nodeId);
    const sourceGroupId = localNode?.[COLUMN.LATENCY_GROUP_ID] || null;
    if (!sourceGroupId) {
      return this.buildGroupedContextResult(
        sourceGroupId,
        [],
        CDC_GROUP_PROPAGATION_REASON.MISSING_LOCAL_GROUP,
      );
    }

    const activeGroups = this.systemTableCache
      .getAll(TABLES.LATENCY_GROUPS)
      .filter((groupRow) => {
        const groupId = groupRow?.[COLUMN.GROUP_ID];
        const state = groupRow?.[COLUMN.STATE];
        if (!groupId) {
          return false;
        }
        return !state || state === LATENCY_GROUP_STATE.ACTIVE;
      });
    if (activeGroups.length === NUM.ZERO) {
      return this.buildGroupedContextResult(
        sourceGroupId,
        [],
        CDC_GROUP_PROPAGATION_REASON.MISSING_ACTIVE_GROUPS,
      );
    }

    const targetOrder = this.latencyTreeService.getRoutingOrder(sourceGroupId);
    const groupById = new Map(activeGroups.map((groupRow) =>
      [groupRow[COLUMN.GROUP_ID], groupRow]
    ));
    const orderedTargetIds = targetOrder.filter((groupId) => groupId !== sourceGroupId);
    const targets = [];

    for (const groupId of orderedTargetIds) {
      const groupRow = groupById.get(groupId);
      if (!groupRow) {
        continue;
      }
      const coordinatorNodeId = groupRow?.[COLUMN.COORDINATOR_NODE_ID];
      if (!coordinatorNodeId) {
        return this.buildGroupedContextResult(
          sourceGroupId,
          [],
          CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_NODE,
        );
      }
      const address = this.resolveCoordinatorAddress(coordinatorNodeId);
      if (!address) {
        return this.buildGroupedContextResult(
          sourceGroupId,
          [],
          CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS,
        );
      }
      targets.push({
        groupId,
        coordinatorNodeId,
        address
      });
    }

    if (targets.length > NUM.ZERO && (
      !this.messageRouter ||
      typeof this.messageRouter.deliver !== TYPEOF.FUNCTION)) {
      return this.buildGroupedContextResult(
        sourceGroupId,
        [],
        CDC_GROUP_PROPAGATION_REASON.MESSAGE_ROUTER_UNAVAILABLE,
      );
    }

    return this.buildGroupedContextResult(sourceGroupId, targets, null);
  }

  buildGroupedContextResult(sourceGroupId, targets, fallbackReason) {
    return {
      sourceGroupId,
      targets,
      fallbackReason
    };
  }

  /**
   * Resolve one coordinator message-group address for a node.
   * @param {string} coordinatorNodeId
   * @return {string|null}
   * @private
   */
  resolveCoordinatorAddress(coordinatorNodeId) {
    const services = this.resolveActiveMessageGroupServices((serviceRow) => {
      return serviceRow?.[COLUMN.NODE_ID] === coordinatorNodeId;
    });
    if (services.length === NUM.ZERO) {
      return null;
    }

    const sorted = this.sortCoordinatorCandidates(services);

    return sorted[NUM.ZERO]?.[COLUMN.ADDRESS] || null;
  }

  /**
   * Resolve source message-group id from message-group service owner.
   * @param {Object} sourceMessageGroupService
   * @return {string|null}
   * @private
   */
  resolveSourceMessageGroupId(sourceMessageGroupService) {
    const groupId = sourceMessageGroupService?.groupId;
    if (typeof groupId !== TYPEOF.STRING || groupId.length === NUM.ZERO) {
      return null;
    }
    return groupId;
  }

  /**
   * Resolve active message-group service rows from cache.
   * @param {Function|null} predicate
   * @return {Array<Object>}
   * @private
   */
  resolveActiveMessageGroupServices(predicate = null) {
    const rowPredicate = typeof predicate === TYPEOF.FUNCTION ? predicate : null;
    return this.systemTableCache.filter(TABLES.SERVICES, (serviceRow) => {
      const isMessageGroup =
      serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
      const isActive = serviceRow?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE;
      const hasAddress =
      typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
      serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
      if (!isMessageGroup || !isActive || !hasAddress) {
        return false;
      }
      if (!rowPredicate) {
        return true;
      }
      return rowPredicate(serviceRow) === true;
    });
  }

  /**
   * Deterministically sort coordinator candidates.
   * Prefers leaders then lexical service id.
   * @param {Array<Object>} services
   * @return {Array<Object>}
   * @private
   */
  sortCoordinatorCandidates(services) {
    return [...services].sort((left, right) => {
      const leftLeader = left?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
      const rightLeader = right?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
      if (leftLeader && !rightLeader) {
        return NUM.NEGATIVE_ONE;
      }
      if (!leftLeader && rightLeader) {
        return NUM.ONE;
      }
      const leftServiceId = left?.[COLUMN.SERVICE_ID] || '';
      const rightServiceId = right?.[COLUMN.SERVICE_ID] || '';
      if (leftServiceId < rightServiceId) {
        return NUM.NEGATIVE_ONE;
      }
      if (leftServiceId > rightServiceId) {
        return NUM.ONE;
      }
      return NUM.ZERO;
    });
  }

  /**
   * Resolve message-group id from services row.
   * @param {Object} serviceRow
   * @return {string|null}
   * @private
   */
  resolveMessageGroupId(serviceRow) {
    const explicitGroupId = serviceRow?.[COLUMN.GROUP_ID];
    if (typeof explicitGroupId === TYPEOF.STRING &&
    explicitGroupId.length > NUM.ZERO) {
      return explicitGroupId;
    }
    const serviceId = serviceRow?.[COLUMN.SERVICE_ID];
    if (typeof serviceId !== TYPEOF.STRING || serviceId.length === NUM.ZERO) {
      return null;
    }
    const replicaSuffixIndex = serviceId.lastIndexOf(
      MESSAGE_GROUP_REPLICA_SUFFIX
    );
    if (replicaSuffixIndex <= NUM.ZERO) {
      return null;
    }
    return serviceId.slice(NUM.ZERO, replicaSuffixIndex);
  }

  /**
   * Build safe propagation targets from active message-group leaders.
   * @param {string|null} sourceGroupId
   * @return {Array<Object>}
   * @private
   */
  buildSafeTargets(sourceGroupId) {
    const services = this.resolveActiveMessageGroupServices();
    const servicesByGroupId = new Map();
    for (const serviceRow of services) {
      const groupId = this.resolveMessageGroupId(serviceRow);
      if (!groupId) {
        continue;
      }
      if (!servicesByGroupId.has(groupId)) {
        servicesByGroupId.set(groupId, []);
      }
      servicesByGroupId.get(groupId).push(serviceRow);
    }

    const orderedGroupIds = [...servicesByGroupId.keys()].
    sort((left, right) => left.localeCompare(right));
    const targets = [];
    for (const groupId of orderedGroupIds) {
      if (sourceGroupId && groupId === sourceGroupId) {
        continue;
      }
      const selectedService =
      this.sortCoordinatorCandidates(servicesByGroupId.get(groupId))[NUM.ZERO];
      if (!selectedService) {
        continue;
      }
      targets.push({
        groupId,
        coordinatorNodeId: selectedService[COLUMN.NODE_ID] || null,
        address: selectedService[COLUMN.ADDRESS]
      });
    }
    return targets;
  }

  /**
   * Deliver CDC payload to target coordinators.
   * @param {Object} options
   * @return {Promise<Array<Object>>}
   * @private
   */
  async deliverToTargets(options) {
    const events = this.normalizeDeliveryEvents(options);
    const deliveryFailures = [];
    for (const target of options.targets) {
      if (!this.messageRouter ||
      typeof this.messageRouter.deliver !== TYPEOF.FUNCTION) {
        deliveryFailures.push({
          targetGroupId: target.groupId,
          coordinatorNodeId: target.coordinatorNodeId,
          address: target.address,
          error: CDC_GROUP_PROPAGATION_REASON.MESSAGE_ROUTER_UNAVAILABLE
        });
        continue;
      }

      const payload = events.length > NUM.ONE ?
      {
        type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH,
        events,
        sourceNodeId: this.nodeId,
        sourceGroupId: options.sourceGroupId,
        targetGroupId: target.groupId
      } :
      {
        type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION,
        tableName: events[0].tableName,
        operation: events[0].operation,
        data: events[0].data,
        sourceNodeId: this.nodeId,
        sourceGroupId: options.sourceGroupId,
        targetGroupId: target.groupId
      };
      let result = null;
      try {
        result = await this.messageRouter.deliver(
          target.address,
          payload,
          { targetNodeId: target.coordinatorNodeId }
        );
      } catch (error) {
        deliveryFailures.push({
          targetGroupId: target.groupId,
          coordinatorNodeId: target.coordinatorNodeId,
          address: target.address,
          error: String(error?.message || error || DELIVERY_ERROR_UNKNOWN)
        });
        continue;
      }
      if (!result?.acknowledged) {
        deliveryFailures.push({
          targetGroupId: target.groupId,
          coordinatorNodeId: target.coordinatorNodeId,
          address: target.address,
          error: result?.error || null
        });
      }
    }
    return deliveryFailures;
  }

  /**
   * Normalize one delivery request into a batch-safe event array.
   * @param {Object} options
   * @return {Array<Object>}
   * @private
   */
  normalizeDeliveryEvents(options) {
    const explicitEvents = Array.isArray(options?.events) ?
    options.events.
    filter((event) => event?.tableName && event?.operation && event?.data).
    map((event) => ({
      tableName: event.tableName,
      operation: event.operation,
      data: event.data
    })) :
    [];
    if (explicitEvents.length > NUM.ZERO) {
      return explicitEvents;
    }
    return [{
      tableName: options.tableName,
      operation: options.operation,
      data: options.data
    }];
  }

  /**
   * Refresh propagation mode from centralized config.
   */
  refreshConfig() {
    const value = this.config.get(LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE);
    if (value === LATENCY_PROPAGATION_MODE.GROUPED) {
      const previousPropagationMode = this.propagationMode;
      this.propagationMode = LATENCY_PROPAGATION_MODE.GROUPED;
      if (previousPropagationMode !== LATENCY_PROPAGATION_MODE.GROUPED ||
      !this.publicationModeDiagnostics) {
        this.setPublicationMode(
          CDC_GROUP_PUBLICATION_MODE.GROUPED,
          CDC_GROUP_PROPAGATION_REASON.CONFIG_GROUPED_MODE
        );
      }
      return;
    }
    this.propagationMode = LATENCY_PROPAGATION_MODE.SAFE;
    this.setPublicationMode(
      CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY,
      CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE
    );
  }

  /**
   * Get the canonical publication-mode diagnostics snapshot.
   * @return {Object}
   */
  getPublicationModeDiagnostics() {
    return this.freezePublicationModeDiagnostics({
      ...this.publicationModeDiagnostics,
      recentTransitions: Array.isArray(
        this.publicationModeDiagnostics?.recentTransitions
      ) ? this.publicationModeDiagnostics.recentTransitions : []
    });
  }

  /**
   * Get current diagnostics counters.
   * @return {Object}
   */
  getStats() {
    return {
      ...this.stats,
      nodeId: this.nodeId,
      state: this.state,
      propagationMode: this.propagationMode,
      deliveryRetryMaxAttempts: this.deliveryRetryMaxAttempts,
      deliveryRetryDelayMs: this.deliveryRetryDelayMs,
      deliveryRetryBackoffMultiplier: this.deliveryRetryBackoffMultiplier,
      deliveryRetryMaxDelayMs: this.deliveryRetryMaxDelayMs,
      publicationModeDiagnostics: this.getPublicationModeDiagnostics()
    };
  }

  /**
   * Update the canonical publication-mode diagnostics.
   * @param {string} nextMode
   * @param {string|null} reasonCode
   * @private
   */
  setPublicationMode(nextMode, reasonCode) {
    const current = this.publicationModeDiagnostics;
    if (!nextMode) {
      return;
    }

    if (!current || current.currentMode !== nextMode) {
      const changedAt = this.toIsoTimestamp(this.now());
      const recentTransitions = Array.isArray(current?.recentTransitions) ?
      [...current.recentTransitions] :
      [];

      if (current?.currentMode) {
        recentTransitions.push(Object.freeze({
          from: current.currentMode,
          to: nextMode,
          reasonCode: reasonCode || null,
          changedAt
        }));
      }
      this.publicationModeDiagnostics = this.freezePublicationModeDiagnostics({
        currentMode: nextMode,
        reasonCode: reasonCode || null,
        enteredAt: changedAt,
        recentTransitions: recentTransitions.slice(
          -PUBLICATION_TRANSITION_HISTORY_LIMIT
        )
      });
      return;
    }

    if (reasonCode && current.reasonCode !== reasonCode) {
      this.publicationModeDiagnostics = this.freezePublicationModeDiagnostics({
        ...current,
        reasonCode
      });
    }
  }

  /**
   * Create a read-only publication diagnostics snapshot.
   * @param {Object} diagnostics
   * @return {Object}
   * @private
   */
  freezePublicationModeDiagnostics(diagnostics) {
    const transitions = Array.isArray(diagnostics?.recentTransitions) ?
    diagnostics.recentTransitions.map((entry) => Object.freeze({ ...entry })) :
    [];
    return Object.freeze({
      currentMode: diagnostics?.currentMode || null,
      reasonCode: diagnostics?.reasonCode || null,
      enteredAt: diagnostics?.enteredAt || null,
      recentTransitions: Object.freeze(transitions)
    });
  }

  /**
   * Ensure lifecycle initialization has happened.
   * @private
   */
  ensureInitialized() {
    assertCritical(
      this.state !== CDC_GROUP_PROPAGATION_STATE.CREATED,
      CDC_GROUP_PROPAGATION_ERROR_MSG.NOT_INITIALIZED
    );
  }

  /**
   * Current wall-clock time.
   * @return {number}
   * @private
   */
  now() {
    return this.nowFn();
  }

  /**
   * Convert the current clock value to an ISO-8601 timestamp.
   * @param {number} value
   * @return {string}
   * @private
   */
  toIsoTimestamp(value) {
    return new Date(value).toISOString();
  }

  /**
   * Resolve positive integer option with fallback.
   * @param {*} value
   * @param {number} fallback
   * @return {number}
   * @private
   */
  resolvePositiveInteger(value, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    const normalized = Math.floor(value);
    if (normalized < NUM.ONE) {
      return fallback;
    }
    return normalized;
  }

  /**
   * Resolve positive numeric option with fallback.
   * @param {*} value
   * @param {number} fallback
   * @return {number}
   * @private
   */
  resolvePositiveNumber(value, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (value <= NUM.ZERO) {
      return fallback;
    }
    return value;
  }
}

export { CDCGroupPropagationService };
