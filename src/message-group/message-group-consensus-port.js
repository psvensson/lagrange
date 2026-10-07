// How a message-group replica runs on its raft-rs semantic operation port
// (design R3): the durable replica database that holds its consensus record,
// the request that states the group's own requirements, the typed startup
// refusal of a port its runtime owner refused, a lone replica's leadership,
// the replica's own committed configuration, and the release of both
// handles. The port's runtime owner makes every Raft decision; nothing here
// reproduces one.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {resolveRaftTransportDeliveryOptions} from '../raft/constants.js';
import {
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../raft/raft-committed-membership-constants.js';
import {genesisStamp} from '../raft/raft-committed-membership-stamp.js';
import {
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../raft/raft-operation-port-constants.js';
import {
  RAFT_OPERATION_PORT_REQUEST,
  hostedConsensusSubstrate,
} from '../raft/raft-operation-port-request.js';
import {committedMembershipRefusal} from
  '../raft/raft-rs-committed-membership-read.js';
import {REPLICA_DB_PRAGMA} from '../storage/storage-constants.js';
import {
  MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME,
  MESSAGE_GROUP_SERVICE_ERROR_MSG,
} from './constants.js';

/**
 * The typed startup refusal of a replica its consensus port refused: the
 * runtime owner refused to open the group, the port opened it held by its
 * host failure (its durable record could not be read), or a lone replica's
 * campaign was refused.
 * @param {Object} service - The message-group replica.
 * @param {Object} answer - What the port answered.
 * @return {Error} The error, carrying the typed code, the port's phase and
 *   the port's answer.
 */
function consensusInitRefusedError(service, answer) {
  const error = new Error(
    MESSAGE_GROUP_SERVICE_ERROR_MSG.CONSENSUS_INIT_REFUSED);
  error.code = MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED;
  error.groupId = service.groupId;
  error.replicaId = service.replicaId;
  error.phase = answer?.phase ?? null;
  error.consensus = answer ?? null;
  return error;
}

/**
 * Whether the replica opens without scheduling its own ticks: elections are
 * deferred until every replica of the group is registered, or the replica
 * joins an existing group and takes part only once its join converged.
 * @param {Object} service - The message-group replica.
 * @return {boolean} True when the port must not schedule at open.
 */
function shouldDeferConsensusScheduling(service) {
  return service.deferElection === true ||
    service.isJoiningExistingGroup === true ||
    service.deferElectionUntilJoinConvergence === true;
}

/**
 * The address of a replica identity. Status-free by construction: the
 * runtime resolves addresses while it computes a status, so this never reads
 * one.
 * @param {Object} service - The message-group replica.
 * @param {string} replicaIdentity - The identity to place.
 * @return {string} Its unified address.
 */
function resolveConsensusPeerAddress(service, replicaIdentity) {
  if (replicaIdentity === service.replicaId) {
    return service.unifiedAddress;
  }
  return service.buildPeerAddress(replicaIdentity, {
    allowBootstrapHints: true,
    consensusResolution: true,
  });
}

/**
 * The group's own requirements, stated once (the port request boundary).
 * @param {Object} service - The message-group replica.
 * @return {Object} Its RAFT_OPERATION_PORT_REQUEST.
 */
function messageGroupConsensusRequest(service) {
  return {
    [RAFT_OPERATION_PORT_REQUEST.GROUP_ID]: service.groupId,
    [RAFT_OPERATION_PORT_REQUEST.PEER_ID]: service.replicaId,
    [RAFT_OPERATION_PORT_REQUEST.PEER_ADDRESS]: service.unifiedAddress,
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS]: service.replicaIds,
    // The founders a replica without a durable record opens from; a
    // replica with one reopens from that record alone.
    [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]:
      genesisStamp(service.replicaIds),
    // A replica that joins an existing group under that stamp holds no
    // founder's history: with no record it is refused (O4).
    [RAFT_OPERATION_PORT_REQUEST.JOINING_EXISTING_GROUP]:
      service.isJoiningExistingGroup === true,
    // The seed's durable services row proves this founder opened before
    // (the open-time rule): without its record it is refused reseed-required.
    [RAFT_OPERATION_PORT_REQUEST.IDENTITY_EXISTED]:
      service.identityExisted === true,
    // A first opening whose services row is not yet durable steps nothing
    // until that write is confirmed (the partition create's identity record).
    ...(service.identityRecorded === null ? {} : {
      [RAFT_OPERATION_PORT_REQUEST.IDENTITY_RECORDED]:
        service.identityRecorded,
    }),
    [RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE]: service.db,
    [RAFT_OPERATION_PORT_REQUEST.TIMING]: service.raftTimingConfig,
    [RAFT_OPERATION_PORT_REQUEST.SUBSTRATE]: hostedConsensusSubstrate(service),
    [RAFT_OPERATION_PORT_REQUEST.DEFER_ELECTION]:
      shouldDeferConsensusScheduling(service),
    [RAFT_OPERATION_PORT_REQUEST.SEND_TO_PEER]: (peerAddress, envelope) =>
      service.transport.deliver(
        peerAddress,
        envelope,
        resolveRaftTransportDeliveryOptions({
          ...envelope,
          targetAddress: peerAddress,
        }),
      ),
    [RAFT_OPERATION_PORT_REQUEST.RESOLVE_PEER_ADDRESS]: (replicaIdentity) =>
      resolveConsensusPeerAddress(service, replicaIdentity),
    // Runs inside the transaction that also advances the applied state.
    [RAFT_OPERATION_PORT_REQUEST.APPLY_COMMITTED_ENTRY]: (committed) =>
      service.applyCommittedEntry(committed),
  };
}

/**
 * Open the replica's durable database (creating its group directory, as a
 * partition replica creates its own) and its operation port over it. A
 * port the runtime owner refused, or one that opened its group held by its
 * host failure, is the replica's typed startup refusal; the caller releases
 * what was acquired.
 * @param {Object} service - The message-group replica.
 * @return {Object} The port, also held as service.raft.
 */
function openMessageGroupConsensusPort(service) {
  fs.mkdirSync(path.dirname(service.dbPath), {recursive: true});
  service.db = new Database(service.dbPath);
  service.db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
  service.db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
  try {
    service.raft = service.createOperationPort(
      messageGroupConsensusRequest(service));
  } catch (error) {
    if (error?.consensus?.outcome !== RAFT_OPERATION_OUTCOME.CORE_REFUSED) {
      throw error;
    }
    throw consensusInitRefusedError(service, error.consensus);
  }
  const opened = service.raft.readStatus();
  if (opened?.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
      opened.recoveryRequired === true) {
    throw consensusInitRefusedError(service, opened);
  }
  return service.raft;
}

/**
 * A lone replica leads its own group: it campaigns once through its port,
 * and a refused campaign is a group that can never serve a write, so it is
 * the typed startup refusal. Below its participation gate it campaigns
 * nothing; its scheduling is armed for the gate's opening instead.
 * @param {Object} service - The message-group replica.
 * @return {Promise<void>}
 */
async function leadLoneMessageGroup(service) {
  if (service.raft.readStatus()?.gateOpen === false) {
    service.raft.startScheduling();
    return;
  }
  const campaign = await service.raft.campaign();
  if (campaign?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    throw consensusInitRefusedError(service, campaign);
  }
}

/**
 * This replica's own committed configuration, read through its port's one
 * committed-membership read (a witness read: what this replica applied,
 * whether it leads or not).
 * @param {Object} service - The message-group replica.
 * @return {Object} The port's frozen COMMITTED or REFUSED answer.
 */
function readMessageGroupCommittedMembership(service) {
  const read = service.raft?.[RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP];
  if (typeof read !== 'function') {
    return committedMembershipRefusal(COMMITTED_MEMBERSHIP_REFUSAL.NOT_HOSTED);
  }
  return read({purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS});
}

/**
 * Release the port, then the database it ran over.
 * @param {Object} service - The message-group replica.
 * @return {Promise<void>}
 */
async function closeMessageGroupConsensus(service) {
  const port = service.raft;
  service.raft = null;
  if (port) {
    await Promise.resolve(port.close());
  }
  const db = service.db;
  service.db = null;
  if (db?.open) {
    db.close();
  }
}

export {
  closeMessageGroupConsensus,
  consensusInitRefusedError,
  leadLoneMessageGroup,
  openMessageGroupConsensusPort,
  readMessageGroupCommittedMembership,
};
