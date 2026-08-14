import assert from 'node:assert/strict';
import fs from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {
  IMAGE_FAMILY,
  READY_MARKER,
  STARTUP_SCRIPT_PATH,
  buildHarnessImage,
  defaultImageName,
  definitionHash,
  parseArgs,
} from '../../scripts/build-gcp-harness-image.js';

function notFound() {
  return new Error('resource was not found');
}

function imageDescription(startupScript) {
  return JSON.stringify({
    name: 'lagrange-harness-v1',
    family: IMAGE_FAMILY,
    status: 'READY',
    labels: {
      purpose: 'lagrange-distributed-harness',
      definition: definitionHash(startupScript),
    },
  });
}

test('GCP harness image builder parses its bounded cloud target', (t) => {
  assert.deepEqual(
    parseArgs([
      '--project', 'project-a',
      '--zone', 'europe-north1-a',
      '--machine-type', 'e2-standard-4',
      '--image-name', 'lagrange-harness-v1',
    ]),
    {
      project: 'project-a',
      zone: 'europe-north1-a',
      machineType: 'e2-standard-4',
      imageName: 'lagrange-harness-v1',
      help: false,
    },
  );
  assert.throws(() => parseArgs([]), /--project is required/u);
  t.end();
});

test('GCP harness image definition has no baked credentials', (t) => {
  const startupScript = fs.readFileSync(STARTUP_SCRIPT_PATH, 'utf8');
  assert.match(startupScript, /apt-get install -y docker\.io/u);
  assert.doesNotMatch(startupScript, /--tlsverify/u);
  assert.match(startupScript, /systemctl stop docker\.service/u);
  assert.match(startupScript, /ssh_host_\*_key/u);
  assert.match(startupScript, /rm -rf \/var\/lib\/google/u);
  assert.doesNotMatch(startupScript, /BEGIN (?:RSA )?PRIVATE KEY/u);
  assert.match(
    defaultImageName(startupScript, new Date('2026-08-14T00:00:00Z')),
    /^lagrange-harness-20260814-[a-f0-9]{8}$/u,
  );
  t.end();
});

test('GCP harness image build versions the family and deletes its builder',
  async () => {
    const calls = [];
    let builderExists = false;
    const runCommand = (args) => {
      calls.push(args);
      if (args[2] === 'describe' && args[1] === 'images') {
        throw notFound();
      }
      if (args[2] === 'describe' && args[1] === 'instances') {
        if (!builderExists) {
          throw notFound();
        }
        return JSON.stringify({
          name: 'lagrange-harness-v1-builder',
          labels: {purpose: 'lagrange-harness-image-builder'},
        });
      }
      if (args[2] === 'create' && args[1] === 'instances') {
        builderExists = true;
      }
      if (args.includes('get-serial-port-output')) {
        return READY_MARKER;
      }
      if (args[2] === 'delete' && args[1] === 'instances') {
        builderExists = false;
      }
      return '';
    };
    const result = await buildHarnessImage({
      project: 'project-a',
      zone: 'us-central1-a',
      machineType: 'e2-standard-2',
      imageName: 'lagrange-harness-v1',
    }, {runCommand});

    assert.deepEqual(result, {
      imageName: 'lagrange-harness-v1',
      imageFamily: IMAGE_FAMILY,
      reused: false,
    });
    assert.ok(calls.some((args) =>
      args[0] === 'compute' && args[1] === 'instances' &&
      args[2] === 'create'));
    assert.ok(calls.some((args) =>
      args[0] === 'compute' && args[1] === 'images' &&
      args[2] === 'create' && args.includes('--family') &&
      args.includes(IMAGE_FAMILY)));
    assert.ok(calls.some((args) =>
      args[0] === 'compute' && args[1] === 'instances' &&
      args[2] === 'delete' && args.includes('--delete-disks=all')));
  });

test('GCP harness image build reuses an existing immutable version',
  async () => {
    const calls = [];
    const startupScript = fs.readFileSync(STARTUP_SCRIPT_PATH, 'utf8');
    const result = await buildHarnessImage({
      project: 'project-a',
      zone: 'us-central1-a',
      machineType: 'e2-standard-2',
      imageName: 'lagrange-harness-v1',
    }, {
      runCommand: (args) => {
        calls.push(args);
        if (args[1] === 'images') {
          return imageDescription(startupScript);
        }
        throw notFound();
      },
    });

    assert.equal(result.reused, true);
    assert.equal(calls.length, 2);
  });

test('GCP harness image build cleans an uncertain accepted create',
  async () => {
    let builderExists = false;
    let builderDeleted = false;
    const runCommand = (args) => {
      if (args[2] === 'describe' && args[1] === 'images') {
        throw notFound();
      }
      if (args[2] === 'describe' && args[1] === 'instances') {
        if (!builderExists) {
          throw notFound();
        }
        return JSON.stringify({
          labels: {purpose: 'lagrange-harness-image-builder'},
        });
      }
      if (args[2] === 'create' && args[1] === 'instances') {
        builderExists = true;
        throw new Error('create command timed out');
      }
      if (args[2] === 'delete' && args[1] === 'instances') {
        builderExists = false;
        builderDeleted = true;
      }
      return '';
    };

    await assert.rejects(
      () => buildHarnessImage({
        project: 'project-a',
        zone: 'us-central1-a',
        machineType: 'e2-standard-2',
        imageName: 'lagrange-harness-v1',
      }, {runCommand}),
      /create command timed out/u,
    );
    assert.equal(builderDeleted, true);
  });

test('GCP harness image build rejects a mismatched existing version',
  async () => {
    await assert.rejects(
      () => buildHarnessImage({
        project: 'project-a',
        zone: 'us-central1-a',
        machineType: 'e2-standard-2',
        imageName: 'lagrange-harness-v1',
      }, {
        runCommand: () => JSON.stringify({
          family: 'unrelated-family',
          labels: {},
        }),
      }),
      /does not match family/u,
    );
  });
