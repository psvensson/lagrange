import {OLTP_OPERATION_KIND} from './oltp-baseline-workload.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringTrim = Function.call.bind(String.prototype.trim);

const ZERO = 0;
const ONE = 1;

const STATEMENT = Object.freeze({
  DISTRICT_NEXT_ORDER_FOR_UPDATE: 'district-next-order-for-update',
  DISTRICT_SET_NEXT_ORDER: 'district-set-next-order',
  ORDER_INSERT: 'order-insert',
  NEW_ORDER_INSERT: 'new-order-insert',
  ITEM_PRICE: 'item-price',
  STOCK_QUANTITY_FOR_UPDATE: 'stock-quantity-for-update',
  STOCK_UPDATE: 'stock-update',
  ORDER_LINE_INSERT: 'order-line-insert',
  WAREHOUSE_PAYMENT: 'warehouse-payment',
  DISTRICT_PAYMENT: 'district-payment',
  CUSTOMER_PAYMENT: 'customer-payment',
  HISTORY_INSERT: 'history-insert',
  ORDER_STATUS_LATEST: 'order-status-latest',
  ORDER_STATUS_LINES: 'order-status-lines',
  DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE: 'delivery-oldest-new-order-for-update',
  DELIVERY_DELETE_NEW_ORDER: 'delivery-delete-new-order',
  DELIVERY_ORDER_FOR_UPDATE: 'delivery-order-for-update',
  DELIVERY_SET_CARRIER: 'delivery-set-carrier',
  DELIVERY_LINES_FOR_UPDATE: 'delivery-lines-for-update',
  DELIVERY_MARK_LINES: 'delivery-mark-lines',
  DELIVERY_CUSTOMER_UPDATE: 'delivery-customer-update',
  STOCK_LEVEL_DISTRICT: 'stock-level-district',
  STOCK_LEVEL_COUNT: 'stock-level-count',
});

function assertSession(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('OLTP transaction executor requires a session');
  }
  if (typeof session.transaction !== 'function') {
    throw new Error('OLTP transaction executor requires session.transaction');
  }
  if (typeof session.execute !== 'function') {
    throw new Error('OLTP transaction executor requires session.execute');
  }
}

function rowsOf(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function singleRow(result, description) {
  const rows = rowsOf(result);
  if (rows.length !== ONE) throw singleRowViolation(description, rows);
  return rows[ZERO];
}

// A success invariant the product's answer violated: a valid response with
// a wrong effect (affected rows, missing row). It is a correctness failure,
// never a product error and never retried.
const CORRECTNESS_VIOLATION_ERROR_NAME = 'OltpCorrectnessViolationError';

function correctnessViolation(message, evidence) {
  const error = new Error(message);
  error.name = CORRECTNESS_VIOLATION_ERROR_NAME;
  error.oltpCorrectnessViolation = Object.freeze({...evidence});
  return error;
}

function singleRowViolation(description, rows) {
  return correctnessViolation(`OLTP transaction expected one ${description} row`, {
    invariant: 'single-row',
    description,
    observedRows: rows.length,
  });
}

// Every write reports its affected rows; a missing count is refused, not
// read as zero or as the returned-row count.
function requireAffectedRows(result, statementId, expected) {
  const reported = result?.rowCount;
  const rowCount = typeof reported === 'number' ? reported : Number.NaN;
  if (!Number.isInteger(rowCount) || rowCount !== expected) {
    throw correctnessViolation(
      `OLTP ${statementId} affected ${Number.isInteger(rowCount) ? rowCount : 'unreported'} ` +
      `row(s), expected ${expected}`,
      {
        invariant: 'affected-rows',
        statementId,
        expectedAffectedRows: expected,
        reportedAffectedRows: Number.isInteger(rowCount) ? rowCount : null,
      },
    );
  }
  return rowCount;
}

// A returned value the contract reads as an integer must be one; a wrong
// value is a correctness violation, never coerced through Number().
function integerColumn(row, column, statementId) {
  const value = row?.[column];
  const number = typeof value === 'string' && stringTrim(value) !== '' ?
    Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number)) {
    throw correctnessViolation(
      `OLTP ${statementId} returned a non-integer ${column}`,
      {invariant: 'integer-column', statementId, column, observedValue: String(value)},
    );
  }
  return number;
}

async function executeWrite(tx, statementId, parameters, expected = ONE) {
  const result = await tx.execute(statementId, parameters);
  requireAffectedRows(result, statementId, expected);
  return result;
}

function normalizeOrderStatusLine(row) {
  return {
    lineNumber: Number(row.line_number),
    itemId: Number(row.item_id),
    supplyWarehouseId: Number(row.supply_warehouse_id),
    quantity: Number(row.quantity),
    amountCents: Number(row.amount_cents),
    delivered: Number(row.delivered),
  };
}

