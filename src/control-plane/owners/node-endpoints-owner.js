import {TABLES} from '../../constants/index.js';
import {EndpointMetadataOwnerBase} from './endpoint-metadata-owner-base.js';

const LOCAL_STR_13T18 = 'node-endpoints-owner';

class NodeEndpointsOwner extends EndpointMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_13T18;
  static TABLE_NAME = TABLES.NODE_ENDPOINTS;
}

export {NodeEndpointsOwner};
