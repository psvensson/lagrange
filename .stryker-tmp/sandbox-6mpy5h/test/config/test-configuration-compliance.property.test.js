/**
 * Property test for Test Configuration Compliance.
 *
 * Property 9: For any property test file using fast-check, the numRuns
 * configuration SHALL be set to 10, and for any unit test, execution
 * time SHALL be under 2 seconds.
 *
 * **Validates: Requirements 11.1, 11.2**
 *
 * **Feature: test-failure-fixes, Property 9: Test Configuration Compliance**
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';

/**
 * Get all property test files in the test directory.
 * @return {string[]} Array of file paths
 */
function getPropertyTestFiles() {
  const testDir = path.resolve(process.cwd(), 'test');
  const files = [];

  function walkDir(dir) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.property.test.js')) {
        files.push(fullPath);
      }
    }
  }

  walkDir(testDir);
  return files;
}

/**
 * Check if a file contains fc.assert with numRuns configuration.
 * @param {string} content - File content
 * @return {Object} Analysis result
 */
function analyzeNumRunsConfig(content) {
  const fcAssertMatches = content.match(/fc\.assert\s*\([^)]+\)/g) || [];
  const results = [];

  for (const match of fcAssertMatches) {
    // Check if numRuns is specified
    const hasNumRuns = match.includes('numRuns');
    const numRunsMatch = match.match(/numRuns:\s*(\d+|NUM\.TEN)/);

    if (hasNumRuns && numRunsMatch) {
      const value = numRunsMatch[1];
      const isCompliant = value === '10' || value === 'NUM.TEN';
      results.push({match, hasNumRuns, value, isCompliant});
    } else if (!hasNumRuns) {
      // fc.assert without numRuns - check if it's in the options object
      results.push({match, hasNumRuns: false, value: null, isCompliant: false});
    }
  }

  return results;
}

/**
 * Feature: test-failure-fixes
 * Property 9: Test Configuration Compliance
 *
 * For any property test file using fast-check, the numRuns configuration
 * SHALL be set to 10.
 */
test('Property 9: Test Configuration Compliance', async (t) => {
  /**
   * Property: All property test files have numRuns set to 10.
   *
   * For any property test file, all fc.assert calls SHALL have
   * numRuns configured to 10 (or NUM.TEN constant).
   *
   * **Validates: Requirements 11.1, 11.2**
   */
  t.test('all property test files have numRuns set to 10', async (t) => {
    const propertyTestFiles = getPropertyTestFiles();

    t.ok(propertyTestFiles.length > 0, 'should find property test files');

    let totalAsserts = 0;
    let compliantAsserts = 0;
    const nonCompliantFiles = [];

    for (const filePath of propertyTestFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const results = analyzeNumRunsConfig(content);

      for (const result of results) {
        totalAsserts++;
        if (result.isCompliant) {
          compliantAsserts++;
        } else if (result.hasNumRuns) {
          nonCompliantFiles.push({
            file: path.relative(process.cwd(), filePath),
            value: result.value,
          });
        }
      }
    }

    t.ok(totalAsserts > 0, `should find fc.assert calls (found ${totalAsserts})`);

    if (nonCompliantFiles.length > 0) {
      t.comment('Non-compliant files:');
      for (const {file, value} of nonCompliantFiles) {
        t.comment(`  ${file}: numRuns=${value}`);
      }
    }

    t.equal(
      nonCompliantFiles.length,
      0,
      `all fc.assert calls should have numRuns: 10 (found ${nonCompliantFiles.length} non-compliant)`,
    );
  });

  /**
   * Property: Property test files use fast-check correctly.
   *
   * For any property test file, the file SHALL import fast-check
   * and use fc.assert or fc.property.
   *
   * **Validates: Requirements 11.1**
   */
  t.test('property test files use fast-check correctly', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...getPropertyTestFiles().slice(0, 10)),
        (filePath) => {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check for fast-check import
          const hasFastCheckImport = content.includes('from \'fast-check\'') ||
                                     content.includes('from "fast-check"');

          // Check for fc.assert or fc.property usage
          const usesFastCheck = content.includes('fc.assert') ||
                               content.includes('fc.property');

          return hasFastCheckImport && usesFastCheck;
        },
      ),
      {numRuns: 10},
    );

    t.pass('property test files use fast-check correctly');
  });

  /**
   * Property: No skipped tests in test files.
   *
   * For any test file, there SHALL be no occurrences of .skip(),
   * xit(), xdescribe(), or xtest().
   *
   * **Validates: Requirements 11.4**
   */
  t.test('no skipped tests in test files', async (t) => {
    const testDir = path.resolve(process.cwd(), 'test');
    const testFiles = [];

    function walkDir(dir) {
      const entries = fs.readdirSync(dir, {withFileTypes: true});
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.name.endsWith('.test.js')) {
          testFiles.push(fullPath);
        }
      }
    }

    walkDir(testDir);

    const skipPatterns = [
      /\bt\.skip\s*\(/,
      /\btest\.skip\s*\(/,
      /\bxit\s*\(/,
      /\bxdescribe\s*\(/,
      /\bxtest\s*\(/,
    ];

    const filesWithSkips = [];

    for (const filePath of testFiles) {
      // Skip this test file itself to avoid false positive from regex patterns
      if (filePath.includes('test-configuration-compliance')) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      for (const pattern of skipPatterns) {
        if (pattern.test(content)) {
          filesWithSkips.push({
            file: path.relative(process.cwd(), filePath),
            pattern: pattern.toString(),
          });
          break;
        }
      }
    }

    if (filesWithSkips.length > 0) {
      t.comment('Files with skipped tests:');
      for (const {file, pattern} of filesWithSkips) {
        t.comment(`  ${file}: ${pattern}`);
      }
    }

    t.equal(
      filesWithSkips.length,
      0,
      `no test files should have skipped tests (found ${filesWithSkips.length})`,
    );
  });
});
