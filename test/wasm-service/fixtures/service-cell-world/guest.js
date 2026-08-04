/**
 * Combined service-cell world fixture guest: one JavaScript source that
 * exports the request surface (`handle-request`), the partition surface
 * (`run`), and the reducer (`reduce`), importing both
 * `lagrange:cell/context` and `lagrange:cell/call-context`. ComponentizeJS
 * compiles it against the canonical wit/world.wit world `service-cell`.
 *
 * Probe-driven so one guest serves both the ABI test and the runtime
 * invocation-mode test: typed refusals are caught and returned as JSON;
 * non-result-typed imports (read/write/capability) trap the invocation
 * when refused, which the runtime test asserts at the invoke boundary.
 */
import {callBinding, capability, read, write} from 'lagrange:cell/context';
import {callBounded, emit} from 'lagrange:cell/call-context';

const LEDGER_TABLE_SLOT = 0;
const CAPABILITY_INDEX = 0;

function typedFailure(error) {
  return error.payload ?? String(error);
}

function restrictedSurfaceProbes() {
  const refusals = {capability: capability(CAPABILITY_INDEX)};
  try {
    callBinding('summarize-account-activity', '{}');
  } catch (error) {
    refusals.callBinding = typedFailure(error);
  }
  try {
    emit('key', '1');
  } catch (error) {
    refusals.emit = typedFailure(error);
  }
  try {
    callBounded('run', '{}');
  } catch (error) {
    refusals.callBounded = typedFailure(error);
  }
  return refusals;
}

export function handleRequest(request) {
  const parsed = JSON.parse(request);
  if (parsed.probe === 'context-io') {
    const total = read(LEDGER_TABLE_SLOT, parsed.key - 1) + parsed.amount;
    write(LEDGER_TABLE_SLOT, parsed.key, total);
    return JSON.stringify({
      capability: capability(CAPABILITY_INDEX),
      total,
    });
  }
  if (parsed.probe === 'call-binding') {
    try {
      return JSON.stringify({
        value: callBinding(parsed.name, parsed.arguments),
      });
    } catch (error) {
      return JSON.stringify({callBinding: typedFailure(error)});
    }
  }
  return JSON.stringify(restrictedSurfaceProbes());
}

export function run(batch, argumentsJson) {
  const parsed = JSON.parse(argumentsJson);
  if (parsed.probe === 'read') read(LEDGER_TABLE_SLOT, 1);
  if (parsed.probe === 'write') write(LEDGER_TABLE_SLOT, 1, 2);
  if (parsed.probe === 'capability') capability(CAPABILITY_INDEX);
  let total = 0;
  for (const row of batch) {
    for (const column of row.columns) {
      if (column.name === 'amount' && column.val.tag === 'integer') {
        total += Number(column.val.val);
      }
    }
  }
  const denied = [];
  try {
    emit('total', JSON.stringify(total));
  } catch (error) {
    denied.push(typedFailure(error));
  }
  let callBindingRefusal = null;
  try {
    callBinding('summarize-account-activity', argumentsJson);
  } catch (error) {
    callBindingRefusal = typedFailure(error);
  }
  return JSON.stringify({
    callBindingRefusal,
    denied,
    rows: batch.length,
    total,
  });
}

export function reduce(partials, _argumentsJson) {
  let total = 0;
  for (const [, partial] of partials) {
    total += JSON.parse(partial);
  }
  return JSON.stringify({partials: partials.length, total});
}
