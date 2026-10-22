// Machines and lanes the placement witnesses share (test-placement.test.js and
// test-placement-lab-split.test.js): a placement candidate, the controller,
// the runner's lane names and a fake fleet inventory.

export const CONTROLLER = Object.freeze({name: '(controller)', controller: true, speed: 1});

export function lab(name, speed, extra = {}) {
  return {name, controller: false, speed, avoid: [], gapsKey: 'k', ...extra};
}

export const LANE = Object.freeze({ORDINARY: 'ordinary', EXCLUSIVE: 'exclusive',
  BOOTSTRAP: 'bootstrap', EXTERNAL: 'external-toolchain'});

// A fake inventory: the machines, their measured facts and the controller's.
export function fakeInventory() {
  const ready = {ready: true, missing: [], gaps: []};
  const cap = (extra = {}) => ({repoPath: '/srv/lagrange', cpuSampleMs: 260, cores: 12,
    memKiB: 16 * 1024 * 1024, nodeVersion: 'v22.22.3', repo: {head: 'c'.repeat(40)}, ...extra});
  const fleet = [
    {name: '(controller)', controller: true,
      capability: {cpuSampleMs: 200, cores: 20, memKiB: 32 * 1024 * 1024}, readiness: ready},
    {name: 'alpha', capability: cap(), readiness: ready},
    {name: 'beta', capability: cap({cpuSampleMs: 150, cores: 8}), readiness: ready},
    {name: 'gamma', capability: cap(), readiness: {ready: false, missing: ['no-repository'],
      gaps: []}},
  ];
  const nodes = Object.fromEntries(fleet.filter((entry) => !entry.controller)
    .map((entry) => [entry.name, {name: entry.name, ssh: `peer@${entry.name}`}]));
  return {fleet, state: {nodes}};
}
