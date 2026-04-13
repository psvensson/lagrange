/**
 * Unit tests for DataDirectoryManager.
 * Tests data directory validation, creation, and path generation.
 * Requirements: 35.2, 35.3, 35.4, 35.5, 35.6, 35.7, 35.8, 35.9, 35.10
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  DataDirectoryManager,
  getPartitionDbPath,
} from '../../src/storage/data-directory-manager.js';
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
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    storage: {dataDir: tempDir},
  });
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  DataDirectoryManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  removeTempDir(tempDir);
});


test('DataDirectoryManager - initializes with configured data directory', async (t) => {
  const manager = DataDirectoryManager.getInstance();
  manager.initialize();

  t.equal(manager.isInitialized(), true);
  t.equal(manager.getDataDir(), path.resolve(tempDir));
});

test('DataDirectoryManager - creates data directory if not exists', async (t) => {
  const newDir = path.join(tempDir, 'new-data-dir');
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    storage: {dataDir: newDir},
  });

  DataDirectoryManager.resetInstance();
  const manager = DataDirectoryManager.getInstance();
  manager.initialize();

  t.equal(fs.existsSync(newDir), true);
});

test('DataDirectoryManager - validates directory is writable', async (t) => {
  const manager = DataDirectoryManager.getInstance();
  manager.initialize();

  // Should not throw - directory is writable
  t.equal(manager.isInitialized(), true);
});

test('DataDirectoryManager - getPartitionDbPath generates correct path', async (t) => {
  const manager = DataDirectoryManager.getInstance();
  manager.initialize();

  const dbPath = manager.getPartitionDbPath('partition-1', 'replica-1');
  const expected = path.join(
    path.resolve(tempDir),
    'partitions',
    'partition-1',
    'replica-1.db',
  );

  t.equal(dbPath, expected);
});

test('DataDirectoryManager - getPartitionsDir returns correct path', async (t) => {
  const manager = DataDirectoryManager.getInstance();
  manager.initialize();

  const partitionsDir = manager.getPartitionsDir();
  const expected = path.join(path.resolve(tempDir), 'partitions');

  t.equal(partitionsDir, expected);
});

test('DataDirectoryManager - ensurePartitionDirExists creates directory', async (t) => {
  const manager = DataDirectoryManager.getInstance();
  manager.initialize();

  manager.ensurePartitionDirExists('test-partition');

  const partitionDir = path.join(
    path.resolve(tempDir),
    'partitions',
    'test-partition',
  );
  t.equal(fs.existsSync(partitionDir), true);
});

test('DataDirectoryManager - throws if not initialized', async (t) => {
  const manager = DataDirectoryManager.getInstance();

  t.throws(() => {
    manager.getDataDir();
  }, /not initialized/);
});

test('DataDirectoryManager - getPartitionDbPath requires partitionId', async (t) => {
  const manager = DataDirectoryManager.getInstance();
  manager.initialize();

  t.throws(() => {
    manager.getPartitionDbPath(null, 'replica-1');
  }, /partitionId and replicaId are required/);
});

test('DataDirectoryManager - getPartitionDbPath requires replicaId', async (t) => {
  const manager = DataDirectoryManager.getInstance();
  manager.initialize();

  t.throws(() => {
    manager.getPartitionDbPath('partition-1', null);
  }, /partitionId and replicaId are required/);
});

test('getPartitionDbPath standalone function generates correct path', async (t) => {
  const dbPath = getPartitionDbPath('/data', 'partition-1', 'replica-1');
  const expected = path.join('/data', 'partitions', 'partition-1', 'replica-1.db');

  t.equal(dbPath, expected);
});

test('getPartitionDbPath standalone function requires all parameters', async (t) => {
  t.throws(() => {
    getPartitionDbPath(null, 'partition-1', 'replica-1');
  }, /dataDir, partitionId, and replicaId are required/);

  t.throws(() => {
    getPartitionDbPath('/data', null, 'replica-1');
  }, /dataDir, partitionId, and replicaId are required/);

  t.throws(() => {
    getPartitionDbPath('/data', 'partition-1', null);
  }, /dataDir, partitionId, and replicaId are required/);
});

test('DataDirectoryManager - singleton returns same instance', async (t) => {
  const manager1 = DataDirectoryManager.getInstance();
  const manager2 = DataDirectoryManager.getInstance();

  t.equal(manager1, manager2);
});

test('DataDirectoryManager - resetInstance clears singleton', async (t) => {
  const manager1 = DataDirectoryManager.getInstance();
  manager1.initialize();

  DataDirectoryManager.resetInstance();

  const manager2 = DataDirectoryManager.getInstance();
  t.not(manager1, manager2);
  t.equal(manager2.isInitialized(), false);
});
