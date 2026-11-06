import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';

const SQL_PROVISIONING_SOURCE =
  'src/query/sql-query-engine-provisioning-methods.js';
const ACTIVE_NODE_PROJECTION_SOURCE =
  'src/control-plane/active-node-projection.js';
const PROJECTION_EVIDENCE_SOURCE =
  'src/control-plane/projection-readiness-evidence.js';
const PROJECTION_DECISION_SOURCE =
  'src/control-plane/projection-readiness-decision.js';

function extractMethod(source, methodName, nextMethodName) {
  const start = source.indexOf(`${methodName}(`);
  const end = source.indexOf(`\n  ${nextMethodName}(`, start);
  return start >= 0 && end > start ? source.slice(start, end) : '';
}

test('W7 dependency guard - provisioning consumes the readiness owner and ' +
  'projection cannot consume provisioning eligibility', (t) => {
  const sqlSource = fs.readFileSync(SQL_PROVISIONING_SOURCE, 'utf8');
  const projectionSource = [
    fs.readFileSync(ACTIVE_NODE_PROJECTION_SOURCE, 'utf8'),
    fs.readFileSync(PROJECTION_EVIDENCE_SOURCE, 'utf8'),
    fs.readFileSync(PROJECTION_DECISION_SOURCE, 'utf8'),
  ].join('\n');
  const diagnosticsMethod = extractMethod(
    sqlSource,
    'resolveProvisionTargetNodeDiagnostics',
    'resolveProvisionTargetNodeIdsForContext',
  );
  const targetResolutionMethod = extractMethod(
    sqlSource,
    'resolveProvisionTargetNodeIdsWithDiagnostics',
    'orderProvisionTargetNodeIds',
  );

  t.ok(diagnosticsMethod.length > 0, 'the SQL provisioning owner exists');
  t.match(
    diagnosticsMethod,
    /controlPlaneReadinessService/,
    'SQL provisioning delegates node trust to ControlPlaneReadinessService',
  );
  t.match(
    diagnosticsMethod,
    /answerServeCohort/,
    'SQL consumes the readiness-owned committed serving cohort',
  );
  t.match(
    diagnosticsMethod,
    /extractCohortStrictNodeIds/,
    'SQL selects eligible node IDs from that same committed cohort',
  );
  t.notMatch(
    sqlSource,
    /getProvisioningNodeTrustViewSync/,
    'no extracted SQL helper may restore observer-local target authority',
  );
  t.notMatch(
    diagnosticsMethod,
    /systemCache|messageRouter|hasLiveTransportEvidence|getProvisioningNodeTrustViewSync/,
    'SQL cannot reconstruct trust by joining cache and router evidence',
  );
  t.notMatch(
    targetResolutionMethod,
    /\[this\.nodeId\]|includes\(this\.nodeId\)/,
    'the whole target-resolution path cannot inject the local SQL node',
  );
  t.notMatch(
    projectionSource,
    /provisioningEligible|\.provisioning\?*\.eligible/,
    'projection readiness cannot consume provisioning eligibility',
  );
  t.end();
});