async function executeNewOrder(session, operation) {
  return session.transaction(async (tx) => {
    const district = singleRow(
      await tx.execute(STATEMENT.DISTRICT_NEXT_ORDER_FOR_UPDATE, [
        operation.warehouseId,
        operation.districtId,
      ]),
      'district',
    );
    const orderId = integerColumn(
      district, 'next_order_id', STATEMENT.DISTRICT_NEXT_ORDER_FOR_UPDATE);
    await executeWrite(tx, STATEMENT.DISTRICT_SET_NEXT_ORDER, [
      orderId + ONE,
      operation.warehouseId,
      operation.districtId,
    ]);
    const allLocal = arrayEvery(
      operation.lines,
      (line) => line.supplyWarehouseId === operation.warehouseId,
    ) ? ONE : ZERO;
    await executeWrite(tx, STATEMENT.ORDER_INSERT, [
      operation.warehouseId,
      operation.districtId,
      orderId,
      operation.customerId,
      operation.lines.length,
      allLocal,
    ]);
    await executeWrite(tx, STATEMENT.NEW_ORDER_INSERT, [
      operation.warehouseId,
      operation.districtId,
      orderId,
    ]);

    let totalCents = ZERO;
    for (let index = ZERO; index < operation.lines.length; index += ONE) {
      const line = operation.lines[index];
      const item = singleRow(
        await tx.execute(STATEMENT.ITEM_PRICE, [line.itemId]),
        'item',
      );
      const stock = singleRow(
        await tx.execute(STATEMENT.STOCK_QUANTITY_FOR_UPDATE, [
          line.supplyWarehouseId,
          line.itemId,
        ]),
        'stock',
      );
      const currentQuantity = integerColumn(
        stock, 'quantity', STATEMENT.STOCK_QUANTITY_FOR_UPDATE);
      const nextQuantity = currentQuantity >= line.quantity + 10 ?
        currentQuantity - line.quantity :
        currentQuantity + 91 - line.quantity;
      const remote = line.supplyWarehouseId === operation.warehouseId ?
        ZERO : ONE;
      await executeWrite(tx, STATEMENT.STOCK_UPDATE, [
        nextQuantity,
        line.quantity,
        remote,
        line.supplyWarehouseId,
        line.itemId,
      ]);
      const amountCents =
        integerColumn(item, 'price_cents', STATEMENT.ITEM_PRICE) * line.quantity;
      totalCents += amountCents;
      await executeWrite(tx, STATEMENT.ORDER_LINE_INSERT, [
        operation.warehouseId,
        operation.districtId,
        orderId,
        index + ONE,
        line.itemId,
        line.supplyWarehouseId,
        line.quantity,
        amountCents,
      ]);
    }
    return {orderId, totalCents, lineCount: operation.lines.length};
  });
}

async function executePayment(session, operation) {
  return session.transaction(async (tx) => {
    await executeWrite(tx, STATEMENT.WAREHOUSE_PAYMENT, [
      operation.amountCents,
      operation.warehouseId,
    ]);
    await executeWrite(tx, STATEMENT.DISTRICT_PAYMENT, [
      operation.amountCents,
      operation.warehouseId,
      operation.districtId,
    ]);
    await executeWrite(tx, STATEMENT.CUSTOMER_PAYMENT, [
      operation.amountCents,
      operation.amountCents,
      operation.customerWarehouseId,
      operation.customerDistrictId,
      operation.customerId,
    ]);
    await executeWrite(tx, STATEMENT.HISTORY_INSERT, [
      operation.phase,
      operation.workerId,
      operation.sequence,
      operation.customerWarehouseId,
      operation.customerDistrictId,
      operation.customerId,
      operation.warehouseId,
      operation.districtId,
      operation.amountCents,
    ]);
    return {paidCents: operation.amountCents};
  });
}

async function executeOrderStatus(session, operation) {
  return session.transaction(async (tx) => {
    const orderRows = rowsOf(await tx.execute(STATEMENT.ORDER_STATUS_LATEST, [
      operation.warehouseId,
      operation.districtId,
      operation.customerId,
    ]));
    if (orderRows.length === ZERO) {
      return {orderId: null, lineCount: ZERO, lines: []};
    }
    const order = orderRows[ZERO];
    const lineRows = rowsOf(await tx.execute(STATEMENT.ORDER_STATUS_LINES, [
      operation.warehouseId,
      operation.districtId,
      order.order_id,
    ]));
    const lines = arrayMap(lineRows, normalizeOrderStatusLine);
    return {
      orderId: integerColumn(order, 'order_id', STATEMENT.ORDER_STATUS_LATEST),
      lineCount: lines.length,
      lines,
    };
  });
}

