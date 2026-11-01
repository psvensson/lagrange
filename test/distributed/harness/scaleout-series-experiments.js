import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PARENT_DIR = '..';
const UTF8 = 'utf8';
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  PARENT_DIR,
  PARENT_DIR,
  PARENT_DIR,
);

const DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH =
  'data/tidb-comparison/admitted-lab-measurements.json';

export function readAdmittedLabMeasurements(rootDir = REPO_ROOT) {
  const filePath = path.resolve(rootDir, DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH);
  return JSON.parse(fs.readFileSync(filePath, UTF8));
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
  return readAdmittedLabMeasurements(rootDir).scenarioSetupBreakdown;
}
