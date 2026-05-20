const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_DEFAULT_MAX_STEPS = 1000;
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_FUNCTION = 'function';
const DETERMINISTIC_SIMULATOR_LINK_SEPARATOR = '::';
const DETERMINISTIC_SIMULATOR_STORAGE_LOG = 'event_log';

const DETERMINISTIC_SIMULATOR_COMMAND = Object.freeze({
  HEAL: 'heal',
  KILL_NODE: 'kill_node',
  PARTITION: 'partition',
  REGISTER_NODE: 'register_node',
  RUN_UNTIL_IDLE: 'run_until_idle',
  SCHEDULE: 'schedule',
  SEND: 'send',
  START_NODE: 'start_node',
  STORAGE_APPEND: 'storage_append',
  STORAGE_CAS: 'storage_cas',
  STORAGE_WRITE: 'storage_write',
});

const DETERMINISTIC_SIMULATOR_EVENT = Object.freeze({
  COMMAND: 'command',
  DELIVERED: 'delivered',
  DROPPED: 'dropped',
  HANDLED: 'handled',
  OBSERVED: 'observed',
  SCHEDULED: 'scheduled',
});

const DETERMINISTIC_SIMULATOR_NODE_STATE = Object.freeze({
  RUNNING: 'running',
  STOPPED: 'stopped',
});

const DETERMINISTIC_SIMULATOR_DROP_REASON = Object.freeze({
  LINK_PARTITIONED: 'link_partitioned',
  NODE_STOPPED: 'node_stopped',
});

function clonePlain(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlain);
  }
  if (value && typeof value === LOCAL_STR_OBJECT) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clonePlain(entry)]),
    );
  }
  return value;
}

function linkKey(leftNodeId, rightNodeId) {
  return [leftNodeId, rightNodeId]
    .sort()
    .join(DETERMINISTIC_SIMULATOR_LINK_SEPARATOR);
}

function createQueueEntry(sequence, dueTimeMs, event) {
  return Object.freeze({
    sequence,
    dueTimeMs,
    event: Object.freeze({...event}),
  });
}

