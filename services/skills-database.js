import { supabase } from '../config/database.js';

/**
 * Database-based Skills Service
 * Uses the skills table as the single source of truth
 * Replaces file-based skills configuration
 */
class DatabaseSkillsService {
  constructor() {
    this.skillsCache = new Map(); // Cache for performance
    this.synonymsCache = new Map(); // Cache for aliases
    this.initialized = false;
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = 0;
  }

  async initialize() {
    if (this.initialized && (Date.now() - this.lastCacheUpdate) < this.cacheExpiry) {
      return;
    }
    
    try {
      console.log('🔄 Initializing database-based skills service...');
      await this.refreshSkillsCache();
      this.initialized = true;
      console.log(`✅ Skills service initialized with ${this.skillsCache.size} approved skills`);
    } catch (error) {
      console.error('❌ Failed to initialize skills service:', error);
      throw error;
    }
  }

  /**
   * Refresh skills cache from database
   */
  async refreshSkillsCache() {
    try {
      // Load all skills from database
      const { data: skills, error } = await supabase
        .from('skills')
        .select('id, name, category, aliases');
      
      if (error) throw error;

      // Clear and rebuild cache
      this.skillsCache.clear();
      this.synonymsCache.clear();

      for (const skill of skills || []) {
        // Main skill name cache
        this.skillsCache.set(skill.name.toLowerCase(), {
          id: skill.id,
          name: skill.name,
          category: skill.category,
          aliases: skill.aliases || []
        });

        // Build synonyms/aliases cache
        if (skill.aliases && Array.isArray(skill.aliases)) {
          for (const alias of skill.aliases) {
            if (alias && alias.trim()) {
              this.synonymsCache.set(alias.toLowerCase(), skill.name);
            }
          }
        }
      }

      this.lastCacheUpdate = Date.now();
      console.log(`📊 Skills cache updated: ${this.skillsCache.size} skills, ${this.synonymsCache.size} aliases`);
    } catch (error) {
      console.error('❌ Failed to refresh skills cache:', error);
      throw error;
    }
  }

  /**
   * Check if a skill exists in the approved skills table
   */
  async isApprovedSkill(skillName) {
    await this.initialize();
    
    const normalizedName = skillName.toLowerCase();
    
    // Check direct match
    if (this.skillsCache.has(normalizedName)) {
      return true;
    }
    
    // Check aliases
    if (this.synonymsCache.has(normalizedName)) {
      return true;
    }
    
    return false;
  }

  /**
   * Normalize skill name to approved form
   */
  async normalizeSkillName(skillName) {
    await this.initialize();
    
    const normalizedInput = skillName.toLowerCase();
    
    // Direct match
    if (this.skillsCache.has(normalizedInput)) {
      return this.skillsCache.get(normalizedInput).name;
    }
    
    // Alias match
    if (this.synonymsCache.has(normalizedInput)) {
      return this.synonymsCache.get(normalizedInput);
    }
    
    return null; // Not found
  }

  /**
   * Normalize array of skills against approved skills
   */
  async normalizeSkills(skills) {
    if (!Array.isArray(skills)) return [];
    
    await this.initialize();
    
    const normalizedSkills = [];
    const discoveredSkills = [];
    
    for (const skill of skills) {
      if (!skill || typeof skill !== 'string') continue;
      
      const trimmedSkill = skill.trim();
      if (!trimmedSkill) continue;
      
      const normalizedName = await this.normalizeSkillName(trimmedSkill);
      
      if (normalizedName) {
        // Skill is approved, use normalized form
        if (!normalizedSkills.includes(normalizedName)) {
          normalizedSkills.push(normalizedName);
        }
      } else {
        // New skill discovered, add to discovery list
        discoveredSkills.push(trimmedSkill);
        // Still include in output but mark for review
        if (!normalizedSkills.includes(trimmedSkill)) {
          normalizedSkills.push(trimmedSkill);
        }
      }
    }
    
    // Log discovered skills for review
    if (discoveredSkills.length > 0) {
      console.log(`🔍 Discovered ${discoveredSkills.length} new skills: ${discoveredSkills.join(', ')}`);
      await this.logDiscoveredSkills(discoveredSkills);
    }
    
    return normalizedSkills;
  }

