// The rebalancer test mocks (test/rebalancer/test-helpers.js), completed to
// the partition's collaborator interface (test/helpers/
// partition-service-fixture.js) for tests that wire them onto a
// PartitionService through its validating setters.
import {
  createMockCache as createRebalancerMockCache,
  createMockCdcService as createRebalancerMockCdcService,
  createMockCoordinator as createRebalancerMockCoordinator,
} from '../rebalancer/test-helpers.js';
import {partitionCollaboratorFake} from '../helpers/partition-service-fixture.js';
import {
  PARTITION_SERVICE_COLLABORATOR as COLLABORATOR,
} from '../../src/partition/partition-service-collaborators.js';

const createMockCache = (options) => partitionCollaboratorFake(
  COLLABORATOR.SYSTEM_TABLE_CACHE, createRebalancerMockCache(options));
const createMockCdcService = () => partitionCollaboratorFake(
  COLLABORATOR.CDC_INTEGRATION_SERVICE, createRebalancerMockCdcService());
const createMockCoordinator = () => partitionCollaboratorFake(
  COLLABORATOR.REBALANCE_COORDINATOR, createRebalancerMockCoordinator());

export {
  createMockCache,
  createMockCdcService,
  createMockCoordinator,
};
