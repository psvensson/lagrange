import {TABLES} from '../../constants/index.js';
import {EndpointMetadataOwnerBase} from './endpoint-metadata-owner-base.js';

const LOCAL_STR_SERVICE_ENDPOINTS_OWNER = 'service-endpoints-owner';

class ServiceEndpointsOwner extends EndpointMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_SERVICE_ENDPOINTS_OWNER;
  static TABLE_NAME = TABLES.SERVICE_ENDPOINTS;
}

export {ServiceEndpointsOwner};
