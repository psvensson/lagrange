#!/bin/bash
# Build script for creating single executable applications
# Requires Node.js 22+ for SEA support

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_ROOT/dist"

echo "=== Building Single Executables ==="
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "Error: Node.js 22+ required for SEA builds"
  echo "Current version: $(node -v)"
  exit 1
fi
echo "✓ Node.js version: $(node -v)"

# Ensure dist directory exists
mkdir -p "$DIST_DIR"

# Step 1: Bundle JavaScript
echo ""
echo "Step 1: Bundling JavaScript..."
node "$SCRIPT_DIR/build-sea.js"

# Step 2: Generate SEA blobs
echo ""
echo "Step 2: Generating SEA blobs..."
cd "$PROJECT_ROOT"
node --experimental-sea-config sea-config.json
echo "  ✓ Main system blob generated"
node --experimental-sea-config sea-config-cli.json
echo "  ✓ CLI blob generated"

# Step 3: Copy Node.js binary
echo ""
echo "Step 3: Creating executable copies..."
NODE_PATH=$(which node)
cp "$NODE_PATH" "$DIST_DIR/distributed-db"
cp "$NODE_PATH" "$DIST_DIR/ddb-cli"
echo "  ✓ Node.js binary copied"

# Step 4: Inject SEA blobs using postject
echo ""
echo "Step 4: Injecting SEA blobs..."

# Check if postject is available
if ! npx postject --help > /dev/null 2>&1; then
  echo "Installing postject..."
  npm install --save-dev postject
fi

npx postject "$DIST_DIR/distributed-db" NODE_SEA_BLOB "$DIST_DIR/sea-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --overwrite
echo "  ✓ Main system blob injected"

npx postject "$DIST_DIR/ddb-cli" NODE_SEA_BLOB "$DIST_DIR/sea-cli-prep.blob" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --overwrite
echo "  ✓ CLI blob injected"

# Step 5: Make executables
echo ""
echo "Step 5: Setting executable permissions..."
chmod +x "$DIST_DIR/distributed-db"
chmod +x "$DIST_DIR/ddb-cli"
echo "  ✓ Permissions set"

# Step 6: Verify executables
echo ""
echo "Step 6: Verifying executables..."
if [ -f "$DIST_DIR/distributed-db" ] && [ -x "$DIST_DIR/distributed-db" ]; then
  MAIN_SIZE=$(du -h "$DIST_DIR/distributed-db" | cut -f1)
  echo "  ✓ distributed-db ($MAIN_SIZE)"
else
  echo "  ✗ distributed-db not found or not executable"
  exit 1
fi

if [ -f "$DIST_DIR/ddb-cli" ] && [ -x "$DIST_DIR/ddb-cli" ]; then
  CLI_SIZE=$(du -h "$DIST_DIR/ddb-cli" | cut -f1)
  echo "  ✓ ddb-cli ($CLI_SIZE)"
else
  echo "  ✗ ddb-cli not found or not executable"
  exit 1
fi

echo ""
echo "=== Build Complete ==="
echo ""
echo "Executables created:"
echo "  Main system: $DIST_DIR/distributed-db"
echo "  CLI tool:    $DIST_DIR/ddb-cli"
echo ""
echo "To run without Node.js in PATH:"
echo "  $DIST_DIR/distributed-db"
echo "  $DIST_DIR/ddb-cli --help"
