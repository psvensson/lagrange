// What one raft-rs group can be asked to do, and the whole of it.
//
// This is the object the provider seam resolves a node to, and it is built
// so that there is nothing to find behind it: the runtime and this group's
// key live in a closure, not in a property, so no walk of what the seam
// hands out reaches a core facade, a raw handle, a host object holding one,
// or a callback that could run arbitrary work against the core. Two
// rejections were earned by objects that moved the capability rather than
// removing it, so the capability is gone: every member below is a SEMANTIC
// OPERATION with a name, and the core is reached only by the host making a
// call the host itself gates.
//
// The reads are a closed set. `read` takes the NAME of a read, checked
// against that set, rather than a function to run - a callback would be the
// same hole wearing a read's name.

import {
  RAFT_RS_GROUP_ACCESS_ERROR_MSG,
  RAFT_RS_GROUP_READS,
} from './raft-rs-group-access-constants.js';
import {campaignRaftRsPeer} from './raft-rs-election-safety.js';
import {dispatchRaftRsMessage} from './raft-rs-ingress.js';
import {drainReady} from './raft-rs-ready-loop.js';

/**
 * Build the access object for one group of one runtime.
 *
 * @param {Object} parts - What this group is.
 * @param {Object} parts.host - The runtime that holds it. Captured, never
 *   exposed: it is the capability this object exists to keep unreachable.
 * @param {string} parts.key - The host's key for it. Captured, never
 *   exposed, for the same reason.
 * @param {Object} parts.store - Its durable Raft record.
 * @param {string} parts.groupId - The group.
 * @param {string} parts.peerId - This replica's raft peer id.
 * @return {Object} A frozen object of named operations.
 */
function createRaftRsGroupAccess({host, key, store, groupId, peerId}) {
  const active = (work) => host.enterActive(key, work);

  return Object.freeze({
    store,
    groupId,
    peerId,

    /** @return {number} Active entries this group has made into the core. */
    get activeCoreEntries() {
      return host.activeCoreEntries(key);
    },

    /** @return {string} The health of the runtime holding it, by name. */
    get runtimeHealth() {
      return host.health;
    },

    /**
     * One named read of this replica's own state.
     * @param {string} name - A RAFT_RS_GROUP_READS value.
     * @return {Object} The named call outcome.
     */
    read(name) {
      if (!RAFT_RS_GROUP_READS.includes(name)) {
        throw new Error(RAFT_RS_GROUP_ACCESS_ERROR_MSG.notARead(
          name, RAFT_RS_GROUP_READS));
      }
      return host.enterRead(key, name);
    },

    /**
     * One tick into the core.
     * @return {Object} The named call outcome.
     */
    tick() {
      return active((core, handle) => core.tick(handle));
    },

    /**
     * Campaign, through the host's half of election safety.
     * @return {Object} The named call outcome, carrying what it decided.
     */
    campaign() {
      return active((core, handle) =>
        campaignRaftRsPeer({core, handle, peerId}));
    },

    /**
     * One inbound envelope: the envelope boundary, then the core.
     * @param {Object} envelope - {groupId, to, message}.
     * @return {Object} The named call outcome, carrying the admission.
     */
    step(envelope) {
      return active((core, handle) => dispatchRaftRsMessage({
        core, handle, envelope, localGroupId: groupId, localPeerId: peerId,
      }));
    },

    /**
     * Propose one command's bytes.
     * @param {Uint8Array} command - The command.
     * @return {Object} The named call outcome.
     */
    propose(command) {
      return active((core, handle) => core.propose(handle, command));
    },

    /**
     * Propose one configuration change.
     * @param {Object} change - {transition, changes}.
     * @return {Object} The named call outcome.
     */
    proposeConfigurationChange(change) {
      return active((core, handle) =>
        core.propose_conf_change_v2(handle, change));
    },

    /**
     * Run the core's Ready cycles, with the host's own persistence, send and
     * apply work around each invocation.
     * @param {Object} [hostWork] - {send, applyEntry, maxCycles}.
     * @return {Object} The named call outcome, carrying what the cycles did.
     */
    drain(hostWork = {}) {
      return active((core, handle) => drainReady({
        core,
        handle,
        store,
        groupId,
        send: hostWork.send,
        applyEntry: hostWork.applyEntry,
        maxCycles: hostWork.maxCycles,
      }));
    },

    /**
     * Release this group's handle in the runtime.
     *
     * It takes no work: there is exactly one thing a teardown does, and a
     * callback here would be a general-purpose entry wearing a teardown's
     * name.
     * @return {Object} The named call outcome.
     */
    free() {
      return host.enterTeardown(key);
    },
  });
}

export {createRaftRsGroupAccess};
