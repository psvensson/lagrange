import fs from 'node:fs';
import path from 'node:path';

// In a cgroup v2 namespace / is relative to the mounted hierarchy. Walk
// visible ancestors because a parent quota also limits its descendants.
export function effectiveCpuCores(read = fs.readFileSync) {
  if (process.platform !== 'linux') return null;
  const root = '/sys/fs/cgroup';
  try {
    const membership = read('/proc/self/cgroup', 'utf8')
      .split('\n').find((line) => line.startsWith('0::/'));
    if (!membership) return null;
    let dir = path.resolve(root, '.' + membership.slice(3));
    if (dir !== root && !dir.startsWith(root + '/')) return null;
    const allowed = /^Cpus_allowed_list:\s*([0-9,-]+)$/mu.exec(read('/proc/self/status', 'utf8'));
    if (!allowed) return null;
    let cores = 0;
    for (const range of allowed[1].split(',')) {
      const [first, last = first] = range.split('-').map(Number);
      if (last < first) return null;
      cores += last - first + 1;
    }
    while (true) {
      const file = path.join(dir, 'cpu.max');
      try {
        const [quota, period] = read(file, 'utf8').trim().split(/\s+/u);
        if (quota !== 'max') {
          const ratio = Number(quota) / Number(period);
          if (!(ratio > 0 && Number.isFinite(ratio))) return null;
          cores = Math.min(cores, ratio);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') return null;
        // Prove the directory is a visible v2 cgroup without a CPU controller.
        read(path.join(dir, 'cgroup.controllers'), 'utf8');
      }
      if (dir === root) return cores;
      dir = path.dirname(dir);
    }
  } catch {
    return null;
  }
}

export function hostTicks(cpus) {
  let total = 0;
  let idle = 0;
  for (const cpu of cpus) {
    if (!cpu.times) return null;
    total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    idle += cpu.times.idle;
  }
  return {total, idle, count: cpus.length};
}

export function hostBusyPercent(previous, current) {
  if (!previous || !current || previous.count !== current.count) return null;
  const total = current.total - previous.total;
  const idle = current.idle - previous.idle;
  return total > 0 && idle >= 0 && idle <= total ? 100 * (total - idle) / total : null;
}
