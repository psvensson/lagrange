/**
 * Developer-authored workload for the JavaScript request-Binding example.
 *
 * ComponentizeJS turns this ordinary module into a WASI component. The guest
 * gets no database connection string or topology API; its only data access is
 * through capability slots supplied by `lagrange:cell/context`.
 *
 * Slot 0 is granted read/write access to the ledger table by deployment policy.
 * Slot 1 is intentionally not granted and exists only for the denial probe.
 * Slot numbers are capability handles, not physical table IDs.
 *
 * Durable state lives in the table. A Cell may disappear and be replaced
 * without losing the running total.
 */
import {read, write} from 'lagrange:cell/context';

const LEDGER_TABLE_SLOT = 0;
const UNDECLARED_TABLE_SLOT = 1;
const DENY_COMMAND = 'deny';
const FIRST_LEDGER_KEY = 1;
const HTTP_STATUS_ACCEPTED = 202;
const RESPONSE_HEADER_NAME = 'x-lagrange-cell';
const RESPONSE_HEADER_VALUE = 'js-request-binding-example';

export function run(request) {
  const parsed = JSON.parse(request);
  if (parsed.body === DENY_COMMAND) {
    // Ask for a capability the deployment did not grant. The host must refuse
    // this read before the service can reach the normal write path.
    read(UNDECLARED_TABLE_SLOT, FIRST_LEDGER_KEY);
  }
  const {key, amount} = parsed.body;
  // Every invocation reconstructs its state from durable table data. The
  // example appends a fresh key rather than relying on Cell-local memory.
  const runningTotal = read(LEDGER_TABLE_SLOT, key - 1) + amount;
  write(LEDGER_TABLE_SLOT, key, runningTotal);
  return JSON.stringify({
    body: `stored ${runningTotal} at key ${key}`,
    headers: [[RESPONSE_HEADER_NAME, RESPONSE_HEADER_VALUE]],
    status: HTTP_STATUS_ACCEPTED,
  });
}
