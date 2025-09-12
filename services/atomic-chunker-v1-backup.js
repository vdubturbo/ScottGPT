import { TokenBudget } from '../utils/token-budget.js';
import crypto from 'crypto';

export class AtomicChunker {
  constructor() {
    this.tokenBudget = new TokenBudget();
    this.deduplicationCache = new Set();
  }

  async createAtomicChunks(yamlData, descriptiveContent) {
    const chunks = [];
    const metadata = this.extractMetadata(yamlData);
    
    const achievements = this.extractAchievements(yamlData, descriptiveContent);
    for (const achievement of achievements) {
      const chunk = this.createAchievementChunk(achievement, metadata);
      if (this.isDuplicate(chunk.content)) continue;
      chunks.push(chunk);
    }
    
    const skills = this.extractSkillEvidence(yamlData, descriptiveContent);
    for (const skillEvidence of skills) {
      const chunk = this.createSkillChunk(skillEvidence, metadata);
      if (this.isDuplicate(chunk.content)) continue;
      chunks.push(chunk);
    }
    
    const responsibilities = this.extractResponsibilities(yamlData, descriptiveContent);
    for (const responsibility of responsibilities) {
      const chunk = this.createResponsibilityChunk(responsibility, metadata);
      if (this.isDuplicate(chunk.content)) continue;
      chunks.push(chunk);
    }
    
    const contextChunk = this.createContextChunk(yamlData, descriptiveContent, metadata);
    if (contextChunk && !this.isDuplicate(contextChunk.content)) {
      chunks.push(contextChunk);
    }
    
    return chunks.filter(chunk => chunk && chunk.content);
  }

  extractMetadata(yamlData) {
    return {
      title: yamlData.title || null,
      role: yamlData.title || null,
      organization: yamlData.org || null,
      start_date: this.normalizeDate(yamlData.date_start),
      end_date: this.normalizeDate(yamlData.date_end),
      domain: yamlData.industry_tags || [],
      skills: yamlData.skills || [],
      achievements: yamlData.outcomes || []
    };
  }

  extractAchievements(yamlData, descriptiveContent) {
    const achievements = [];
    
    if (yamlData.outcomes && Array.isArray(yamlData.outcomes)) {
      achievements.push(...yamlData.outcomes);
    }
    
    const achievementPattern = /[•\-\*]\s*(Reduced|Increased|Led|Built|Delivered|Achieved|Improved|Saved|Generated|Launched|Implemented|Optimized|Created|Designed|Developed|Managed).*?(\d+[%\$KMB]|\d+\s*(days?|months?|hours?|weeks?))/gi;
    const matches = descriptiveContent?.match(achievementPattern) || [];
    
    for (const match of matches) {
      const cleaned = match.replace(/^[•\-\*]\s*/, '').trim();
      if (!achievements.includes(cleaned)) {
        achievements.push(cleaned);
      }
    }
    
    return achievements.slice(0, 10);
  }

  extractSkillEvidence(yamlData, descriptiveContent) {
    const skillEvidence = [];
    const skills = yamlData.skills || [];
    
    for (const skill of skills.slice(0, 8)) {
      const evidencePattern = new RegExp(`[^.]*\\b${skill}\\b[^.]*\\.`, 'gi');
      const matches = descriptiveContent?.match(evidencePattern) || [];
      
      if (matches.length > 0) {
        skillEvidence.push({
          skill,
          evidence: matches[0].trim()
        });
      } else {
        const context = this.findSkillContext(skill, yamlData);
        if (context) {
          skillEvidence.push({
            skill,
            evidence: context
          });
        }
      }
    }
    
    return skillEvidence;
  }

  findSkillContext(skill, yamlData) {
    const techMap = {
      'Python': 'Automated processes and data analysis',
      'JavaScript': 'Built web applications and interactive features',
      'React': 'Developed modern frontend user interfaces',
      'Node.js': 'Implemented backend services and APIs',
      'AWS': 'Deployed cloud infrastructure and services',
      'Docker': 'Containerized applications for deployment',
      'Kubernetes': 'Orchestrated container deployments at scale',
      'SQL': 'Designed and optimized database queries',
      'Git': 'Managed code versioning and collaboration',
      'Jenkins': 'Built CI/CD pipelines for automated deployment',
      'Terraform': 'Managed infrastructure as code',
      'GraphQL': 'Implemented efficient data fetching APIs'
    };
    
    const baseContext = techMap[skill] || `Applied ${skill} expertise`;
    return `${baseContext} at ${yamlData.org || 'organization'}`;
  }

  extractResponsibilities(yamlData, descriptiveContent) {
    const responsibilities = [];
    
    const respPattern = /[•\-\*]\s*(?!Reduced|Increased|Led|Built|Delivered|Achieved|Improved|Saved|Generated)([A-Z][^.!?]*[.!?])/g;
    const matches = descriptiveContent?.match(respPattern) || [];
    
    for (const match of matches.slice(0, 5)) {
      const cleaned = match.replace(/^[•\-\*]\s*/, '').trim();
      if (cleaned.length > 30 && cleaned.length < 200) {
        responsibilities.push(cleaned);
      }
    }
    
    if (responsibilities.length === 0 && yamlData.summary) {
      const summary = yamlData.summary.slice(0, 150);
      responsibilities.push(summary);
    }
    
    return responsibilities;
  }

