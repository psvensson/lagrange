import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';

const UNIFIED_REBALANCER_PATH = path.resolve(
  process.cwd(),
  'src/rebalancer/unified-rebalancer.js',
);
const READINESS_SERVICE_PATH = path.resolve(
  process.cwd(),
  'src/control-plane/control-plane-readiness-service.js',
);

test('projection boundary guard - rebalancer availability cannot fall back to stale cache readiness',
  async (t) => {
    const rebalancerSource = fs.readFileSync(
      UNIFIED_REBALANCER_PATH,
      'utf8',
    );

    t.notMatch(
      rebalancerSource,
      /clusterMemberHealthy\s*!==\s*false/,
      'steady-state placement must not accept cache-ready rows when canonical readiness is missing',
    );
    t.notMatch(
      rebalancerSource,
      /clusterMemberHealthy\s*===\s*true\s*\|\|/,
      'steady-state placement must not retain a mixed canonical-or-cache readiness branch',
    );
  });

test('projection boundary guard - transport cannot directly restore cluster membership truth',
  async (t) => {
    const readinessSource = fs.readFileSync(
      READINESS_SERVICE_PATH,
      'utf8',
    );

    t.notMatch(
      readinessSource,
      /isClusterMemberHealthy\(nodeId,\s*nodeRow\)\s*\{[\s\S]*?if\s*\(!this\.isNodeTransportConnected\(nodeId,\s*nodeRow\)\)\s*\{\s*return false;\s*\}\s*return true;/,
      'cluster membership health must not be restored by transport connectivity alone',
    );
  });
