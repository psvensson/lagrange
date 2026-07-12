#!/usr/bin/env node

import path from 'node:path';

import {writeHistoricalMigrationV2Manifest} from
  './solve/historical-artifact-migration-v2.js';

const result = writeHistoricalMigrationV2Manifest(process.cwd());
process.stdout.write(`${path.resolve(result.manifestPath)}\n`);
