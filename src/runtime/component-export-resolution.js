/**
 * Canonical WIT-export-name resolution for instantiated Cell components.
 *
 * Manifests and Binding targets carry WIT kebab-case export names (the
 * deployment contract's NAME_PATTERN forbids uppercase), while jco's
 * instantiated component object exposes the same exports under
 * lowerCamelCase keys ('handle-request' -> 'handleRequest' - jco's own
 * naming convention). This module is the ONE owner of that translation:
 * the worker resolves every export through it, so manifests, Bindings,
 * and invoke messages keep kebab names end to end and no second naming
 * convention leaks into the deployment surface.
 */

const WIT_KEBAB_SEGMENT_PATTERN = /-([a-z0-9])/gu;

// jco convention: each '-x' segment of a WIT kebab-case name becomes an
// uppercased 'X' in the generated JavaScript export key.
function toJsComponentExportKey(witExportName) {
  return witExportName.replace(
    WIT_KEBAB_SEGMENT_PATTERN,
    (_segment, first) => first.toUpperCase(),
  );
}

/**
 * Resolve a declared export name against an instantiated component's
 * export object: the exact key wins (single-word exports like 'run' and
 * callers already holding the camelCase key), then the canonical
 * kebab-to-camel mapping. Returns undefined when neither key resolves
 * to a function, so callers keep their own typed export-missing errors.
 *
 * @param {object} componentExports jco-instantiated component exports
 * @param {string} exportName declared WIT export name (kebab-case)
 * @return {Function|undefined} the export function, when present
 */
function resolveComponentExport(componentExports, exportName) {
  if (!componentExports || typeof exportName !== 'string') return undefined;
  const exact = componentExports[exportName];
  if (typeof exact === 'function') return exact;
  const mapped = componentExports[toJsComponentExportKey(exportName)];
  return typeof mapped === 'function' ? mapped : undefined;
}

Object.freeze(toJsComponentExportKey);
Object.freeze(resolveComponentExport);

export {resolveComponentExport};
