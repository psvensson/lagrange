import {TABLES} from '../../constants/index.js';
import {EndpointMetadataOwnerBase} from './endpoint-metadata-owner-base.js';

class NodeEndpointsOwner extends EndpointMetadataOwnerBase {
  static OWNER_NAME = 'node-endpoints-owner';
  static TABLE_NAME = TABLES.NODE_ENDPOINTS;
}

export {NodeEndpointsOwner};
