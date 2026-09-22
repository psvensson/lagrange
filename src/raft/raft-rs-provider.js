import {createRaftRsOperationPort} from './raft-rs-operation-port.js';

class RaftRsWasmProvider {
  constructor() {
    Object.freeze(this);
  }

  createPartitionPort(request) {
    return createRaftRsOperationPort(request);
  }
}

export {RaftRsWasmProvider};
