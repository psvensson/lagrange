// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {RaftTransportAdapter} from '../../src/raft/raft-transport-adapter.js';
import {
  RAFT_PACKET_TYPE,
  RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
  RAFT_TRANSPORT_DELIVERY_OPTIONS,
} from '../../src/raft/constants.js';

test('RaftTransportAdapter keeps append-entry replication off the critical lane',
  async (t) => {
    let receivedAddress = null;
    let receivedMessage = null;
    let receivedOptions = null;
    const messageRouter = {
      async deliver(address, message, options) {
        receivedAddress = address;
        receivedMessage = message;
        receivedOptions = options;
        return {acknowledged: true};
      },
    };
    const adapter = new RaftTransportAdapter({
      messageRouter,
      entityType: 'partition',
      nodeId: 'node-1',
    });
    const packet = {
      type: RAFT_PACKET_TYPE.APPEND,
      term: 7,
      address: 'node-1/partition/part-1-r1',
      state: 'leader',
      leader: 'part-1-r1',
      last: {index: 12, term: 7},
      data: [{index: 12, term: 7, command: {type: 'QUERY'}}],
      destination: 'node-2/partition/part-1-r2',
    };

    await new Promise((resolve, reject) => {
      adapter.write(packet, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    t.equal(receivedAddress, packet.destination,
      'adapter should preserve the resolved peer address');
    t.equal(receivedMessage.type, 'RAFT_APPEND_ENTRIES',
      'adapter should keep the existing transport message mapping');
    t.same(receivedOptions, RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
      'append-entry replication should use the background delivery lane');
  });

test('RaftTransportAdapter keeps heartbeat traffic on the critical lane',
  async (t) => {
    let receivedOptions = null;
    const messageRouter = {
      async deliver(_address, _message, options) {
        receivedOptions = options;
        return {acknowledged: true};
      },
    };
    const adapter = new RaftTransportAdapter({
      messageRouter,
      entityType: 'partition',
      nodeId: 'node-1',
    });
    const packet = {
      type: RAFT_PACKET_TYPE.APPEND,
      term: 7,
      address: 'node-1/partition/part-1-r1',
      state: 'leader',
      leader: 'part-1-r1',
      last: {index: 12, term: 7},
      data: [],
      destination: 'node-2/partition/part-1-r2',
    };

    await new Promise((resolve, reject) => {
      adapter.write(packet, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    t.same(receivedOptions, RAFT_TRANSPORT_DELIVERY_OPTIONS,
      'heartbeat append traffic should remain critical');
  });

test('RaftTransportAdapter keeps control-plane publication append traffic critical',
  async (t) => {
    let receivedOptions = null;
    const messageRouter = {
      async deliver(_address, _message, options) {
        receivedOptions = options;
        return {acknowledged: true};
      },
    };
    const adapter = new RaftTransportAdapter({
      messageRouter,
      entityType: 'partition',
      nodeId: 'node-1',
    });
    const packet = {
      type: RAFT_PACKET_TYPE.APPEND,
      term: 7,
      address: 'node-1/partition/control_plane_publications-p1-r1',
      state: 'leader',
      leader: 'control_plane_publications-p1-r1',
      last: {index: 12, term: 7},
      data: [{index: 12, term: 7, command: {type: 'QUERY'}}],
      destination: 'node-2/partition/control_plane_publications-p1-r2',
    };

    await new Promise((resolve, reject) => {
      adapter.write(packet, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    t.same(receivedOptions, RAFT_TRANSPORT_DELIVERY_OPTIONS,
      'publication append traffic should remain critical');
  });

test('RaftTransportAdapter keeps sql transaction append traffic off the critical lane',
  async (t) => {
    let receivedOptions = null;
    const messageRouter = {
      async deliver(_address, _message, options) {
        receivedOptions = options;
        return {acknowledged: true};
      },
    };
    const adapter = new RaftTransportAdapter({
      messageRouter,
      entityType: 'partition',
      nodeId: 'node-1',
    });
    const packet = {
      type: RAFT_PACKET_TYPE.APPEND,
      term: 7,
      address: 'node-1/partition/sql_write_operations-p1-r1',
      state: 'leader',
      leader: 'sql_write_operations-p1-r1',
      last: {index: 12, term: 7},
      data: [{index: 12, term: 7, command: {type: 'QUERY'}}],
      destination: 'node-2/partition/sql_write_operations-p1-r2',
    };

    await new Promise((resolve, reject) => {
      adapter.write(packet, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    t.same(receivedOptions, RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
      'sql transaction append traffic should use the background delivery lane');
  });

test('RaftTransportAdapter keeps non-critical append-fail traffic off the ' +
  'critical lane', async (t) => {
  let receivedOptions = null;
  const messageRouter = {
    async deliver(_address, _message, options) {
      receivedOptions = options;
      return {acknowledged: true};
    },
  };
  const adapter = new RaftTransportAdapter({
    messageRouter,
    entityType: 'partition',
    nodeId: 'node-1',
  });
  const packet = {
    type: RAFT_PACKET_TYPE.APPEND_FAIL,
    term: 7,
    address: 'node-1/partition/tbl-bench-p1-r1',
    state: 'follower',
    leader: 'tbl-bench-p1-r1',
    last: {index: 12, term: 7},
    destination: 'node-2/partition/tbl-bench-p1-r2',
  };

  await new Promise((resolve, reject) => {
    adapter.write(packet, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  t.same(receivedOptions, RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
    'non-critical append-fail traffic should use the background delivery lane');
});

test('RaftTransportAdapter keeps control-plane append-fail traffic critical',
  async (t) => {
    let receivedOptions = null;
    const messageRouter = {
      async deliver(_address, _message, options) {
        receivedOptions = options;
        return {acknowledged: true};
      },
    };
    const adapter = new RaftTransportAdapter({
      messageRouter,
      entityType: 'partition',
      nodeId: 'node-1',
    });
    const packet = {
      type: RAFT_PACKET_TYPE.APPEND_FAIL,
      term: 7,
      address: 'node-1/partition/control_plane_publications-p1-r1',
      state: 'follower',
      leader: 'control_plane_publications-p1-r1',
      last: {index: 12, term: 7},
      destination: 'node-2/partition/control_plane_publications-p1-r2',
    };

    await new Promise((resolve, reject) => {
      adapter.write(packet, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    t.same(receivedOptions, RAFT_TRANSPORT_DELIVERY_OPTIONS,
      'control-plane append-fail traffic should remain critical');
  });

test('RaftTransportAdapter prefers the resolved target address when sender and ' +
  'target priorities differ', async (t) => {
    let receivedOptions = null;
    const messageRouter = {
      async deliver(_address, _message, options) {
        receivedOptions = options;
        return {acknowledged: true};
      },
    };
    const adapter = new RaftTransportAdapter({
      messageRouter,
      entityType: 'partition',
      nodeId: 'node-1',
    });
    const packet = {
      type: RAFT_PACKET_TYPE.APPEND_FAIL,
      term: 7,
      address: 'node-1/partition/control_plane_publications-p1-r1',
      state: 'follower',
      leader: 'control_plane_publications-p1-r1',
      last: {index: 12, term: 7},
      destination: 'node-2/partition/tbl-bench-p1-r2',
    };

    await new Promise((resolve, reject) => {
      adapter.write(packet, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    t.same(receivedOptions, RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
      'non-critical target routing should win over a critical-looking sender');
  });
