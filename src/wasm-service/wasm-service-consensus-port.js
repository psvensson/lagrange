// How a WASM service replica runs on its raft-rs semantic operation port
// (design R4 §2(b)): one durable database holds the group's consensus record
// and the session KV store, the request states the group's own requirements,
// a port its runtime owner refused is the replica's typed startup refusal,
// and both handles are released. The port's runtime owner makes every Raft
// decision; nothing here reproduces one.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {COLUMN, TABLES} from '../constants/index.js';
import {SERVICE_TYPE, isPartitionCleanupServiceRow} from
  '../constants/service.js';
import {resolveRaftTransportDeliveryOptions} from '../raft/constants.js';
import {genesisStamp} from '../raft/raft-committed-membership-stamp.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {
  RAFT_OPERATION_PORT_REQUEST,
  hostedConsensusSubstrate,
} from '../raft/raft-operation-port-request.js';
import {createRaftRsOperationPort} from '../raft/raft-rs-operation-port.js';
import {resolveReplicaRaftTiming} from '../raft/replica-raft-timing.js';
import {REPLICA_DB_PRAGMA} from '../storage/storage-constants.js';
import {WASM_SERVICE_ERROR_MSG} from './wasm-service-constants.js';

const LOCAL_STR_STRING = 'string';
const SQLITE_MEMORY_PATH = ':memory:';

/**
 * Refuse a replica without its own durable consensus file.
 * @param {string} dbPath - The configured database path.
 */
function assertDurableDbPath(dbPath) {
  if (typeof dbPath !== LOCAL_STR_STRING || dbPath.length === 0) {
    throw new Error(WASM_SERVICE_ERROR_MSG.MISSING_DB_PATH);
  }
  if (dbPath === SQLITE_MEMORY_PATH) {
    throw new Error(WASM_SERVICE_ERROR_MSG.IN_MEMORY_DB_PATH_REFUSED);
  }
}

/**
 * The typed startup refusal of a replica its consensus port refused.
 * @param {Object} replica - The WASM service replica.
 * @param {Object} answer - What the port answered.
 * @return {Error} The error, carrying the port's answer.
 */
function consensusInitRefusedError(replica, answer) {
  const error = new Error(WASM_SERVICE_ERROR_MSG.CONSENSUS_INIT_REFUSED);
  error.serviceDefinitionId = replica.serviceDefinitionId;
  error.replicaId = replica.replicaId;
  error.consensus = answer ?? null;
  return error;
}

/**
 * The address of a replica identity: the node its services row places it
 * on. A peer without a placing row is unresolved - the port records the
 * failed delivery and resolves again on the next send, so a row that
 * appears later is used at once. Nothing guesses a peer's node.
 * @param {Object} replica - The WASM service replica.
 * @param {string} replicaIdentity - The identity to place.
 * @return {string} Its unified address.
 * @throws {Error} When no services row places the peer.
 */
function resolveWasmServicePeerAddress(replica, replicaIdentity) {
  if (replicaIdentity === replica.replicaId) {
    return replica.unifiedAddress;
  }
  const row = replica.systemTableCache?.get(TABLES.SERVICES, replicaIdentity);
  const placedNodeId = row && !isPartitionCleanupServiceRow(row) ?
    row[COLUMN.NODE_ID] : null;
  if (!placedNodeId) {
    throw new Error(
      `${WASM_SERVICE_ERROR_MSG.PEER_UNPLACED}: ${replicaIdentity}`,
    );
  }
  return replica.addressManager.format(
    placedNodeId,
    SERVICE_TYPE.WASM_SERVICE,
    replicaIdentity,
  );
}

/**
 * The group's own requirements, stated once (the port request boundary).
 * @param {Object} replica - The WASM service replica.
 * @return {Object} Its RAFT_OPERATION_PORT_REQUEST.
 */
function wasmServiceConsensusRequest(replica) {
  return {
    [RAFT_OPERATION_PORT_REQUEST.GROUP_ID]: replica.serviceDefinitionId,
    [RAFT_OPERATION_PORT_REQUEST.PEER_ID]: replica.replicaId,
    [RAFT_OPERATION_PORT_REQUEST.PEER_ADDRESS]: replica.unifiedAddress,
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS]: replica.replicaIds,
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]:
      genesisStamp(replica.replicaIds),
    [RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE]: replica.db,
    [RAFT_OPERATION_PORT_REQUEST.TIMING]: resolveReplicaRaftTiming(replica),
    [RAFT_OPERATION_PORT_REQUEST.SUBSTRATE]: hostedConsensusSubstrate(replica),
    [RAFT_OPERATION_PORT_REQUEST.DEFER_ELECTION]: false,
    [RAFT_OPERATION_PORT_REQUEST.SEND_TO_PEER]: (peerAddress, envelope) =>
      replica.transport.deliver(peerAddress, envelope,
        resolveRaftTransportDeliveryOptions({
          ...envelope,
          targetAddress: peerAddress,
        })),
    [RAFT_OPERATION_PORT_REQUEST.RESOLVE_PEER_ADDRESS]: (replicaIdentity) =>
      resolveWasmServicePeerAddress(replica, replicaIdentity),
    // Runs inside the transaction that also advances the applied state.
    [RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY]: (committed) =>
      replica.applyCommittedEntry(committed),
  };
}

/**
 * Open the replica's durable database, creating its service directory.
 * @param {Object} replica - The WASM service replica.
 * @return {Object} The open connection, also held as replica.db.
 */
function openWasmServiceDatabase(replica) {
  fs.mkdirSync(path.dirname(replica.dbPath), {recursive: true});
  replica.db = new Database(replica.dbPath);
  replica.db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
  replica.db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
  return replica.db;
}

/**
 * Open the replica's operation port over its open database. A port the
 * runtime owner refused, or one that opened its group held by its host
 * failure, is the typed startup refusal; the caller releases what was
 * acquired.
 * @param {Object} replica - The WASM service replica.
 * @return {Object} The port, also held as replica.raft.
 */
function openWasmServiceConsensusPort(replica) {
  try {
    replica.raft = createRaftRsOperationPort(
      wasmServiceConsensusRequest(replica));
  } catch (error) {
    if (error?.consensus?.outcome !== RAFT_OPERATION_OUTCOME.CORE_REFUSED) {
      throw error;
    }
    throw consensusInitRefusedError(replica, error.consensus);
  }
  const opened = replica.raft.readStatus();
  if (opened?.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
      opened.recoveryRequired === true) {
    throw consensusInitRefusedError(replica, opened);
  }
  return replica.raft;
}

/**
 * Release the port, then the database it ran over.
 * @param {Object} replica - The WASM service replica.
 * @return {Promise<void>}
 */
async function closeWasmServiceConsensus(replica) {
  const port = replica.raft;
  replica.raft = null;
  if (port) {
    await Promise.resolve(port.close());
  }
  const db = replica.db;
  replica.db = null;
  if (db?.open) {
    db.close();
  }
}

export {
  assertDurableDbPath,
  closeWasmServiceConsensus,
  openWasmServiceConsensusPort,
  openWasmServiceDatabase,
};
