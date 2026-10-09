// Restrict the substitution to the SQLite driver. Everything else resolves normally.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'better-sqlite3') {
    return {url: new URL('./node-sqlite-adapter.mjs', import.meta.url).href,
      shortCircuit: true};
  }
  return nextResolve(specifier, context);
}
