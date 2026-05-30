#!/usr/bin/env node

// Phase A runner. Exercises the executable active-gate model in both modes and
// writes *.model.report.json evidence artifacts that the representative-evidence
// summarizer (Phase C) folds into the theory-loop residual/route pipeline.
//
// Exit code is 0 only when the route mode converges (residual 0, liveness holds)
// and the stall mode reproduces a non-progressing window — i.e. the model still
// distinguishes a converging route from an oscillating one.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  AbstractGate,
  DEFAULT_NODES,
  greedyDriveToConvergence,
  detectStallWindows,
  buildModelReport,
} from '../test/model/active-gate/model.js';

const REPORTS_DIR = path.resolve('test-output', 'reports');
const ROUTE_REPORT = 'active-gate-model-route.model.report.json';
const STALL_REPORT = 'active-gate-model-stall.model.report.json';

function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, {recursive: true});
}

function writeReport(name, report) {
  const target = path.join(REPORTS_DIR, name);
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  return path.relative(process.cwd(), target);
}

// Route mode: bounded re-entry; greedy progress must reach the green gate.
function runRoute() {
  const gate = new AbstractGate(DEFAULT_NODES, {allowUnboundedReentry: false});
  const {converged, trajectory} = greedyDriveToConvergence(gate);
  const stallWindows = detectStallWindows(trajectory, 4);
  return buildModelReport({
    source: 'fast-check',
    mode: 'route',
    nodes: DEFAULT_NODES,
    converged,
    residual: gate.residual(),
    trajectory,
    stallWindows,
    livenessHolds: converged && stallWindows.length === 0,
    extra: {promotionAllowed: gate.realPromotionAllowed()},
  });
}

// Stall mode: unbounded re-entry; a reconcile/defer cycle starves convergence.
function runStall() {
  const gate = new AbstractGate(['n1', 'n2'], {allowUnboundedReentry: true});
  const trajectory = [gate.residual()];
  for (let i = 0; i < 12; i += 1) {
    if (gate.canReconcileOwner('n1')) gate.reconcileOwner('n1');
    trajectory.push(gate.residual());
    if (gate.canDeferReentry('n1')) gate.deferReentry('n1');
    trajectory.push(gate.residual());
  }
  const stallWindows = detectStallWindows(trajectory, 4);
  return buildModelReport({
    source: 'fast-check',
    mode: 'stall',
    nodes: ['n1', 'n2'],
    converged: gate.convergedAbstract(),
    residual: gate.residual(),
    trajectory,
    stallWindows,
    livenessHolds: false,
    extra: {promotionAllowed: gate.realPromotionAllowed()},
  });
}

function main() {
  ensureReportsDir();
  const route = runRoute();
  const stall = runStall();
  const routePath = writeReport(ROUTE_REPORT, route);
  const stallPath = writeReport(STALL_REPORT, stall);

  console.log('Active-gate model run complete.');
  console.log(
    `  route: converged=${route.converged} residual=${route.residual} ` +
    `livenessHolds=${route.livenessHolds} -> ${routePath}`,
  );
  console.log(
    `  stall: converged=${stall.converged} residual=${stall.residual} ` +
    `stallWindows=${stall.stallWindows.length} -> ${stallPath}`,
  );

  const routeOk = route.converged === true &&
    route.residual === 0 &&
    route.livenessHolds === true &&
    route.promotionAllowed === true;
  const stallOk = stall.converged === false &&
    stall.stallWindows.length > 0 &&
    stall.promotionAllowed === false;
  if (!routeOk || !stallOk) {
    console.error(
      `Model invariant failed (routeOk=${routeOk}, stallOk=${stallOk}).`,
    );
    process.exit(1);
  }
  console.log('Model distinguishes converging route from oscillating stall.');
}

main();
