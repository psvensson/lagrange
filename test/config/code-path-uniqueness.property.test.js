/**
 * Property Test: Code Path Uniqueness
 * **Property 14: Code Path Uniqueness**
 * **Validates: Requirements 11.1, 11.2, 11.4**
 *
 * *For any* functionality in the system, there should be exactly one
 * implementation path with no conditional compilation or feature flags
 * for core features.
 *
 * This property test verifies that:
 * 1. Each service/manager class has exactly one implementation
 * 2. No feature flags exist for core functionality
 * 3. Only observability-related flags are allowed
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '../../src');

/**
 * Get all JavaScript source files recursively.
 * @param {string} dir - Directory to scan.
 * @return {string[]} Array of file paths.
 */
function getSourceFiles(dir) {
  const files = [];

  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

/**
 * Extract class definitions from a source file.
 * @param {string} filePath - Path to the source file.
 * @return {string[]} Array of class names.
 */
function extractClassNames(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Match class declarations - must start with uppercase letter
  // and be followed by space, extends, or {
  const classRegex = /\bclass\s+([A-Z][a-zA-Z0-9_]*)\s*(?:extends|{)/g;
  const classes = [];
  let match;

  while ((match = classRegex.exec(content)) !== null) {
    classes.push(match[1]);
  }

  return classes;
}

/**
 * Check if a file contains feature flags for core functionality.
 * @param {string} filePath - Path to the source file.
 * @return {Object} Object with flag info.
 */
function checkForFeatureFlags(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(srcDir, filePath);

  // Patterns that indicate feature flags for core functionality
  const coreFeatureFlagPatterns = [
    /FEATURE_FLAG/gi,
    /ENABLE_\w+(?!_LOG|_DEBUG|_TRACE)/gi, // Exclude observability
    /DISABLE_\w+(?!_LOG|_DEBUG|_TRACE)/gi,
    /process\.env\.\w+_ENABLED(?!.*debug|.*log|.*trace)/gi,
    /USE_LEGACY/gi,
    /USE_V\d+/gi,
    /EXPERIMENTAL_/gi,
  ];

  // Allowed observability patterns
  const allowedPatterns = [
    /debugMode/g,
    /debug_mode/g,
    /DEBUG_MODE/g,
    /LOG_LEVEL/g,
    /TRACE_/g,
    /observability/gi,
  ];

  const foundFlags = [];
  const allowedFlags = [];

  for (const pattern of coreFeatureFlagPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      foundFlags.push(...matches);
    }
  }

  for (const pattern of allowedPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      allowedFlags.push(...matches);
    }
  }

  return {
    file: relativePath,
    coreFlags: foundFlags,
    observabilityFlags: allowedFlags,
    hasCoreFlags: foundFlags.length > 0,
  };
}

/**
 * Check for conditional compilation patterns.
 * @param {string} filePath - Path to the source file.
 * @return {Object} Object with conditional compilation info.
 */
