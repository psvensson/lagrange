import {test} from '../../src/test-helpers/tap.js';
import {evaluateSharedMetadataNodeCoverage} from
  '../../src/admin/admin-shared-metadata-consistency.js';

test('evaluateSharedMetadataNodeCoverage detects referenced nodes missing from nodes rows',
  async (t) => {
    const result = evaluateSharedMetadataNodeCoverage({
      nodeRows: [
        {node_id: 'node-seed'},
      ],
      serviceRows: [
        {node_id: 'node-seed', status: 'active'},
        {node_id: 'node-joiner', status: 'active'},
      ],
      partitionRows: [
        {leader_node_id: 'node-seed'},
      ],
      nodeEndpointRows: [
        {node_id: 'node-joiner', status: 'active'},
      ],
    });

    t.equal(result.hasCoverageGap, true);
    t.same(result.missingNodeIds, ['node-joiner']);
    t.same(
      result.referencedNodeIds,
      ['node-joiner', 'node-seed'],
    );
  });

test('evaluateSharedMetadataNodeCoverage ignores inactive service-only references',
  async (t) => {
    const result = evaluateSharedMetadataNodeCoverage({
      nodeRows: [
        {node_id: 'node-seed'},
      ],
      serviceRows: [
        {node_id: 'node-retired', status: 'inactive'},
      ],
      partitionRows: [],
      nodeEndpointRows: [],
    });

    t.equal(result.hasCoverageGap, false);
    t.same(result.missingNodeIds, []);
  });
