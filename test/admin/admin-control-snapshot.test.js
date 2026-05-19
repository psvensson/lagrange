import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import './admin-control-snapshot-publication-convergence-test-cases.js';
import './admin-control-snapshot-repair-handoff-outcome-test-cases.js';
import './admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js';
import {registerAdminControlSnapshotTailTests} from './admin-control-snapshot-tail-test-cases.js';

registerAdminControlSnapshotTailTests({
  test,
  TABLES,
  AdminControlSnapshot,
  CONTROL_PLANE_READINESS_DIMENSION,
});
