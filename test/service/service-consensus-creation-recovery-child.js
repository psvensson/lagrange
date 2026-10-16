// Actual process loss over a file-backed component DB; no native quorum proof.
import {createOriginFixture} from './service-consensus-creation-fixture.js';
const [mode, databasePath, operationId] = process.argv.slice(2);
const cleanup = [];
try {
  const f = await createOriginFixture({after: (fn) => cleanup.push(fn)}, {databasePath});
  f.db.pragma('journal_mode = WAL');
  f.db.pragma('synchronous = FULL');
  const interrupted = () => {
    process.send({kind: 'interrupted', mode, pid: process.pid, row: f.row(),
      resource: f.state().selected.resources[0]});
    return new Promise(() => {});
  };
  if (mode === 'reservation') {
    const reserve = f.primary.reserveInstanceResource.bind(f.primary);
    f.primary.reserveInstanceResource = async (...args) => {
      await reserve(...args);
      return interrupted();
    };
    await f.prepare();
    throw new Error('reservation hold was not reached');
  } else if (mode === 'admission') {
    f.lifecycle.setOperationWriter(async (sql, params) => {
      const result = await f.writer(sql, params);
      if (f.row()?.admission_json !== null) return interrupted();
      return result;
    });
    await f.prepare();
    throw new Error('admission hold was not reached');
  } else if (mode === 'recover') {
    const result = await f.lifecycle.recoverConsensusCreation(operationId);
    process.send({kind: 'recovered', pid: process.pid, result, row: f.row(),
      resource: f.state().selected.resources[0],
      operations: f.db.prepare('SELECT count(*) AS n FROM wasm_operations').get().n});
    for (const fn of cleanup.reverse()) await fn();
    process.disconnect();
  } else {
    throw new Error('unknown child mode');
  }
} catch (error) {
  process.send({kind: 'error', message: error.stack});
  process.exitCode = 1;
  for (const fn of cleanup.reverse()) await fn();
  if (process.connected) process.disconnect();
}
