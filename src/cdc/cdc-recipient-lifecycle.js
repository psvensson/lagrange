// The recipient-domain lifecycle evidence a CDC source lane may detach a
// recipient on (dead-recipient measure 2, owner ruling 2026-11-11): the
// membership owner's authoritative state of the recipient's group, read from
// the leaders of the `services` and `nodes` partitions (leader-witnessed, as
// the owner holds it - never the sender's cache, never elapsed time). A
// group's lifecycle is its replica rows': the message_groups row carries no
// lifecycle column (MESSAGE_GROUPS_SCHEMA), so it is not read.
//
// A message group is STOPPED when the services partition's leader holds at
// least one replica row of the group and every one of them is stopped: its
// status is stopped, or the nodes partition's leader holds its node in a
// terminal state (stopped, failed). Any active replica on a live node makes it
// ACTIVE. No row at all is NOT_ESTABLISHED (absence is not evidence, R07);
// an unreadable or non-leader answer is UNAVAILABLE. Only STOPPED detaches.
// Detaching is safe by construction (CDC Stage 3): a group that returns is a
// new recipient whose first range answers a gap, and it lists again.
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../constants/index.js';
import {NODE_STATE} from '../constants/node-state.js';
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';
import {isValidLeaderReadAuthorityWitness} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {resolveMessageGroupId} from '../topology/cdc-group-propagation-routing.js';

const CDC_RECIPIENT_LIFECYCLE = Object.freeze({
  ACTIVE: 'active',
  STOPPED: 'stopped',
  NOT_ESTABLISHED: 'not_established',
  UNAVAILABLE: 'unavailable',
});

const TERMINAL_NODE_STATES = Object.freeze(new Set([NODE_STATE.STOPPED, NODE_STATE.FAILED]));

const LIFECYCLE_READ_OPTIONS = Object.freeze({
  readAuthority: buildControlPlaneReadAuthority({
    authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  }),
});

async function leaderRows(service, tableName) {
  const result = await service.executeAuthoritativeSystemTableRead(tableName,
    `SELECT * FROM ${tableName}`, [], LIFECYCLE_READ_OPTIONS);
  return result?.success === true && Array.isArray(result.rows) &&
    isValidLeaderReadAuthorityWitness(result.readAuthorityWitness,
      INITIAL_PARTITION_IDS[tableName]) ? result.rows : null;
}

function evidence(state, detail = {}) {
  return Object.freeze({state, ...detail});
}

/**
 * Read the lifecycle of one recipient group from its membership owner.
 * @param {Object|null} service - The node's CDC integration service.
 * @param {string} groupId - The recipient group.
 * @return {Promise<Object>} Frozen {state: a CDC_RECIPIENT_LIFECYCLE, ...}.
 */
async function readRecipientGroupLifecycle(service, groupId) {
  if (service === null || service === undefined) {
    return evidence(CDC_RECIPIENT_LIFECYCLE.UNAVAILABLE, {groupId});
  }
  const services = await leaderRows(service, TABLES.SERVICES);
  if (services === null) return evidence(CDC_RECIPIENT_LIFECYCLE.UNAVAILABLE, {groupId});
  const replicas = services.filter((row) =>
    row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
    resolveMessageGroupId(row) === groupId);
  if (replicas.length === 0) return evidence(CDC_RECIPIENT_LIFECYCLE.NOT_ESTABLISHED, {groupId});
  const nodes = await leaderRows(service, TABLES.NODES);
  if (nodes === null) return evidence(CDC_RECIPIENT_LIFECYCLE.UNAVAILABLE, {groupId});
  const nodeState = new Map(nodes.map((row) => [row?.[COLUMN.NODE_ID], row?.[COLUMN.STATUS]]));
  const stopped = replicas.every((row) => row[COLUMN.STATUS] === SERVICE_STATUS.STOPPED ||
    TERMINAL_NODE_STATES.has(nodeState.get(row[COLUMN.NODE_ID])));
  return evidence(stopped ? CDC_RECIPIENT_LIFECYCLE.STOPPED : CDC_RECIPIENT_LIFECYCLE.ACTIVE,
    {groupId, by: TABLES.SERVICES, replicas: replicas.length});
}

export {CDC_RECIPIENT_LIFECYCLE, readRecipientGroupLifecycle};
