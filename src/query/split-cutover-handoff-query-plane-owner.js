import {COLUMN, NODE_STATE, TABLES} from '../constants/index.js';
import {TRANSPORT_EVENT} from '../constants/transport.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../control-plane/control-plane-readiness-constants.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../partition/partition-constants.js';
import {
  HANDOFF_CLOSURE_PHASE,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_RESPONSE_STATE,
  buildSplitCutoverHandoffAddress,
} from '../partition/split-cutover-handoff-contract.js';
import {
  copyDenseOwnDataArray,
  copyStrictOwnDataRecord,
} from '../utils/strict-own-data.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayIsArray = Array.isArray;
const booleanConstructor = Boolean;
const ErrorConstructor = Error;
const MapConstructor = Map;
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapClear = Function.call.bind(Map.prototype.clear);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const numberIsSafeInteger = Number.isSafeInteger;
const numberConstructor = Number;
const objectAssign = Object.assign;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const PromiseConstructor = Promise;
const promiseResolve = Promise.resolve.bind(Promise);
const promiseThen = Function.call.bind(Promise.prototype.then);
const setAdd = Function.call.bind(Set.prototype.add);
const setClear = Function.call.bind(Set.prototype.clear);
const setForEach = Function.call.bind(Set.prototype.forEach);
const setHas = Function.call.bind(Set.prototype.has);
const SetConstructor = Set;
const stringConstructor = String;
const reflectOwnKeys = Reflect.ownKeys;

const HANDOFF_ERROR = objectFreeze({
  INVALID_REQUEST: 'Split cutover handoff request is invalid',
  SHUTDOWN: 'Split cutover handoff query-plane owner is shut down',
});
const HANDOFF_DURABLE_SOURCE = 'durable';
const LOCAL_BOOT_INCARNATION_FIELD = 'bootIncarnation';

const DEFAULT_OWNER_OPTIONS = objectFreeze({
  nodeId: null,
  systemCache: null,
  messageRouter: null,
  transactionCoordinator: null,
  getTableInfo: () => null,
  parsePartitionTransition: () => null,
  resolveActivePartitionVersion: () => 1,
  getRoutablePartitionServiceNodeIds: () => [],
  ensureTransactionRecoveryObserved: () => {},
  isTransactionRecoveryReady: () => true,
  requestWorkflowReconcile: () => {},
  logger: console,
});

function readRowField(row, snakeKey, camelKey = snakeKey) {
  return row?.[snakeKey] ?? row?.[camelKey] ?? null;
}

function normalizedString(value) {
  return typeof value === 'string' ? value : '';
}

function prepareRequestShapeIsValid(request, requiredNode, targetIds) {
  return booleanConstructor(request) &&
    request.type === HANDOFF_MESSAGE_TYPE.PREPARE &&
    booleanConstructor(requiredNode) &&
    booleanConstructor(targetIds) &&
    targetIds.length === 2;
}

function prepareRequestValuesAreValid(request, requiredNode, targetIds) {
  const stringValues = [
    request.generation,
    request.workflowId,
    request.tableId,
    request.sourcePartitionId,
    requiredNode.nodeId,
  ];
  const integerValues = [
    request.targetPartitionVersion,
    request.membershipPublicationEpoch,
    requiredNode.bootIncarnation,
  ];
  return arrayEvery(stringValues, normalizedString) &&
    arrayEvery(integerValues, numberIsSafeInteger) &&
    arrayEvery(targetIds, normalizedString);
}

function normalizePrepareRequest(value) {
  const request = copyStrictOwnDataRecord(value);
  const requiredNode = copyStrictOwnDataRecord(request?.requiredNode);
  const targetPartitionIds = copyDenseOwnDataArray(
    request?.targetPartitionIds,
  );
  if (!prepareRequestShapeIsValid(
    request,
    requiredNode,
    targetPartitionIds,
  ) || !prepareRequestValuesAreValid(
    request,
    requiredNode,
    targetPartitionIds,
  )) {
    return null;
  }
  return objectFreeze({
    generation: request.generation,
    workflowId: request.workflowId,
    tableId: request.tableId,
    sourcePartitionId: request.sourcePartitionId,
    targetPartitionIds: objectFreeze(targetPartitionIds),
    targetPartitionVersion: request.targetPartitionVersion,
    membershipPublicationEpoch: request.membershipPublicationEpoch,
    requiredNode: objectFreeze({
      nodeId: requiredNode.nodeId,
      bootIncarnation: requiredNode.bootIncarnation,
    }),
  });
}

