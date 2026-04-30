import {TABLES} from '../../constants/index.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const LOCAL_STR_NODES_OWNER = 'nodes-owner';

class NodesOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_NODES_OWNER;
  static TABLE_NAME = TABLES.NODES;

  async getNode(nodeId, options = {}) {
    return this.readByPrimaryKey(nodeId, options);
  }

  async getNodeFromCache(nodeId, options = {}) {
    return this.readCachedByPrimaryKey(nodeId, options);
  }

  async listNodes(options = {}) {
    return this.listRows(options);
  }

  async listNodesFromCache(options = {}) {
    return this.listCachedRows(options);
  }

  async insertNode(row, options = {}) {
    return this.insertRow(row, options);
  }

  async upsertNode(row, options = {}) {
    return this.upsertRow(row, options);
  }

  async updateNode(nodeId, data, options = {}) {
    return this.updateByPrimaryKey(nodeId, data, options);
  }

  async removeNode(nodeId, options = {}) {
    return this.deleteByPrimaryKey(nodeId, options);
  }
}

export {NodesOwner};
