/**
 * Property Test: Drill-Down Filtering
 * Property 3: For any drill-down navigation from a parent entity to child
 * entities, all displayed children should have a foreign key reference to
 * the selected parent.
 *
 * **Validates: Requirements 2.3, 3.1, 4.2**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {ServicesView} from '../../../src/cli/views/services-view.js';

/**
 * Generate a valid service record
 */
const serviceArb = fc.record({
  service_id: fc.string({minLength: 1, maxLength: 20}),
  service_type: fc.constantFrom('partition', 'message_group', 'node'),
  node_id: fc.string({minLength: 1, maxLength: 20}),
  status: fc.constantFrom('active', 'inactive', 'failed', 'starting'),
  address: fc.string({minLength: 5, maxLength: 30}),
});

test('Property 3: Drill-Down Filtering', async (t) => {
  await t.test('node filter shows only services for that node', async (t) => {
    fc.assert(
      fc.property(
        fc.array(serviceArb, {minLength: 1, maxLength: 10}),
        fc.string({minLength: 1, maxLength: 20}),
        (services, targetNodeId) => {
          // Ensure unique service IDs
          const uniqueServices = [];
          const seenIds = new Set();
          for (const service of services) {
            if (!seenIds.has(service.service_id)) {
              seenIds.add(service.service_id);
              uniqueServices.push(service);
            }
          }

          // Add at least one service with the target node
          const targetService = {
            ...uniqueServices[0],
            service_id: 'target-svc',
            node_id: targetNodeId,
          };
          uniqueServices.push(targetService);

          const view = new ServicesView();
          view.setData(uniqueServices);
          view.setNodeFilter(targetNodeId);

          // All filtered services should have the target node_id
          return view.filteredData.every((s) => s.node_id === targetNodeId);
        },
      ),
      {numRuns: 10},
    );
    t.pass('node filter shows only services for that node');
  });

  await t.test('type filter shows only services of that type', async (t) => {
    fc.assert(
      fc.property(
        fc.array(serviceArb, {minLength: 1, maxLength: 10}),
        fc.constantFrom('partition', 'message_group', 'node'),
        (services, targetType) => {
          // Ensure unique service IDs
          const uniqueServices = [];
          const seenIds = new Set();
          for (const service of services) {
            if (!seenIds.has(service.service_id)) {
              seenIds.add(service.service_id);
              uniqueServices.push(service);
            }
          }

          // Add at least one service with the target type
          const targetService = {
            ...uniqueServices[0],
            service_id: 'target-svc',
            service_type: targetType,
          };
          uniqueServices.push(targetService);

          const view = new ServicesView();
          view.setData(uniqueServices);
          view.setTypeFilter(targetType);

          // All filtered services should have the target type
          return view.filteredData.every(
            (s) => s.service_type === targetType);
        },
      ),
      {numRuns: 10},
    );
    t.pass('type filter shows only services of that type');
  });

  await t.test('combined filters are conjunctive (AND)', async (t) => {
    fc.assert(
      fc.property(
        fc.array(serviceArb, {minLength: 1, maxLength: 10}),
        fc.string({minLength: 1, maxLength: 20}),
        fc.constantFrom('partition', 'message_group', 'node'),
        (services, targetNodeId, targetType) => {
          // Ensure unique service IDs
          const uniqueServices = [];
          const seenIds = new Set();
          for (const service of services) {
            if (!seenIds.has(service.service_id)) {
              seenIds.add(service.service_id);
              uniqueServices.push(service);
            }
          }

          // Add a service matching both filters
          const targetService = {
            service_id: 'target-svc',
            service_type: targetType,
            node_id: targetNodeId,
            status: 'active',
            address: '127.0.0.1:8080',
          };
          uniqueServices.push(targetService);

          const view = new ServicesView();
          view.setData(uniqueServices);
          view.setNodeFilter(targetNodeId);
          view.setTypeFilter(targetType);

          // All filtered services should match BOTH filters
          return view.filteredData.every(
            (s) => s.node_id === targetNodeId &&
                         s.service_type === targetType);
        },
      ),
      {numRuns: 10},
    );
    t.pass('combined filters are conjunctive (AND)');
  });

  await t.test('clearing filters restores all data', async (t) => {
    fc.assert(
      fc.property(
        fc.array(serviceArb, {minLength: 1, maxLength: 10}),
        fc.string({minLength: 1, maxLength: 20}),
        (services, targetNodeId) => {
          // Ensure unique service IDs
          const uniqueServices = [];
          const seenIds = new Set();
          for (const service of services) {
            if (!seenIds.has(service.service_id)) {
              seenIds.add(service.service_id);
              uniqueServices.push(service);
            }
          }

          const view = new ServicesView();
          view.setData(uniqueServices);

          // Apply filter
          view.setNodeFilter(targetNodeId);
          const filteredCount = view.filteredData.length;

          // Clear filter
          view.clearServiceFilters();

          // Should restore all data
          return view.filteredData.length === uniqueServices.length &&
                     view.filteredData.length >= filteredCount;
        },
      ),
      {numRuns: 10},
    );
    t.pass('clearing filters restores all data');
  });

  await t.test('filtered count is subset of total', async (t) => {
    fc.assert(
      fc.property(
        fc.array(serviceArb, {minLength: 0, maxLength: 10}),
        fc.string({minLength: 1, maxLength: 20}),
        (services, targetNodeId) => {
          // Ensure unique service IDs
          const uniqueServices = [];
          const seenIds = new Set();
          for (const service of services) {
            if (!seenIds.has(service.service_id)) {
              seenIds.add(service.service_id);
              uniqueServices.push(service);
            }
          }

          const view = new ServicesView();
          view.setData(uniqueServices);
          view.setNodeFilter(targetNodeId);

          // Filtered count should be <= total count
          return view.filteredData.length <= uniqueServices.length;
        },
      ),
      {numRuns: 10},
    );
    t.pass('filtered count is subset of total');
  });

  await t.test('drill-down returns correct parent reference', async (t) => {
    fc.assert(
      fc.property(
        fc.record({
          service_id: fc.string({minLength: 1, maxLength: 20}),
          service_type: fc.constant('partition'),
          node_id: fc.string({minLength: 1, maxLength: 20}),
          status: fc.constant('active'),
          address: fc.string({minLength: 5, maxLength: 30}),
          partition_id: fc.string({minLength: 1, maxLength: 20}),
        }),
        (service) => {
          const view = new ServicesView();
          view.setData([service]);

          const action = view.handleDrillDown();

          // Drill-down should reference the correct partition
          return action !== null &&
                     action.context.partitionId === service.partition_id &&
                     action.context.serviceId === service.service_id;
        },
      ),
      {numRuns: 10},
    );
    t.pass('drill-down returns correct parent reference');
  });

  await t.test('message group drill-down returns correct reference',
    async (t) => {
      fc.assert(
        fc.property(
          fc.record({
            service_id: fc.string({minLength: 1, maxLength: 20}),
            service_type: fc.constant('message_group'),
            node_id: fc.string({minLength: 1, maxLength: 20}),
            status: fc.constant('active'),
            address: fc.string({minLength: 5, maxLength: 30}),
            group_id: fc.string({minLength: 1, maxLength: 20}),
          }),
          (service) => {
            const view = new ServicesView();
            view.setData([service]);

            const action = view.handleDrillDown();

            // Drill-down should reference the correct message group
            return action !== null &&
                         action.context.groupId === service.group_id &&
                         action.context.serviceId === service.service_id;
          },
        ),
        {numRuns: 10},
      );
      t.pass('message group drill-down returns correct reference');
    });
});
