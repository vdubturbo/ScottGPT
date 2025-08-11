import fs from 'fs/promises';
import path from 'path';

const SKILLS_CONFIG_PATH = 'config/skills.json';
const DISCOVERED_SKILLS_PATH = 'logs/discovered-skills.json';

class SkillDiscoveryService {
  constructor() {
    this.controlledVocabulary = new Set();
    this.synonyms = {};
    this.discoveredSkills = [];
    this.commonSkillPatterns = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Load existing configuration with fallback
      let config;
      try {
        config = JSON.parse(await fs.readFile(SKILLS_CONFIG_PATH, 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn('⚠️ skills.json not found, creating default configuration');
          config = {
            controlled_vocabulary: {
              technical: [],
              business: [],
              leadership: []
            },
            synonyms: {}
          };
          await fs.mkdir('config', { recursive: true });
          await fs.writeFile(SKILLS_CONFIG_PATH, JSON.stringify(config, null, 2));
        } else {
          throw error;
        }
      }
      
      // Handle controlled_vocabulary as either object with categories or flat array
      let allSkills = [];
      if (config.controlled_vocabulary) {
        if (Array.isArray(config.controlled_vocabulary)) {
          allSkills = config.controlled_vocabulary;
        } else if (typeof config.controlled_vocabulary === 'object') {
          // Flatten categorized skills
          allSkills = Object.values(config.controlled_vocabulary).flat();
        }
      }
      this.controlledVocabulary = new Set(allSkills);
      this.synonyms = config.synonyms || {};
      
      // Load discovered skills if they exist
      try {
        const discovered = JSON.parse(await fs.readFile(DISCOVERED_SKILLS_PATH, 'utf8'));
        this.discoveredSkills = discovered.skills || [];
      } catch (error) {
        this.discoveredSkills = [];
      }
      
      // Initialize common patterns for skill categorization
      this.initializeSkillPatterns();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize skill discovery service:', error);
      throw error;
    }
  }

  initializeSkillPatterns() {
    this.commonSkillPatterns = new Map([
      // Management & Leadership
      ['management', { category: 'Leadership', priority: 'high', examples: ['Project Management', 'Risk Management', 'Change Management'] }],
      ['leadership', { category: 'Leadership', priority: 'high', examples: ['Technical Leadership', 'Team Leadership'] }],
      
      // Security & Compliance
      ['security', { category: 'Security', priority: 'high', examples: ['Cybersecurity', 'Cloud Security', 'Network Security'] }],
      ['compliance', { category: 'Compliance', priority: 'high', examples: ['Regulatory Compliance', 'Risk & Compliance'] }],
      ['risk', { category: 'Risk Management', priority: 'high', examples: ['Risk Assessment', 'Risk Mitigation'] }],
      
      // Technology
      ['cloud', { category: 'Technology', priority: 'medium', examples: ['Cloud Architecture', 'Cloud Security', 'Multi-Cloud'] }],
      ['agile', { category: 'Methodology', priority: 'medium', examples: ['Agile Development', 'Agile Coaching'] }],
      ['ai', { category: 'Technology', priority: 'high', examples: ['AI/ML', 'AI Strategy', 'AI Ethics'] }],
      ['data', { category: 'Technology', priority: 'medium', examples: ['Data Analytics', 'Data Governance'] }],
      
      // Business
      ['strategy', { category: 'Strategy', priority: 'high', examples: ['Business Strategy', 'Product Strategy'] }],
      ['process', { category: 'Operations', priority: 'medium', examples: ['Process Improvement', 'Process Optimization'] }],
      ['transformation', { category: 'Strategy', priority: 'high', examples: ['Digital Transformation', 'Business Transformation'] }]
    ]);
  }

  /**
   * Check if a skill is already approved
   */
  isApprovedSkill(skill) {
    return this.controlledVocabulary.has(skill);
  }

