import assert from 'node:assert/strict';
import t from 'tap';

import {computeSourceFingerprint} from '../../../src/diagnostics/source-fingerprint.js';
import {
  LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
} from '../harness/oltp-scenario-a-lagrange-proof-plan.js';
import {
  buildLagrangeScenarioALiveAdmission,
} from '../harness/oltp-scenario-a-lagrange-live-admission.js';
import {
  buildScenarioANewOrderContentionCase,
} from '../harness/oltp-scenario-a-new-order-contention-case.js';
import {
  buildScenarioAPaymentCase,
} from '../harness/oltp-scenario-a-payment-case.js';
import {
  buildScenarioAOrderStatusCase,
} from '../harness/oltp-scenario-a-order-status-case.js';
import {
  buildScenarioADeliveryCase,
} from '../harness/oltp-scenario-a-delivery-case.js';
import {
  buildScenarioAStockLevelCase,
} from '../harness/oltp-scenario-a-stock-level-case.js';
import {
  buildScenarioAFailureAtomicityCase,
} from '../harness/oltp-scenario-a-failure-atomicity-case.js';
import {
  buildScenarioADurabilityCase,
} from '../harness/oltp-scenario-a-durability-case.js';
import {
  observeLagrangePaymentState,
} from './lagrange-payment-observer.js';
import {
  LAGRANGE_OLTP_SNAPSHOT_TABLES,
  observeLagrangeOltpStateSnapshot,
} from './lagrange-oltp-state-snapshot.js';
import {
  observeLagrangeDeliveryState,
} from './lagrange-delivery-observer.js';
import {
  induceLagrangeRetryableConflict,
} from './lagrange-retryable-conflict-probe.js';
import {
  preStart as preStartContention,
  run as runContention,
} from '../scenarios/scenario-a-new-order-contention-lagrange.js';
import {
  preStart as preStartPayment,
  run as runPayment,
} from '../scenarios/scenario-a-payment-lagrange.js';
import {
  preStart as preStartOrderStatus,
  run as runOrderStatus,
} from '../scenarios/scenario-a-order-status-lagrange.js';
import {
  preStart as preStartDelivery,
  run as runDelivery,
} from '../scenarios/scenario-a-delivery-lagrange.js';
import {
  preStart as preStartStockLevel,
  run as runStockLevel,
} from '../scenarios/scenario-a-stock-level-lagrange.js';
import {
  preStart as preStartFailureAtomicity,
  run as runFailureAtomicity,
} from '../scenarios/scenario-a-failure-atomicity-lagrange.js';
import {
  preStart as preStartRetryableConflict,
  run as runRetryableConflict,
} from '../scenarios/scenario-a-retryable-conflict-lagrange.js';
import {
  preStart as preStartDurability,
  run as runDurability,
} from '../scenarios/scenario-a-durability-lagrange.js';

const ENDPOINT = Object.freeze({host: '127.0.0.1', port: 5432});
const CONNECTION = Object.freeze({user: 'benchmark', database: 'benchmark', ssl: false});
const DUMMY_STATE_SHA = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const SOURCE_FINGERPRINT = await computeSourceFingerprint('src');

function makeAdmission(proofCaseId) {
  return buildLagrangeScenarioALiveAdmission({
    proofCaseId,
    formationCertification: {
      ...LAGRANGE_SCENARIO_A_FORMATION_REQUIREMENT,
      status: 'passed',
      coreHeadSha: 'a'.repeat(40),
      srcFingerprint: SOURCE_FINGERPRINT,
      artifactSha256: 'b'.repeat(64),
    },
  });
}

function fakeMockContext(admission) {
  return Object.freeze({
    admission,
    runtimePreflight: Object.freeze({preflightSha256: 'fake-preflight'}),
    publicExecutionContract: admission.publicExecutionContract,
    connection: CONNECTION,
    endpoint: ENDPOINT,
    serviceEndpoint: Object.freeze({
      nodeId: 'node-1',
      protocol: 'postgresql',
      advertisedAddress: null,
      port: 5432,
      healthStatus: 'healthy',
    }),
  });
}