  createAchievementChunk(achievement, metadata) {
    const content = `• ${achievement}`;
    const { text, tokenCount } = this.tokenBudget.enforceHardCap(content);
    
    return {
      content: text,
      content_summary: achievement.slice(0, 100),
      metadata: {
        ...metadata,
        chunk_type: 'achievement',
        evidence_strength: this.calculateEvidenceStrength(achievement)
      },
      title: metadata.title,
      role: metadata.role,
      organization: metadata.organization,
      start_date: metadata.start_date,
      end_date: metadata.end_date,
      domain: metadata.domain,
      skills: this.extractRelevantSkills(achievement, metadata.skills),
      achievements: [achievement],
      token_count: tokenCount
    };
  }

  createSkillChunk(skillEvidence, metadata) {
    const content = skillEvidence.evidence;
    const { text, tokenCount } = this.tokenBudget.enforceHardCap(content);
    
    return {
      content: text,
      content_summary: `${skillEvidence.skill} application`,
      metadata: {
        ...metadata,
        chunk_type: 'skill_evidence',
        primary_skill: skillEvidence.skill
      },
      title: metadata.title,
      role: metadata.role,
      organization: metadata.organization,
      start_date: metadata.start_date,
      end_date: metadata.end_date,
      domain: metadata.domain,
      skills: [skillEvidence.skill],
      achievements: [],
      token_count: tokenCount
    };
  }

  createResponsibilityChunk(responsibility, metadata) {
    const content = responsibility;
    const { text, tokenCount } = this.tokenBudget.enforceHardCap(content);
    
    return {
      content: text,
      content_summary: responsibility.slice(0, 100),
      metadata: {
        ...metadata,
        chunk_type: 'responsibility'
      },
      title: metadata.title,
      role: metadata.role,
      organization: metadata.organization,
      start_date: metadata.start_date,
      end_date: metadata.end_date,
      domain: metadata.domain,
      skills: this.extractRelevantSkills(responsibility, metadata.skills),
      achievements: [],
      token_count: tokenCount
    };
  }

  createContextChunk(yamlData, descriptiveContent, metadata) {
    const contextParts = [];
    
    if (yamlData.title && yamlData.org) {
      contextParts.push(`${yamlData.title} at ${yamlData.org}`);
    }
    
    const programPattern = /(OLDP|rotation|program|initiative|fellowship|internship)/i;
    const programMatch = descriptiveContent?.match(programPattern);
    if (programMatch) {
      const programContext = descriptiveContent.match(new RegExp(`[^.]*${programMatch[0]}[^.]*\\.`, 'i'));
      if (programContext) {
        contextParts.push(programContext[0].trim());
      }
    }
    
    if (contextParts.length === 0) return null;
    
    const content = contextParts.join('. ');
    const { text, tokenCount } = this.tokenBudget.enforceHardCap(content);
    
    return {
      content: text,
      content_summary: `Role context: ${yamlData.title}`,
      metadata: {
        ...metadata,
        chunk_type: 'context'
      },
      title: metadata.title,
      role: metadata.role,
      organization: metadata.organization,
      start_date: metadata.start_date,
      end_date: metadata.end_date,
      domain: metadata.domain,
      skills: [],
      achievements: [],
      token_count: tokenCount
    };
  }

  calculateEvidenceStrength(text) {
    let strength = 0.5;
    
    if (/\d+[%\$KMB]/.test(text)) strength += 0.3;
    if (/\d+\s*(days?|months?|hours?|weeks?)/.test(text)) strength += 0.2;
    if (/(reduced|increased|improved|optimized)/i.test(text)) strength += 0.1;
    if (text.split(' ').length > 10) strength += 0.1;
    
    return Math.min(1.0, strength);
  }

  extractRelevantSkills(text, availableSkills) {
    const foundSkills = [];
    
    for (const skill of availableSkills) {
      const pattern = new RegExp(`\\b${skill}\\b`, 'i');
      if (pattern.test(text)) {
        foundSkills.push(skill);
      }
    }
    
    return foundSkills.slice(0, 3);
  }

  isDuplicate(content) {
    const contentHash = crypto.createHash('md5').update(content).digest('hex');
    
    if (this.deduplicationCache.has(contentHash)) {
      return true;
    }
    
    this.deduplicationCache.add(contentHash);
    return false;
  }

  normalizeDate(date) {
    if (!date) return null;
    
    const dateStr = String(date).toLowerCase().trim();
    if (['present', 'current', 'now'].includes(dateStr)) return null;
    
    if (/^\d{4}$/.test(dateStr)) {
      return `${dateStr}-01-01`;
    }
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    return null;
  }

  getMetrics() {
    return {
      ...this.tokenBudget.getMetrics(),
      deduplicationRate: this.deduplicationCache.size > 0 
        ? (this.deduplicationCache.size / (this.deduplicationCache.size + this.tokenBudget.metrics.totalChunks))
        : 0
    };
  }

  reset() {
    this.tokenBudget.reset();
    this.deduplicationCache.clear();
  }
}

export default AtomicChunker;