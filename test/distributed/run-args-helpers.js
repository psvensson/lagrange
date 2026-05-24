export function createDistributedRunArgHelpers({CLI}) {
  /**
   * Parse CLI arguments from argv.
   * @param {Array<string>} argv - process.argv.slice(2)
   * @returns {{config: string, scenario: string|null,
   *   output: string, verbose: boolean, fastLocal: boolean|null,
   *   deterministicDebug: boolean|null}}
   */
  function parseArgs(argv) {
    let config = CLI.DEFAULT_CONFIG;
    let scenario = null;
    let output = CLI.DEFAULT_OUTPUT;
    let verbose = false;
    let fastLocal = null;
    let deterministicDebug = null;
    let contract = null;

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === CLI.ARG_CONFIG && i + 1 < argv.length) {
        config = argv[++i];
      } else if (arg === CLI.ARG_SCENARIO && i + 1 < argv.length) {
        scenario = argv[++i];
      } else if (arg === CLI.ARG_OUTPUT && i + 1 < argv.length) {
        output = argv[++i];
      } else if (arg === CLI.ARG_VERBOSE) {
        verbose = true;
      } else if (arg === CLI.ARG_FAST_LOCAL) {
        fastLocal = true;
      } else if (arg === CLI.ARG_NO_FAST_LOCAL) {
        fastLocal = false;
      } else if (arg === CLI.ARG_DETERMINISTIC_DEBUG) {
        deterministicDebug = true;
      } else if (arg === CLI.ARG_NO_DETERMINISTIC_DEBUG) {
        deterministicDebug = false;
      } else if (arg === '--contract' && i + 1 < argv.length) {
        contract = argv[++i];
      }
    }

    return {
      config,
      scenario,
      output,
      verbose,
      fastLocal,
      deterministicDebug,
      contract,
    };
  }

  return {
    parseArgs,
  };
}
