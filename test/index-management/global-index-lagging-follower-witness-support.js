import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {
  enableParticipantTransactionAdmission,
} from '../../src/partition/partition-participant-transaction-request.js';
import {
  readParticipantReleaseFacts,
  resumeParticipantCutoverAdmission,
} from '../../src/partition/partition-participant-transaction-pause.js';
import {PARTICIPANT_CUTOVER_OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {releaseIdentityOf} from
  '../../src/partition/partition-participant-release-contract.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  buildIndexDatasetSchema,
} from '../../src/index-management/global-index-dataset-manager.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {createLoopbackTransport} from '../partition/partition-service-test-support.js';
import {
  createCommittedServeEligibilityOwner,
} from '../control-plane/serve-eligibility-test-support.js';
import {
  createSchemaAwareSystemGateway,
} from './global-index-founding-witness-support.js';

function releaseHandlerOf(service) {
  return {
    nodeId: service.nodeId,
    ownerIncarnation: 1,
    localServices: new Map([[service.replicaId, service]]),
  };
}

async function openGroupWriteAdmission(group) {
  const leader = group.services[0];
  const enabled = await enableParticipantTransactionAdmission(leader);
  if (enabled?.success !== true) {
    throw new Error(`group participant admission refused: ${JSON.stringify(enabled)}`);
  }
  let census = [];
  const observed = await group.waitFor(async () => {
    census = await Promise.all(
      group.services.map((svc) => readParticipantReleaseFacts(releaseHandlerOf(svc), svc)),
    );
    return census.every((facts) =>
      facts.outcome === PARTICIPANT_CUTOVER_OUTCOME.OBSERVED &&
      facts.origin !== null &&
      facts.leaderReplicaId === leader.replicaId,
    );
  });
  if (!observed) {
    throw new Error(`group members did not observe participant origin on ${leader.partitionId}`);
  }
  const local = census[0];
  const release = releaseIdentityOf({
    partitionId: leader.partitionId,
    targetBuildDigest: local.buildDigest,
    configurationKey: local.membership.configurationKey,
    membershipGenerationIndex: local.membership.membershipGenerationIndex,
  });
  const outcome = await resumeParticipantCutoverAdmission(
    releaseHandlerOf(leader),
    leader,
    {release, census},
  );
  if (outcome !== PARTICIPANT_CUTOVER_OUTCOME.RESUMED) {
    throw new Error(`group participant release refused: ${outcome}`);
  }
}

const USERS_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'email', type: 'TEXT'},
    {name: 'name', type: 'TEXT'},
    {name: 'status', type: 'TEXT'},
  ],
  primaryKey: ['id'],
});

