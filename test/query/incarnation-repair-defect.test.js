
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {TABLES, COLUMN} from '../../src/constants/index.js';
import {
  NODE_REGISTRATION_OUTCOME,
  createNodeRegistrationIssueRecord,
  writeNodeRegistrationAtIncarnation,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
import {
  JOIN_WRITE_OPTIONS,
  JOINER_ID,
  nodeRow,
  withSurface,
  withMutedConsoleError,
} from './unknown-outcome-surface-fixture.js';

const BOOT_INCARNATION = 1;

test('Reproduction: failed INSERT followed by reread adopts old row', async () => {
  await withSurface([TABLES.NODES], async ({engine, gateway, of}) => {
    const surface = of(TABLES.NODES);
    
    // 1. Setup old row
    const oldRow = {
      ...nodeRow(),
      [COLUMN.NODE_ID]: JOINER_ID,
      [COLUMN.BOOT_INCARNATION]: BOOT_INCARNATION,
      [COLUMN.HOST_ID]: 'other-host'
    };
    await gateway.insertSystemTableRow(TABLES.NODES, oldRow);

    const issueRecord = createNodeRegistrationIssueRecord();
    let observeCalls = 0;
    
    const observe = async () => {
      observeCalls++;
      if (observeCalls === 1) return {available: false, row: null}; // Unavailable
      return {available: true, row: oldRow}; // Return old row
    };
    
    const register = (row) => writeNodeRegistrationAtIncarnation({
      row, bootIncarnation: BOOT_INCARNATION, issueRecord,
      nowMs: Date.now(),
      observe,
      insert: (stamped, identity) => gateway.insertSystemTableRow(
        TABLES.NODES, stamped, {...JOIN_WRITE_OPTIONS, ...identity}),
      advance: (where, stamped, identity) => gateway.updateSystemTableRow(
        TABLES.NODES, where, stamped, {...JOIN_WRITE_OPTIONS, ...identity}),
    });

    const result = await register({node_id: JOINER_ID, host_id: LOCAL_MACHINE_HOST_ID});
    
    // The defect is that it should be REFUSED_STALE, but currently becomes ACCEPTED/CURRENT
    assert.equal(result.outcome, NODE_REGISTRATION_OUTCOME.REFUSED_STALE,
      `Should be refused, but was: ${result.outcome}`);
  });
});
