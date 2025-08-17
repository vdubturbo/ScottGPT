#!/usr/bin/env node
/**
 * Script to identify and optionally remove redundant debug scripts
 * Compares debug scripts with new test coverage
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Debug scripts that have been converted to proper tests
const debugScriptMapping = {
  // Unit test coverage
  'debug-embeddings.js': 'tests/unit/embeddings.test.js',
  'check-embedding-details.js': 'tests/unit/embeddings.test.js',
  'debug-db-structure.js': 'tests/unit/database.test.js',
  'debug-search.js': 'tests/unit/database.test.js',
  'debug-retrieval.js': 'tests/unit/retrieval.test.js',
  
  // Integration test coverage
  'test-oldp-retrieval-detailed.js': 'tests/integration/rag-pipeline.test.js',
  'test-oldp-search.js': 'tests/integration/rag-pipeline.test.js',
  'test-oldp-similarity.js': 'tests/integration/rag-pipeline.test.js',
  'test-oldp-filter.js': 'tests/integration/rag-pipeline.test.js',
  'test-extraction.js': 'tests/integration/rag-pipeline.test.js',
  'test-search.js': 'tests/integration/rag-pipeline.test.js',
  
  // Performance test coverage
  'test-pgvector-migration.js': 'tests/performance/database-performance.test.js',
  'test-scoring-system.js': 'tests/performance/api-performance.test.js',
  
  // Specific functionality checks
  'check-oldp-context.js': 'tests/unit/database.test.js',
  'check-oldp-embeddings.js': 'tests/unit/embeddings.test.js',
  'check-skills-tags.js': 'tests/unit/retrieval.test.js',
  'debug-oldp-search.js': 'tests/integration/rag-pipeline.test.js',
  'debug-iot-search.js': 'tests/integration/rag-pipeline.test.js',
  'debug-extraction.js': 'tests/integration/rag-pipeline.test.js'
};

async function analyzeDebugScripts() {
  console.log('🔍 Analyzing debug scripts for redundancy...\n');

  const results = {
    covered: [],
    uncovered: [],
    missing: []
  };

  // Check each debug script
  for (const [debugScript, testFile] of Object.entries(debugScriptMapping)) {
    const debugPath = path.join(rootDir, debugScript);
    const testPath = path.join(rootDir, testFile);

    try {
      // Check if debug script exists
      const debugExists = await fs.access(debugPath).then(() => true).catch(() => false);
      
      // Check if corresponding test exists
      const testExists = await fs.access(testPath).then(() => true).catch(() => false);

      if (debugExists && testExists) {
        results.covered.push({
          debugScript,
          testFile,
          status: 'covered'
        });
      } else if (debugExists && !testExists) {
        results.uncovered.push({
          debugScript,
          testFile,
          status: 'missing_test'
        });
      } else if (!debugExists && testExists) {
        results.missing.push({
          debugScript,
          testFile,
          status: 'already_removed'
        });
      }
    } catch (error) {
      console.error(`Error checking ${debugScript}:`, error.message);
    }
  }

  return results;
}

async function generateCleanupReport(results) {
  console.log('📊 Debug Script Analysis Report\n');
  console.log('=' .repeat(50));

  // Scripts that can be safely removed
  if (results.covered.length > 0) {
    console.log('\n✅ Scripts covered by tests (can be removed):');
    results.covered.forEach(({ debugScript, testFile }) => {
      console.log(`   ${debugScript} → ${testFile}`);
    });
  }

  // Scripts without test coverage
  if (results.uncovered.length > 0) {
    console.log('\n⚠️  Scripts without test coverage (keep for now):');
    results.uncovered.forEach(({ debugScript, testFile }) => {
      console.log(`   ${debugScript} → ${testFile} (missing)`);
    });
  }

  // Scripts already removed
  if (results.missing.length > 0) {
    console.log('\n🗑️  Scripts already removed:');
    results.missing.forEach(({ debugScript, testFile }) => {
      console.log(`   ${debugScript} → ${testFile} (exists)`);
    });
  }

  // Summary
  console.log('\n📈 Summary:');
  console.log(`   Total scripts analyzed: ${Object.keys(debugScriptMapping).length}`);
  console.log(`   Covered by tests: ${results.covered.length}`);
  console.log(`   Missing test coverage: ${results.uncovered.length}`);
  console.log(`   Already cleaned up: ${results.missing.length}`);

  if (results.covered.length > 0) {
    console.log(`\n💾 Space that can be reclaimed: ${results.covered.length} debug scripts`);
  }
}

async function createBackupArchive(scriptsToRemove) {
  const archiveDir = path.join(rootDir, 'archive-debug-scripts');
  
  try {
    await fs.mkdir(archiveDir, { recursive: true });
    
    for (const { debugScript } of scriptsToRemove) {
      const sourcePath = path.join(rootDir, debugScript);
      const archivePath = path.join(archiveDir, debugScript);
      
      try {
        await fs.copyFile(sourcePath, archivePath);
        console.log(`   📦 Archived: ${debugScript}`);
      } catch (error) {
        console.error(`   ❌ Failed to archive ${debugScript}:`, error.message);
      }
    }
    
    // Create a README for the archive
    const readmeContent = `# Archived Debug Scripts

These debug scripts were archived on ${new Date().toISOString()} after being converted to proper test suites.

## Conversion Mapping

${scriptsToRemove.map(({ debugScript, testFile }) => 
  `- \`${debugScript}\` → \`${testFile}\``
).join('\n')}

## Test Suite Usage

The functionality of these debug scripts is now covered by the test suite:

\`\`\`bash
# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:performance
npm run test:e2e

# Run with coverage
npm run test:coverage
\`\`\`

These archived files can be safely deleted if the test suite provides adequate coverage.
`;

    await fs.writeFile(path.join(archiveDir, 'README.md'), readmeContent);
    console.log(`   📝 Created archive README`);
    
    return archiveDir;
  } catch (error) {
    console.error('Failed to create backup archive:', error.message);
    return null;
  }
}

async function removeDebugScripts(scriptsToRemove, createBackup = true) {
  console.log('\n🗑️  Removing redundant debug scripts...\n');

  let archiveDir = null;
  if (createBackup) {
    console.log('📦 Creating backup archive...');
    archiveDir = await createBackupArchive(scriptsToRemove);
    if (archiveDir) {
      console.log(`   Archive created at: ${archiveDir}\n`);
    }
  }

  console.log('🗑️  Removing debug scripts...');
  let removedCount = 0;
  
  for (const { debugScript } of scriptsToRemove) {
    const scriptPath = path.join(rootDir, debugScript);
    
    try {
      await fs.unlink(scriptPath);
      console.log(`   ✅ Removed: ${debugScript}`);
      removedCount++;
    } catch (error) {
      console.log(`   ⚠️  Could not remove ${debugScript}: ${error.message}`);
    }
  }

  console.log(`\n✨ Cleanup complete! Removed ${removedCount} debug scripts.`);
  
  if (archiveDir) {
    console.log(`   💾 Backup archive: ${archiveDir}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'analyze';

  try {
    const results = await analyzeDebugScripts();
    
    switch (command) {
      case 'analyze':
        await generateCleanupReport(results);
        
        if (results.covered.length > 0) {
          console.log('\n🔧 Next steps:');
          console.log('   Run with --remove to clean up covered scripts');
          console.log('   Run with --remove --no-backup to remove without backup');
        }
        break;
        
      case 'remove':
      case '--remove':
        if (results.covered.length === 0) {
          console.log('No redundant scripts to remove.');
          break;
        }
        
        const createBackup = !args.includes('--no-backup');
        await removeDebugScripts(results.covered, createBackup);
        break;
        
      default:
        console.log('Usage:');
        console.log('  node scripts/cleanup-debug-scripts.js [analyze|remove] [--no-backup]');
        console.log('');
        console.log('Commands:');
        console.log('  analyze  Show debug scripts that can be removed (default)');
        console.log('  remove   Remove debug scripts covered by tests');
        console.log('');
        console.log('Options:');
        console.log('  --no-backup  Skip creating backup archive when removing');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();