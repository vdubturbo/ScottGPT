import fs from 'fs/promises';
import path from 'path';

const TAGS_CONFIG_PATH = 'config/tags.json';
const PENDING_TAGS_PATH = 'logs/pending-tags.json';

class TagManager {
  constructor() {
    this.controlledVocabulary = [];
    this.synonyms = {};
    this.pendingTags = [];
  }

  async loadConfiguration() {
    try {
      const config = JSON.parse(await fs.readFile(TAGS_CONFIG_PATH, 'utf8'));
      this.controlledVocabulary = config.controlled_vocabulary || [];
      this.synonyms = config.synonyms || {};
      
      // Load pending tags if they exist
      try {
        const pending = JSON.parse(await fs.readFile(PENDING_TAGS_PATH, 'utf8'));
        this.pendingTags = pending.tags || [];
      } catch (error) {
        // File doesn't exist, start with empty pending list
        this.pendingTags = [];
      }
    } catch (error) {
      console.error('Failed to load tag configuration:', error.message);
      throw error;
    }
  }

  /**
   * Check if a tag is in the controlled vocabulary
   * @param {string} tag - Tag to check
   * @returns {boolean} - True if tag is approved
   */
  isApprovedTag(tag) {
    return this.controlledVocabulary.includes(tag);
  }

  /**
   * Check if a tag is already pending approval
   * @param {string} tag - Tag to check
   * @returns {boolean} - True if tag is already pending
   */
  isPendingTag(tag) {
    return this.pendingTags.some(pending => pending.tag === tag);
  }

  /**
   * Add a new tag to the pending approval list
   * @param {string} tag - Tag to add
   * @param {Object} context - Context where tag was found
   */
  async addPendingTag(tag, context = {}) {
    if (this.isApprovedTag(tag) || this.isPendingTag(tag)) {
      return; // Already approved or pending
    }

    const pendingTag = {
      tag: tag,
      firstSeen: new Date().toISOString(),
      context: {
        file: context.file || 'unknown',
        content: context.content ? context.content.substring(0, 200) + '...' : '',
        ...context
      },
      occurrences: 1
    };

    this.pendingTags.push(pendingTag);
    await this.savePendingTags();
    
    console.log(`🏷️  New tag discovered: "${tag}" (added to pending approval)`);
  }

  /**
   * Increment occurrence count for a pending tag
   * @param {string} tag - Tag name
   * @param {Object} context - Additional context
   */
  async incrementTagOccurrence(tag, context = {}) {
    const pendingTag = this.pendingTags.find(p => p.tag === tag);
    if (pendingTag) {
      pendingTag.occurrences++;
      pendingTag.lastSeen = new Date().toISOString();
      if (context.file) {
        pendingTag.context.additionalFiles = pendingTag.context.additionalFiles || [];
        if (!pendingTag.context.additionalFiles.includes(context.file)) {
          pendingTag.context.additionalFiles.push(context.file);
        }
      }
      await this.savePendingTags();
    }
  }

  /**
   * Process a tag - either approve it or add to pending
   * @param {string} tag - Tag to process
   * @param {Object} context - Context information
   */
  async processTag(tag, context = {}) {
    if (this.isApprovedTag(tag)) {
      return 'approved';
    }

    if (this.isPendingTag(tag)) {
      await this.incrementTagOccurrence(tag, context);
      return 'pending';
    }

    await this.addPendingTag(tag, context);
    return 'new-pending';
  }

  /**
   * Save pending tags to file
   */
  async savePendingTags() {
    const data = {
      tags: this.pendingTags,
      lastUpdated: new Date().toISOString()
    };
    
    await fs.writeFile(PENDING_TAGS_PATH, JSON.stringify(data, null, 2));
  }

