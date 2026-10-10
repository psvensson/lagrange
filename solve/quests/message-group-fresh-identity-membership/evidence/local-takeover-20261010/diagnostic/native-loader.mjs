// Explicit local diagnostic: node:sqlite, uuid/ws setup adapters, logging output,
// and an exact configuration validated separately. No locked dependency proof.
// Canonical validation MUST omit this loader and use locked npm dependencies.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'ajv') return {url: new URL('./ajv-config-diagnostic.mjs', import.meta.url).href, shortCircuit: true};
  if (specifier === 'uuid' || specifier === 'ws') {
    return {url: new URL('./' + specifier + '-diagnostic.mjs', import.meta.url).href, shortCircuit: true};
  }
  if (specifier === 'better-sqlite3') {
    return {url: new URL('./node-sqlite-adapter.mjs', import.meta.url).href, shortCircuit: true};
  }
  if (specifier.startsWith('.') && new URL(specifier, context.parentURL).pathname.endsWith('/src/logging/logging-service.js')) {
    return {url: new URL('./logging-sink.mjs', import.meta.url).href, shortCircuit: true};
  }
  return nextResolve(specifier, context);
}