function createDeterministicSimulator(options = {}) {
  let nowMs = Number.isFinite(options.startTimeMs) ?
    Math.floor(options.startTimeMs) :
    LOCAL_NUM_ZERO;
  let logSequence = LOCAL_NUM_ZERO;
  let queueSequence = LOCAL_NUM_ZERO;
  let handlerDepth = LOCAL_NUM_ZERO;
  const eventLog = [];
  const queue = [];
  const nodes = new Map();
  const handlers = new Map(Object.entries(options.handlers || {}));
  const partitions = new Set();
  const storage = new Map();
  const storageLogs = new Map();

  function record(entry) {
    const event = Object.freeze({
      sequence: logSequence++,
      timeMs: nowMs,
      ...entry,
      payload: clonePlain(entry.payload || {}),
    });
    eventLog.push(event);
    return event;
  }

  function recordCommand(command, payload = {}) {
    return record({
      kind: DETERMINISTIC_SIMULATOR_EVENT.COMMAND,
      command,
      replayable: handlerDepth === LOCAL_NUM_ZERO,
      payload,
    });
  }

  function scheduleInternal(delayMs, event) {
    const dueTimeMs = nowMs + Math.max(
      LOCAL_NUM_ZERO,
      Number.isFinite(delayMs) ? Math.floor(delayMs) : LOCAL_NUM_ZERO,
    );
    queue.push(createQueueEntry(queueSequence++, dueTimeMs, event));
    queue.sort((left, right) =>
      left.dueTimeMs - right.dueTimeMs ||
      left.sequence - right.sequence,
    );
  }

  function schedule(options) {
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.SCHEDULE, {
      type: options.type,
      payload: clonePlain(options.payload || {}),
      delayMs: options.delayMs || LOCAL_NUM_ZERO,
    });
    scheduleInternal(options.delayMs || LOCAL_NUM_ZERO, {
      from: options.from,
      to: options.to,
      type: options.type,
      payload: clonePlain(options.payload || {}),
      scheduled: true,
    });
  }

  function resolveNodeState(nodeId) {
    return nodes.get(nodeId) ||
      DETERMINISTIC_SIMULATOR_NODE_STATE.STOPPED;
  }

  function isPartitioned(fromNodeId, toNodeId) {
    return partitions.has(linkKey(fromNodeId, toNodeId));
  }

  function registerNode(nodeId, handler) {
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.REGISTER_NODE, {
      nodeId,
    });
    nodes.set(nodeId, DETERMINISTIC_SIMULATOR_NODE_STATE.RUNNING);
    if (typeof handler === LOCAL_STR_FUNCTION) {
      handlers.set(nodeId, handler);
    }
  }

  function startNode(nodeId) {
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.START_NODE, {nodeId});
    nodes.set(nodeId, DETERMINISTIC_SIMULATOR_NODE_STATE.RUNNING);
  }

  function killNode(nodeId) {
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.KILL_NODE, {nodeId});
    nodes.set(nodeId, DETERMINISTIC_SIMULATOR_NODE_STATE.STOPPED);
  }

  function partition(leftNodeId, rightNodeId) {
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.PARTITION, {
      leftNodeId,
      rightNodeId,
    });
    partitions.add(linkKey(leftNodeId, rightNodeId));
  }

  function heal(leftNodeId, rightNodeId) {
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.HEAL, {
      leftNodeId,
      rightNodeId,
    });
    partitions.delete(linkKey(leftNodeId, rightNodeId));
  }

  function send(options) {
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.SEND, {
      from: options.from,
      to: options.to,
      type: options.type,
      payload: clonePlain(options.payload || {}),
      delayMs: options.delayMs || LOCAL_NUM_ZERO,
    });
    scheduleInternal(options.delayMs || LOCAL_NUM_ZERO, {
      from: options.from,
      to: options.to,
      type: options.type,
      payload: clonePlain(options.payload || {}),
    });
  }

  function observe(options) {
    record({
      kind: DETERMINISTIC_SIMULATOR_EVENT.OBSERVED,
      nodeId: options.nodeId,
      type: options.type,
      payload: clonePlain(options.payload || {}),
    });
  }

  function deliver(entry) {
    const event = entry.event;
    nowMs = entry.dueTimeMs;
    if (resolveNodeState(event.to) !==
        DETERMINISTIC_SIMULATOR_NODE_STATE.RUNNING) {
      record({
        kind: DETERMINISTIC_SIMULATOR_EVENT.DROPPED,
        from: event.from,
        to: event.to,
        type: event.type,
        reason: DETERMINISTIC_SIMULATOR_DROP_REASON.NODE_STOPPED,
        payload: event.payload,
      });
      return;
    }
    if (isPartitioned(event.from, event.to)) {
      record({
        kind: DETERMINISTIC_SIMULATOR_EVENT.DROPPED,
        from: event.from,
        to: event.to,
        type: event.type,
        reason: DETERMINISTIC_SIMULATOR_DROP_REASON.LINK_PARTITIONED,
        payload: event.payload,
      });
      return;
    }
    record({
      kind: event.scheduled === true ?
        DETERMINISTIC_SIMULATOR_EVENT.SCHEDULED :
        DETERMINISTIC_SIMULATOR_EVENT.DELIVERED,
      from: event.from,
      to: event.to,
      type: event.type,
      payload: event.payload,
    });
    const handler = handlers.get(event.to);
    if (typeof handler === LOCAL_STR_FUNCTION) {
      handlerDepth += LOCAL_NUM_ONE;
      try {
        handler(Object.freeze({...event}), api);
      } finally {
        handlerDepth -= LOCAL_NUM_ONE;
      }
      record({
        kind: DETERMINISTIC_SIMULATOR_EVENT.HANDLED,
        from: event.from,
        to: event.to,
        type: event.type,
        payload: event.payload,
      });
    }
  }

  function runUntilIdle(options = {}) {
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.RUN_UNTIL_IDLE, {
      maxSteps: options.maxSteps || LOCAL_NUM_DEFAULT_MAX_STEPS,
    });
    const maxSteps = options.maxSteps || LOCAL_NUM_DEFAULT_MAX_STEPS;
    let steps = LOCAL_NUM_ZERO;
    while (queue.length > LOCAL_NUM_ZERO && steps < maxSteps) {
      const entry = queue.shift();
      deliver(entry);
      steps += LOCAL_NUM_ONE;
    }
    return Object.freeze({
      steps,
      remaining: queue.length,
      nowMs,
    });
  }

  function getEventLog() {
    return Object.freeze(eventLog.map((entry) => Object.freeze({
      ...entry,
      payload: clonePlain(entry.payload || {}),
    })));
  }

  function storageRead(key) {
    return clonePlain(storage.get(key) || {});
  }

  function storageWrite(key, value) {
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.STORAGE_WRITE, {
      key,
      value: clonePlain(value || {}),
    });
    storage.set(key, clonePlain(value || {}));
  }

  function storageCompareAndSwap(key, expectedVersion, value) {
    const current = storage.get(key) || {};
    const applied = current.version === expectedVersion;
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.STORAGE_CAS, {
      key,
      expectedVersion,
      applied,
      value: clonePlain(value || {}),
    });
    if (applied) {
      storage.set(key, clonePlain(value || {}));
    }
    return Object.freeze({
      applied,
      current: clonePlain(storage.get(key) || current),
    });
  }

  function storageAppend(logName, value) {
    const name = logName || DETERMINISTIC_SIMULATOR_STORAGE_LOG;
    const currentLog = storageLogs.get(name) || [];
    const nextLog = Object.freeze([...currentLog, clonePlain(value || {})]);
    recordCommand(DETERMINISTIC_SIMULATOR_COMMAND.STORAGE_APPEND, {
      logName: name,
      value: clonePlain(value || {}),
    });
    storageLogs.set(name, nextLog);
    return nextLog.length;
  }

  function storageReadLog(logName) {
    return Object.freeze([
      ...(storageLogs.get(logName || DETERMINISTIC_SIMULATOR_STORAGE_LOG) ||
        []),
    ].map(clonePlain));
  }

  function snapshot() {
    return Object.freeze({
      nowMs,
      queued: queue.length,
      nodes: Object.freeze(Object.fromEntries(nodes.entries())),
      partitions: Object.freeze([...partitions].sort()),
      eventLog: getEventLog(),
      storage: Object.freeze(Object.fromEntries(storage.entries())),
      storageLogs: Object.freeze(Object.fromEntries(storageLogs.entries())),
    });
  }

  const api = Object.freeze({
    get nowMs() {
      return nowMs;
    },
    getEventLog,
    heal,
    killNode,
    observe,
    partition,
    registerNode,
    runUntilIdle,
    schedule,
    send,
    snapshot,
    startNode,
    storage: Object.freeze({
      append: storageAppend,
      compareAndSwap: storageCompareAndSwap,
      read: storageRead,
      readLog: storageReadLog,
      write: storageWrite,
    }),
  });

  return api;
}

