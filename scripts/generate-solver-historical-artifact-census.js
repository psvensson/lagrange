#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  buildHistoricalArtifactCensus,
  canonicalHistoricalCensusBytes,
} from './solve/historical-artifact-census.js';

const OUTPUT = 'solve/changes/solver-historical-artifact-census/census.json';
const QUEST = 'solve/quests/solver-historical-artifact-census.json';
const quest = JSON.parse(fs.readFileSync(QUEST, 'utf8'));
const census = buildHistoricalArtifactCensus(process.cwd(), {
  commit: quest.links.sealedAtCommit,
});
fs.mkdirSync(path.dirname(OUTPUT), {recursive: true});
fs.writeFileSync(OUTPUT, canonicalHistoricalCensusBytes(census));
process.stdout.write(`${path.resolve(OUTPUT)}\n`);
