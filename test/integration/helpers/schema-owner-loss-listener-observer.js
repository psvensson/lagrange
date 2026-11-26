// Worker-only observations. Use the module's actual socket -> handler map to
// bind the submitted simple query to the physical listener and session.
import {PostgresWireRuntimeModule} from '../../../src/runtime/pgwire-runtime-module.js';
import {PgWireProtocolHandler, parseQueryMessage} from '../../../src/runtime/pgwire-protocol-handler.js';
import {ServiceRuntimeLifecycle} from '../../../src/runtime/service-runtime-lifecycle.js';
import {LIFECYCLE_EVENT, OPERATION_JOURNAL_EVENT, STATE_PROJECTION_EVENT} from '../../../src/constants/runtime.js';

const events = new Set([...Object.values(OPERATION_JOURNAL_EVENT), ...Object.values(STATE_PROJECTION_EVENT),
  ...Object.values(LIFECYCLE_EVENT)]);
events.delete(LIFECYCLE_EVENT.HEALTH_CHECK);
events.delete(LIFECYCLE_EVENT.HEALTH_RESULT);
const history = [];
const listeners = new WeakMap();
let expectedSql;
let observed;

const emit = ServiceRuntimeLifecycle.prototype.emit;
ServiceRuntimeLifecycle.prototype.emit = function(event, data, ...args) {
  if (events.has(event) && data?.serviceId?.startsWith('sys-postgres-wire')) {
    const record = {at: Date.now(), event, replica: data.serviceId, operationId: data.operationId,
      causeId: data.causeId, command: data.command, toState: data.toState,
      error: data.error?.message?.slice(0, 256)};
    if (history.length === 32) history.shift();
    history.push(record);
  }
  return emit.call(this, event, data, ...args);
};

const start = PostgresWireRuntimeModule.prototype.start;
PostgresWireRuntimeModule.prototype.start = async function(context) {
  const result = await start.call(this, context);
  const entry = this._running.get(context?.serviceId);
  if (entry) listeners.set(entry.server, {entry, replica: context.serviceId});
  return result;
};

const stop = PostgresWireRuntimeModule.prototype.stop;
PostgresWireRuntimeModule.prototype.stop = function(context) {
  const entry = this._running.get(context?.serviceId);
  if (entry && observed && entry.handlers.get(observed.socket) === observed.handler) {
    observed.record.driverStopAt ??= Date.now();
  }
  return stop.call(this, context);
};

const simpleQuery = PgWireProtocolHandler.prototype._handleSimpleQuery;
PgWireProtocolHandler.prototype._handleSimpleQuery = function(payload) {
  if (expectedSql && !observed && parseQueryMessage(payload).query === expectedSql) {
    const socket = this._socket;
    const listener = listeners.get(socket.server);
    const record = {submittedAt: Date.now(), sessionId: this.getSession()?.sessionId,
      replica: listener?.entry.handlers.get(socket) === this ? listener.replica : null,
      listenerPort: socket.localPort, clientPort: socket.remotePort};
    observed = {socket, handler: this, record};
    const fail = this._failProtocol;
    this._failProtocol = function(message) {
      record.protocolFailure ??= {at: Date.now(), message: String(message).slice(0, 256)};
      return fail.call(this, message);
    };
    socket.once('error', (error) => { record.socketError = {at: Date.now(), code: error.code}; });
    socket.once('end', () => { record.remoteEndAt = Date.now(); });
    socket.once('close', (hadError) => {
      record.closed = {at: Date.now(), hadError};
      record.lifecycleAtClose = history.filter((event) => event.replica === record.replica);
      console.error(JSON.stringify({schemaOwnerLossListener: record}));
    });
  }
  return simpleQuery.call(this, payload);
};

export function armListenerObservation(sql) { expectedSql = sql; }
export function listenerObservation() {
  if (!observed) return null;
  return {...observed.record, lifecycle: history.filter((event) => event.replica === observed.record.replica)};
}