function requestsMatch(left, right) {
  return booleanConstructor(left && right) &&
    left.generation === right.generation &&
    left.workflowId === right.workflowId &&
    left.tableId === right.tableId &&
    left.sourcePartitionId === right.sourcePartitionId &&
    left.targetPartitionVersion === right.targetPartitionVersion &&
    left.membershipPublicationEpoch === right.membershipPublicationEpoch &&
    left.requiredNode.nodeId === right.requiredNode.nodeId &&
    left.requiredNode.bootIncarnation === right.requiredNode.bootIncarnation &&
    left.targetPartitionIds.length === right.targetPartitionIds.length &&
    arrayEvery(left.targetPartitionIds, (partitionId, index) =>
      partitionId === right.targetPartitionIds[index]);
}

function readyNotificationMatches(options) {
  const {notification, durableRequest, sourceNodeId} = options;
  return arrayEvery([
    notification?.type === HANDOFF_MESSAGE_TYPE.READY,
    options.durableOwnerNodeId === options.localNodeId,
    booleanConstructor(durableRequest),
    notification?.generation === durableRequest?.generation,
    notification?.workflowId === durableRequest?.workflowId,
    notification?.nodeId === sourceNodeId,
    notification?.bootIncarnation ===
      durableRequest?.requiredNode.bootIncarnation,
    notification?.targetPartitionVersion ===
      durableRequest?.targetPartitionVersion,
  ], booleanConstructor);
}

function durableBarrierIsCurrent(owner, barrier) {
  const tableInfo = owner.getTableInfo(barrier.tableId);
  const transition = owner.parsePartitionTransition(tableInfo);
  const durable = transition?.metadata?.[
    PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE
  ];
  return transition?.state ===
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE &&
    durable?.generation === barrier.generation &&
    owner.resolveActivePartitionVersion(tableInfo) ===
      barrier.targetPartitionVersion;
}

function barrierTargetsAreRoutable(owner, barrier) {
  return arrayEvery(barrier.targetPartitionIds, (partitionId) =>
    owner.getRoutablePartitionServiceNodeIds(
      partitionId,
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    ).length > 0);
}

class SplitCutoverHandoffQueryPlaneOwner {
  constructor(options = {}) {
    const {
      nodeId,
      systemCache,
      messageRouter,
      transactionCoordinator,
      getTableInfo,
      parsePartitionTransition,
      resolveActivePartitionVersion,
      getRoutablePartitionServiceNodeIds,
      ensureTransactionRecoveryObserved,
      isTransactionRecoveryReady,
      requestWorkflowReconcile,
      logger,
    } = objectAssign({}, DEFAULT_OWNER_OPTIONS, options);
    this.nodeId = nodeId;
    this.systemCache = systemCache;
    this.messageRouter = messageRouter;
    this.transactionCoordinator = transactionCoordinator;
    this.getTableInfo = getTableInfo;
    this.parsePartitionTransition = parsePartitionTransition;
    this.resolveActivePartitionVersion = resolveActivePartitionVersion;
    this.getRoutablePartitionServiceNodeIds =
      getRoutablePartitionServiceNodeIds;
    this.ensureTransactionRecoveryObserved = ensureTransactionRecoveryObserved;
    this.isTransactionRecoveryReady = isTransactionRecoveryReady;
    this.requestWorkflowReconcile = requestWorkflowReconcile;
    this.logger = logger;
    this.activeLeasesById = new MapConstructor();
    this.barriersByTableId = new MapConstructor();
    this.nextLeaseId = 0;
    this.started = false;
    this.shuttingDown = false;
    this.cacheChangeListener = () => {
      this.observeDurableBarriers();
      this.evaluateBarriers();
      this.requestWorkflowReconcile();
    };
    this.transportProgressListener = () => this.evaluateBarriers();
  }

