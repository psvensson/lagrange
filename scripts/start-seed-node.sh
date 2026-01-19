#!/bin/bash
#
# Start a seed node on default port (8080) and default data directory (./data)
#
# Usage: ./scripts/start-seed-node.sh
#

set -e

echo "Starting seed node..."
echo "  REST API Port: 8080"
echo "  Admin WebSocket Port: 8081"
echo "  Data Directory: ./data"
echo ""

# Set environment variables for the seed node
# Using a fixed UUID for reproducible testing (seed-node-1)
export NODE_ID="550e8400-e29b-41d4-a716-446655440001"
export NODE_ADDRESS="localhost:8080"
export REST_API_PORT=8080
export DATA_DIR="./data"
export LOG_LEVEL="info"
export LOG_PRETTY_PRINT="true"

# Run the distributed database system
node src/index.js --data-dir ./data
