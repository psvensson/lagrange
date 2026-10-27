// Native source-bound witness for marker custody while its leader cannot
// contact a quorum. Physical Docker partition acceptance remains separate.
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {formAdmittedGroup} from '../../partition/partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from '../../partition/partition-release-fixture.js';
import {createLoopbackTransport} from '../../partition/partition-service-test-support.js';
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {LOGS_SCHEMA} from '../../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../../src/constants/index.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {RAFT_RS_TRANSPORT_PROTOCOL} from '../../../src/raft/raft-rs-ingress-constants.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {LogsOwner} from '../../../src/control-plane/owners/logs-owner.js';
import {ControlPlaneSystemTableGateway} from
  '../../../src/control-plane/control-plane-system-table-gateway.js';
import {CDCIntegrationService} from '../../../src/cdc/cdc-integration-service.js';
import {durableConsumerView, holdNativeDeliveries, trackAnswer, traceConsumer} from
  './runtime-completion-consumers-fixture.js';

const PARTITION_ID = 'logs-p1';
const NODE_ID = 'marker-native-node';
const MEMBERS = [1, 2, 3].map((index) => [`logs-native-r${index}`, NODE_ID]);
const BUDGET_MS = 10000;
const REQUEST = Object.freeze({markerId: 'native-held-quorum', message: 'held logs partition'});
const LOG_ID = 'diagnostic-marker:native-held-quorum';
const NOW = 1700000000000;
const rows = (service) => service.db.prepare('SELECT * FROM logs WHERE log_id = ?').all(LOG_ID);

function markerEntry(record) {
  return record.entries.find((entry) => {
    if (typeof entry.data !== 'string' || entry.data.length === 0) return false;
    try {
      const command = JSON.parse(Buffer.from(entry.data, 'base64').toString());
      return command.params?.includes(LOG_ID);
    } catch {
      return false;
    }
  });
}

async function fixture(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID},
    logging: {level: 'fatal'}, raft: {heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const transport = createLoopbackTransport();
  const group = await formAdmittedGroup({partitionId: PARTITION_ID, members: MEMBERS,
    tempPrefix: 'log-marker-native-', budgetMs: BUDGET_MS, transport,
    serviceOptions: {tableName: TABLES.LOGS, tableId: TABLES.LOGS, schema: LOGS_SCHEMA}});
  let owners = null;
  let cdc = null;
  t.after(async () => {
    let failed = false;
    try {
      await owners?.dispose();
    } catch (error) {
      failed = true; throw error;
    } finally {
      cdc?.markShuttingDown();
      transport.deliver = async () => undefined;
      await group.dispose({retainDirectory: failed});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
  owners = await attachPartitionReleaseOwners(group.services,
    {directory: path.dirname(group.dbFileOf(MEMBERS[0])), budgetMs: BUDGET_MS});
  await owners.release(PARTITION_ID);
  const leader = group.services.find((service) =>
    service.raft.readStatus().role === RAFT_ROLE.LEADER);
  assert.ok(leader, 'actual core selected a leader');
  const cache = new SystemTableCache();
  const routed = [];
  cdc = new CDCIntegrationService({nodeId: NODE_ID, systemTableCache: cache,
    sqlQueryEngine: {async executeQuery(sql, params, options) {
      const call = {sql, params, options};
      routed.push(call);
      call.answer = await leader.executeQuery(sql, params, options);
      return call.answer;
    }}});
  cdc.initialize();
  cdc.executeAuthoritativeSystemTableRead = async (_table, sql, params) =>
    ({success: true, rows: leader.db.prepare(sql).all(...params)});
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID,
    cdcIntegrationService: cdc, systemTableCache: cache});
  const owner = new LogsOwner({controlPlaneSystemTableGateway: gateway, now: () => NOW});
  return {group, leader, transport, owner, routed};
}

test('native logs marker remains unapplied and unacknowledged while quorum traffic is held',
  {timeout: 40000}, async (t) => {
    const f = await fixture(t);
    // The existing native fixture's scheduling seam isolates this one
    // application/ACK claim from leadership transfer, tested independently.
    f.group.services.forEach((service) => service.raft.stopScheduling());
    const leaderAddress = `${f.leader.nodeId}/partition/${f.leader.replicaId}`;
    const followers = new Set(f.group.services.filter((service) => service !== f.leader)
      .map((service) => `${service.nodeId}/partition/${service.replicaId}`));
    const gate = holdNativeDeliveries(f.transport, (to, packet) =>
      packet?.protocol === RAFT_RS_TRANSPORT_PROTOCOL && packet.groupId === PARTITION_ID &&
      (to === leaderAddress || followers.has(to)));
    // This witness measures durable source application, not cache delivery.
    const pending = trackAnswer(f.owner.appendDiagnosticMarker(REQUEST, NODE_ID,
      {skipCacheWait: true}));
    const exactAppendHeld = () => gate.records.some(({address, packet}) =>
      followers.has(address) && markerEntry({entries: packet.message?.entries || []}));
    try {
      await f.group.waitFor(() => pending.settled ||
        (markerEntry(durableConsumerView(f.leader)) && exactAppendHeld()));
      traceConsumer(t, 'marker-seam-observation', {routed: f.routed,
        settled: pending.settled, answer: pending.answer,
        error: pending.error ? {code: pending.error.code, message: pending.error.message,
          cause: pending.error.cause?.message} : null,
        durable: durableConsumerView(f.leader), held: gate.evidence()});
      assert.ok(markerEntry(durableConsumerView(f.leader)),
        'the exact marker reached the native log');
      assert.ok(exactAppendHeld(), 'an actual APPEND carrying the exact marker is held');
      // The send owner awaits each delivery. The first held send prevents
      // later sends from being issued; the gate fences all of them, and the
      // durable observations below prove that no replica applied the marker.
      const before = f.group.services.map((service) => ({replicaId: service.replicaId,
        durable: durableConsumerView(service), rows: rows(service)}));
      const proposed = markerEntry(before.find((entry) =>
        entry.replicaId === f.leader.replicaId).durable);
      assert.equal(pending.settled, false, 'no successful owner receipt during the cut');
      for (const observation of before) {
        assert.deepEqual(observation.rows, [], 'no marker applied on any replica during the cut');
        assert.ok(BigInt(observation.durable.commitIndex) < BigInt(proposed.index));
        assert.ok(BigInt(observation.durable.appliedIndex) < BigInt(proposed.index));
      }
      traceConsumer(t, 'marker-held', {proposedIndex: proposed.index,
        observations: before, heldDeliveries: gate.evidence(), ownerSettled: pending.settled});
      gate.release();
      const answer = await pending.promise;
      assert.equal(answer.markerState, 'recorded');
      // Scheduling resumes real replication of the final committed frontier.
      f.group.services.forEach((service) => service.raft.startScheduling());
      assert.equal(await f.group.waitFor(() =>
        f.group.services.every((service) => rows(service).length === 1)), true);
      const original = rows(f.leader)[0];
      const replay = await f.owner.appendDiagnosticMarker(REQUEST, NODE_ID, {skipCacheWait: true});
      assert.deepEqual(replay, answer, 'same semantic marker reconciles the first row');
      for (const service of f.group.services) assert.deepEqual(rows(service), [original]);
      traceConsumer(t, 'marker-healed', {answer, replay,
        observations: f.group.services.map((service) => ({replicaId: service.replicaId,
          durable: durableConsumerView(service), rows: rows(service)}))});
    } finally {
      await gate.restore();
      f.group.services.forEach((service) => service.raft.startScheduling());
      await pending.promise.catch(() => undefined);
    }
  });
