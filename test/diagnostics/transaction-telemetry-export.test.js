/**
 * Witnesses of the transaction-path telemetry export (quest
 * transaction-path-telemetry-export). The witnesses live in one owner,
 * transaction-telemetry-export-witnesses.js, which the sealed guard
 * scripts/checks/transaction-path-telemetry-export-guard.js runs as well.
 */
import {test} from 'node:test';

import {
  negativeControlAccountingOverrun,
  negativeControlUndrivenEntry,
  witnessAccounting,
  witnessCatalogueCoverage,
  witnessCollection,
  witnessFifoWait,
  witnessReads,
  witnessRouteAnswer,
  witnessWindow,
} from './transaction-telemetry-export-witnesses.js';

test('W1: GET /api/admin/diagnostics/transactions answers a typed, ' +
  'catalogue-exact node answer and collectTransactionTelemetry exists', async () => {
  await witnessRouteAnswer();
});

test('W2: committed and rolled-back transactions through PgWireProtocolHandler ' +
  'sum their phases to totalMs with the remainder reported, and the retry ' +
  'backoff, TRANSACTION_OUTCOME request and metadata readback are measured', async () => {
  await witnessAccounting();
});

test('W3: in-transaction reads are timed and counted', async () => {
  await witnessReads();
});

test('W4: a RECOVERY operation holding the session lane shows as the user ' +
  'operation\'s FIFO wait', async () => {
  await witnessFifoWait();
});

test('W7: two reads give a delta, the cursor returns exactly the new samples, ' +
  'ring overflow reports droppedCount, and a restart is INCOMPARABLE_RESTARTED',
async () => {
  await witnessWindow();
});

test('W8: collection returns one typed entry per node', async () => {
  await witnessCollection();
});

test('W9: every catalogue entry is driven above zero by its named witness', async () => {
  await witnessCatalogueCoverage();
});

test('N1: an answer whose phases sum to more than totalMs is rejected', async () => {
  await negativeControlAccountingOverrun();
});

test('N2: a catalogue entry its witness left at count 0 is reported', async () => {
  await negativeControlUndrivenEntry();
});
