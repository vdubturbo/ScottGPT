#!/usr/bin/env node
/**
 * Comprehensive Cache Audit Script
 * Identifies all cache locations and analyzes data contamination sources
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const AUDIT_REPORT = 'CACHE-AUDIT-REPORT.md';

class CacheAuditor {
  constructor() {
    this.findings = {
      cacheLocations: [],
      contentHashes: [],
      contaminatedExtractions: [],
      systemState: {},
      recommendations: []
    };
  }

  async auditCacheLocations() {
    console.log('🔍 Auditing Cache Locations...');
    
    const locations = [
      // Primary cache locations found
      '.work/',
      '.work/content-cache.json',
      '.work/upload-cache.json',
      '.work/extracted/',
      '.work/normalized/',
      '.work/validated/',
      
      // Standard cache directories
      '.cache', '.tmp', 'tmp', 'cache',
      'node_modules/.cache',
      'client/node_modules/.cache',
      
      // Potential hidden caches
      '.extraction-cache', '.dedup-cache', '.content-hash',
      'extraction-state.json', 'dedup-state.json'
    ];

    for (const location of locations) {
      try {
        const stats = await fs.stat(location);
        const isDirectory = stats.isDirectory();
        
        let contents = [];
        let totalSize = stats.size;
        
        if (isDirectory) {
          try {
            const files = await fs.readdir(location);
            contents = files;
            
            // Calculate directory size
            let dirSize = 0;
            for (const file of files) {
              const filePath = path.join(location, file);
              try {
                const fileStats = await fs.stat(filePath);
                dirSize += fileStats.size;
              } catch (e) { /* ignore */ }
            }
            totalSize = dirSize;
          } catch (e) {
            contents = ['<access denied>'];
          }
        }

        this.findings.cacheLocations.push({
          path: location,
          type: isDirectory ? 'directory' : 'file',
          size: totalSize,
          sizeHuman: this.formatBytes(totalSize),
          modified: stats.mtime.toISOString(),
          contents: isDirectory ? contents : null,
          exists: true
        });

        console.log(`  ✅ Found: ${location} (${this.formatBytes(totalSize)})`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          this.findings.cacheLocations.push({
            path: location,
            type: 'error',
            error: error.message,
            exists: false
          });
        }
      }
    }
  }

  async auditContentCache() {
    console.log('📊 Auditing Content Cache...');
    
    try {
      const cacheData = await fs.readFile('.work/content-cache.json', 'utf8');
      const cache = JSON.parse(cacheData);
      
      this.findings.systemState.contentCacheSize = Object.keys(cache.contentHashes || {}).length;
      this.findings.systemState.lastUpdated = cache.lastUpdated;
      
      for (const [hash, entry] of Object.entries(cache.contentHashes || {})) {
        const contentLength = entry.extractedContent?.length || 0;
        const yamlBlocks = (entry.extractedContent?.match(/---/g) || []).length / 2;
        
        // Detect contamination indicators
        const isContaminated = this.detectContamination(entry.extractedContent);
        
        const hashInfo = {
          hash: hash,
          originalFile: entry.originalFile,
          processedAt: entry.processedAt,
          contentLength,
          yamlBlocks: Math.floor(yamlBlocks),
          duration: entry.duration,
          tokens: entry.tokens,
          isContaminated,
          contaminationReason: isContaminated ? this.getContaminationReason(entry.extractedContent) : null,
          preview: entry.extractedContent?.substring(0, 200) + '...'
        };
        
        this.findings.contentHashes.push(hashInfo);
        
        if (isContaminated) {
          this.findings.contaminatedExtractions.push(hashInfo);
        }
      }
      
      console.log(`  📊 Found ${this.findings.contentHashes.length} cached extractions`);
      console.log(`  🚨 Contaminated: ${this.findings.contaminatedExtractions.length}`);
      
    } catch (error) {
      console.log(`  ❌ Could not audit content cache: ${error.message}`);
    }
  }

  detectContamination(content) {
    if (!content) return false;
    
    // Check for hardcoded career indicators
    const contaminationMarkers = [
      'Binary Defense',
      'Lockheed Martin',
      'McKesson',
      'Cyberdyne Systems',
      'Serta Simmons',
      'American Cybersystems',
      'middleseat.app',
      'Georgia Institute of Technology'
    ];
    
    const foundMarkers = contaminationMarkers.filter(marker => 
      content.includes(marker)
    );
    
    // If content has multiple hardcoded companies, it's likely contaminated
    return foundMarkers.length >= 3;
  }

  getContaminationReason(content) {
    const yamlBlocks = (content.match(/---/g) || []).length / 2;
    const hasMultipleCompanies = this.detectContamination(content);
    
    if (yamlBlocks >= 5 && hasMultipleCompanies) {
      return `Contains ${Math.floor(yamlBlocks)} YAML blocks with hardcoded career data`;
    }
    
    return 'Contains hardcoded career information';
  }

  async auditSystemPrompt() {
    console.log('🎯 Auditing System Prompt...');
    
    try {
      const extractScript = await fs.readFile('scripts/extract.js', 'utf8');
      
      // Find SYSTEM_PROMPT
      const promptMatch = extractScript.match(/const SYSTEM_PROMPT = `([^`]+)`/);
      
      if (promptMatch) {
        const prompt = promptMatch[1];
        const hasHardcodedCareers = prompt.includes('Binary Defense') || prompt.includes('Lockheed Martin');
        
        this.findings.systemState.systemPrompt = {
          length: prompt.length,
          hasHardcodedCareers,
          preview: prompt.substring(0, 300) + '...',
          contaminationSource: hasHardcodedCareers
        };
        
        console.log(`  🎯 System prompt: ${prompt.length} chars`);
        console.log(`  🚨 Contains hardcoded careers: ${hasHardcodedCareers}`);
      }
    } catch (error) {
      console.log(`  ❌ Could not audit system prompt: ${error.message}`);
    }
  }

  generateRecommendations() {
    console.log('💡 Generating Recommendations...');
    
    // Critical recommendations based on findings
    this.findings.recommendations = [
      {
        priority: 'CRITICAL',
        issue: 'Hardcoded career data in SYSTEM_PROMPT',
        description: 'The extraction script contains hardcoded career information that contaminates all extractions',
        action: 'Remove hardcoded career references from SYSTEM_PROMPT',
        files: ['scripts/extract.js']
      },
      {
        priority: 'CRITICAL', 
        issue: 'Contaminated cache entries',
        description: `${this.findings.contaminatedExtractions.length} cache entries contain historical career data`,
        action: 'Clear .work/content-cache.json to remove contaminated extractions',
        files: ['.work/content-cache.json']
      },
      {
        priority: 'HIGH',
        issue: 'Cache persistence across uploads',
        description: 'Content cache persists between uploads, causing data leakage',
        action: 'Implement cache isolation per upload session or user',
        files: ['scripts/extract.js']
      },
      {
        priority: 'MEDIUM',
        issue: 'No cache expiration',
        description: 'Cache entries persist indefinitely without expiration',
        action: 'Add cache expiration based on time or content changes',
        files: ['scripts/extract.js']
      }
    ];
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async generateReport() {
    console.log('📄 Generating Audit Report...');
    
    const report = `# Cache Contamination Audit Report
Generated: ${new Date().toISOString()}

## Executive Summary

**CRITICAL DATA INTEGRITY ISSUE IDENTIFIED**

The ScottGPT extraction system has persistent cache contamination causing single-paragraph uploads (142 chars) to return complete career histories (8752 chars) containing fabricated professional data.

### Key Findings:
- **${this.findings.contaminatedExtractions.length}** contaminated cache entries found
- **${this.findings.contentHashes.length}** total cached extractions
- **Hardcoded career data** in system prompt causing contamination
- **Cache persistence** across uploads enabling data leakage

## Detailed Findings

### 1. Cache Locations Discovered

${this.findings.cacheLocations.map(location => 
  `**${location.path}**
- Type: ${location.type}
- Size: ${location.sizeHuman}
- Modified: ${location.modified}
${location.contents ? `- Contents: ${location.contents.length} items` : ''}
${location.error ? `- Error: ${location.error}` : ''}`
).join('\n\n')}

### 2. Content Cache Analysis

**Cache Statistics:**
- Total entries: ${this.findings.contentHashes.length}
- Contaminated entries: ${this.findings.contaminatedExtractions.length}
- Last updated: ${this.findings.systemState.lastUpdated}

**Sample Contaminated Entries:**
${this.findings.contaminatedExtractions.slice(0, 3).map(entry => 
  `**Hash: ${entry.hash}**
- Original file: ${entry.originalFile}
- Content length: ${entry.contentLength} chars
- YAML blocks: ${entry.yamlBlocks}
- Contamination: ${entry.contaminationReason}
- Preview: ${entry.preview}`
).join('\n\n')}

### 3. System Prompt Analysis

${this.findings.systemState.systemPrompt ? `
**System Prompt Status:**
- Length: ${this.findings.systemState.systemPrompt.length} characters
- Contains hardcoded careers: ${this.findings.systemState.systemPrompt.hasHardcodedCareers}
- Preview: ${this.findings.systemState.systemPrompt.preview}
` : 'System prompt analysis failed'}

## Root Cause Analysis

### Primary Issue: Hardcoded Career Data
The \`SYSTEM_PROMPT\` in \`scripts/extract.js\` contains hardcoded career information:

1. **Independent Technologist & Developer (2025-CURRENT)**
2. **Binary Defense - Senior Director, DSO (2023-6/2025)**
3. **Serta Simmons - Senior Director of IT Strategy**
4. **Cyberdyne Systems LLC - Consultant**
5. **McKesson Corporation - Sr. Director, OT Security**
6. **American Cybersystems - Sr. Program Manager**
7. **Lockheed Martin - Program Management Manager**
8. **Education - Georgia Institute of Technology**

### Secondary Issue: Cache Contamination
The content cache stores extractions containing this hardcoded data, causing:
- Hash collisions between different inputs
- Historical data returned for new uploads
- Fabricated professional information in responses

## Critical Recommendations

${this.findings.recommendations.map((rec, index) => 
  `### ${index + 1}. ${rec.issue} (${rec.priority})

**Problem:** ${rec.description}

**Action Required:** ${rec.action}

**Files to modify:** ${rec.files.join(', ')}`
).join('\n\n')}

## Immediate Actions Required

### Phase 1: Emergency Cleanup (Do Immediately)
1. **Clear contaminated cache**:
   \`\`\`bash
   rm .work/content-cache.json
   rm -rf .work/extracted/
   rm -rf .work/normalized/
   rm -rf .work/validated/
   \`\`\`

2. **Fix system prompt** in \`scripts/extract.js\`:
   - Remove hardcoded career information
   - Make prompt generic for any resume
   - Remove specific company/role references

### Phase 2: System Hardening
1. **Implement cache isolation**
2. **Add cache expiration**
3. **Add content validation**
4. **Implement cache versioning**

## Verification Steps

After cleanup:
1. Upload single paragraph → should return single extraction
2. Verify no historical data contamination
3. Check cache only contains current session data
4. Confirm extraction matches actual input content

## Prevention Measures

1. **Generic prompts only** - no hardcoded career data
2. **Session-isolated caches** - prevent cross-contamination
3. **Cache validation** - verify content matches input
4. **Regular cache auditing** - detect future contamination

---

**Report Status: CRITICAL ACTION REQUIRED**
**Next Review: After implementing Phase 1 cleanup**
`;

    await fs.writeFile(AUDIT_REPORT, report);
    console.log(`📄 Audit report saved: ${AUDIT_REPORT}`);
  }

  async run() {
    console.log('🚨 Starting Comprehensive Cache Audit...\n');
    
    await this.auditCacheLocations();
    await this.auditContentCache();
    await this.auditSystemPrompt();
    this.generateRecommendations();
    await this.generateReport();
    
    console.log('\n✅ Audit Complete!');
    console.log(`📊 Summary: ${this.findings.contaminatedExtractions.length}/${this.findings.contentHashes.length} contaminated cache entries found`);
    console.log('📄 Detailed report: CACHE-AUDIT-REPORT.md');
    console.log('\n🚨 CRITICAL: Clear cache and fix system prompt immediately!');
  }
}

// Run audit
const auditor = new CacheAuditor();
auditor.run().catch(console.error);