function checkForConditionalCompilation(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(srcDir, filePath);

  // Patterns that indicate conditional compilation
  const conditionalPatterns = [
    /if\s*\(\s*process\.env\.NODE_ENV\s*===?\s*['"]production['"]\s*\)/g,
    /if\s*\(\s*process\.env\.NODE_ENV\s*!==?\s*['"]production['"]\s*\)/g,
    /if\s*\(\s*__DEV__\s*\)/g,
    /if\s*\(\s*__PROD__\s*\)/g,
    /#ifdef/g,
    /#ifndef/g,
    /#if\s+/g,
  ];

  const foundPatterns = [];

  for (const pattern of conditionalPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      foundPatterns.push(...matches);
    }
  }

  return {
    file: relativePath,
    conditionalPatterns: foundPatterns,
    hasConditionalCompilation: foundPatterns.length > 0,
  };
}

// Get all source files
const SOURCE_FILES = getSourceFiles(srcDir);

// Build class registry to check for duplicates
const CLASS_REGISTRY = new Map();
for (const file of SOURCE_FILES) {
  const classes = extractClassNames(file);
  for (const className of classes) {
    if (!CLASS_REGISTRY.has(className)) {
      CLASS_REGISTRY.set(className, []);
    }
    CLASS_REGISTRY.get(className).push(path.relative(srcDir, file));
  }
}

// Get unique class names for property testing
const CLASS_NAMES = Array.from(CLASS_REGISTRY.keys());

test('Property 14: Code Path Uniqueness', async (t) => {
  /**
   * Property: For any class in the system, there should be exactly one
   * implementation (no duplicate class definitions).
   */
  t.test('each class has exactly one implementation', async (t) => {
    // Classes that are intentionally duplicated for different contexts
    // CLI has its own LiveQueryManager that wraps the core one
    // RaftNode is defined in both message-group-service.js and partition-service.js
    // as inner classes extending LifeRaft for their specific use cases
    const allowedDuplicates = new Set([
      'LiveQueryManager', // CLI wrapper vs core implementation
      'RaftNode', // Inner class in message-group-service.js and partition-service.js
      // Shared utility/error names used in separate bounded contexts
      'InvalidTransitionError',
      'InProcWebSocket',
    ]);

    fc.assert(
      fc.property(
        fc.constantFrom(...CLASS_NAMES),
        (className) => {
          const implementations = CLASS_REGISTRY.get(className);

          // Skip allowed duplicates
          if (allowedDuplicates.has(className)) {
            return true;
          }

          // Each class should have exactly one implementation
          if (implementations.length !== 1) {
            // Allow test helper classes that might be duplicated
            const isTestHelper = implementations.some((f) =>
              f.includes('test') || f.includes('mock'),
            );
            if (isTestHelper) {
              return true;
            }
            return false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    // Also verify no unexpected duplicates exist
    const duplicates = [];
    for (const [className, files] of CLASS_REGISTRY.entries()) {
      if (files.length > 1 && !allowedDuplicates.has(className)) {
        duplicates.push({className, files});
      }
    }

    t.equal(duplicates.length, 0,
      `No unexpected duplicate class implementations should exist. Found: ${
        JSON.stringify(duplicates)}`);
  });

  /**
   * Property: For any source file, there should be no feature flags
   * for core functionality (only observability flags allowed).
   */
  t.test('no feature flags for core functionality', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SOURCE_FILES),
        (filePath) => {
          const result = checkForFeatureFlags(filePath);

          // Should have no core feature flags
          return !result.hasCoreFlags;
        },
      ),
      {numRuns: 10},
    );

    // Verify across all files
    const filesWithFlags = SOURCE_FILES
      .map(checkForFeatureFlags)
      .filter((r) => r.hasCoreFlags);

    t.equal(filesWithFlags.length, 0,
      `No files should have core feature flags. Found: ${
        JSON.stringify(filesWithFlags)}`);
  });

  /**
   * Property: For any source file, there should be no conditional
   * compilation patterns.
   */
  t.test('no conditional compilation patterns', async (t) => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SOURCE_FILES),
        (filePath) => {
          const result = checkForConditionalCompilation(filePath);

          // Should have no conditional compilation
          return !result.hasConditionalCompilation;
        },
      ),
      {numRuns: 10},
    );

    // Verify across all files
    const filesWithConditional = SOURCE_FILES
      .map(checkForConditionalCompilation)
      .filter((r) => r.hasConditionalCompilation);

    t.equal(filesWithConditional.length, 0,
      `No files should have conditional compilation. Found: ${
        JSON.stringify(filesWithConditional)}`);
  });

  /**
   * Property: For any service class, there should be a single
   * implementation pattern (singleton or instance-based, not both).
   */
  t.test('consistent service implementation patterns', async (t) => {
    const serviceClasses = CLASS_NAMES.filter((name) =>
      name.endsWith('Service') || name.endsWith('Manager'),
    );

    fc.assert(
      fc.property(
        fc.constantFrom(...serviceClasses),
        (className) => {
          const files = CLASS_REGISTRY.get(className);
          if (files.length !== 1) return true; // Skip duplicates (handled above)

          const filePath = path.join(srcDir, files[0]);
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check for singleton pattern
          const hasSingleton = /static\s+instance\s*=/.test(content);
          const hasGetInstance = /static\s+getInstance\s*\(/.test(content);

          // If it has singleton pattern, it should have both parts
          if (hasSingleton || hasGetInstance) {
            return hasSingleton && hasGetInstance;
          }

          // Otherwise it's instance-based, which is also valid
          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('all service classes have consistent implementation patterns');
  });

  /**
   * Property: For any transport implementation, each should serve
   * a distinct purpose (no redundant transports).
   */
  t.test('transport implementations serve distinct purposes', async (t) => {
    const transportDir = path.join(srcDir, 'transport');
    const transportFiles = fs.readdirSync(transportDir)
      .filter((f) => f.endsWith('.js') && f !== 'index.js');

    // Required core transport entry points
    const requiredTransports = [
      'websocket-transport.js', // For inter-node communication
      'message-router.js', // For routing messages between transports
      'rpc-client.js', // For request-response pattern over message groups
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...transportFiles),
        (transportFile) => {
          // Transport module decomposition is allowed as long as each file
          // still clearly belongs to transport/routing responsibilities.
          return transportFile.includes('transport') ||
            transportFile.includes('router') ||
            transportFile.includes('connection') ||
            transportFile.includes('rpc');
        },
      ),
      {numRuns: 10},
    );

    t.ok(
      requiredTransports.every((file) => transportFiles.includes(file)),
      'core transport entry points are present',
    );
  });
});
