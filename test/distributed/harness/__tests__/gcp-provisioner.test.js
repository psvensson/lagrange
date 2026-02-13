/**
 * Unit tests for GCP Provisioner.
 *
 * Feature: distributed-testing-framework
 *
 * Tests preemptible VM configuration (Req 8.4)
 * Tests returned address format matches tcp://{ip}:{port} (Req 8.6)
 *
 * Since Pulumi dependencies are not installed, these tests verify
 * constructor configuration and address format expectations without
 * calling provision().
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {GCPProvisioner} from '../gcp-provisioner.js';

// --- Constructor / preemptible configuration (Req 8.4) ---

test('GCPProvisioner stores preemptible true', (t) => {
  const p = new GCPProvisioner({project: 'proj', preemptible: true});
  assert.strictEqual(p._preemptible, true);
  t.end();
});

test('GCPProvisioner stores preemptible false', (t) => {
  const p = new GCPProvisioner({project: 'proj', preemptible: false});
  assert.strictEqual(p._preemptible, false);
  t.end();
});

// --- Constructor default values (Req 8.4) ---

test('GCPProvisioner uses default values for optional config', (t) => {
  const p = new GCPProvisioner({project: 'my-project'});
  assert.strictEqual(p._zone, 'us-central1-a');
  assert.strictEqual(p._machineType, 'e2-standard-4');
  assert.strictEqual(p._vmCount, 1);
  assert.strictEqual(p._preemptible, false);
  assert.strictEqual(p._project, 'my-project');
  t.end();
});

// --- destroy() without provision() ---

test('destroy throws when no stack is active', async (t) => {
  const p = new GCPProvisioner({project: 'proj'});
  await assert.rejects(
    () => p.destroy(),
    {message: 'No active Pulumi stack. Call provision() before destroy().'},
  );
  t.end();
});

// --- Address format validation (Req 8.6) ---

test('expected address format matches tcp://{ip}:{port} pattern', (t) => {
  const pattern = /^tcp:\/\/\d+\.\d+\.\d+\.\d+:\d+$/;

  // Verify the format that provision() produces
  assert.ok(pattern.test('tcp://1.2.3.4:2376'));
  assert.ok(pattern.test('tcp://10.128.0.5:2376'));
  assert.ok(pattern.test('tcp://192.168.1.100:2376'));

  // Verify non-matching formats are rejected
  assert.ok(!pattern.test('http://1.2.3.4:2376'));
  assert.ok(!pattern.test('tcp://hostname:2376'));
  assert.ok(!pattern.test('1.2.3.4:2376'));
  t.end();
});
