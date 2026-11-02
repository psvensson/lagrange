import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH,
  deriveAdmittedMeasurementsFromRawObservations,
} from './raw-observation-store.js';

const PARENT_DIR = '..';
const UTF8 = 'utf8';
const arrayMap = Function.call.bind(Array.prototype.map);
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  PARENT_DIR,
  PARENT_DIR,
  PARENT_DIR,
);

export function readAdmittedLabMeasurements(rootDir = REPO_ROOT) {
  const filePath = path.resolve(rootDir, DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, UTF8));
  }
  return deriveAdmittedMeasurementsFromRawObservations(rootDir);
}

export function writeAdmittedLabMeasurementsFromRawObservations(rootDir = REPO_ROOT) {
  const derived = deriveAdmittedMeasurementsFromRawObservations(rootDir);
  const filePath = path.resolve(rootDir, DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(derived, null, 2)}\n`, UTF8);
  return {derived, filePath};
}

export function buildLagrangeEvolutionTimeline(rootDir = REPO_ROOT) {
  return readAdmittedLabMeasurements(rootDir).lagrangeEvolutionTimeline;
}

export function buildScaleout3To5Rf3Experiment(rootDir = REPO_ROOT) {
  return readAdmittedLabMeasurements(rootDir).scaleout3To5Rf3Experiment;
}

export function buildPartitionGranularitySweepExperiment(rootDir = REPO_ROOT) {
  return readAdmittedLabMeasurements(rootDir).partitionGranularitySweepExperiment;
}

export function buildScenarioBRttWorkingSetExperiment(rootDir = REPO_ROOT) {
  return readAdmittedLabMeasurements(rootDir).scenarioBRttWorkingSetExperiment;
}

export function buildLiveMovementAndScenarioCScalingExperiment(rootDir = REPO_ROOT) {
  return readAdmittedLabMeasurements(rootDir).liveMovementAndScenarioCScalingExperiment;
}

export function buildScenarioSetupAndTimeBreakdown(rootDir = REPO_ROOT) {
  const raw = readAdmittedLabMeasurements(rootDir).scenarioSetupBreakdown;
  return {
    scenarioA: arrayMap(raw.scenarioA, (r) => (Array.isArray(r) ? r : [
      r.label, r.wireMs, r.parsePlanMs, r.lockWaitMs,
      r.prepare2pcMs, r.quorumFsyncMs, r.applyMs, r.totalP95Ms,
    ])),
    scenarioB: arrayMap(raw.scenarioB, (r) => (Array.isArray(r) ? r : [
      r.label, r.ingressMs, r.reducerExecMs, r.wanRoundTripsMs,
      r.wireDecodeMs, r.steadyP99Ms, r.moveDeltaMs, r.wanBytes,
    ])),
    scenarioC: arrayMap(raw.scenarioC, (r) => (Array.isArray(r) ? r : [
      r.label, r.ingestQuorumMs, r.propagationLagMs, r.decisionComputeMs,
      r.fresh0msDecPerSec, r.scale5xFresh0msDecPerSec, r.ruleBackfillSec, r.decisionDowntimeSec,
    ])),
  };
}
