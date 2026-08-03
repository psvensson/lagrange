/**
 * Legacy-shape request guest: compiled against
 * legacy-request-wit/world.wit (the pre-call-binding context) to prove a
 * component that never heard of `call-binding` still instantiates and
 * runs against the new superset host import set.
 */
import {read, write} from 'lagrange:cell/context';

const LEDGER_TABLE_SLOT = 0;

export function run(request) {
  const {key, amount} = JSON.parse(request);
  const total = read(LEDGER_TABLE_SLOT, key) + amount;
  write(LEDGER_TABLE_SLOT, key, total);
  return JSON.stringify({total});
}
