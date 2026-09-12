import {OLTP_OPERATION_KIND} from './oltp-baseline-workload.js';

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
  if (rows.length !== ONE) {
    throw new Error(`OLTP transaction expected one ${description} row`);
  }
  return rows[ZERO];
}

function rowCountOf(result) {
  const rowCount = Number(result?.rowCount);
  return Number.isFinite(rowCount) ? rowCount : rowsOf(result).length;
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
    const orderId = Number(district.next_order_id);
    await tx.execute(STATEMENT.DISTRICT_SET_NEXT_ORDER, [
      orderId + ONE,
      operation.warehouseId,
      operation.districtId,
    ]);
    const allLocal = operation.lines.every((line) =>
      line.supplyWarehouseId === operation.warehouseId) ? ONE : ZERO;
    await tx.execute(STATEMENT.ORDER_INSERT, [
      operation.warehouseId,
      operation.districtId,
      orderId,
      operation.customerId,
      operation.lines.length,
      allLocal,
    ]);
    await tx.execute(STATEMENT.NEW_ORDER_INSERT, [
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
      const currentQuantity = Number(stock.quantity);
      const nextQuantity = currentQuantity >= line.quantity + 10 ?
        currentQuantity - line.quantity :
        currentQuantity + 91 - line.quantity;
      const remote = line.supplyWarehouseId === operation.warehouseId ?
        ZERO : ONE;
      await tx.execute(STATEMENT.STOCK_UPDATE, [
        nextQuantity,
        line.quantity,
        remote,
        line.supplyWarehouseId,
        line.itemId,
      ]);
      const amountCents = Number(item.price_cents) * line.quantity;
      totalCents += amountCents;
      await tx.execute(STATEMENT.ORDER_LINE_INSERT, [
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
    return {orderId, totalCents};
  });
}

async function executePayment(session, operation) {
  return session.transaction(async (tx) => {
    await tx.execute(STATEMENT.WAREHOUSE_PAYMENT, [
      operation.amountCents,
      operation.warehouseId,
    ]);
    await tx.execute(STATEMENT.DISTRICT_PAYMENT, [
      operation.amountCents,
      operation.warehouseId,
      operation.districtId,
    ]);
    const customerUpdate = await tx.execute(STATEMENT.CUSTOMER_PAYMENT, [
      operation.amountCents,
      operation.amountCents,
      operation.customerWarehouseId,
      operation.customerDistrictId,
      operation.customerId,
    ]);
    if (rowCountOf(customerUpdate) !== ONE) {
      throw new Error('OLTP payment did not update exactly one customer');
    }
    await tx.execute(STATEMENT.HISTORY_INSERT, [
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
      return {orderId: null, lineCount: ZERO};
    }
    const order = orderRows[ZERO];
    const lineRows = rowsOf(await tx.execute(STATEMENT.ORDER_STATUS_LINES, [
      operation.warehouseId,
      operation.districtId,
      order.order_id,
    ]));
    return {orderId: Number(order.order_id), lineCount: lineRows.length};
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
      const orderId = Number(newOrderRows[ZERO].order_id);
      await tx.execute(STATEMENT.DELIVERY_DELETE_NEW_ORDER, [
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
      await tx.execute(STATEMENT.DELIVERY_SET_CARRIER, [
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
        throw new Error('OLTP transaction expected delivery order lines');
      }
      const amountCents = lineRows.reduce(
        (sum, row) => sum + Number(row.amount_cents),
        ZERO,
      );
      await tx.execute(STATEMENT.DELIVERY_MARK_LINES, [
        operation.warehouseId,
        districtId,
        orderId,
      ]);
      await tx.execute(STATEMENT.DELIVERY_CUSTOMER_UPDATE, [
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
    const nextOrderId = Number(district.next_order_id);
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
    return {lowStock: Number(count.low_stock)};
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
  STATEMENT as OLTP_SQL_STATEMENT,
  executeOltpBaselineTransaction,
};