async function testPaymentObserver() {
  const events = [];
  const client = {
    async connect() {
      events.push('connect');
    },
    async query(sql) {
      events.push(sql);
      if (sql.includes('FROM warehouse')) return {rows: [{ytd_cents: 300000000}]};
      if (sql.includes('FROM district')) return {rows: [{ytd_cents: 30000000}]};
      if (sql.includes('FROM customer')) {
        return {
          rows: [{
            balance_cents: -1000,
            ytd_payment_cents: 1000,
            payment_count: 2,
          }],
        };
      }
      if (sql.includes('FROM history')) return {rows: [{amount_cents: 1000}]};
      return {rows: []};
    },
    async end() {
      events.push('end');
    },
  };
  const result = await observeLagrangePaymentState({
    endpoint: ENDPOINT,
    connection: CONNECTION,
    operation: {
      warehouseId: 1,
      districtId: 1,
      customerWarehouseId: 1,
      customerDistrictId: 1,
      customerId: 1,
      phase: 'measurement',
      workerId: 1,
      sequence: 1,
    },
    createClient: () => client,
  });
  assert.equal(result.warehouseYtdCents, 300000000);
  assert.equal(result.districtYtdCents, 30000000);
  assert.equal(result.customerBalanceCents, -1000);
  assert.equal(result.customerYtdPaymentCents, 1000);
  assert.equal(result.customerPaymentCount, 2);
  assert.equal(result.historyCount, 1);
  assert.equal(result.historyAmountCents, 1000);
  assert.equal(events.includes('connect'), true);
  assert.equal(events.includes('end'), true);
}

async function testOltpStateSnapshot() {
  const queriedTables = [];
  const client = {
    async connect() {},
    async query(sql) {
      for (const table of LAGRANGE_OLTP_SNAPSHOT_TABLES) {
        if (sql.includes(`FROM ${table.name}`)) {
          queriedTables.push(table.name);
          return {rows: [{[table.columns[0]]: 1}]};
        }
      }
      return {rows: []};
    },
    async end() {},
  };
  const snapshot = await observeLagrangeOltpStateSnapshot({
    endpoint: ENDPOINT,
    connection: CONNECTION,
    createClient: () => client,
  });
  assert.equal(typeof snapshot.stateSha256, 'string');
  assert.equal(snapshot.state.length, LAGRANGE_OLTP_SNAPSHOT_TABLES.length);
  assert.equal(queriedTables.length, LAGRANGE_OLTP_SNAPSHOT_TABLES.length);
}

async function testDeliveryObserver() {
  const client = {
    async connect() {},
    async query(sql) {
      if (sql.includes('FROM orders')) {
        return {rows: [{customer_id: 1, carrier_id: 2}]};
      }
      if (sql.includes('FROM new_order')) {
        return {rows: [{row_count: 0}]};
      }
      if (sql.includes('FROM order_line')) {
        return {
          rows: [
            {line_number: 1, amount_cents: 500, delivered: 1},
            {line_number: 2, amount_cents: 500, delivered: 1},
          ],
        };
      }
      if (sql.includes('FROM customer')) {
        return {rows: [{balance_cents: 1000, delivery_count: 1}]};
      }
      return {rows: []};
    },
    async end() {},
  };
  const result = await observeLagrangeDeliveryState({
    endpoint: ENDPOINT,
    connection: CONNECTION,
    warehouseId: 1,
    districts: [{districtId: 1, orderId: 3001}],
    createClient: () => client,
  });
  assert.equal(result.districts.length, 1);
  assert.equal(result.districts[0].deliveredLineCount, 2);
  assert.equal(result.districts[0].lineTotalCents, 1000);
}

async function testRetryableConflictProbe() {
  let leftOpen = false;
  function createClient() {
    let side = null;
    return {
      async connect() {},
      async query(sql) {
        if (sql === 'BEGIN') {
          if (!side) {
            side = !leftOpen ? 'left' : 'right';
            if (side === 'left') leftOpen = true;
          }
          return {rowCount: 0};
        }
        if (sql === 'COMMIT') {
          if (side === 'right') {
            const error = new Error('serialization failure');
            error.code = '40001';
            throw error;
          }
          return {rowCount: 0};
        }
        if (sql === 'ROLLBACK') {
          return {rowCount: 0};
        }
        return {rows: [{ytd_cents: 100}]};
      },
      async end() {},
    };
  }
  const probe = await induceLagrangeRetryableConflict({
    endpoint: ENDPOINT,
    connection: CONNECTION,
    createClient,
  });
  assert.equal(probe.victim.side, 'right');
  assert.equal(probe.victim.code, '40001');
  assert.equal(probe.victim.sqlState, '40001');
  assert.equal(probe.results.length, 2);
}

async function testPreStartTokens() {
  const scenarios = [
    {id: 'new-order-contention', preStart: preStartContention},
    {id: 'payment', preStart: preStartPayment},
    {id: 'order-status', preStart: preStartOrderStatus},
    {id: 'delivery', preStart: preStartDelivery},
    {id: 'stock-level', preStart: preStartStockLevel},
    {id: 'failure-atomicity', preStart: preStartFailureAtomicity},
    {id: 'retryable-conflict', preStart: preStartRetryableConflict},
    {id: 'durability', preStart: preStartDurability},
  ];

  for (const scenario of scenarios) {
    const admission = makeAdmission(scenario.id);
    const token = await scenario.preStart({admission});
    assert.match(token.admissionSha256, /^[0-9a-f]{64}$/u);
    assert.match(token.runtimePreflightSha256, /^[0-9a-f]{64}$/u);

    const wrongAdmission = makeAdmission(
      scenario.id === 'payment' ? 'delivery' : 'payment',
    );
    await assert.rejects(
      scenario.preStart({admission: wrongAdmission}),
      /bound admission/u,
    );
  }
}

