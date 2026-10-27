// Component journal adapter: real SQLite and metadata owner, not replicated SQL.
import assert from 'node:assert/strict';
import {ServiceLifecycleManager} from '../../src/service/service-lifecycle-manager.js';
import {SYSTEM_TABLE_SCHEMAS, generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {createCreationSqliteFixture} from
  '../control-plane/service-instance-creation-sqlite-fixture.js';

const QUIET = {debug() {}, info() {}, warn() {}, error() {}};
async function createOriginFixture(t, options = {}) {
  const f = await createCreationSqliteFixture(t, options);
  const schema = SYSTEM_TABLE_SCHEMAS.find((s) => s.tableName === 'wasm_operations');
  f.db.exec(generateCreateTableSQL(schema));
  const selected = await f.primary.selectConsensusInstance(f.request());
  assert.equal(selected.outcome, 'SELECTED');
  const request = f.request();
  const slotRequest = f.slotRequest();
  const intent = {format: 1, descriptor: {serviceId: f.serviceId,
    tenantId: request.tenantId, serviceType: 'runtime_service',
    replicaId: slotRequest.replicaId, replicaCount: 3, runtimeKind: 'wasm_component',
    runtimeRef: 'fixture/component@1.0.0', runtimeConfig: JSON.stringify({definition: request.definition})},
  consensusBinding: selected.binding, consensusSlotRequest: slotRequest};
  const events = [];
  const operationId = slotRequest.operationId;
  const parameters = (values) => Object.fromEntries(values.map((v, i) => [i + 1, v]));
  const row = () => f.db.prepare('SELECT * FROM wasm_operations WHERE operation_id = ?')
    .get(operationId) ?? null;
  const originalReserve = f.primary.reserveInstanceResource.bind(f.primary);
  let lostReservation = false;
  let journalFault = null;
  let readFault = null;
  let holdRead = null;
  f.primary.reserveInstanceResource = async (binding, value, options) => {
    const retained = row();
    const event = {kind: 'reserve', intent: retained?.intent_json,
      request: structuredClone(value)};
    events.push(event);
    const result = await originalReserve(binding, value, options);
    event.outcome = result.outcome;
    event.token = structuredClone(result.token);
    if (lostReservation) {
      lostReservation = false;
      throw new Error('APPLIED_RESERVATION_REPLY_LOST');
    }
    return result;
  };
  const writer = async (sql, params) => {
    const insert = /^INSERT /u.test(sql);
    const kind = insert ? 'intent' : 'admission';
    events.push({kind, sql, params: structuredClone(params)});
    if (journalFault === `before-${kind}`) throw new Error('JOURNAL_NOT_APPLIED');
    const result = f.db.prepare(sql).run(parameters(params));
    if (journalFault === `after-${kind}`) throw new Error('JOURNAL_APPLIED_REPLY_LOST');
    return {success: true, affectedRows: result.changes};
  };
  const reader = async (sql, params) => {
    if (readFault) throw new Error(readFault);
    if (holdRead) {
      const captured = holdRead;
      holdRead = null;
      captured.entered.resolve();
      await captured.release.promise;
    }
    return f.db.prepare(sql).all(parameters(params));
  };
  const manager = () => {
    const result = new ServiceLifecycleManager({logger: QUIET,
      serviceDefinitionsOwner: f.primary});
    result.setOperationWriter(writer);
    result.setIdempotencyReader(reader);
    result.setRecoveryReader(reader);
    return result;
  };
  const primary = manager();
  return {...f, intent, events, row, manager, lifecycle: primary, writer, reader,
    prepare: () => primary.prepareConsensusCreation(intent),
    loseReservation: () => {
      lostReservation = true;
    },
    setJournalFault: (value) => {
      journalFault = value;
    },
    setReadFault: (value) => {
      readFault = value;
    },
    holdRead: () => {
      const pending = {entered: Promise.withResolvers(), release: Promise.withResolvers()};
      holdRead = pending;
      return {entered: pending.entered.promise, release: pending.release.resolve};
    }};
}
export {createOriginFixture};
