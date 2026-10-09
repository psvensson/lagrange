// Diagnostic linker only. No repository bytes are modified.
// Replace the network/SQL gateway wrapper with an explicit supplied read boundary.
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/control-plane/control-plane-system-table-gateway.js')) {
    return {format: 'module', shortCircuit: true, source: `
      export async function readAuthoritativeControlPlaneRows(gateway, table, sql, params, options) {
        return gateway.readAuthoritativeRows(table, sql, params, options);
      }
    `};
  }
  return nextLoad(url, context);
}
