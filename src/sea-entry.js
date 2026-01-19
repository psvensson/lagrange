#!/usr/bin/env node
/**
 * Single Executable Application Entry Point
 *
 * This entry point handles version/help flags before loading the main module,
 * allowing the SEA to respond to basic commands without requiring native modules.
 */

const VERSION = '1.0.0';

/**
 * Check for version flag.
 * @return {boolean} True if version was printed
 */
function checkVersionFlag() {
  const args = process.argv.slice(2);
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`distributed-database-system v${VERSION}`);
    return true;
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Distributed Database System v${VERSION}`);
    console.log('');
    console.log('Usage: distributed-db [options]');
    console.log('');
    console.log('Options:');
    console.log('  --version, -v    Show version number');
    console.log('  --help, -h       Show this help message');
    console.log('  --seed <url>     Seed node URL to join existing cluster');
    console.log('  --config <path>  Path to configuration file');
    console.log('  --dry-run        Validate configuration without starting');
    console.log('');
    console.log('Environment Variables:');
    console.log('  NODE_ID          Override auto-generated node ID');
    console.log('  LOG_LEVEL        Set logging level (error, warn, info, debug)');
    console.log('  PORT             HTTP/WebSocket port (default: 8080)');
    return true;
  }
  return false;
}

// Handle version/help flags early
if (checkVersionFlag()) {
  process.exit(0);
}

// Load the main module (this will fail if native modules are not available)
import('./index.js').catch((err) => {
  if (err.code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
    console.error('Error: Native modules not available.');
    console.error('');
    console.error('The distributed database system requires native modules that');
    console.error('cannot be bundled into a single executable:');
    console.error('  - better-sqlite3 (SQLite bindings)');
    console.error('  - piscina (worker thread pool)');
    console.error('');
    console.error('To run the system, either:');
    console.error('  1. Use "npm start" with Node.js installed');
    console.error('  2. Install native modules in the same directory as the executable');
    process.exit(1);
  }
  console.error('Fatal error:', err);
  process.exit(1);
});
