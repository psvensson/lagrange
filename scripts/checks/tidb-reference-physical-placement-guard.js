#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  buildTiDbPhysicalMysqlCommand,
  buildTiDbPhysicalRegionPeerPlacementSql,
  buildTiDbPhysicalStoreStatusSql,
  evaluatePhysicalPlacement,
  parseTiDbPhysicalPeerRows,
  parseTiDbPhysicalStoreRows,
} from '../../test/distributed/harness/tidb-reference-physical-placement-proof.js';

const PASS_LINE = 'tidb-reference-physical-placement-guard: PASS\n';
const EXPECTED = ['10.0.0.11:8090', '10.0.0.12:8090', '10.0.0.13:8090'];

function validStores() {
  return [
    {storeId: '1', address: EXPECTED[0], state: 'Up'},
    {storeId: '2', address: EXPECTED[1], state: 'Up'},
    {storeId: '3', address: EXPECTED[2], state: 'Up'},
  ];
}

function validPeers() {
  return [
    {
      regionId: '18', peerId: '101', storeId: '1', address: EXPECTED[0],
      isLearner: 0, isLeader: 1, status: 'NORMAL',
    },
    {
      regionId: '18', peerId: '102', storeId: '2', address: EXPECTED[1],
      isLearner: 0, isLeader: 0, status: 'NORMAL',
    },
    {
      regionId: '18', peerId: '103', storeId: '3', address: EXPECTED[2],
      isLearner: 0, isLeader: 0, status: 'NORMAL',
    },
  ];
}

function assertSqlAndParsing() {
  const command = buildTiDbPhysicalMysqlCommand(
    {host: '10.0.0.10', port: 8085},
    'SELECT 1;',
  );
  assert.ok(command.includes('--host=10.0.0.10'));
  assert.ok(command.includes('--port=8085'));

  assert.match(buildTiDbPhysicalStoreStatusSql(), /TIKV_STORE_STATUS/u);
  const peerSql = buildTiDbPhysicalRegionPeerPlacementSql('probe_db', 'probe');
  assert.match(peerSql, /TIKV_REGION_PEERS/u);
  assert.match(peerSql, /s\.ADDRESS/u);
  assert.match(peerSql, /DB_NAME = 'probe_db'/u);
  assert.match(peerSql, /TABLE_NAME = 'probe'/u);
  assert.throws(
    () => buildTiDbPhysicalRegionPeerPlacementSql('bad-name', 'probe'),
    /simple SQL identifier/u,
  );

  assert.deepEqual(
    parseTiDbPhysicalStoreRows(
      '1\t10.0.0.11:8090\tUp\n2\t10.0.0.12:8090\tUp\n',
    ),
    [
      {storeId: '1', address: '10.0.0.11:8090', state: 'Up'},
      {storeId: '2', address: '10.0.0.12:8090', state: 'Up'},
    ],
  );
  assert.deepEqual(
    parseTiDbPhysicalPeerRows(
      '18\t101\t1\t10.0.0.11:8090\t0\t1\tNORMAL\n',
    ),
    [{
      regionId: '18', peerId: '101', storeId: '1',
      address: '10.0.0.11:8090', isLearner: 0, isLeader: 1,
      status: 'NORMAL',
    }],
  );
}

function assertPlacementEvaluation() {
  const valid = evaluatePhysicalPlacement({
    stores: validStores(),
    peers: validPeers(),
    expectedAddresses: EXPECTED,
    replicaTarget: 3,
  });
  assert.equal(valid.ready, true);
  assert.equal(valid.storesReady, true);
  assert.equal(valid.regions.length, 1);
  assert.equal(valid.regions[0].peerCount, 3);
  assert.equal(valid.regions[0].storeCount, 3);
  assert.equal(valid.regions[0].leaderCount, 1);
  assert.equal(valid.regions[0].learnerCount, 0);
  assert.equal(valid.regions[0].normalCount, 3);
  assert.deepEqual(valid.regions[0].addresses, [...EXPECTED].sort());

  const wrongHost = validPeers();
  wrongHost[2] = {...wrongHost[2], address: '10.0.0.99:8090'};
  assert.equal(evaluatePhysicalPlacement({
    stores: validStores(),
    peers: wrongHost,
    expectedAddresses: EXPECTED,
    replicaTarget: 3,
  }).ready, false);

  const learner = validPeers();
  learner[1] = {...learner[1], isLearner: 1};
  assert.equal(evaluatePhysicalPlacement({
    stores: validStores(), peers: learner, expectedAddresses: EXPECTED,
    replicaTarget: 3,
  }).ready, false);

  const twoLeaders = validPeers();
  twoLeaders[1] = {...twoLeaders[1], isLeader: 1};
  assert.equal(evaluatePhysicalPlacement({
    stores: validStores(), peers: twoLeaders, expectedAddresses: EXPECTED,
    replicaTarget: 3,
  }).ready, false);

  const missingPeer = validPeers().slice(0, 2);
  assert.equal(evaluatePhysicalPlacement({
    stores: validStores(), peers: missingPeer, expectedAddresses: EXPECTED,
    replicaTarget: 3,
  }).ready, false);

  const wrongStoreSet = validStores();
  wrongStoreSet[2] = {...wrongStoreSet[2], address: '10.0.0.99:8090'};
  assert.equal(evaluatePhysicalPlacement({
    stores: wrongStoreSet, peers: validPeers(), expectedAddresses: EXPECTED,
    replicaTarget: 3,
  }).ready, false);

  assert.throws(
    () => evaluatePhysicalPlacement({
      stores: validStores(), peers: validPeers(),
      expectedAddresses: [EXPECTED[0], EXPECTED[0], EXPECTED[2]],
      replicaTarget: 3,
    }),
    /3 distinct expected addresses/u,
  );
}

function main() {
  assertSqlAndParsing();
  assertPlacementEvaluation();
  process.stdout.write(PASS_LINE);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}
