// Component source compiled to a WASI component by ComponentizeJS. The only
// available imports are the host functions of `lagrange:cell/context`; the
// engine runs with random, clocks, stdio, and http disabled.
//
// Request Cell writes are inserts of new keys, so each request records its
// running total under its own key and reads the previous request's row.
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
    read(UNDECLARED_TABLE_SLOT, FIRST_LEDGER_KEY);
  }
  const {key, amount} = parsed.body;
  const runningTotal = read(LEDGER_TABLE_SLOT, key - 1) + amount;
  write(LEDGER_TABLE_SLOT, key, runningTotal);
  return JSON.stringify({
    body: `stored ${runningTotal} at key ${key}`,
    headers: [[RESPONSE_HEADER_NAME, RESPONSE_HEADER_VALUE]],
    status: HTTP_STATUS_ACCEPTED,
  });
}
