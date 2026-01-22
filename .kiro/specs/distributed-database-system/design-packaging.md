# Single Executable Packaging

The system supports building both the distributed database system and the admin CLI tool as free-standing single executables for Linux deployment.

## Packaging Technology

The system uses Node.js Single Executable Application (SEA) feature, available in Node.js 20+ and stable in Node.js 22+.

**Build Process Overview:**
1. Bundle all JavaScript source files into a single entry point
2. Generate SEA configuration blob
3. Inject blob into Node.js binary
4. Sign the executable (optional, for distribution)

## Build Configuration

```javascript
// sea-config.json for main system
{
  "main": "dist/index.bundle.js",
  "output": "dist/sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "useCodeCache": true,
  "assets": {
    "config-schema": "src/config/schemas.js"
  }
}

// sea-config-cli.json for admin CLI
{
  "main": "dist/admin-cli.bundle.js",
  "output": "dist/sea-cli-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "useCodeCache": true
}
```

## Bundling Strategy

The system uses **esbuild** for fast, efficient bundling:

```javascript
// build-sea.js
const esbuild = require('esbuild');

async function buildBundle(entryPoint, outputFile) {
  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: outputFile,
    external: ['better-sqlite3'], // Native modules handled separately
    minify: true,
    sourcemap: false,
  });
}

// Build main system bundle
await buildBundle('src/index.js', 'dist/index.bundle.js');

// Build CLI bundle
await buildBundle('src/admin-cli.js', 'dist/admin-cli.bundle.js');
```

## Native Module Handling

Native modules like `better-sqlite3` require special handling:

**Approach 1: Prebuild Binaries**
- Include prebuilt native binaries for target Linux architectures (x64, arm64)
- Extract at runtime to a temporary directory
- Load using absolute path

**Approach 2: Static Linking**
- Compile native modules statically into the executable
- Requires custom build of better-sqlite3 with static SQLite

```javascript
// Native module loader for SEA
class NativeModuleLoader {
  constructor() {
    this.extractDir = path.join(os.tmpdir(), 'ddb-native');
  }

  async loadBetterSqlite3() {
    const platform = process.platform;
    const arch = process.arch;
    const binaryName = `better_sqlite3_${platform}_${arch}.node`;
    
    // Check if running as SEA
    if (process.pkg || require.main?.filename?.includes('.sea.')) {
      const extractedPath = path.join(this.extractDir, binaryName);
      
      if (!fs.existsSync(extractedPath)) {
        // Extract from embedded assets
        const assetData = sea.getAsset(binaryName);
        fs.mkdirSync(this.extractDir, { recursive: true });
        fs.writeFileSync(extractedPath, assetData);
      }
      
      return require(extractedPath);
    }
    
    // Normal require for development
    return require('better-sqlite3');
  }
}
```

## Build Scripts

```bash
#!/bin/bash
# build-executables.sh

set -e

# Ensure Node.js 22+
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "Error: Node.js 22+ required for SEA builds"
  exit 1
fi

# Bundle JavaScript
echo "Bundling JavaScript..."
node build-sea.js

# Generate SEA blobs
echo "Generating SEA blobs..."
node --experimental-sea-config sea-config.json
node --experimental-sea-config sea-config-cli.json

# Copy Node.js binary
echo "Creating executables..."
cp $(which node) dist/distributed-db
cp $(which node) dist/ddb-cli

# Inject SEA blobs
echo "Injecting SEA blobs..."
npx postject dist/distributed-db NODE_SEA_BLOB dist/sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

npx postject dist/ddb-cli NODE_SEA_BLOB dist/sea-cli-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# Make executable
chmod +x dist/distributed-db
chmod +x dist/ddb-cli

echo "Build complete!"
echo "  Main system: dist/distributed-db"
echo "  CLI tool:    dist/ddb-cli"
```

## Package.json Scripts

```json
{
  "scripts": {
    "build:bundle": "node build-sea.js",
    "build:sea": "./build-executables.sh",
    "build:all": "npm run build:bundle && npm run build:sea"
  }
}
```

## Executable Behavior

The single executables behave identically to the non-packaged versions:

**Main System (`distributed-db`):**
```bash
# Start as seed node
./distributed-db

# Start and join existing cluster
./distributed-db --seed ws://192.168.1.100:8080

# With custom configuration
./distributed-db --config /etc/ddb/config.env
```

**CLI Tool (`ddb-cli`):**
```bash
# Connect to local node
./ddb-cli

# Connect to specific node
./ddb-cli --host 192.168.1.100 --port 8080

# Execute single command
./ddb-cli --execute "SELECT * FROM nodes"
```

## Distribution Considerations

**Target Platforms:**
- Linux x64 (primary)
- Linux arm64 (secondary)

**Dependencies:**
- glibc 2.17+ (compatible with most Linux distributions)
- No external runtime dependencies

**File Sizes (approximate):**
- Main system: ~80-100 MB (includes Node.js runtime + SQLite)
- CLI tool: ~60-80 MB (includes Node.js runtime)

## Testing Single Executables

```javascript
// test/integration/single-executable.test.js
const { execSync, spawn } = require('child_process');
const path = require('path');

describe('Single Executable', () => {
  const mainExe = path.join(__dirname, '../../dist/distributed-db');
  const cliExe = path.join(__dirname, '../../dist/ddb-cli');

  it('main executable starts without Node.js in PATH', () => {
    // Run with empty PATH to verify no Node.js dependency
    const result = execSync(`${mainExe} --version`, {
      env: { PATH: '' },
    });
    expect(result.toString()).toMatch(/\d+\.\d+\.\d+/);
  });

  it('CLI executable connects and executes queries', () => {
    const result = execSync(`${cliExe} --execute "SELECT 1"`, {
      env: { PATH: '' },
    });
    expect(result.toString()).toContain('1');
  });

  it('main executable behaves identically to npm start', async () => {
    // Compare outputs of both versions
    const seaOutput = execSync(`${mainExe} --dry-run`);
    const npmOutput = execSync('npm start -- --dry-run');
    expect(seaOutput.toString()).toEqual(npmOutput.toString());
  });
});
```

**Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.6**
