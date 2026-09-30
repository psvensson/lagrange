/**
 * Test-layer fixtures for the message-group activation effect boundary
 * (owner decision N2): a gated durable SERVICES row behind the registration
 * INSERT and the exact-predicate activation CAS, and a message-group replica
 * runtime registered through the production exact-identity registration.
 * Scheduling is deterministic: durable calls are held on gates, never timed.
 */
import {registerMessageGroupTransportHandler} from
  '../../src/bootstrap/shared/message-group-transport-handler.js';

/**
 * A one-shot gate: `reached` resolves when the held call arrives, `held`
 * resolves when the test releases it.
 * @return {Object} {release, held, reached, reach}.
 */
function gate() {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let reach;
  const reached = new Promise((resolve) => {
    reach = resolve;
  });
  return {release, held, reached, reach};
}

async function passGate(current) {
  if (current) {
    current.reach();
    await current.held;
  }
}

/**
 * The durable SERVICES row (null when absent). `holdNextRead`,
 * `holdNextInsert` and `holdNextCas` hold the next call of that kind;
 * `options.atCas` / `options.atInsert` observe the world when it is issued.
 * @param {Object|null} initialRow
 * @param {Object} [options]
 * @return {Object}
 */
function createGatedServicesRow(initialRow, options = {}) {
  let row = initialRow ? {...initialRow} : null;
  const casCalls = [];
  const insertCalls = [];
  const gates = {read: null, insert: null, cas: null};
  const hold = (kind) => {
    gates[kind] = gate();
    return gates[kind];
  };
  const take = (kind) => {
    const current = gates[kind];
    gates[kind] = null;
    return current;
  };
  return {
    casCalls,
    insertCalls,
    get row() {
      return row ? {...row} : null;
    },
    holdNextRead: () => hold('read'),
    holdNextInsert: () => hold('insert'),
    holdNextCas: () => hold('cas'),
    async readAuthoritativeRows() {
      await passGate(take('read'));
      return {success: true, rows: row ? [{...row}] : []};
    },
    async insertSystemTableRow(tableName, data) {
      insertCalls.push({data, world: options.atInsert?.()});
      await passGate(take('insert'));
      const applied = row === null;
      if (applied) row = {...data};
      return {success: true,
        partitionResult: {affectedRows: applied ? 1 : 0}};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      casCalls.push({whereClause, data, world: options.atCas?.()});
      await passGate(take('cas'));
      const applied = row !== null && Object.entries(whereClause)
        .every(([column, value]) => (row[column] ?? null) === value);
      if (applied) row = {...row, ...data};
      return {success: true,
        partitionResult: {affectedRows: applied ? 1 : 0}};
    },
  };
}

/**
 * A message-group replica runtime. With `register` the production
 * registration records its exact handler identity and its lifecycle owner.
 * @param {Object} replica - {router, stateMachine, address, groupId,
 *   replicaId, register}.
 * @return {Object} The service.
 */
function createMessageGroupReplicaRuntime(replica) {
  const service = {groupId: replica.groupId, replicaId: replica.replicaId,
    unifiedAddress: replica.address, transport: replica.router,
    isLeaderReplica: () => false,
    receiveMessage: () => ({acknowledged: true})};
  if (replica.register !== false) {
    registerMessageGroupTransportHandler(service, {
      messageRouter: replica.router, address: replica.address,
      resolveLane: () => replica.stateMachine});
  }
  return service;
}

async function turns(count) {
  for (let turn = 0; turn < count; turn += 1) await Promise.resolve();
}

export {
  createGatedServicesRow,
  createMessageGroupReplicaRuntime,
  gate,
  turns,
};
