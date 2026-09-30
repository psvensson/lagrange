/**
 * Witnesses for the one durable node lifecycle owner (NodeLifecyclePublication):
 * every named outcome, the full-identity CAS predicate, the incarnation fence,
 * owner-granted READY lease, telemetry on liveness writes and authoritative
 * readback of lost / zero-row outcomes. No retries, no hidden queue.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  NODE_LIFECYCLE_PUBLICATION_OUTCOME as OUTCOME,
  NodeLifecyclePublication,
} from '../../src/control-plane/node-lifecycle-publication.js';
import {NodeReadyLeaseAuthority} from
  '../../src/control-plane/node-ready-lease-authority.js';
import {COLUMN, SERVICE_STATUS, STATE} from '../../src/constants/index.js';
import {
  NODE_REGISTRATION_OUTCOME,
  writeNodeRegistrationAtIncarnation,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';

const NODE_ID = 'node-lifecycle';
const READY_LEASE_MS = 15_000;
const NOW = 100_000;

function registeredRow(overrides = {}) {
  return {
    node_id: NODE_ID,
    node_address: '10.0.0.7:8080',
    status: 'joining',
    connection_state: STATE.CONNECTED,
    last_heartbeat: NOW - 5_000,
    ready_lease_expires_at: null,
    boot_incarnation: 3,
    created_at: NOW - 60_000,
    ...overrides,
  };
}

// A single durable NODES row honoring the CAS predicate exactly.
function createDurableNodes(initialRow, hooks = {}) {
  let row = initialRow ? {...initialRow} : null;
  const writes = [];
  const reads = [];
  return {
    writes,
    reads,
    current: () => row,
    replace: (next) => {
      row = next;
    },
    gateway: {
      async readAuthoritativeRows(tableName, _sql, params, options) {
        reads.push({tableName, params, options});
        if (hooks.readUnavailable?.(reads.length)) {
          return {success: false, error: 'authoritative_row_source_unavailable'};
        }
        return {success: true, rows: row ? [{...row}] : []};
      },
      async updateSystemTableRow(tableName, whereClause, data, options) {
        writes.push({tableName, whereClause, data, options});
        await hooks.beforeWrite?.({whereClause, data});
        const matches = row && Object.entries(whereClause)
          .every(([column, value]) => (row[column] ?? null) === value);
        if (!matches) {
          return {success: true, partitionResult: {affectedRows: 0}};
        }
        row = {...row, ...data};
        if (hooks.loseAcknowledgement) {
          throw new Error('lost acknowledgement');
        }
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    },
  };
}

function createPublication(durable, now = () => NOW) {
  return new NodeLifecyclePublication({
    gateway: durable.gateway,
    leaseAuthority: new NodeReadyLeaseAuthority({readyLeaseMs: READY_LEASE_MS}),
    now,
  });
}

function readyRequest(overrides = {}) {
  return {
    nodeId: NODE_ID,
    bootIncarnation: 3,
    state: STATE.READY,
    heartbeatOnly: true,
    heartbeatAt: NOW,
    nodeAddress: '10.0.0.7:8080',
    capabilities: ['partition_replica'],
    telemetry: {
      [COLUMN.CPU_CORES]: 8,
      [COLUMN.MEMORY_MB]: 4096,
      [COLUMN.DISK_GB]: 100,
      [COLUMN.CPU_USAGE_PERCENT]: 12,
      [COLUMN.MEMORY_USAGE_PERCENT]: 34,
      [COLUMN.DISK_USAGE_PERCENT]: 56,
      [COLUMN.STORAGE_BUDGET_BYTES]: 1073741824,
      [COLUMN.STORAGE_BUDGET_SOURCE]: 'absolute',
      [COLUMN.STORAGE_BUDGET_UPDATED_AT]: NOW - 1_000,
    },
    ...overrides,
  };
}

test('APPLIED: READY promotes a JOINING row through the full-identity CAS with ' +
  'an owner-granted lease and the telemetry and budget columns', async (t) => {
  const source = registeredRow();
  const durable = createDurableNodes(source);
  const result = await createPublication(durable).publish(readyRequest());

  t.equal(result.outcome, OUTCOME.APPLIED);
  t.ok(Object.isFrozen(result), 'outcomes are frozen named states');
  t.equal(durable.writes.length, 1, 'one CAS write, no retry');
  t.same(durable.writes[0].whereClause, {
    node_id: NODE_ID,
    boot_incarnation: 3,
    status: 'joining',
    connection_state: STATE.CONNECTED,
    last_heartbeat: source.last_heartbeat,
    created_at: source.created_at,
  }, 'the CAS predicate carries the full observed registration identity');
  t.match(durable.current(), {
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: NOW,
    ready_lease_expires_at: NOW + READY_LEASE_MS,
    boot_incarnation: 3,
    cpu_cores: 8,
    memory_usage_percent: 34,
    storage_budget_bytes: 1073741824,
    storage_budget_source: 'absolute',
    capabilities: '["partition_replica"]',
  }, 'READY, lease, identity, telemetry and budget land in one write');
  t.same(result.row, durable.current(), 'APPLIED carries the durable row');
  t.equal(result.observedAtMs, NOW);
  t.match(durable.reads[0].options, {
    authoritativeReadMode: 'owner_rpc_required',
    leaderMode: 'required',
  }, 'the source is read from the NODES partition owner, never a local ' +
    'non-owner replica');
});

test('ALREADY_CURRENT: a request that does not advance liveness writes nothing',
  async (t) => {
    const durable = createDurableNodes(registeredRow({
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      last_heartbeat: NOW,
      ready_lease_expires_at: NOW + READY_LEASE_MS,
    }));
    const result = await createPublication(durable).publish(readyRequest());
    t.equal(result.outcome, OUTCOME.ALREADY_CURRENT);
    t.equal(durable.writes.length, 0, 'no write');
    t.same(result.row, durable.current());
  });

test('RESOLVED_BY_READBACK: a lost acknowledgement is classified by the ' +
  'authoritative destination, never re-written', async (t) => {
  const durable = createDurableNodes(registeredRow(), {
    loseAcknowledgement: true,
  });
  const result = await createPublication(durable).publish(readyRequest());
  t.equal(result.outcome, OUTCOME.RESOLVED_BY_READBACK);
  t.equal(durable.writes.length, 1, 'exactly one write attempt');
  t.equal(durable.reads.length, 2, 'source read plus one authoritative readback');
  t.match(result.row, {connection_state: STATE.READY, boot_incarnation: 3});
});

test('NOT_APPLIED_SOURCE_UNCHANGED: a zero-row CAS on a liveness race is a ' +
  'deferred outcome with retryAfterMs and no retry', async (t) => {
  const source = registeredRow();
  const durable = createDurableNodes(source, {
    beforeWrite: () => {
      durable.replace({...source, last_heartbeat: source.last_heartbeat + 1});
    },
  });
  const result = await createPublication(durable).publish(readyRequest());
  t.equal(result.outcome, OUTCOME.NOT_APPLIED_SOURCE_UNCHANGED);
  t.ok(result.retryAfterMs > 0, 'carries a retry hint for the caller tick');
  t.equal(durable.writes.length, 1, 'the owner never retries the CAS itself');
});

test('REFUSED_SOURCE_CHANGED: READY is published only from JOINING or ACTIVE',
  async (t) => {
    for (const status of ['failed', 'shutting_down']) {
      const durable = createDurableNodes(registeredRow({status}));
      const result = await createPublication(durable).publish(readyRequest());
      t.equal(result.outcome, OUTCOME.REFUSED_SOURCE_CHANGED, status);
      t.equal(durable.writes.length, 0, `${status}: zero writes`);
    }
    const stopped = createDurableNodes(
      registeredRow({status: SERVICE_STATUS.STOPPED}));
    const result = await createPublication(stopped).publish(readyRequest());
    t.equal(result.outcome, OUTCOME.REFUSED_TERMINAL_STATE,
      'a terminal source is refused as terminal');
    t.equal(stopped.writes.length, 0, 'stopped: zero writes');
  });

test('REFUSED_TERMINAL_STATE: a concurrent terminal transition observed on ' +
  'readback is terminal', async (t) => {
  const source = registeredRow();
  const durable = createDurableNodes(source, {
    beforeWrite: () => {
      durable.replace({...source, status: SERVICE_STATUS.STOPPED});
    },
  });
  const result = await createPublication(durable).publish(readyRequest());
  t.equal(result.outcome, OUTCOME.REFUSED_TERMINAL_STATE);
});

test('N2 liveness: a delayed liveness publication of a STOPPED generation ' +
  'never mutates it; the next generation registers its own endpoint',
async (t) => {
  const stoppedG1 = registeredRow({status: SERVICE_STATUS.STOPPED,
    connection_state: STATE.DISCONNECTED, ready_lease_expires_at: null});
  const delayedLiveness = readyRequest({state: STATE.CONNECTED,
    nodeAddress: '10.9.9.9:9999', heartbeatAt: NOW + 5_000,
    capabilities: ['other']});
  // G1 already STOPPED when the delayed liveness arrives.
  const durable = createDurableNodes(stoppedG1);
  const refused = await createPublication(durable).publish(delayedLiveness);
  t.equal(refused.outcome, OUTCOME.REFUSED_TERMINAL_STATE,
    'typed terminal refusal');
  t.equal(durable.writes.length, 0, 'no mutation is issued');
  t.same(durable.current(), stoppedG1, 'the durable G1 row is unchanged');

  // G1 stops between the source read and the CAS: the final mutation's
  // predicate (observed non-terminal status) cannot match the STOPPED row.
  const racing = createDurableNodes(registeredRow(), {
    beforeWrite: () => racing.replace({...stoppedG1}),
  });
  const raced = await createPublication(racing).publish(delayedLiveness);
  t.equal(raced.outcome, OUTCOME.REFUSED_TERMINAL_STATE,
    'the lost race is named by the readback');
  t.equal(racing.writes[0].whereClause.status, 'joining',
    'the predicate carries the observed non-terminal status');
  t.same(racing.current(), stoppedG1,
    'no address, connection, incarnation or state change on the STOPPED row');

  // G2 establishes its connection data through the registration owner.
  const g2Row = {...stoppedG1, node_address: '10.9.9.9:9999',
    status: 'joining', connection_state: STATE.CONNECTED,
    last_heartbeat: NOW, boot_incarnation: 4};
  const registration = await writeNodeRegistrationAtIncarnation({
    row: g2Row, bootIncarnation: 4,
    observe: async () => ({available: true, row: durable.current()}),
    insert: async () => ({success: false}),
    advance: (whereClause, row) => durable.gateway.updateSystemTableRow(
      'nodes', whereClause, row),
  });
  t.equal(registration.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
    'G2 registers over the STOPPED G1 row');
  t.equal(durable.current().node_address, '10.9.9.9:9999',
    'with its own endpoint data');
  const g2Ready = await createPublication(durable).publish(
    readyRequest({bootIncarnation: 4, nodeAddress: '10.9.9.9:9999'}));
  t.equal(g2Ready.outcome, OUTCOME.APPLIED, 'and G2 publishes READY normally');
});

test('REFUSED_STALE_INCARNATION: a lower boot is a zombie and writes nothing',
  async (t) => {
    const durable = createDurableNodes(registeredRow({boot_incarnation: 5}));
    const result = await createPublication(durable).publish(
      readyRequest({bootIncarnation: 3}),
    );
    t.equal(result.outcome, OUTCOME.REFUSED_STALE_INCARNATION);
    t.equal(result.knownIncarnation, 5);
    t.equal(durable.writes.length, 0, 'zero writes');
  });

test('a newer boot cannot advance the incarnation through publication: the ' +
  'registration verb owns that transition', async (t) => {
  const durable = createDurableNodes(registeredRow({boot_incarnation: 2}));
  const result = await createPublication(durable).publish(readyRequest());
  t.equal(result.outcome, OUTCOME.REFUSED_SOURCE_CHANGED);
  t.equal(durable.writes.length, 0, 'zero writes');
});

test('REFUSED_ROW_MISSING: an absent registration is never created', async (t) => {
  const durable = createDurableNodes(null);
  const result = await createPublication(durable).publish(readyRequest());
  t.equal(result.outcome, OUTCOME.REFUSED_ROW_MISSING);
  t.equal(durable.writes.length, 0, 'zero writes');
});

test('REFUSED_INCARNATION_REQUIRED: an unknown boot reads nothing and writes ' +
  'nothing', async (t) => {
  for (const bootIncarnation of [0, undefined, '3', {}, -1, 1.5]) {
    const durable = createDurableNodes(registeredRow());
    const result = await createPublication(durable).publish(
      readyRequest({bootIncarnation}),
    );
    t.equal(result.outcome, OUTCOME.REFUSED_INCARNATION_REQUIRED,
      String(bootIncarnation));
    t.equal(durable.reads.length + durable.writes.length, 0);
  }
});

test('AUTHORITY_UNAVAILABLE: an unanswered authoritative read is explicit and ' +
  'never a missing row', async (t) => {
  const durable = createDurableNodes(registeredRow(), {
    readUnavailable: () => true,
  });
  const result = await createPublication(durable).publish(readyRequest());
  t.equal(result.outcome, OUTCOME.AUTHORITY_UNAVAILABLE);
  t.ok(result.retryAfterMs > 0);
  t.equal(durable.writes.length, 0);
});

test('CONNECTED liveness renews the heartbeat without a lease or status change',
  async (t) => {
    const durable = createDurableNodes(registeredRow());
    const result = await createPublication(durable).publish(readyRequest({
      state: STATE.CONNECTED,
    }));
    t.equal(result.outcome, OUTCOME.APPLIED);
    t.notOk(COLUMN.STATUS in durable.writes[0].data,
      'CONNECTED never writes status');
    t.match(durable.current(), {
      status: 'joining',
      connection_state: STATE.CONNECTED,
      last_heartbeat: NOW,
      ready_lease_expires_at: null,
      cpu_cores: 8,
    });
  });

test('a lagged READY is rebased to write time and granted a full lease',
  async (t) => {
    const durable = createDurableNodes(registeredRow());
    await createPublication(durable).publish(readyRequest({
      heartbeatAt: NOW - 30_000,
    }));
    t.equal(durable.current().last_heartbeat, NOW);
    t.equal(durable.current().ready_lease_expires_at, NOW + READY_LEASE_MS);
  });

test('the lease authority owns grant and expiry', (t) => {
  const authority = new NodeReadyLeaseAuthority({readyLeaseMs: 10});
  t.equal(authority.grant(5), 15);
  t.equal(authority.isExpired({ready_lease_expires_at: 15}, 15), true);
  t.equal(authority.isExpired({ready_lease_expires_at: 16}, 15), false);
  t.equal(authority.holdsLiveLease({ready_lease_expires_at: 16}, 15), true);
  t.equal(authority.holdsLiveLease({ready_lease_expires_at: null}, 15), false);
  t.throws(() => new NodeReadyLeaseAuthority({readyLeaseMs: 0}));
  t.end();
});

test('an invalid request is a contract violation, not a domain outcome',
  async (t) => {
    const publication = createPublication(createDurableNodes(registeredRow()));
    await t.rejects(publication.publish(readyRequest({
      state: STATE.DISCONNECTED,
    })), TypeError);
    await t.rejects(publication.publish(readyRequest({nodeId: ''})), TypeError);
  });

// The deleted dispatch retry machinery is replaced by these owner-level
// guarantees; the level-triggered heartbeat tick is the only re-drive.
test('READY durable but acknowledgement lost: readback proves the same-' +
  'incarnation READY and the re-drive is an idempotent no-op', async (t) => {
  const durable = createDurableNodes(registeredRow(), {
    loseAcknowledgement: true,
  });
  const publication = createPublication(durable);
  const first = await publication.publish(readyRequest());
  t.equal(first.outcome, OUTCOME.RESOLVED_BY_READBACK);
  t.match(first.row, {boot_incarnation: 3, connection_state: STATE.READY,
    status: SERVICE_STATUS.ACTIVE});
  const redrive = await publication.publish(readyRequest());
  t.equal(redrive.outcome, OUTCOME.ALREADY_CURRENT,
    'the re-drive of the same request is idempotent');
  t.equal(durable.writes.length, 1, 'no second write');
});

test('READY not durable and outcome unknown: no invented success, and the ' +
  'level-triggered re-drive applies it once', async (t) => {
  let failNext = true;
  const durable = createDurableNodes(registeredRow(), {
    beforeWrite: () => {
      if (failNext) {
        failNext = false;
        throw new Error('outcome unknown');
      }
    },
  });
  const publication = createPublication(durable);
  const first = await publication.publish(readyRequest());
  t.equal(first.outcome, OUTCOME.NOT_APPLIED_SOURCE_UNCHANGED,
    'an unknown outcome with the source unchanged is never success');
  t.equal(durable.current().connection_state, STATE.CONNECTED);
  const redrive = await publication.publish(readyRequest());
  t.equal(redrive.outcome, OUTCOME.APPLIED, 'the re-drive applies READY');
  t.equal(durable.current().connection_state, STATE.READY);
});

test('a replacement incarnation registered before the re-drive makes the old ' +
  'publication fail stale-incarnation', async (t) => {
  let failNext = true;
  const durable = createDurableNodes(registeredRow(), {
    beforeWrite: () => {
      if (failNext) {
        failNext = false;
        throw new Error('outcome unknown');
      }
    },
  });
  const publication = createPublication(durable);
  t.equal((await publication.publish(readyRequest())).outcome,
    OUTCOME.NOT_APPLIED_SOURCE_UNCHANGED);
  durable.replace({...durable.current(), boot_incarnation: 4,
    created_at: NOW - 1_000});
  const replacement = durable.current();
  const redrive = await publication.publish(readyRequest());
  t.equal(redrive.outcome, OUTCOME.REFUSED_STALE_INCARNATION,
    'the old boot is refused against the replacement incarnation');
  t.same(durable.current(), replacement, 'the replacement row is untouched');
});