  /**
   * Find similar skills using fuzzy matching
   */
  findSimilarSkills(skill) {
    const skillLower = skill.toLowerCase();
    const similar = [];
    
    for (const approved of this.controlledVocabulary) {
      const approvedLower = approved.toLowerCase();
      
      // Check for substring matches
      if (skillLower.includes(approvedLower) || approvedLower.includes(skillLower)) {
        similar.push({ skill: approved, type: 'substring', confidence: 0.8 });
      }
      
      // Check for word overlap
      const skillWords = skillLower.split(/[\s&-]+/);
      const approvedWords = approvedLower.split(/[\s&-]+/);
      const overlap = skillWords.filter(word => approvedWords.includes(word));
      
      if (overlap.length > 0 && overlap.length >= Math.min(skillWords.length, approvedWords.length) * 0.5) {
        similar.push({ skill: approved, type: 'word_overlap', confidence: overlap.length / Math.max(skillWords.length, approvedWords.length) });
      }
    }
    
    return similar.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  /**
   * Categorize a skill based on patterns
   */
  categorizeSkill(skill) {
    const skillLower = skill.toLowerCase();
    
    for (const [pattern, info] of this.commonSkillPatterns) {
      if (skillLower.includes(pattern)) {
        return info;
      }
    }
    
    return { category: 'Other', priority: 'low', examples: [] };
  }

  /**
   * Discover and log a new skill
   */
  async discoverSkill(skill, context = {}) {
    if (!this.initialized) await this.initialize();
    
    if (this.isApprovedSkill(skill)) {
      return { status: 'approved', skill };
    }

    // Check if already discovered
    const existing = this.discoveredSkills.find(d => d.skill === skill);
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date().toISOString();
      existing.contexts.push({
        file: context.file,
        content: context.content?.substring(0, 100) + '...'
      });
      await this.saveDiscoveredSkills();
      return { status: 'existing_discovery', skill, occurrences: existing.occurrences };
    }

    // New skill discovery
    const similar = this.findSimilarSkills(skill);
    const category = this.categorizeSkill(skill);
    
    const discoveredSkill = {
      skill,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      occurrences: 1,
      category: category.category,
      priority: category.priority,
      similar: similar,
      contexts: [{
        file: context.file,
        content: context.content?.substring(0, 100) + '...'
      }],
      suggestions: this.generateSkillSuggestions(skill, category)
    };

    this.discoveredSkills.push(discoveredSkill);
    await this.saveDiscoveredSkills();
    
    console.log(`🔍 New skill discovered: "${skill}" (${category.category}, ${category.priority} priority)`);
    if (similar.length > 0) {
      console.log(`   Similar existing skills: ${similar.map(s => s.skill).join(', ')}`);
    }
    
    return { status: 'new_discovery', skill, category: category.category, similar };
  }

  /**
   * Generate suggestions for skill normalization
   */
  generateSkillSuggestions(skill, category) {
    const suggestions = [];
    
    // Suggest using existing similar skills
    const similar = this.findSimilarSkills(skill);
    if (similar.length > 0) {
      suggestions.push({
        type: 'merge',
        suggestion: `Consider using existing skill: "${similar[0].skill}"`,
        action: 'replace',
        target: similar[0].skill
      });
    }
    
    // Suggest standardization based on category
    if (category.examples.length > 0) {
      const bestMatch = category.examples.find(example => 
        skill.toLowerCase().includes(example.toLowerCase()) || 
        example.toLowerCase().includes(skill.toLowerCase())
      );
      
      if (bestMatch) {
        suggestions.push({
          type: 'standardize',
          suggestion: `Consider standardizing as: "${bestMatch}"`,
          action: 'replace',
          target: bestMatch
        });
      }
    }
    
    // Suggest adding as-is for high priority skills
    if (category.priority === 'high') {
      suggestions.push({
        type: 'add',
        suggestion: 'High priority skill - recommend adding to vocabulary',
        action: 'approve',
        target: skill
      });
    }
    
    return suggestions;
  }

