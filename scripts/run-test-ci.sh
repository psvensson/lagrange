#!/usr/bin/env bash

# The complete CI proof has one deterministic order. Analysis/model writers
# finish before behavioural readers start, and the behavioural corpus has one
# resource-aware scheduler. No environment switch can select a second meaning
# of "complete".
set -euo pipefail

npm run test:static
npm run model:contracts
npm run test:all
npm run test:chart:endpoint-sync
