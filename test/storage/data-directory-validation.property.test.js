/**
 * Property-based tests for data directory validation.
 * Property 77: Data Directory Validation
 * *For any* data directory configuration, the system validates writability
 * and creates the directory if needed, or fails with a clear error.
 * **Validates: Requirements 35.4, 35.6, 35.7**
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {DataDirectoryManager} from '../../src/storage/data-directory-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Create a temporary directory for testing.
 * @return {string} Path to temporary directory.
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ddb-test-'));
}

/**
 * Remove a directory recursively.
 * @param {string} dirPath - Directory path to remove.
 */
function removeTempDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, {recursive: true, force: true});
  }
}

let tempDir;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  DataDirectoryManager.resetInstance();
  tempDir = createTempDir();
});

afterEach(() => {
  DataDirectoryManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  removeTempDir(tempDir);
});


/**
 * Generate valid subdirectory names (non-empty, no path separators).
 */
const subdirNameArb = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => !s.includes('/') && !s.includes('\\') && s.trim().length > 0)
  .filter((s) => !s.includes('\0') && !s.includes(':'));

test('Property 77: Data Directory Validation - creates non-existent dirs', async (t) => {
  /**
   * Feature: distributed-database-system
   * Property 77: Data Directory Validation
   * *For any* valid subdirectory name, the system creates the directory if needed.
   * **Validates: Requirements 35.4**
   */
  fc.assert(
    fc.property(
      subdirNameArb,
      (subdirName) => {
        // Reset singletons for each test
        DataDirectoryManager.resetInstance();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();

        const newDir = path.join(tempDir, subdirName);

        // Ensure directory doesn't exist
        if (fs.existsSync(newDir)) {
          fs.rmSync(newDir, {recursive: true, force: true});
        }

        const config = ConfigurationManager.getInstance();
        config.initialize({
          node: {id: 'test-node'},
          storage: {dataDir: newDir},
        });

        const logger = LoggingService.getInstance();
        logger.initialize({level: 'error'});

        const manager = DataDirectoryManager.getInstance();
        manager.initialize();

        // Directory should now exist
        return fs.existsSync(newDir);
      },
    ),
    {numRuns: 10},
  );

  t.pass('Property 77: All non-existent directories are created');
});

test('Property 77: Data Directory Validation - validates writability', async (t) => {
  /**
   * Feature: distributed-database-system
   * Property 77: Data Directory Validation
   * *For any* writable directory, the system validates writability successfully.
   * **Validates: Requirements 35.6**
   */
  fc.assert(
    fc.property(
      subdirNameArb,
      (subdirName) => {
        // Reset singletons for each test
        DataDirectoryManager.resetInstance();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();

        const newDir = path.join(tempDir, subdirName);

        // Create the directory
        if (!fs.existsSync(newDir)) {
          fs.mkdirSync(newDir, {recursive: true});
        }

        const config = ConfigurationManager.getInstance();
        config.initialize({
          node: {id: 'test-node'},
          storage: {dataDir: newDir},
        });

        const logger = LoggingService.getInstance();
        logger.initialize({level: 'error'});

        const manager = DataDirectoryManager.getInstance();

        // Should not throw for writable directory
        try {
          manager.initialize();
          return manager.isInitialized();
        } catch (_e) {
          return false;
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Property 77: All writable directories pass validation');
});

test('Property 77: Data Directory Validation - returns absolute path', async (t) => {
  /**
   * Feature: distributed-database-system
   * Property 77: Data Directory Validation
   * *For any* data directory, getDataDir returns an absolute path.
   * **Validates: Requirements 35.4**
   */
  fc.assert(
    fc.property(
      subdirNameArb,
      (subdirName) => {
        // Reset singletons for each test
        DataDirectoryManager.resetInstance();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();

        const newDir = path.join(tempDir, subdirName);

        const config = ConfigurationManager.getInstance();
        config.initialize({
          node: {id: 'test-node'},
          storage: {dataDir: newDir},
        });

        const logger = LoggingService.getInstance();
        logger.initialize({level: 'error'});

        const manager = DataDirectoryManager.getInstance();
        manager.initialize();

        const dataDir = manager.getDataDir();
        return path.isAbsolute(dataDir);
      },
    ),
    {numRuns: 10},
  );

  t.pass('Property 77: All returned paths are absolute');
});

test('Property 77: Data Directory Validation - nested dirs created', async (t) => {
  /**
   * Feature: distributed-database-system
   * Property 77: Data Directory Validation
   * *For any* nested directory path, the system creates all parent directories.
   * **Validates: Requirements 35.4**
   */
  fc.assert(
    fc.property(
      subdirNameArb,
      subdirNameArb,
      (dir1, dir2) => {
        // Reset singletons for each test
        DataDirectoryManager.resetInstance();
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();

        const nestedDir = path.join(tempDir, dir1, dir2);

        // Ensure directory doesn't exist
        if (fs.existsSync(nestedDir)) {
          fs.rmSync(nestedDir, {recursive: true, force: true});
        }

        const config = ConfigurationManager.getInstance();
        config.initialize({
          node: {id: 'test-node'},
          storage: {dataDir: nestedDir},
        });

        const logger = LoggingService.getInstance();
        logger.initialize({level: 'error'});

        const manager = DataDirectoryManager.getInstance();
        manager.initialize();

        // Nested directory should now exist
        return fs.existsSync(nestedDir);
      },
    ),
    {numRuns: 10},
  );

  t.pass('Property 77: All nested directories are created');
});