function replayDeterministicSimulation(eventLog, options = {}) {
  const simulator = createDeterministicSimulator(options);
  const commands = Array.isArray(eventLog) ?
    eventLog.filter((entry) =>
      entry?.kind === DETERMINISTIC_SIMULATOR_EVENT.COMMAND &&
      entry?.replayable !== false,
    ) :
    [];
  for (const entry of commands) {
    const payload = entry.payload || {};
    if (entry.command === DETERMINISTIC_SIMULATOR_COMMAND.REGISTER_NODE) {
      simulator.registerNode(payload.nodeId);
    } else if (entry.command === DETERMINISTIC_SIMULATOR_COMMAND.START_NODE) {
      simulator.startNode(payload.nodeId);
    } else if (entry.command === DETERMINISTIC_SIMULATOR_COMMAND.KILL_NODE) {
      simulator.killNode(payload.nodeId);
    } else if (entry.command === DETERMINISTIC_SIMULATOR_COMMAND.PARTITION) {
      simulator.partition(payload.leftNodeId, payload.rightNodeId);
    } else if (entry.command === DETERMINISTIC_SIMULATOR_COMMAND.HEAL) {
      simulator.heal(payload.leftNodeId, payload.rightNodeId);
    } else if (entry.command === DETERMINISTIC_SIMULATOR_COMMAND.SEND) {
      simulator.send(payload);
    } else if (entry.command ===
        DETERMINISTIC_SIMULATOR_COMMAND.RUN_UNTIL_IDLE) {
      simulator.runUntilIdle({maxSteps: payload.maxSteps});
    } else if (entry.command === DETERMINISTIC_SIMULATOR_COMMAND.SCHEDULE) {
      simulator.schedule(payload);
    } else if (entry.command === DETERMINISTIC_SIMULATOR_COMMAND.STORAGE_WRITE) {
      simulator.storage.write(payload.key, payload.value);
    } else if (entry.command === DETERMINISTIC_SIMULATOR_COMMAND.STORAGE_CAS) {
      simulator.storage.compareAndSwap(
        payload.key,
        payload.expectedVersion,
        payload.value,
      );
    } else if (entry.command ===
        DETERMINISTIC_SIMULATOR_COMMAND.STORAGE_APPEND) {
      simulator.storage.append(payload.logName, payload.value);
    }
  }
  return simulator;
}

function minimizeDeterministicTrace(eventLog, predicate) {
  const replayableCommands = Array.isArray(eventLog) ?
    eventLog.filter((entry) =>
      entry?.kind === DETERMINISTIC_SIMULATOR_EVENT.COMMAND &&
      entry?.replayable !== false,
    ) :
    [];
  let minimized = [...replayableCommands];
  let index = LOCAL_NUM_ZERO;
  while (index < minimized.length) {
    const candidate = [
      ...minimized.slice(LOCAL_NUM_ZERO, index),
      ...minimized.slice(index + LOCAL_NUM_ONE),
    ];
    if (predicate(candidate) === true) {
      minimized = candidate;
    } else {
      index += LOCAL_NUM_ONE;
    }
  }
  return Object.freeze(minimized.map(clonePlain));
}

export {
  DETERMINISTIC_SIMULATOR_COMMAND,
  DETERMINISTIC_SIMULATOR_DROP_REASON,
  DETERMINISTIC_SIMULATOR_EVENT,
  DETERMINISTIC_SIMULATOR_NODE_STATE,
  createDeterministicSimulator,
  minimizeDeterministicTrace,
  replayDeterministicSimulation,
};