async function executeDelivery(session, operation, scale) {
  return session.transaction(async (tx) => {
    let deliveredOrders = ZERO;
    for (let districtId = ONE;
      districtId <= scale.districtsPerWarehouse;
      districtId += ONE) {
      const newOrderRows = rowsOf(await tx.execute(
        STATEMENT.DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE,
        [operation.warehouseId, districtId],
      ));
      if (newOrderRows.length === ZERO) continue;
      const orderId = integerColumn(
        newOrderRows[ZERO], 'order_id', STATEMENT.DELIVERY_OLDEST_NEW_ORDER_FOR_UPDATE);
      await executeWrite(tx, STATEMENT.DELIVERY_DELETE_NEW_ORDER, [
        operation.warehouseId,
        districtId,
        orderId,
      ]);
      const order = singleRow(
        await tx.execute(STATEMENT.DELIVERY_ORDER_FOR_UPDATE, [
          operation.warehouseId,
          districtId,
          orderId,
        ]),
        'delivery order',
      );
      await executeWrite(tx, STATEMENT.DELIVERY_SET_CARRIER, [
        operation.carrierId,
        operation.warehouseId,
        districtId,
        orderId,
      ]);
      const lineRows = rowsOf(await tx.execute(
        STATEMENT.DELIVERY_LINES_FOR_UPDATE,
        [operation.warehouseId, districtId, orderId],
      ));
      if (lineRows.length === ZERO) {
        throw correctnessViolation('OLTP transaction expected delivery order lines', {
          invariant: 'delivery-order-lines-present',
          orderId,
        });
      }
      const amountCents = lineRows.reduce(
        (sum, row) => sum +
          integerColumn(row, 'amount_cents', STATEMENT.DELIVERY_LINES_FOR_UPDATE),
        ZERO,
      );
      await executeWrite(tx, STATEMENT.DELIVERY_MARK_LINES, [
        operation.warehouseId,
        districtId,
        orderId,
      ], lineRows.length);
      await executeWrite(tx, STATEMENT.DELIVERY_CUSTOMER_UPDATE, [
        amountCents,
        operation.warehouseId,
        districtId,
        order.customer_id,
      ]);
      deliveredOrders += ONE;
    }
    return {deliveredOrders};
  });
}

async function executeStockLevel(session, operation) {
  return session.transaction(async (tx) => {
    const district = singleRow(
      await tx.execute(STATEMENT.STOCK_LEVEL_DISTRICT, [
        operation.warehouseId,
        operation.districtId,
      ]),
      'stock-level district',
    );
    const nextOrderId = integerColumn(
      district, 'next_order_id', STATEMENT.STOCK_LEVEL_DISTRICT);
    const firstOrderId = Math.max(ONE, nextOrderId - 20);
    const count = singleRow(
      await tx.execute(STATEMENT.STOCK_LEVEL_COUNT, [
        operation.warehouseId,
        operation.warehouseId,
        operation.districtId,
        firstOrderId,
        nextOrderId,
        operation.threshold,
      ]),
      'stock-level count',
    );
    return {lowStock: integerColumn(count, 'low_stock', STATEMENT.STOCK_LEVEL_COUNT)};
  });
}

async function executeOltpBaselineTransaction(session, operation, scale) {
  assertSession(session);
  if (!operation || typeof operation !== 'object') {
    throw new Error('OLTP transaction executor requires an operation');
  }
  if (!scale || !Number.isInteger(scale.districtsPerWarehouse)) {
    throw new Error('OLTP transaction executor requires workload scale');
  }

  switch (operation.kind) {
  case OLTP_OPERATION_KIND.NEW_ORDER:
    return executeNewOrder(session, operation);
  case OLTP_OPERATION_KIND.PAYMENT:
    return executePayment(session, operation);
  case OLTP_OPERATION_KIND.ORDER_STATUS:
    return executeOrderStatus(session, operation);
  case OLTP_OPERATION_KIND.DELIVERY:
    return executeDelivery(session, operation, scale);
  case OLTP_OPERATION_KIND.STOCK_LEVEL:
    return executeStockLevel(session, operation);
  default:
    throw new Error(`Unsupported OLTP operation kind: ${operation.kind}`);
  }
}

export {
  CORRECTNESS_VIOLATION_ERROR_NAME as OLTP_CORRECTNESS_VIOLATION_ERROR_NAME,
  STATEMENT as OLTP_SQL_STATEMENT,
  executeOltpBaselineTransaction,
};
