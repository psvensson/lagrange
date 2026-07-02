import {TABLES} from '../../constants/index.js';
import {EndpointMetadataOwnerBase} from './endpoint-metadata-owner-base.js';

const LOCAL_STR_NODE_ENDPOINTS_OWNER = 'node-endpoints-owner';

class NodeEndpointsOwner extends EndpointMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_NODE_ENDPOINTS_OWNER;
  static TABLE_NAME = TABLES.NODE_ENDPOINTS;
}

export {NodeEndpointsOwner};
