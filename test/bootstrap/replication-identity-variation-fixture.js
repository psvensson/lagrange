// The metamorphic identity fixture for the replication policy authority
// contract.
//
// It lives beside the witness rather than inside it because it is a fixture,
// not an assertion, and because the two together exceed this repository's
// test file-size threshold.

import {
  resolveDesiredReplicationFactor,
} from '../../src/bootstrap/replication-target-authority.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  MessageGroupService,
} from '../../src/message-group/message-group-service.js';
import {
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  INITIAL_REPLICA_IDS,
  SYSTEM_TABLE_NAME,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';

// ---------------------------------------------------------------------------
// The metamorphic fixture for CLAUSE 4.
//
// Each variation perturbs identity-bearing state that REAL production code
// owns and mutates - the seed declarations, the peer lists PartitionService
// and MessageGroupService keep, minted replacement identities, node identity,
// and peer ordering and count. They are applied CUMULATIVELY, so by the last
// one almost nothing about the cluster's identity picture is what it was.
// ---------------------------------------------------------------------------

const FIXED_POLICY_ROW = Object.freeze(
  {partition_id: 'services-p1', replica_count: 3});
const MINTED_REPLACEMENT = '-replace-replica-a1b2c3d4e5f60718';

function snapshotIdentityDeclarations() {
  const tables = Object.keys(INITIAL_REPLICA_IDS);
  return {
    tables,
    perTable: tables.map((table) => [...INITIAL_REPLICA_IDS[table]]),
    messageGroup: [...INITIAL_MESSAGE_GROUP_REPLICA_IDS],
  };
}

function restoreIdentityDeclarations(snapshot) {
  snapshot.tables.forEach((table, index) => {
    INITIAL_REPLICA_IDS[table].splice(
      0, INITIAL_REPLICA_IDS[table].length, ...snapshot.perTable[index]);
  });
  INITIAL_MESSAGE_GROUP_REPLICA_IDS.splice(
    0, INITIAL_MESSAGE_GROUP_REPLICA_IDS.length, ...snapshot.messageGroup);
}

function buildIdentityFixture() {
  const table = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
  const partitionService = new PartitionService({
    partitionId: `${table}-p1`,
    tableId: table,
    replicaId: INITIAL_REPLICA_IDS[table][0],
    replicaIds: INITIAL_REPLICA_IDS[table],
    nodeId: 'seed',
  });
  const messageGroupService = new MessageGroupService({
    transport: {
      deliver: () => {},
      initialize: () => {},
      setServiceNodeResolver: () => {},
    },
    groupId: 'mg-1',
    replicaId: INITIAL_MESSAGE_GROUP_REPLICA_IDS[0],
    replicaIds: INITIAL_MESSAGE_GROUP_REPLICA_IDS,
    nodeId: 'seed',
  });
  return {table, partitionService, messageGroupService};
}

// What the cluster's identity state looks like right now, as one comparable
// value. Two variations that produce the SAME digest have not actually varied
// anything, and the receipts below refuse that.
function identityDigest(fixture) {
  return JSON.stringify({
    declarations: Object.keys(INITIAL_REPLICA_IDS).map(
      (table) => [table, [...INITIAL_REPLICA_IDS[table]]]),
    messageGroupDeclaration: [...INITIAL_MESSAGE_GROUP_REPLICA_IDS],
    handedOut: getInitialReplicaIds(fixture.table),
    partitionPeers: [...fixture.partitionService.replicaIds],
    partitionNode: fixture.partitionService.nodeId,
    partitionReplica: fixture.partitionService.replicaId,
    messageGroupPeers: [...fixture.messageGroupService.replicaIds],
    messageGroupNode: fixture.messageGroupService.nodeId,
  });
}

const IDENTITY_VARIATIONS = Object.freeze([
  Object.freeze({
    name: 'baseline',
    apply: () => {},
  }),
  Object.freeze({
    name: 'minted-replacement-identities-on-every-declaration',
    apply: () => {
      for (const table of Object.keys(INITIAL_REPLICA_IDS)) {
        INITIAL_REPLICA_IDS[table].push(
          `${table}-p1${MINTED_REPLACEMENT}`, `${table}-p2${MINTED_REPLACEMENT}`);
      }
      INITIAL_MESSAGE_GROUP_REPLICA_IDS.push(`mg-1${MINTED_REPLACEMENT}`);
    },
  }),
  Object.freeze({
    name: 'runtime-peer-lists-grow-by-replacement',
    apply: (fixture) => {
      fixture.partitionService.replicaIds.push(
        `${fixture.table}-p1${MINTED_REPLACEMENT}`);
      fixture.messageGroupService.replicaIds.push(
        `mg-1${MINTED_REPLACEMENT}`);
    },
  }),
  Object.freeze({
    name: 'peer-ordering-reversed-everywhere',
    apply: (fixture) => {
      for (const table of Object.keys(INITIAL_REPLICA_IDS)) {
        INITIAL_REPLICA_IDS[table].reverse();
      }
      INITIAL_MESSAGE_GROUP_REPLICA_IDS.reverse();
      fixture.partitionService.replicaIds.reverse();
      fixture.messageGroupService.replicaIds.reverse();
    },
  }),
  Object.freeze({
    name: 'node-and-replica-identity-replaced',
    apply: (fixture) => {
      fixture.partitionService.nodeId = 'node-a7f3';
      fixture.partitionService.replicaId =
        `${fixture.table}-p1${MINTED_REPLACEMENT}`;
      fixture.messageGroupService.nodeId = 'node-a7f3';
      fixture.messageGroupService.replicaId = `mg-1${MINTED_REPLACEMENT}`;
    },
  }),
  Object.freeze({
    name: 'peer-counts-collapsed-to-one',
    apply: (fixture) => {
      for (const table of Object.keys(INITIAL_REPLICA_IDS)) {
        INITIAL_REPLICA_IDS[table].splice(1);
      }
      INITIAL_MESSAGE_GROUP_REPLICA_IDS.splice(1);
      fixture.partitionService.replicaIds.splice(1);
      fixture.messageGroupService.replicaIds.splice(1);
    },
  }),
  Object.freeze({
    name: 'peer-counts-inflated-far-past-the-target',
    apply: (fixture) => {
      const inflate = (list, prefix) => {
        for (let index = 0; index < 17; index += 1) {
          list.push(`${prefix}-inflated-${index}`);
        }
      };
      for (const table of Object.keys(INITIAL_REPLICA_IDS)) {
        inflate(INITIAL_REPLICA_IDS[table], table);
      }
      inflate(INITIAL_MESSAGE_GROUP_REPLICA_IDS, 'mg-1');
      inflate(fixture.partitionService.replicaIds, fixture.table);
      inflate(fixture.messageGroupService.replicaIds, 'mg-1');
    },
  }),
  Object.freeze({
    name: 'every-identity-list-emptied',
    apply: (fixture) => {
      for (const table of Object.keys(INITIAL_REPLICA_IDS)) {
        INITIAL_REPLICA_IDS[table].length = 0;
      }
      INITIAL_MESSAGE_GROUP_REPLICA_IDS.length = 0;
      fixture.partitionService.replicaIds.length = 0;
      fixture.messageGroupService.replicaIds.length = 0;
    },
  }),
]);

// Walks the cumulative identity variations and decodes `rows` at each step.
// Returns one entry per variation: what identity looked like, and what every
// row decoded to there.
function decodeAcrossIdentityVariations(rows) {
  const snapshot = snapshotIdentityDeclarations();
  try {
    const fixture = buildIdentityFixture();
    return IDENTITY_VARIATIONS.map((variation) => {
      variation.apply(fixture);
      return {
        name: variation.name,
        digest: identityDigest(fixture),
        decoded: rows.map(({label, row}) => [label,
          JSON.stringify(resolveDesiredReplicationFactor(row))]),
      };
    });
  } finally {
    restoreIdentityDeclarations(snapshot);
  }
}
export {
  FIXED_POLICY_ROW,
  IDENTITY_VARIATIONS,
  MINTED_REPLACEMENT,
  decodeAcrossIdentityVariations,
  identityDigest,
  restoreIdentityDeclarations,
  snapshotIdentityDeclarations,
  buildIdentityFixture,
};
