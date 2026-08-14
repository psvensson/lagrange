#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const DEFAULT_ZONE = 'us-central1-a';
const DEFAULT_MACHINE_TYPE = 'e2-standard-2';
const DEFAULT_SOURCE_IMAGE_FAMILY = 'ubuntu-2204-lts';
const DEFAULT_SOURCE_IMAGE_PROJECT = 'ubuntu-os-cloud';
const IMAGE_FAMILY = 'lagrange-distributed-harness';
const IMAGE_NAME_PREFIX = 'lagrange-harness';
const BUILDER_SUFFIX = '-builder';
const BUILDER_PURPOSE = 'lagrange-harness-image-builder';
const IMAGE_PURPOSE = 'lagrange-distributed-harness';
const READY_MARKER = 'LAGRANGE_GCP_HARNESS_IMAGE_READY';
const POLL_INTERVAL_MS = 10000;
const BUILD_TIMEOUT_MS = 900000;
const COMMAND_TIMEOUT_MS = 180000;
const HASH_LENGTH = 8;
const DATE_LENGTH = 8;
const LINE_SEPARATOR = '\n';
const OPTION_PREFIX = '--';
const FLAG_HELP = '--help';
const FLAG_PROJECT = '--project';
const FLAG_ZONE = '--zone';
const FLAG_MACHINE_TYPE = '--machine-type';
const FLAG_IMAGE_NAME = '--image-name';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const TEXT_ENCODING = 'utf8';
const IMAGE_STATUS_READY = 'READY';
const GCLOUD = Object.freeze({
  binary: 'gcloud',
  compute: 'compute',
  images: 'images',
  instances: 'instances',
  describe: 'describe',
  create: 'create',
  stop: 'stop',
  delete: 'delete',
  projectFlag: '--project',
  zoneFlag: '--zone',
  machineTypeFlag: '--machine-type',
  imageFamilyFlag: '--image-family',
  imageProjectFlag: '--image-project',
  sourceDiskFlag: '--source-disk',
  sourceDiskZoneFlag: '--source-disk-zone',
  familyFlag: '--family',
  bootDiskSize: '--boot-disk-size=20GB',
  bootDiskType: '--boot-disk-type=pd-standard',
  deleteDisks: '--delete-disks=all',
  quiet: '--quiet',
  imageFormat: '--format=json(name,family,status,labels)',
  builderFormat: '--format=json(name,labels)',
});
const IMAGE_DESCRIPTION =
  '--description=Ubuntu 22.04 with Docker preinstalled for the Lagrange ' +
  'distributed harness; TLS credentials are injected per run.';
const USAGE_LINES = Object.freeze([
  'Usage:',
  '  node scripts/build-gcp-harness-image.js --project <gcp-project>',
  '',
  'Options:',
  `  --zone <zone>                  default: ${DEFAULT_ZONE}`,
  '  --image-name <name>            default: date + definition hash',
  `  --machine-type <type>          default: ${DEFAULT_MACHINE_TYPE}`,
  '  --help',
]);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const STARTUP_SCRIPT_PATH = path.join(
  SCRIPT_DIR,
  'gcp-harness-image-startup.sh',
);

function usage() {
  return USAGE_LINES.join(LINE_SEPARATOR);
}

function optionValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith(OPTION_PREFIX)) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseArgs(argv = []) {
  const parsed = {
    project: null,
    zone: DEFAULT_ZONE,
    machineType: DEFAULT_MACHINE_TYPE,
    imageName: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === FLAG_HELP) {
      parsed.help = true;
    } else if (flag === FLAG_PROJECT) {
      parsed.project = optionValue(argv, index, flag);
      index += 1;
    } else if (flag === FLAG_ZONE) {
      parsed.zone = optionValue(argv, index, flag);
      index += 1;
    } else if (flag === FLAG_MACHINE_TYPE) {
      parsed.machineType = optionValue(argv, index, flag);
      index += 1;
    } else if (flag === FLAG_IMAGE_NAME) {
      parsed.imageName = optionValue(argv, index, flag);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  if (!parsed.help && !parsed.project) {
    throw new Error(`${FLAG_PROJECT} is required`);
  }
  return parsed;
}

function definitionHash(startupScript) {
  return createHash(HASH_ALGORITHM)
    .update(startupScript)
    .digest(HASH_ENCODING)
    .slice(0, HASH_LENGTH);
}

function defaultImageName(startupScript, now = new Date()) {
  const date = now.toISOString().slice(0, DATE_LENGTH + 2).replaceAll('-', '');
  return `${IMAGE_NAME_PREFIX}-${date}-${definitionHash(startupScript)}`;
}

function runGcloud(args, options = {}) {
  return execFileSync(GCLOUD.binary, args, {
    encoding: TEXT_ENCODING,
    timeout: COMMAND_TIMEOUT_MS,
    ...options,
  });
}

function isNotFoundError(error) {
  return /(?:was )?not found/iu.test(
    `${error?.message || ''}\n${error?.stderr || ''}`,
  );
}

function describeOptional(args, runCommand) {
  try {
    return JSON.parse(runCommand(args));
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function describeImage(project, imageName, runCommand) {
  return describeOptional([
    GCLOUD.compute, GCLOUD.images, GCLOUD.describe, imageName,
    GCLOUD.projectFlag, project,
    GCLOUD.imageFormat,
  ], runCommand);
}

function describeBuilder(options, runCommand) {
  return describeOptional([
    GCLOUD.compute, GCLOUD.instances, GCLOUD.describe, options.builderName,
    GCLOUD.projectFlag, options.project,
    GCLOUD.zoneFlag, options.zone,
    GCLOUD.builderFormat,
  ], runCommand);
}

function assertOwnedBuilder(builder, builderName) {
  if (builder?.labels?.purpose !== BUILDER_PURPOSE) {
    throw new Error(
      `Refusing to delete existing instance ${builderName}: ` +
      `missing purpose=${BUILDER_PURPOSE} label`,
    );
  }
}

function assertReusableImage(image, imageName, hash) {
  if (image.family !== IMAGE_FAMILY ||
      image.status !== IMAGE_STATUS_READY ||
      image.labels?.purpose !== IMAGE_PURPOSE ||
      image.labels?.definition !== hash) {
    throw new Error(
      `Image ${imageName} exists but does not match family ` +
      `${IMAGE_FAMILY}, READY status, and definition ${hash}`,
    );
  }
}

function delay(durationMs) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, durationMs);
  });
}