  start() {
    if (this.started || this.shuttingDown) return;
    this.started = true;
    this.systemCache?.onCacheChange?.(this.cacheChangeListener);
    this.registerMessageHandler();
    this.registerTransportListeners();
    this.observeDurableBarriers();
    this.evaluateBarriers();
  }

  registerMessageHandler() {
    if (!this.messageRouter?.register) return;
    this.registeredMessageHandler = (envelope) => this.handleMessage(envelope);
    this.messageRouter.register(
      buildSplitCutoverHandoffAddress(this.nodeId),
      this.registeredMessageHandler,
    );
  }

  unregisterMessageHandler() {
    if (!this.registeredMessageHandler) return;
    this.messageRouter?.unregister?.(
      buildSplitCutoverHandoffAddress(this.nodeId),
    );
    this.registeredMessageHandler = null;
  }

  registerTransportListeners() {
    if (typeof this.messageRouter?.on !== 'function') return;
    this.messageRouter.on(
      TRANSPORT_EVENT.CONNECTION_ESTABLISHED,
      this.transportProgressListener,
    );
    this.messageRouter.on(
      TRANSPORT_EVENT.NODE_CONNECTED,
      this.transportProgressListener,
    );
  }

  unregisterTransportListeners() {
    if (typeof this.messageRouter?.off !== 'function') return;
    this.messageRouter.off(
      TRANSPORT_EVENT.CONNECTION_ESTABLISHED,
      this.transportProgressListener,
    );
    this.messageRouter.off(
      TRANSPORT_EVENT.NODE_CONNECTED,
      this.transportProgressListener,
    );
  }

  setSystemCache(systemCache) {
    if (this.systemCache === systemCache) return;
    if (this.started) {
      this.systemCache?.offCacheChange?.(this.cacheChangeListener);
    }
    this.systemCache = systemCache || null;
    if (this.started && !this.shuttingDown) {
      this.systemCache?.onCacheChange?.(this.cacheChangeListener);
      this.observeDurableBarriers();
      this.evaluateBarriers();
    }
  }

  setMessageRouter(messageRouter) {
    if (this.messageRouter === messageRouter) return;
    this.unregisterTransportListeners();
    this.unregisterMessageHandler();
    this.messageRouter = messageRouter || null;
    if (this.started && !this.shuttingDown) {
      this.registerMessageHandler();
      this.registerTransportListeners();
    }
  }

  shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.systemCache?.offCacheChange?.(this.cacheChangeListener);
    this.unregisterTransportListeners();
    this.unregisterMessageHandler();
    mapForEach(this.barriersByTableId, (barrier) =>
      this.rejectBarrierWaiters(
        barrier,
        new ErrorConstructor(HANDOFF_ERROR.SHUTDOWN),
      ));
    mapClear(this.barriersByTableId);
  }

  async handleMessage(envelope = {}) {
    const message = copyStrictOwnDataRecord(envelope);
    const payload = copyStrictOwnDataRecord(message?.payload);
    if (payload?.type === HANDOFF_MESSAGE_TYPE.PREPARE) {
      return this.handlePrepare(payload, message.sourceNodeId);
    }
    if (payload?.type === HANDOFF_MESSAGE_TYPE.READY) {
      return this.handleReady(payload, message.sourceNodeId);
    }
    return {
      acknowledged: true,
      state: HANDOFF_RESPONSE_STATE.REFUSED,
      error: HANDOFF_ERROR.INVALID_REQUEST,
    };
  }

  async handlePrepare(payload, sourceNodeId) {
    const request = normalizePrepareRequest(payload);
    if (!request || !sourceNodeId || !this.isPrepareAuthorized(
      request,
      sourceNodeId,
    )) {
      return {
        acknowledged: true,
        state: HANDOFF_RESPONSE_STATE.REFUSED,
        error: HANDOFF_ERROR.INVALID_REQUEST,
      };
    }
    const barrier = this.installBarrier(request, sourceNodeId);
    this.evaluateBarrier(barrier);
    return this.buildBarrierResponse(barrier);
  }

  handleReady(payload, sourceNodeId) {
    const notification = copyStrictOwnDataRecord(payload);
    const tableInfo = this.getTableInfo(notification?.tableId);
    const transition = this.parsePartitionTransition(tableInfo);
    const durable = transition?.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE
    ];
    const durableRequest = this.resolveDurablePrepareRequest(
      tableInfo,
      sourceNodeId,
    );
    if (!readyNotificationMatches({
      notification,
      durableRequest,
      durableOwnerNodeId: durable?.ownerNodeId,
      localNodeId: this.nodeId,
      sourceNodeId,
    })) {
      return {
        acknowledged: true,
        state: HANDOFF_RESPONSE_STATE.REFUSED,
        error: HANDOFF_ERROR.INVALID_REQUEST,
      };
    }
    this.requestWorkflowReconcile();
    return {
      acknowledged: true,
      state: HANDOFF_RESPONSE_STATE.READY,
      generation: notification.generation,
      nodeId: sourceNodeId,
    };
  }

  installBarrier(request, sourceNodeId) {
    const existing = mapGet(this.barriersByTableId, request.tableId);
    if (existing?.generation === request.generation) return existing;
    const carriedAdmissionWaiters =
      existing?.admissionWaiters || new SetConstructor();
    if (existing) {
      existing.admissionWaiters = new SetConstructor();
    }
    const barrier = {
      ...request,
      sourceNodeId,
      admissionWaiters: carriedAdmissionWaiters,
      readyNotificationSent: false,
    };
    mapSet(this.barriersByTableId, request.tableId, barrier);
    return barrier;
  }

  observeDurableBarriers() {
    const tableRows = this.systemCache?.getAll?.(TABLES.TABLES) || [];
    for (let index = 0; index < tableRows.length; index++) {
      this.observeDurableBarrierFromTableInfo(tableRows[index]);
    }
    const barriers = [];
    mapForEach(this.barriersByTableId, (barrier) => {
      barriers[barriers.length] = barrier;
    });
    for (let index = 0; index < barriers.length; index++) {
      const barrier = barriers[index];
      if (!durableBarrierIsCurrent(this, barrier)) {
        this.releaseBarrier(barrier);
      }
    }
  }

  observeDurableBarrierFromTableInfo(tableInfo) {
    const request = this.resolveDurablePrepareRequest(tableInfo);
    if (!request) return;
    const transition = this.parsePartitionTransition(tableInfo);
    const durable = transition.metadata[
      PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE
    ];
    this.installBarrier(request, durable.ownerNodeId || HANDOFF_DURABLE_SOURCE);
  }

  resolveDurablePrepareRequest(tableInfo, requiredNodeId = this.nodeId) {
    const transition = this.parsePartitionTransition(tableInfo);
    const durable = transition?.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE
    ];
    if (
      transition?.state !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE ||
      !durable ||
      (durable.state !== HANDOFF_CLOSURE_PHASE.CLOSING &&
        durable.state !== HANDOFF_CLOSURE_PHASE.QUERY_PLANE_READY)
    ) return null;
    const requiredNodes = copyDenseOwnDataArray(durable.requiredNodes) || [];
    const requiredNode = arrayFind(requiredNodes,
      (entry) => entry?.nodeId === requiredNodeId,
    );
    if (!requiredNode) return null;
    return normalizePrepareRequest({
      type: HANDOFF_MESSAGE_TYPE.PREPARE,
      generation: durable.generation,
      workflowId: durable.workflowId,
      tableId: durable.tableId,
      sourcePartitionId: durable.sourcePartitionId,
      targetPartitionIds: durable.targetPartitionIds,
      targetPartitionVersion: durable.targetPartitionVersion,
      membershipPublicationEpoch: durable.membershipPublicationEpoch,
      requiredNode,
    });
  }

  isPrepareAuthorized(request, sourceNodeId) {
    if (request.requiredNode.nodeId !== this.nodeId) return false;
    const tableInfo = this.getTableInfo(request.tableId);
    const transition = this.parsePartitionTransition(tableInfo);
    const durable = transition?.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE
    ];
    return durable?.ownerNodeId === sourceNodeId &&
      requestsMatch(request, this.resolveDurablePrepareRequest(tableInfo));
  }

  async acquireStatementLease(ast) {
    const tableNames = this.resolveStatementTableNames(ast);
    while (!this.shuttingDown) {
      const tableSnapshots = arrayFilter(
        arrayMap(tableNames, (tableName) =>
          this.buildTableSnapshot(tableName)),
        booleanConstructor,
      );
      for (let index = 0; index < tableSnapshots.length; index++) {
        this.observeDurableBarrierFromTableInfo(
          tableSnapshots[index].tableInfo,
        );
      }
      const barrier = arrayFind(
        arrayMap(tableSnapshots, (snapshot) =>
          mapGet(this.barriersByTableId, snapshot.tableId)),
        booleanConstructor,
      );
      if (barrier) {
        await new PromiseConstructor((resolve, reject) => {
          setAdd(barrier.admissionWaiters, {resolve, reject});
        });
        continue;
      }
      const lease = {
        leaseId: `${this.nodeId}:${++this.nextLeaseId}`,
        tables: tableSnapshots,
      };
      mapSet(this.activeLeasesById, lease.leaseId, lease);
      return lease;
    }
    throw new ErrorConstructor(HANDOFF_ERROR.SHUTDOWN);
  }

  releaseStatementLease(lease) {
    if (!lease?.leaseId) return;
    mapDelete(this.activeLeasesById, lease.leaseId);
    this.evaluateBarriers();
  }

  notifyTransactionStateChanged() {
    this.evaluateBarriers();
  }

  resolveStatementTableNames(ast) {
    const names = new SetConstructor();
    const visited = new SetConstructor();
    const nestedVisited = new SetConstructor();
    let visit = () => {};
    const append = (value) => {
      if (arrayIsArray(value)) {
        for (let index = 0; index < value.length; index++) {
          append(value[index]);
        }
        return;
      }
      if (value?.subquery) visit(value.subquery);
      const tableName = typeof value === 'string' ? value : value?.name;
      if (tableName) setAdd(names, tableName);
    };
    const visitNested = (value) => {
      if (arrayIsArray(value)) {
        for (let index = 0; index < value.length; index++) {
          visitNested(value[index]);
        }
        return;
      }
      if (!value || typeof value !== 'object' ||
          setHas(nestedVisited, value)) return;
      setAdd(nestedVisited, value);
      if (value.type === 'SELECT') {
        visit(value);
      }
      const keys = reflectOwnKeys(value);
      for (let index = 0; index < keys.length; index++) {
        const descriptor = objectGetOwnPropertyDescriptor(value, keys[index]);
        if (descriptor && objectHasOwn(descriptor, 'value')) {
          visitNested(descriptor.value);
        }
      }
    };
    visit = (query) => {
      if (!query || typeof query !== 'object' || setHas(visited, query)) return;
      setAdd(visited, query);
      append(query.table);
      append(query.from);
      const joins = arrayIsArray(query.joins) ? query.joins : [];
      for (let index = 0; index < joins.length; index++) {
        append(joins[index]?.table);
      }
      const ctes = arrayIsArray(query.ctes) ? query.ctes : [];
      for (let index = 0; index < ctes.length; index++) {
        visit(ctes[index]?.query);
      }
      visit(query.setOperation?.right);
      visitNested(query);
    };
    visit(ast);
    const resolvedNames = [];
    setForEach(names, (name) => {
      resolvedNames[resolvedNames.length] = name;
    });
    return resolvedNames;
  }

  buildTableSnapshot(tableName) {
    const tableInfo = this.getTableInfo(tableName);
    const tableId = stringConstructor(
      readRowField(tableInfo, 'table_id', 'tableId') || '',
    );
    if (!tableInfo || !tableId) return null;
    const transition = this.parsePartitionTransition(tableInfo);
    return {
      tableId,
      tableName,
      partitionVersion: this.resolveActivePartitionVersion(tableInfo),
      workflowId: transition?.metadata?.[
        PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID
      ] || null,
      requiresSourceMirror:
        transition?.state === PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      tableInfo,
    };
  }

  evaluateBarriers() {
    mapForEach(this.barriersByTableId, (barrier) =>
      this.evaluateBarrier(barrier));
  }

  evaluateBarrier(barrier) {
    if (!this.isBarrierReady(barrier)) {
      barrier.readyNotificationSent = false;
      return;
    }
    if (barrier.readyNotificationSent) return;
    barrier.readyNotificationSent = true;
    const notification = {
      type: HANDOFF_MESSAGE_TYPE.READY,
      ...this.buildBarrierResponse(barrier),
    };
    promiseThen(promiseResolve(this.messageRouter?.deliver?.(
      buildSplitCutoverHandoffAddress(barrier.sourceNodeId),
      notification,
      {targetNodeId: barrier.sourceNodeId},
    )), (result) => {
      if (result?.acknowledged !== true || result?.state ===
          HANDOFF_RESPONSE_STATE.REFUSED) {
        barrier.readyNotificationSent = false;
      }
    }, () => {
      barrier.readyNotificationSent = false;
    });
  }

  buildBarrierResponse(barrier) {
    if (!this.isBarrierReady(barrier)) {
      return {
        acknowledged: true,
        state: HANDOFF_RESPONSE_STATE.WAITING,
        generation: barrier.generation,
        workflowId: barrier.workflowId,
        nodeId: this.nodeId,
        bootIncarnation: barrier.requiredNode.bootIncarnation,
        targetPartitionVersion: barrier.targetPartitionVersion,
      };
    }
    return {
      acknowledged: true,
      state: HANDOFF_RESPONSE_STATE.READY,
      generation: barrier.generation,
      workflowId: barrier.workflowId,
      nodeId: this.nodeId,
      bootIncarnation: barrier.requiredNode.bootIncarnation,
      targetPartitionVersion: barrier.targetPartitionVersion,
    };
  }

  isBarrierReady(barrier) {
    this.ensureTransactionRecoveryObserved();
    if (this.shuttingDown || !this.isLocalIncarnationCurrent(barrier)) {
      return false;
    }
    if (this.isTransactionRecoveryReady() !== true) return false;
    if (!durableBarrierIsCurrent(this, barrier)) return false;
    if (this.hasBlockingLease(barrier) || this.hasBlockingTransaction(barrier)) {
      return false;
    }
    return barrierTargetsAreRoutable(this, barrier);
  }

  isLocalIncarnationCurrent(barrier) {
    const nodeRows = this.systemCache?.getAll?.(TABLES.NODES) || [];
    const row = arrayFind(nodeRows, (entry) =>
      readRowField(entry, COLUMN.NODE_ID, 'nodeId') === this.nodeId);
    const status = normalizedString(
      readRowField(row, COLUMN.STATUS, 'status'),
    );
    return (status === NODE_STATE.ACTIVE || status === NODE_STATE.READY) &&
      numberConstructor(
        readRowField(row, COLUMN.BOOT_INCARNATION,
          LOCAL_BOOT_INCARNATION_FIELD),
      ) ===
      barrier.requiredNode.bootIncarnation;
  }

  hasBlockingLease(barrier) {
    let blocked = false;
    mapForEach(this.activeLeasesById, (lease) => {
      if (arraySome(lease.tables, (table) =>
        table.tableId === barrier.tableId)) blocked = true;
    });
    return blocked;
  }

  hasBlockingTransaction(barrier) {
    const partitionIds = new SetConstructor();
    setAdd(partitionIds, barrier.sourcePartitionId);
    for (let index = 0; index < barrier.targetPartitionIds.length; index++) {
      setAdd(partitionIds, barrier.targetPartitionIds[index]);
    }
    const transactions = this.transactionCoordinator?.transactionsBySession;
    if (!(transactions instanceof MapConstructor)) return false;
    let blocked = false;
    mapForEach(transactions, (transaction) => {
      const participants = transaction?.participants;
      if (!(participants instanceof MapConstructor)) return;
      mapForEach(participants, (_participant, partitionId) => {
        if (setHas(partitionIds, partitionId)) blocked = true;
      });
    });
    return blocked;
  }

  releaseBarrier(barrier) {
    if (mapGet(this.barriersByTableId, barrier.tableId) !== barrier) return;
    mapDelete(this.barriersByTableId, barrier.tableId);
    setForEach(barrier.admissionWaiters, (waiter) => waiter.resolve());
    setClear(barrier.admissionWaiters);
  }

  rejectBarrierWaiters(barrier, error) {
    setForEach(barrier.admissionWaiters, (waiter) => waiter.reject(error));
    setClear(barrier.admissionWaiters);
  }
}

export {
  SplitCutoverHandoffQueryPlaneOwner,
};
