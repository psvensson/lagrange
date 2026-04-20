import {TABLES} from '../../constants/index.js';
import {EndpointMetadataOwnerBase} from './endpoint-metadata-owner-base.js';

class ServiceEndpointsOwner extends EndpointMetadataOwnerBase {
  static OWNER_NAME = 'service-endpoints-owner';
  static TABLE_NAME = TABLES.SERVICE_ENDPOINTS;
}

export {ServiceEndpointsOwner};