  /**
   * Approve pending tags and add them to controlled vocabulary
   * @param {Array<string>} tagsToApprove - Array of tag names to approve
   */
  async approveTags(tagsToApprove) {
    const approved = [];
    
    for (const tagName of tagsToApprove) {
      const pendingIndex = this.pendingTags.findIndex(p => p.tag === tagName);
      if (pendingIndex !== -1) {
        const pendingTag = this.pendingTags[pendingIndex];
        
        // Add to controlled vocabulary
        this.controlledVocabulary.push(pendingTag.tag);
        
        // Remove from pending
        this.pendingTags.splice(pendingIndex, 1);
        
        approved.push(pendingTag.tag);
        console.log(`✅ Approved tag: "${pendingTag.tag}"`);
      }
    }

    if (approved.length > 0) {
      // Save updated configuration
      await this.saveConfiguration();
      await this.savePendingTags();
      
      console.log(`🎉 Successfully approved ${approved.length} tags: ${approved.join(', ')}`);
    }

    return approved;
  }

  /**
   * Reject pending tags
   * @param {Array<string>} tagsToReject - Array of tag names to reject
   */
  async rejectTags(tagsToReject) {
    const rejected = [];
    
    for (const tagName of tagsToReject) {
      const pendingIndex = this.pendingTags.findIndex(p => p.tag === tagName);
      if (pendingIndex !== -1) {
        const pendingTag = this.pendingTags[pendingIndex];
        this.pendingTags.splice(pendingIndex, 1);
        rejected.push(pendingTag.tag);
        console.log(`❌ Rejected tag: "${pendingTag.tag}"`);
      }
    }

    if (rejected.length > 0) {
      await this.savePendingTags();
      console.log(`🗑️  Rejected ${rejected.length} tags: ${rejected.join(', ')}`);
    }

    return rejected;
  }

  /**
   * Save the current configuration back to file
   */
  async saveConfiguration() {
    const config = {
      controlled_vocabulary: this.controlledVocabulary.sort(),
      synonyms: this.synonyms
    };
    
    await fs.writeFile(TAGS_CONFIG_PATH, JSON.stringify(config, null, 2));
  }

  /**
   * Get pending tags sorted by occurrence count
   * @returns {Array} - Sorted pending tags
   */
  getPendingTags() {
    return [...this.pendingTags].sort((a, b) => b.occurrences - a.occurrences);
  }

  /**
   * Generate a report of pending tags
   */
  generatePendingTagsReport() {
    if (this.pendingTags.length === 0) {
      return '✅ No pending tags waiting for approval.';
    }

    let report = `\n📋 PENDING TAGS REPORT (${this.pendingTags.length} tags)\n`;
    report += '=' + '='.repeat(50) + '\n\n';

    const sortedTags = this.getPendingTags();
    
    sortedTags.forEach((pending, index) => {
      report += `${index + 1}. "${pending.tag}"\n`;
      report += `   Occurrences: ${pending.occurrences}\n`;
      report += `   First seen: ${pending.firstSeen.split('T')[0]}\n`;
      report += `   Context file: ${pending.context.file}\n`;
      if (pending.context.additionalFiles) {
        report += `   Also found in: ${pending.context.additionalFiles.join(', ')}\n`;
      }
      report += `   Sample context: ${pending.context.content}\n\n`;
    });

    report += '\n🔧 To approve tags, run:\n';
    report += '   npm run tags:approve -- "Tag Name 1" "Tag Name 2"\n\n';
    report += '🗑️  To reject tags, run:\n';
    report += '   npm run tags:reject -- "Tag Name 1" "Tag Name 2"\n';

    return report;
  }
}

// CLI functionality
async function main() {
  const tagManager = new TagManager();
  await tagManager.loadConfiguration();

  const command = process.argv[2];
  const tags = process.argv.slice(3);

  switch (command) {
    case 'report':
      console.log(tagManager.generatePendingTagsReport());
      break;
      
    case 'approve':
      if (tags.length === 0) {
        console.error('❌ Please specify tags to approve');
        process.exit(1);
      }
      await tagManager.approveTags(tags);
      break;
      
    case 'reject':
      if (tags.length === 0) {
        console.error('❌ Please specify tags to reject');
        process.exit(1);
      }
      await tagManager.rejectTags(tags);
      break;
      
    default:
      console.log('📋 Tag Manager Commands:');
      console.log('  report  - Show pending tags report');
      console.log('  approve - Approve pending tags');
      console.log('  reject  - Reject pending tags');
      break;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default TagManager;