  /**
   * Find similar approved skills
   */
  async findSimilarSkills(skillName) {
    await this.initialize();
    
    const inputLower = skillName.toLowerCase();
    const similar = [];
    
    for (const [skillKey, skillData] of this.skillsCache) {
      // Substring matching
      if (inputLower.includes(skillKey) || skillKey.includes(inputLower)) {
        similar.push({
          skill: skillData.name,
          type: 'substring',
          confidence: Math.max(inputLower.length, skillKey.length) / Math.min(inputLower.length, skillKey.length)
        });
      }
      
      // Word overlap matching
      const inputWords = inputLower.split(/[\s&-]+/);
      const skillWords = skillKey.split(/[\s&-]+/);
      const overlap = inputWords.filter(word => skillWords.includes(word));
      
      if (overlap.length > 0) {
        const confidence = overlap.length / Math.max(inputWords.length, skillWords.length);
        if (confidence >= 0.3) { // Minimum confidence threshold
          similar.push({
            skill: skillData.name,
            type: 'word_overlap',
            confidence: confidence
          });
        }
      }
    }
    
    // Sort by confidence and return top matches
    return similar
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  /**
   * Add new skill to database
   */
  async addSkill(skillName, category = 'Other', aliases = []) {
    try {
      const { data, error } = await supabase
        .from('skills')
        .insert({
          name: skillName,
          category: category,
          aliases: Array.isArray(aliases) ? aliases : []
        })
        .select('*')
        .single();
      
      if (error) throw error;
      
      // Update cache
      await this.refreshSkillsCache();
      
      console.log(`✅ Added new skill: "${skillName}" (${category})`);
      return data;
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        console.log(`⏭️  Skill "${skillName}" already exists`);
        return null;
      }
      console.error(`❌ Failed to add skill "${skillName}":`, error);
      throw error;
    }
  }

  /**
   * Bulk add skills from discovered list
   */
  async addDiscoveredSkills(discoveredSkills, category = 'Other') {
    const results = { added: [], skipped: [], failed: [] };
    
    for (const skillName of discoveredSkills) {
      try {
        const result = await this.addSkill(skillName, category);
        if (result) {
          results.added.push(skillName);
        } else {
          results.skipped.push(skillName);
        }
      } catch (error) {
        results.failed.push({ skill: skillName, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Get skills by category
   */
  async getSkillsByCategory(category = null) {
    await this.initialize();
    
    const skillsByCategory = {};
    
    for (const skillData of this.skillsCache.values()) {
      const cat = skillData.category || 'Other';
      if (!skillsByCategory[cat]) {
        skillsByCategory[cat] = [];
      }
      skillsByCategory[cat].push(skillData.name);
    }
    
    if (category) {
      return skillsByCategory[category] || [];
    }
    
    return skillsByCategory;
  }

  /**
   * Log discovered skills for later review (temporary until approval workflow)
   */
  async logDiscoveredSkills(skills) {
    try {
      // For now, just log to console. Could extend to database logging table later
      const timestamp = new Date().toISOString();
      console.log(`📝 [${timestamp}] Discovered skills logged:`, skills);
      
      // TODO: Could add to a discovered_skills table for approval workflow
    } catch (error) {
      console.warn('⚠️ Failed to log discovered skills:', error);
    }
  }

  /**
   * Get approved skills suggestions for a partial match
   */
  async getSkillSuggestions(partial, limit = 10) {
    await this.initialize();
    
    const partialLower = partial.toLowerCase();
    const suggestions = [];
    
    for (const skillData of this.skillsCache.values()) {
      if (skillData.name.toLowerCase().includes(partialLower)) {
        suggestions.push({
          name: skillData.name,
          category: skillData.category,
          match: 'name'
        });
      }
      
      // Check aliases too
      for (const alias of skillData.aliases || []) {
        if (alias.toLowerCase().includes(partialLower)) {
          suggestions.push({
            name: skillData.name,
            category: skillData.category,
            match: 'alias',
            matchedAlias: alias
          });
        }
      }
    }
    
    return suggestions.slice(0, limit);
  }

  /**
   * Validate skills array against approved skills
   */
  async validateSkills(skills) {
    if (!Array.isArray(skills)) return { valid: [], invalid: [], suggestions: [] };
    
    await this.initialize();
    
    const valid = [];
    const invalid = [];
    const suggestions = [];
    
    for (const skill of skills) {
      const normalizedName = await this.normalizeSkillName(skill);
      
      if (normalizedName) {
        valid.push(normalizedName);
      } else {
        invalid.push(skill);
        const similar = await this.findSimilarSkills(skill);
        if (similar.length > 0) {
          suggestions.push({
            original: skill,
            suggestions: similar.slice(0, 3)
          });
        }
      }
    }
    
    return { valid, invalid, suggestions };
  }

  /**
   * Get skills statistics
   */
  async getSkillsStats() {
    await this.initialize();
    
    const stats = {
      totalSkills: this.skillsCache.size,
      totalAliases: this.synonymsCache.size,
      byCategory: {}
    };
    
    for (const skillData of this.skillsCache.values()) {
      const category = skillData.category || 'Other';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    }
    
    return stats;
  }
}

export default DatabaseSkillsService;