async function testScenarioRunContracts() {
  const fakeCluster = {
    getNodes: () => [{id: 'node-1', ip: '127.0.0.1'}],
    restartNode: async () => {},
  };

  // 1. Contention
  {
    const admission = makeAdmission('new-order-contention');
    const caseDef = buildScenarioANewOrderContentionCase();
    const result = await runContention(fakeCluster, {
      admission,
      prepareContext: () => fakeMockContext(admission),
      createAdapter: async () => ({
        executionPath: 'public-sql',
        protocol: 'postgresql',
        lockingReadMode: 'snapshot-write-conflict',
        datasetSha256: caseDef.identity.datasetSha256,
        executeTransaction: async (op) => ({orderId: op.sequence, ...op}),
        close: async () => {},
      }),
      observeState: async () => ({
        districtNextOrderId: caseDef.identity.expected.districtNextOrderId,
        orderIds: caseDef.identity.expected.orderIds,
        newOrderIds: caseDef.identity.expected.newOrderIds,
        orderLineCountByOrderId: caseDef.identity.expected.orderLineCountByOrderId,
        stockRows: caseDef.identity.expected.stockRows,
      }),
      outputPath: '/tmp/test-contention.json',
    });
    assert.equal(result.status, 'passed');
  }

  // 2. Payment
  {
    const admission = makeAdmission('payment');
    const caseDef = buildScenarioAPaymentCase();
    const result = await runPayment(fakeCluster, {
      admission,
      prepareContext: () => fakeMockContext(admission),
      createAdapter: async () => ({
        executionPath: 'public-sql',
        protocol: 'postgresql',
        lockingReadMode: 'snapshot-write-conflict',
        datasetSha256: caseDef.identity.datasetSha256,
        executeTransaction: async () => ({paidCents: caseDef.identity.expected.paidCents}),
        close: async () => {},
      }),
      observePayment: async () => ({
        warehouseYtdCents: caseDef.identity.expected.warehouseYtdCents,
        districtYtdCents: caseDef.identity.expected.districtYtdCents,
        customerBalanceCents: caseDef.identity.expected.customerBalanceCents,
        customerYtdPaymentCents: caseDef.identity.expected.customerYtdPaymentCents,
        customerPaymentCount: caseDef.identity.expected.customerPaymentCount,
        historyCount: caseDef.identity.expected.historyCount,
        historyAmountCents: caseDef.identity.expected.historyAmountCents,
      }),
      outputPath: '/tmp/test-payment.json',
    });
    assert.equal(result.status, 'passed');
  }

  // 3. Order Status
  {
    const admission = makeAdmission('order-status');
    const caseDef = buildScenarioAOrderStatusCase();
    const result = await runOrderStatus(fakeCluster, {
      admission,
      prepareContext: () => fakeMockContext(admission),
      createAdapter: async () => ({
        executionPath: 'public-sql',
        protocol: 'postgresql',
        lockingReadMode: 'snapshot-write-conflict',
        datasetSha256: caseDef.identity.datasetSha256,
        executeTransaction: async () => ({
          orderId: caseDef.identity.expected.orderId,
          lineCount: caseDef.identity.expected.lineCount,
          lines: caseDef.identity.expected.lines,
        }),
        close: async () => {},
      }),
      observeSnapshot: async () => ({stateSha256: DUMMY_STATE_SHA}),
      outputPath: '/tmp/test-order-status.json',
    });
    assert.equal(result.status, 'passed');
  }

  // 4. Delivery
  {
    const admission = makeAdmission('delivery');
    const caseDef = buildScenarioADeliveryCase();
    const result = await runDelivery(fakeCluster, {
      admission,
      prepareContext: () => fakeMockContext(admission),
      createAdapter: async () => ({
        executionPath: 'public-sql',
        protocol: 'postgresql',
        lockingReadMode: 'snapshot-write-conflict',
        datasetSha256: caseDef.identity.datasetSha256,
        executeTransaction: async (op) => {
          const expectedDistrict = caseDef.identity.expected.districts.find(
            ({districtId}) => districtId === op.districtId,
          );
          return {
            deliveredOrders: caseDef.identity.expected.districts.length,
            orderId: expectedDistrict ? expectedDistrict.orderId : undefined,
          };
        },
        close: async () => {},
      }),
      observeDelivery: async () => ({
        districts: caseDef.identity.expected.districts.map((d) => ({
          ...d,
          newOrderCount: 0,
          deliveredLineCount: d.lineCount,
        })),
      }),
      outputPath: '/tmp/test-delivery.json',
    });
    assert.equal(result.status, 'passed');
  }

  // 5. Stock Level
  {
    const admission = makeAdmission('stock-level');
    const caseDef = buildScenarioAStockLevelCase();
    const result = await runStockLevel(fakeCluster, {
      admission,
      prepareContext: () => fakeMockContext(admission),
      createAdapter: async () => ({
        executionPath: 'public-sql',
        protocol: 'postgresql',
        lockingReadMode: 'snapshot-write-conflict',
        datasetSha256: caseDef.identity.datasetSha256,
        executeTransaction: async () => ({
          orderId: caseDef.identity.expected.setupOrderId,
          lowStock: caseDef.identity.expected.lowStock,
        }),
        close: async () => {},
      }),
      observeSnapshot: async () => ({stateSha256: DUMMY_STATE_SHA}),
      outputPath: '/tmp/test-stock-level.json',
    });
    assert.equal(result.status, 'passed');
  }

  // 6. Failure Atomicity
  {
    const admission = makeAdmission('failure-atomicity');
    const caseDef = buildScenarioAFailureAtomicityCase();
    const terminalError = new Error(
      'simulated terminal error: OLTP transaction expected one item row',
    );
    terminalError.oltpRetryEvidence = {
      retries: 0,
      attempts: 1,
      failures: [{outcome: 'terminal-failure', retryable: false}],
    };
    const result = await runFailureAtomicity(fakeCluster, {
      admission,
      prepareContext: () => fakeMockContext(admission),
      createAdapter: async () => ({
        executionPath: 'public-sql',
        protocol: 'postgresql',
        lockingReadMode: 'snapshot-write-conflict',
        datasetSha256: caseDef.identity.datasetSha256,
        executeTransaction: async () => {
          throw terminalError;
        },
        close: async () => {},
      }),
      observeSnapshot: async () => ({stateSha256: DUMMY_STATE_SHA}),
      outputPath: '/tmp/test-failure-atomicity.json',
    });
    assert.equal(result.status, 'passed');
  }

  // 7. Retryable Conflict
  {
    const admission = makeAdmission('retryable-conflict');
    const result = await runRetryableConflict(fakeCluster, {
      admission,
      prepareContext: () => fakeMockContext(admission),
      createAdapter: async () => ({
        executionPath: 'public-sql',
        protocol: 'postgresql',
        lockingReadMode: 'snapshot-write-conflict',
        close: async () => {},
      }),
      induceConflict: async () => ({
        victim: {side: 'right', code: '40001', sqlState: '40001', message: 'conflict'},
        results: [],
      }),
      outputPath: '/tmp/test-retryable-conflict.json',
    });
    assert.equal(result.status, 'passed');
  }

  // 8. Durability
  {
    const admission = makeAdmission('durability');
    const caseDef = buildScenarioADurabilityCase();
    const payment = buildScenarioAPaymentCase();
    const result = await runDurability(fakeCluster, {
      admission,
      prepareContext: () => fakeMockContext(admission),
      createAdapter: async () => ({
        executionPath: 'public-sql',
        protocol: 'postgresql',
        lockingReadMode: 'snapshot-write-conflict',
        datasetSha256: caseDef.identity.datasetSha256,
        executeTransaction: async () => ({paidCents: payment.identity.expected.paidCents}),
        close: async () => {},
      }),
      restartCluster: async () => {},
      observePayment: async () => ({
        warehouseYtdCents: payment.identity.expected.warehouseYtdCents,
        districtYtdCents: payment.identity.expected.districtYtdCents,
        customerBalanceCents: payment.identity.expected.customerBalanceCents,
        customerYtdPaymentCents: payment.identity.expected.customerYtdPaymentCents,
        customerPaymentCount: payment.identity.expected.customerPaymentCount,
        historyCount: payment.identity.expected.historyCount,
        historyAmountCents: payment.identity.expected.historyAmountCents,
      }),
      observeSnapshot: async () => ({stateSha256: DUMMY_STATE_SHA}),
      outputPath: '/tmp/test-durability.json',
    });
    assert.equal(result.status, 'passed');
  }
}

await t.test('Lagrange payment observer queries and formats payment state', testPaymentObserver);
await t.test('Lagrange OLTP snapshot reads and digests all 9 tables', testOltpStateSnapshot);
await t.test('Lagrange delivery observer queries and formats delivery state', testDeliveryObserver);
await t.test('Lagrange retryable conflict probe induces serialization failure',
  testRetryableConflictProbe);
await t.test('all Lagrange Scenario A runners export preStart and return valid tokens',
  testPreStartTokens);
await t.test('all Lagrange Scenario A runners execute run contract and pass evaluation',
  testScenarioRunContracts);
