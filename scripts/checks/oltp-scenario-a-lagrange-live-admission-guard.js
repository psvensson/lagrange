import {
  evaluateLagrangeScenarioALiveAdmissionGuard,
} from '../../test/scripts/oltp-scenario-a-lagrange-live-admission-guard-witness.js';

const METRIC_FLAG = '--metric';
const result = evaluateLagrangeScenarioALiveAdmissionGuard();
if (process.argv[2] === METRIC_FLAG) process.stdout.write(`${result.metric}\n`);
process.stdout.write(`${result.summary}\n`);