async function withLaggingFollowerEnvironment(callback) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-gsi-2b-'));
  const oracleDb = new Database(':memory:');
  oracleDb.exec(
    'CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, status TEXT)',
  );

  const network = createLoopbackTransport();
  const baseDeliver = network.deliver.bind(network);
  let lagFollowerUsersAppend = false;
  let lagFollowerIdxAppend = false;
  let blockLeaderDelivery = false;

  network.deliver = async (address, payload, options) => {
    const addrStr = String(address || '');
    if (blockLeaderDelivery && addrStr.startsWith('node-leader/')) {
      return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
    }
    const isFollowerAppend =
      addrStr.startsWith('node-follower/') &&
      payload?.message?.msgType === RAFT_RS_MESSAGE_TYPE.APPEND;
    if (isFollowerAppend) {
      if (lagFollowerUsersAppend && addrStr.includes('users_p0')) {
        return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
      }
      if (lagFollowerIdxAppend && addrStr.includes('__gsi_users_idx_users_email_p0')) {
        return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
      }
    }
    return baseDeliver(address, payload, options);
  };

  const idxSchema = buildIndexDatasetSchema({
    tableName: 'users',
    indexName: 'idx_users_email',
    columnNames: ['email'],
    basePrimaryKeyColumns: ['id'],
    columnTypes: {id: 'INTEGER', email: 'TEXT'},
  });

  const usersMembers = [
    ['users_p0-r1', 'node-leader'],
    ['users_p0-r2', 'node-follower'],
    ['users_p0-r3', 'node-witness'],
  ];
  const idxMembers = [
    ['__gsi_users_idx_users_email_p0-r1', 'node-leader'],
    ['__gsi_users_idx_users_email_p0-r2', 'node-follower'],
    ['__gsi_users_idx_users_email_p0-r3', 'node-witness'],
  ];

  const usersGroup = await formAdmittedGroup({
    partitionId: 'users_p0',
    members: usersMembers,
    tempPrefix: 'lagrange-gsi-2b-users-',
    serviceOptions: {tableId: 'users', tableName: 'users', schema: USERS_SCHEMA},
    budgetMs: 10000,
    transport: network,
  });
  const idxGroup = await formAdmittedGroup({
    partitionId: '__gsi_users_idx_users_email_p0',
    members: idxMembers,
    tempPrefix: 'lagrange-gsi-2b-idx-',
    serviceOptions: {
      tableId: '__idx_users_idx_users_email',
      tableName: '__idx_users_idx_users_email',
      schema: idxSchema,
    },
    budgetMs: 10000,
    transport: network,
  });

  const systemCache = new SystemTableCache();
  const {gateway, cdcService} = createSchemaAwareSystemGateway(
    path.join(tmpDir, 'catalog.db'),
    systemCache,
  );

  const now = Date.now();
  await gateway.insertSystemTableRow(TABLES.TABLES, {
    table_id: 'users',
    table_name: 'users',
    schema_definition: JSON.stringify(USERS_SCHEMA),
    partition_key: 'id',
    table_policies: '{}',
    partition_count: 1,
    active_partition_version: 1,
    created_at: now,
    updated_at: now,
  });
  await gateway.insertSystemTableRow(TABLES.PARTITIONS, {
    partition_id: 'users_p0',
    table_id: 'users',
    table_name: 'users',
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: 'INTEGER',
    partition_version: 1,
    replica_count: 3,
    size_bytes: 0,
    leader_node_id: 'node-leader',
    state: 'NORMAL',
    created_at: now,
    updated_at: now,
  });
  await gateway.insertSystemTableRow(TABLES.TABLES, {
    table_id: '__idx_users_idx_users_email',
    table_name: '__idx_users_idx_users_email',
    schema_definition: JSON.stringify(idxSchema),
    partition_key: 'email',
    table_policies: '{}',
    partition_count: 1,
    active_partition_version: 1,
    created_at: now,
    updated_at: now,
  });
  await gateway.insertSystemTableRow(TABLES.PARTITIONS, {
    partition_id: '__gsi_users_idx_users_email_p0',
    table_id: '__idx_users_idx_users_email',
    table_name: '__idx_users_idx_users_email',
    partition_key_start: null,
    partition_key_end: null,
    partition_key_type: 'TEXT',
    partition_version: 1,
    replica_count: 3,
    size_bytes: 0,
    leader_node_id: 'node-leader',
    state: 'NORMAL',
    created_at: now,
    updated_at: now,
  });

  const registerServices = async (partitionId, members) => {
    for (const [replicaId, nodeId] of members) {
      const res = await gateway.insertSystemTableRow(TABLES.SERVICES, {
        service_id: replicaId,
        replica_id: replicaId,
        partition_id: partitionId,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: nodeId,
        address: `${nodeId}/partition/${replicaId}`,
        raft_role: nodeId === 'node-leader' ? 'leader' : 'follower',
        status: SERVICE_STATUS.ACTIVE,
        created_at: now,
        updated_at: now,
      });
      if (!res.success) {
        throw new Error(`Failed to register service ${replicaId}: ${res.error}`);
      }
    }
  };
  await registerServices('users_p0', usersMembers);
  await registerServices('__gsi_users_idx_users_email_p0', idxMembers);

  const allReplicas = [...usersGroup.services, ...idxGroup.services];
  for (const svc of allReplicas) {
    svc.systemTableCache = systemCache;
  }
  await openGroupWriteAdmission(usersGroup);
  await openGroupWriteAdmission(idxGroup);

  const followerHostedServices = new Map([
    [usersGroup.services[1].replicaId, usersGroup.services[1]],
    [idxGroup.services[1].replicaId, idxGroup.services[1]],
  ]);
  const leaderHostedServices = new Map([
    [usersGroup.services[0].replicaId, usersGroup.services[0]],
    [idxGroup.services[0].replicaId, idxGroup.services[0]],
  ]);

  const messageRouter = {
    async deliver(address, message) {
      const addrStr = String(address || '');
      if (blockLeaderDelivery && addrStr.startsWith('node-leader/')) {
        return buildDeliveryEnvelope(
          {acknowledged: false, error: 'Authoritative leader unavailable'},
          {success: false, error: 'Authoritative leader unavailable'},
        );
      }
      const parts = addrStr.split('/');
      const targetId = parts[1] === 'partition' ? parts[2] : parts[1];
      const target = allReplicas.find(
        (svc) => svc.replicaId === targetId ||
          (`${svc.nodeId}/partition/${svc.replicaId}` === addrStr),
      );
      if (!target) {
        return buildDeliveryEnvelope(
          {acknowledged: false, error: `Participant unavailable: ${address}`},
          {success: false, error: `Participant unavailable: ${address}`},
        );
      }
      const response = await target.handleApplicationMessage(message);
      return buildDeliveryEnvelope({acknowledged: true}, response);
    },
  };

  const eligibility = createCommittedServeEligibilityOwner({
    nodeIds: ['node-leader', 'node-follower', 'node-witness'],
  });
  const makeEngine = (nodeId, hostedMap) => new SQLQueryEngine({
    nodeId,
    systemCache,
    controlPlaneReadinessService: eligibility,
    controlPlaneSystemTableGateway: gateway,
    cdcIntegrationService: cdcService,
    messageRouter,
    partitionServicesProvider: () => hostedMap,
    autoStartDistributedTransactionRecovery: false,
    migrationAutoWire: false,
  });

  const engineLeader = makeEngine('node-leader', leaderHostedServices);
  const engineFollower = makeEngine('node-follower', followerHostedServices);

  try {
    await callback({
      oracleDb,
      usersGroup,
      idxGroup,
      engineLeader,
      engineFollower,
      systemCache,
      setFollowerUsersLag: (lag) => {
        lagFollowerUsersAppend = lag;
      },
      setFollowerIdxLag: (lag) => {
        lagFollowerIdxAppend = lag;
      },
      setLeaderDown: (down) => {
        blockLeaderDelivery = down;
      },
    });
  } finally {
    await engineFollower.shutdown().catch(() => {});
    await engineLeader.shutdown().catch(() => {});
    await idxGroup.dispose().catch(() => {});
    await usersGroup.dispose().catch(() => {});
    gateway.close();
    oracleDb.close();
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

export {withLaggingFollowerEnvironment};
