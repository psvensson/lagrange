import {TABLES} from '../../constants/index.js';
import {EndpointMetadataOwnerBase} from './endpoint-metadata-owner-base.js';

const LOCAL_STR_1RRTM = 'service-endpoints-owner';

class ServiceEndpointsOwner extends EndpointMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_1RRTM;
  static TABLE_NAME = TABLES.SERVICE_ENDPOINTS;
}

export {ServiceEndpointsOwner};