async function waitForImageReady(options, hooks) {
  const deadline = hooks.now() + BUILD_TIMEOUT_MS;
  let lastError = null;
  while (hooks.now() < deadline) {
    try {
      const serialOutput = hooks.runCommand([
        'compute', 'instances', 'get-serial-port-output', options.builderName,
        '--project', options.project,
        '--zone', options.zone,
        '--port=1',
      ]);
      if (serialOutput.includes(READY_MARKER)) {
        return;
      }
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await hooks.sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Builder ${options.builderName} did not report ${READY_MARKER} within ` +
    `${BUILD_TIMEOUT_MS}ms` +
    (lastError ? `: ${lastError.message}` : ''),
  );
}

function createBuilder(options, startupScriptPath, runCommand) {
  runCommand([
    GCLOUD.compute, GCLOUD.instances, GCLOUD.create, options.builderName,
    GCLOUD.projectFlag, options.project,
    GCLOUD.zoneFlag, options.zone,
    GCLOUD.machineTypeFlag, options.machineType,
    GCLOUD.imageFamilyFlag, DEFAULT_SOURCE_IMAGE_FAMILY,
    GCLOUD.imageProjectFlag, DEFAULT_SOURCE_IMAGE_PROJECT,
    GCLOUD.bootDiskSize,
    GCLOUD.bootDiskType,
    `--metadata-from-file=startup-script=${startupScriptPath}`,
    `--labels=purpose=${BUILDER_PURPOSE}`,
    GCLOUD.quiet,
  ]);
}

function createImage(options, hash, runCommand) {
  runCommand([
    GCLOUD.compute, GCLOUD.instances, GCLOUD.stop, options.builderName,
    GCLOUD.projectFlag, options.project,
    GCLOUD.zoneFlag, options.zone,
    GCLOUD.quiet,
  ]);
  runCommand([
    GCLOUD.compute, GCLOUD.images, GCLOUD.create, options.imageName,
    GCLOUD.projectFlag, options.project,
    GCLOUD.sourceDiskFlag, options.builderName,
    GCLOUD.sourceDiskZoneFlag, options.zone,
    GCLOUD.familyFlag, IMAGE_FAMILY,
    `--labels=purpose=${IMAGE_PURPOSE},definition=${hash}`,
    IMAGE_DESCRIPTION,
    GCLOUD.quiet,
  ]);
}

function deleteBuilder(options, runCommand) {
  runCommand([
    GCLOUD.compute, GCLOUD.instances, GCLOUD.delete, options.builderName,
    GCLOUD.projectFlag, options.project,
    GCLOUD.zoneFlag, options.zone,
    GCLOUD.deleteDisks,
    GCLOUD.quiet,
  ]);
}

function removeOwnedBuilderIfPresent(options, runCommand) {
  const builder = describeBuilder(options, runCommand);
  if (!builder) {
    return false;
  }
  assertOwnedBuilder(builder, options.builderName);
  deleteBuilder(options, runCommand);
  return true;
}

async function buildHarnessImage(args, hooks = {}) {
  const startupScript = fs.readFileSync(STARTUP_SCRIPT_PATH, 'utf8');
  const runCommand = hooks.runCommand || runGcloud;
  const runtime = {
    runCommand,
    sleep: hooks.sleep || delay,
    now: hooks.now || Date.now,
  };
  const imageName = args.imageName || defaultImageName(startupScript);
  const options = {
    ...args,
    imageName,
    builderName: `${imageName}${BUILDER_SUFFIX}`,
  };
  const hash = definitionHash(startupScript);

  const existingImage = describeImage(options.project, imageName, runCommand);
  if (existingImage) {
    assertReusableImage(existingImage, imageName, hash);
    removeOwnedBuilderIfPresent(options, runCommand);
    return {imageName, imageFamily: IMAGE_FAMILY, reused: true};
  }

  removeOwnedBuilderIfPresent(options, runCommand);
  let primaryError = null;
  try {
    createBuilder(options, STARTUP_SCRIPT_PATH, runCommand);
    await waitForImageReady(options, runtime);
    createImage(options, hash, runCommand);
  } catch (error) {
    primaryError = error;
  }
  let cleanupError = null;
  try {
    // Re-describe even when create reported failure: GCP might have accepted
    // a request whose local command timed out. The ownership label prevents
    // cleanup from deleting an unrelated same-name instance.
    removeOwnedBuilderIfPresent(options, runCommand);
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError) {
    if (cleanupError) {
      process.stderr.write(
        `GCP harness image builder cleanup failed: ${cleanupError.message}\n`,
      );
    }
    throw primaryError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
  return {imageName, imageFamily: IMAGE_FAMILY, reused: false};
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await buildHarnessImage(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`GCP harness image build failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  IMAGE_FAMILY,
  READY_MARKER,
  STARTUP_SCRIPT_PATH,
  buildHarnessImage,
  defaultImageName,
  definitionHash,
  parseArgs,
};