  /**
   * Get discovered skills grouped by category and priority
   */
  getDiscoveredSkillsReport() {
    if (this.discoveredSkills.length === 0) {
      return '✅ No new skills discovered.';
    }

    // Group by category and priority
    const grouped = this.discoveredSkills.reduce((acc, skill) => {
      const key = `${skill.category}-${skill.priority}`;
      if (!acc[key]) {
        acc[key] = { category: skill.category, priority: skill.priority, skills: [] };
      }
      acc[key].skills.push(skill);
      return acc;
    }, {});

    // Sort groups by priority
    const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
    const sortedGroups = Object.values(grouped).sort((a, b) => 
      priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    let report = `\n📊 DISCOVERED SKILLS REPORT (${this.discoveredSkills.length} skills)\n`;
    report += '=' + '='.repeat(60) + '\n\n';

    sortedGroups.forEach(group => {
      report += `🔸 ${group.category.toUpperCase()} (${group.priority} priority)\n`;
      report += '-'.repeat(40) + '\n';
      
      // Sort skills by occurrence count
      const sortedSkills = group.skills.sort((a, b) => b.occurrences - a.occurrences);
      
      sortedSkills.forEach(skill => {
        report += `  • "${skill.skill}" (${skill.occurrences}x)\n`;
        
        if (skill.similar.length > 0) {
          report += `    Similar: ${skill.similar.slice(0, 2).map(s => s.skill).join(', ')}\n`;
        }
        
        if (skill.suggestions.length > 0) {
          const topSuggestion = skill.suggestions[0];
          report += `    💡 ${topSuggestion.suggestion}\n`;
        }
      });
      report += '\n';
    });

    report += '🔧 BULK ACTIONS:\n';
    report += '  npm run skills:approve-high     # Approve all high priority skills\n';
    report += '  npm run skills:approve-category -- "Security"  # Approve by category\n';
    report += '  npm run skills:interactive      # Interactive approval process\n';
    
    return report;
  }

  /**
   * Approve skills by criteria
   */
  async approveSkills(criteria = {}) {
    const { priority, category, skills: specificSkills } = criteria;
    const approved = [];
    
    for (let i = this.discoveredSkills.length - 1; i >= 0; i--) {
      const discovered = this.discoveredSkills[i];
      let shouldApprove = false;
      
      if (specificSkills && specificSkills.includes(discovered.skill)) {
        shouldApprove = true;
      } else if (priority && discovered.priority === priority) {
        shouldApprove = true;
      } else if (category && discovered.category === category) {
        shouldApprove = true;
      }
      
      if (shouldApprove) {
        this.controlledVocabulary.add(discovered.skill);
        approved.push(discovered.skill);
        this.discoveredSkills.splice(i, 1);
        console.log(`✅ Approved skill: "${discovered.skill}"`);
      }
    }
    
    if (approved.length > 0) {
      await this.saveControlledVocabulary();
      await this.saveDiscoveredSkills();
      console.log(`🎉 Approved ${approved.length} skills: ${approved.join(', ')}`);
    }
    
    return approved;
  }

  /**
   * Save discovered skills to file
   */
  async saveDiscoveredSkills() {
    const data = {
      skills: this.discoveredSkills,
      lastUpdated: new Date().toISOString(),
      summary: {
        total: this.discoveredSkills.length,
        byPriority: this.discoveredSkills.reduce((acc, skill) => {
          acc[skill.priority] = (acc[skill.priority] || 0) + 1;
          return acc;
        }, {}),
        byCategory: this.discoveredSkills.reduce((acc, skill) => {
          acc[skill.category] = (acc[skill.category] || 0) + 1;
          return acc;
        }, {})
      }
    };
    
    await fs.writeFile(DISCOVERED_SKILLS_PATH, JSON.stringify(data, null, 2));
  }

  /**
   * Save updated controlled vocabulary
   */
  async saveControlledVocabulary() {
    const config = {
      controlled_vocabulary: Array.from(this.controlledVocabulary).sort(),
      synonyms: this.synonyms
    };
    
    await fs.writeFile(SKILLS_CONFIG_PATH, JSON.stringify(config, null, 2));
  }
}

export default SkillDiscoveryService;