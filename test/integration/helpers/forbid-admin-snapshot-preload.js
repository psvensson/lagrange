// Harness instrumentation, loaded before the public embedded consumer starts.
// A failed call is recorded even when a product caller catches the rejection.
// This guard neither writes product state nor supplies progress to an owner.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {AdminControlSnapshot} from '../../../src/admin/admin-control-snapshot.js';

const evidencePath = join(process.env.LAGRANGE_NO_ADMIN_POLL_EVIDENCE_DIR,
  `${process.env.NODE_ID}.json`);
const observation = {installed: true, calls: []};
const record = () => writeFileSync(evidencePath, JSON.stringify(observation));

for (const method of ['getControlSnapshot', 'buildLocalControlSnapshot']) {
  if (typeof AdminControlSnapshot.prototype[method] !== 'function') {
    throw new Error(`no-admin-poll guard cannot bind ${method}`);
  }
  AdminControlSnapshot.prototype[method] = async function forbiddenSnapshot() {
    observation.calls.push(method);
    record();
    throw new Error(`ADMIN_SNAPSHOT_DURING_FORMATION: ${method}`);
  };
}
record();
