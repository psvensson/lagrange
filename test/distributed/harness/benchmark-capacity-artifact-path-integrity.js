import {lstat} from 'node:fs/promises';
import {Stats} from 'node:fs';
import {isAbsolute, parse, sep} from 'node:path';

const statsIsSymbolicLink =
  Function.call.bind(Stats.prototype.isSymbolicLink);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);

async function inspectComponents(path, allowMissingLeaf) {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    return {valid: false, reason: 'absolute_path_required'};
  }
  const root = parse(path).root;
  const suffix = stringSlice(path, root.length);
  const components = stringSplit(suffix, sep);
  let current = root;
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    if (component.length === 0) continue;
    current += current === root ? component : `${sep}${component}`;
    try {
      const stat = await lstat(current);
      if (statsIsSymbolicLink(stat)) {
        return {valid: false, reason: 'symlink_component_forbidden'};
      }
    } catch (error) {
      if (
        allowMissingLeaf &&
        error &&
        typeof error === 'object' &&
        error.code === 'ENOENT'
      ) {
        return {valid: true, reason: 'valid_missing_suffix'};
      }
      return {valid: false, reason: 'path_component_unreadable'};
    }
  }
  return {valid: true, reason: 'valid'};
}

export function inspectBenchmarkCapacityArtifactPathParents(path) {
  return inspectComponents(path, true);
}

export function inspectBenchmarkCapacityArtifactPath(path) {
  return inspectComponents(path, false);
}
