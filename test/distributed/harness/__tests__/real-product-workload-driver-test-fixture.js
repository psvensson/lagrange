// Controlled product substitutes for the comparative-benchmark workload
// driver tests. The driver under test is the real driver entry; only the wire
// endpoints are substituted. Evidence ceiling: these fakes prove the driver's
// classification and accounting of each response class, never native product
// behaviour.
import vm from 'node:vm';
import * as perfHooks from 'node:perf_hooks';

import {
  buildWorkloadDriverScript,
} from '../real-product-workload-drivers.js';

const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringIncludes = Function.call.bind(String.prototype.includes);

const FAST_TIMER_MS = 5;
const MODE = Object.freeze({
  OK: 'ok',
  NEVER_OPEN: 'never-open',
  SILENT: 'silent',
  ERROR_ENVELOPE: 'error-envelope',
  ZERO_AFFECTED: 'zero-affected',
  WRONG_VALUE: 'wrong-value',
  COMMIT_ACK_LOST: 'commit-ack-lost',
});
const PRODUCT_ERROR_CODE = 'TABLE_NOT_FOUND';
const TABLE_PATTERN = /\b(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/giu;

function tablesOfStatements(statements) {
  const tables = new Set();
  for (const sql of statements) {
    for (const match of String(sql).matchAll(TABLE_PATTERN)) tables.add(match[1]);
  }
  return [...tables].sort();
}

function createLegacyProbe(mode) {
  return {mode, statements: [], healthRequests: 0};
}

function createFakeWebSocketClass(probe) {
  return class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.handlers = new Map();
      if (probe.mode !== MODE.NEVER_OPEN) {
        setImmediate(() => {
          this.readyState = 1;
          this.emit('open');
        });
      }
    }
    setMaxListeners() {}
    on(event, handler) {
      const list = this.handlers.get(event) || [];
      list.push(handler);
      this.handlers.set(event, list);
    }
    once(event, handler) {
      this.on(event, handler);
    }
    emit(event, ...args) {
      for (const handler of this.handlers.get(event) || []) handler(...args);
    }
    close() {
      this.readyState = 3;
    }
    send(raw) {
      const message = JSON.parse(raw);
      probe.statements.push(message.sql);
      const response = legacyEnvelope(probe.mode, message);
      if (!response) return;
      setImmediate(() => this.emit('message', Buffer.from(JSON.stringify(response))));
    }
  };
}

function legacyEnvelope(mode, message) {
  const base = {type: 'query_result', queryId: message.queryId};
  switch (mode) {
  case MODE.SILENT:
    return null;
  case MODE.ERROR_ENVELOPE:
    return {...base, error: 'Table not found', errorCode: PRODUCT_ERROR_CODE};
  case MODE.ZERO_AFFECTED:
    return {...base, operation: 'update', affectedRows: 0};
  case MODE.WRONG_VALUE:
    return {...base, rows: [{next_order_id: 'garbage', balance: 'garbage'}]};
  default:
    return {...base, operation: 'update', affectedRows: 1, rows: []};
  }
}

function createFakeHttp(probe) {
  return {
    Agent: class FakeAgent {},
    request(_options, onResponse) {
      probe.healthRequests += 1;
      const request = {
        on() {},
        end() {
          setImmediate(() => {
            const handlers = new Map();
            const response = {
              statusCode: 200,
              on(event, handler) {
                handlers.set(event, handler);
              },
            };
            onResponse(response);
            handlers.get('data')?.(Buffer.from('{"status":"ok"}'));
            handlers.get('end')?.();
          });
        },
      };
      return request;
    },
  };
}

function createFakeMysqlPromise(probe) {
  const connection = {
    async ping() {},
    async beginTransaction() {
      probe.statements.push('BEGIN');
    },
    async query(sql) {
      probe.statements.push(sql);
      if (probe.mode === MODE.ZERO_AFFECTED) return [{affectedRows: 0}];
      return stringIncludes(sql, 'SELECT') ? [[{balance: 1, version: 1}]] : [{affectedRows: 1}];
    },
    async commit() {
      probe.statements.push('COMMIT');
    },
    release() {},
  };
  return {
    createPool() {
      return {
        async getConnection() {
          return connection;
        },
        async end() {},
      };
    },
  };
}

function legacyEndpoints(targetId) {
  if (stringIncludes(targetId, 'tidb')) return ['mysql://10.0.0.9:4000'];
  return ['http://10.0.0.7:8080'];
}

function legacyAccounting(printed) {
  return {
    offered: printed.totalAttempts,
    committed: printed.completed,
    unresolved: printed.timeouts,
    unissued: 0,
    terminalFailures: {},
  };
}

function legacyObserved(printed, probe) {
  return {
    dispatchStatus: 'executed',
    accounting: legacyAccounting(printed),
    latencyCount: Array.isArray(printed.latenciesMs) ? printed.latenciesMs.length : 0,
    failureClasses: [],
    outputKeys: Object.keys(printed),
    statements: [...probe.statements],
    tables: tablesOfStatements(probe.statements),
    healthRequests: probe.healthRequests,
    kinds: [],
  };
}

// Evaluates the generated driver script exactly as the base runner does
// (`node -e eval(...)`), with the native client modules substituted.
async function runDriverCase({targetId, scenario, subkind, mode = MODE.OK, operations = 6}) {
  const probe = createLegacyProbe(mode);
  const script = buildWorkloadDriverScript({
    targetId,
    scenario,
    subkind,
    endpoints: legacyEndpoints(targetId),
    totalOps: operations,
    concurrency: 2,
    payloadConfig: {keySpace: 4},
  });
  const modules = {
    'node:perf_hooks': perfHooks,
    'node:http': createFakeHttp(probe),
    'ws': createFakeWebSocketClass(probe),
    'mysql2/promise': createFakeMysqlPromise(probe),
  };
  let resolvePrinted;
  const printed = new Promise((resolve) => {
    resolvePrinted = resolve;
  });
  const context = vm.createContext({
    require(name) {
      if (!(name in modules)) throw new Error(`unexpected module ${name}`);
      return modules[name];
    },
    console: {log: (line) => resolvePrinted(JSON.parse(line))},
    Buffer,
    URL,
    setImmediate,
    setTimeout: (callback, ms) => setTimeout(callback, Math.min(ms, FAST_TIMER_MS)),
    clearTimeout,
  });
  vm.runInContext(script, context);
  return legacyObserved(await printed, probe);
}

function workloadStatements(observed) {
  return arrayFilter(observed.statements, (sql) => sql !== 'BEGIN' && sql !== 'COMMIT');
}

function kindsOf(observed) {
  return arrayMap(observed.kinds, (kind) => kind);
}

export {
  MODE as DRIVER_FIXTURE_MODE,
  kindsOf,
  runDriverCase,
  tablesOfStatements,
  workloadStatements,
};
