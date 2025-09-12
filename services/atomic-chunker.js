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
    
    // Create fewer, richer chunks with full context
    const contextualChunks = this.createContextualEvidenceChunks(yamlData, descriptiveContent, metadata);
    
    for (const chunk of contextualChunks) {
      if (this.isDuplicate(chunk.content)) continue;
      chunks.push(chunk);
    }
    
    return chunks.filter(chunk => chunk && chunk.content);
  }

  createContextualEvidenceChunks(yamlData, descriptiveContent, metadata) {
    const chunks = [];
    const jobContext = this.buildJobContext(yamlData);
    
    // 1. Create rich achievement chunks (with full context)
    const achievements = this.extractAchievements(yamlData, descriptiveContent);
    for (const achievement of achievements.slice(0, 5)) { // Limit to top 5
      const chunk = this.createRichAchievementChunk(achievement, jobContext, metadata);
      if (chunk) chunks.push(chunk);
    }
    
    // 2. Create contextual skill chunks (fewer, but richer)
    const skillGroups = this.groupSkillsByContext(yamlData, descriptiveContent);
    for (const skillGroup of skillGroups.slice(0, 3)) { // Max 3 skill contexts
      const chunk = this.createContextualSkillChunk(skillGroup, jobContext, metadata);
      if (chunk) chunks.push(chunk);
    }
    
    // 3. Create comprehensive role overview chunk
    const overviewChunk = this.createRoleOverviewChunk(yamlData, descriptiveContent, metadata);
    if (overviewChunk) chunks.push(overviewChunk);
    
    // 4. Create domain/industry expertise chunk if relevant
    const domainChunk = this.createDomainExpertiseChunk(yamlData, descriptiveContent, metadata);
    if (domainChunk) chunks.push(domainChunk);
    
    return chunks;
  }

  buildJobContext(yamlData) {
    const parts = [];
    
    if (yamlData.title) parts.push(yamlData.title);
    if (yamlData.org) parts.push(`at ${yamlData.org}`);
    
    const dateRange = this.buildDateRange(yamlData.date_start, yamlData.date_end);
    if (dateRange) parts.push(`(${dateRange})`);
    
    return parts.join(' ');
  }

  buildDateRange(startDate, endDate) {
    if (!startDate && !endDate) return '';
    
    const start = startDate ? new Date(startDate).getFullYear() : 'Unknown';
    const end = endDate && endDate !== 'Present' ? new Date(endDate).getFullYear() : 'Present';
    
    return start === end ? start : `${start}-${end}`;
  }

  createRichAchievementChunk(achievement, jobContext, metadata) {
    // Build contextual achievement: Context + Achievement + Impact + Skills + Business Context
    let content = `${jobContext}: ${achievement}`;
    
    // Add relevant skills if they're mentioned in the achievement
    const relevantSkills = this.extractSkillsFromText(achievement, metadata.skills);
    if (relevantSkills.length > 0) {
      content += ` by leveraging ${relevantSkills.slice(0, 3).join(', ')} expertise`;
    }
    
    // Add more business context and impact
    const impactContext = this.generateImpactContext(achievement);
    if (impactContext) {
      content += `. ${impactContext}`;
    }
    
    // Add industry/domain context with more detail
    if (metadata.domain && metadata.domain.length > 0) {
      content += ` This work directly supported ${metadata.domain[0]} initiatives and business objectives`;
    }
    
    const { text, tokenCount } = this.tokenBudget.enforceHardCap(content);
    
    return {
      content: text,
      content_summary: achievement.slice(0, 100),
      metadata: {
        ...metadata,
        chunk_type: 'contextual_achievement',
        evidence_strength: this.calculateEvidenceStrength(achievement),
        primary_focus: 'achievement'
      },
      title: metadata.title,
      role: metadata.role,
      organization: metadata.organization,
      start_date: metadata.start_date,
      end_date: metadata.end_date,
      domain: metadata.domain,
      skills: relevantSkills,
      achievements: [achievement],
      token_count: tokenCount
    };
  }

  createContextualSkillChunk(skillGroup, jobContext, metadata) {
    // Build rich skill context: Role + Skills + Application + Results
    const skills = skillGroup.skills;
    const context = skillGroup.context;
    
    let content = `${jobContext}: `;
    
    if (skills.length === 1) {
      content += `Utilized ${skills[0]} for ${context}`;
    } else {
      content += `Applied ${skills.slice(0, -1).join(', ')} and ${skills[skills.length - 1]} technologies for ${context}`;
    }
    
    // Add specific examples if available
    if (skillGroup.examples && skillGroup.examples.length > 0) {
      content += `, including ${skillGroup.examples.slice(0, 2).join(' and ')}`;
    }
    
    const { text, tokenCount } = this.tokenBudget.enforceHardCap(content);
    
    return {
      content: text,
      content_summary: `${skills.join(', ')} expertise application`,
      metadata: {
        ...metadata,
        chunk_type: 'contextual_skills',
        primary_skills: skills,
        skill_context: context
      },
      title: metadata.title,
      role: metadata.role,
      organization: metadata.organization,
      start_date: metadata.start_date,
      end_date: metadata.end_date,
      domain: metadata.domain,
      skills: skills,
      achievements: [],
      token_count: tokenCount
    };
  }

  createRoleOverviewChunk(yamlData, descriptiveContent, metadata) {
    // Create comprehensive role description
    let content = `${this.buildJobContext(yamlData)}: `;
    
    // Add role summary if available
    if (yamlData.summary) {
      content += yamlData.summary;
    } else {
      content += `Professional role focused on ${metadata.skills.slice(0, 3).join(', ')} technologies`;
    }
    
    // Add key responsibilities context
    const keyResponsibilities = this.extractKeyResponsibilities(descriptiveContent);
    if (keyResponsibilities.length > 0) {
      content += `. Key responsibilities included ${keyResponsibilities.slice(0, 2).join(' and ')}`;
    }
    
    // Add team/scale context if mentioned
    const scaleContext = this.extractScaleContext(yamlData, descriptiveContent);
    if (scaleContext) {
      content += `. ${scaleContext}`;
    }
    
    const { text, tokenCount } = this.tokenBudget.enforceHardCap(content);
    
    return {
      content: text,
      content_summary: `Role overview: ${yamlData.title}`,
      metadata: {
        ...metadata,
        chunk_type: 'role_overview',
        comprehensive: true
      },
      title: metadata.title,
      role: metadata.role,
      organization: metadata.organization,
      start_date: metadata.start_date,
      end_date: metadata.end_date,
      domain: metadata.domain,
      skills: metadata.skills.slice(0, 8), // Include more skills for overview
      achievements: [],
      token_count: tokenCount
    };
  }

  createDomainExpertiseChunk(yamlData, descriptiveContent, metadata) {
    if (!metadata.domain || metadata.domain.length === 0) return null;
    
    const domain = metadata.domain[0];
    let content = `${this.buildJobContext(yamlData)}: `;
    
    content += `Developed expertise in ${domain} domain`;
    
    // Add specific domain applications
    const domainApplications = this.extractDomainApplications(descriptiveContent, domain);
    if (domainApplications.length > 0) {
      content += `, specifically ${domainApplications.slice(0, 2).join(' and ')}`;
    }
    
    // Add relevant skills for this domain
    const domainSkills = this.extractDomainRelevantSkills(metadata.skills, domain);
    if (domainSkills.length > 0) {
      content += ` using ${domainSkills.slice(0, 4).join(', ')} technologies`;
    }
    
    const { text, tokenCount } = this.tokenBudget.enforceHardCap(content);
    
    return {
      content: text,
      content_summary: `${domain} domain expertise`,
      metadata: {
        ...metadata,
        chunk_type: 'domain_expertise',
        primary_domain: domain
      },
      title: metadata.title,
      role: metadata.role,
      organization: metadata.organization,
      start_date: metadata.start_date,
      end_date: metadata.end_date,
      domain: metadata.domain,
      skills: domainSkills,
      achievements: [],
      token_count: tokenCount
    };
  }

  groupSkillsByContext(yamlData, descriptiveContent) {
    const skills = yamlData.skills || [];
    const skillGroups = [];
    
    // Group related skills with their context
    const techStacks = this.identifyTechStacks(skills);
    
    for (const stack of techStacks) {
      const context = this.findSkillContext(stack.skills, descriptiveContent);
      const examples = this.findSkillExamples(stack.skills, descriptiveContent);
      
      skillGroups.push({
        skills: stack.skills,
        context: context || stack.defaultContext,
        examples: examples,
        category: stack.category
      });
    }
    
    return skillGroups;
  }

  identifyTechStacks(skills) {
    const stacks = [];
    const used = new Set();
    
    // Frontend stack
    const frontend = skills.filter(s => ['React', 'JavaScript', 'TypeScript', 'Vue', 'Angular'].includes(s));
    if (frontend.length > 0) {
      stacks.push({
        skills: frontend,
        category: 'frontend',
        defaultContext: 'building modern web applications and user interfaces'
      });
      frontend.forEach(s => used.add(s));
    }
    
    // Backend stack
    const backend = skills.filter(s => ['Node.js', 'Python', 'Java', 'C#', 'Go', 'Scala'].includes(s));
    if (backend.length > 0) {
      stacks.push({
        skills: backend,
        category: 'backend',
        defaultContext: 'developing scalable backend services and APIs'
      });
      backend.forEach(s => used.add(s));
    }
    
    // Cloud/DevOps stack
    const cloud = skills.filter(s => ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform'].includes(s));
    if (cloud.length > 0) {
      stacks.push({
        skills: cloud,
        category: 'cloud',
        defaultContext: 'implementing cloud infrastructure and deployment automation'
      });
      cloud.forEach(s => used.add(s));
    }
    
    // Add remaining skills as individual contexts
    const remaining = skills.filter(s => !used.has(s));
    remaining.forEach(skill => {
      stacks.push({
        skills: [skill],
        category: 'specialized',
        defaultContext: `applying ${skill} expertise in professional projects`
      });
    });
    
    return stacks.slice(0, 3); // Limit to 3 main skill contexts
  }

  findSkillContext(skills, descriptiveContent) {
    if (!descriptiveContent) return null;
    
    // Look for sentences that mention these skills
    const sentences = descriptiveContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    for (const sentence of sentences) {
      const foundSkills = skills.filter(skill => 
        sentence.toLowerCase().includes(skill.toLowerCase())
      );
      
      if (foundSkills.length > 0) {
        // Extract the relevant part of the sentence
        const trimmed = sentence.trim();
        return trimmed.length > 100 ? trimmed.slice(0, 100) + '...' : trimmed;
      }
    }
    
    return null;
  }

  findSkillExamples(skills, descriptiveContent) {
    const examples = [];
    if (!descriptiveContent) return examples;
    
    // Look for specific project mentions or implementations
    const projectPattern = /(built|created|developed|implemented|designed)\s+([^.]{20,80})/gi;
    const matches = descriptiveContent.matchAll(projectPattern);
    
    for (const match of matches) {
      const example = match[2].trim();
      const hasRelevantSkill = skills.some(skill => 
        example.toLowerCase().includes(skill.toLowerCase())
      );
      
      if (hasRelevantSkill) {
        examples.push(example);
        if (examples.length >= 2) break;
      }
    }
    
    return examples;
  }

  extractKeyResponsibilities(descriptiveContent) {
    if (!descriptiveContent) return [];
    
    const responsibilities = [];
    
    // Look for responsibility patterns
    const respPattern = /(?:responsible for|led|managed|oversaw|coordinated)\s+([^.]{15,60})/gi;
    const matches = descriptiveContent.matchAll(respPattern);
    
    for (const match of matches) {
      responsibilities.push(match[1].trim());
      if (responsibilities.length >= 3) break;
    }
    
    return responsibilities;
  }

  extractScaleContext(yamlData, descriptiveContent) {
    if (!descriptiveContent) return null;
    
    // Look for scale indicators
    const scalePattern = /(team of \d+|\d+\s*(?:users?|customers?|million|billion|developers?|engineers?))/i;
    const match = descriptiveContent.match(scalePattern);
    
    if (match) {
      // Find the sentence containing this scale reference
      const sentences = descriptiveContent.split(/[.!?]+/);
      for (const sentence of sentences) {
        if (sentence.includes(match[0])) {
          return sentence.trim().slice(0, 80);
        }
      }
    }
    
    return null;
  }

  extractDomainApplications(descriptiveContent, domain) {
    // This would be more sophisticated in practice
    return [];
  }

  generateImpactContext(achievement) {
    // Generate additional business impact context based on achievement type
    if (/reduced.*cost/i.test(achievement)) {
      return "This cost optimization contributed to improved operational efficiency and budget allocation";
    }
    if (/led.*team/i.test(achievement)) {
      return "This leadership role involved cross-functional coordination and technical mentoring";
    }
    if (/improved.*reliability/i.test(achievement)) {
      return "Enhanced system stability resulted in better user experience and reduced operational overhead";
    }
    if (/delivered.*features/i.test(achievement)) {
      return "Accelerated product delivery supported business growth and competitive positioning";
    }
    if (/mentored/i.test(achievement)) {
      return "This investment in team development enhanced organizational capability and knowledge retention";
    }
    return null;
  }

  extractDomainRelevantSkills(skills, domain) {
    // Map domains to relevant skills
    const domainSkillMap = {
      'Cloud Computing': ['AWS', 'Azure', 'GCP', 'Kubernetes', 'Docker', 'Terraform'],
      'Enterprise Software': ['Java', 'C#', 'SQL', 'Microservices'],
      'Web Development': ['JavaScript', 'React', 'Node.js', 'TypeScript'],
      'Data Science': ['Python', 'SQL', 'Machine Learning', 'Analytics']
    };
    
    const relevantSkills = domainSkillMap[domain] || [];
    return skills.filter(skill => relevantSkills.includes(skill));
  }

  extractSkillsFromText(text, availableSkills) {
    const foundSkills = [];
    
    for (const skill of availableSkills) {
      const pattern = new RegExp(`\\b${skill}\\b`, 'i');
      if (pattern.test(text)) {
        foundSkills.push(skill);
      }
    }
    
    return foundSkills.slice(0, 3);
  }

  // Keep existing utility methods
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
    
    const achievementPattern = /[•\-\*]\s*(Reduced|Increased|Led|Built|Delivered|Achieved|Improved|Saved|Generated|Launched|Implemented|Optimized|Created|Designed|Developed|Managed).*?(\d+[%\$KMB]|\d+\s*(days?|months?|hours?|weeks?|people|users|developers))/gi;
    const matches = descriptiveContent?.match(achievementPattern) || [];
    
    for (const match of matches) {
      const cleaned = match.replace(/^[•\-\*]\s*/, '').trim();
      if (!achievements.includes(cleaned)) {
        achievements.push(cleaned);
      }
    }
    
    return achievements.slice(0, 8); // More achievements but still limited
  }

  calculateEvidenceStrength(text) {
    let strength = 0.5;
    
    if (/\d+[%\$KMB]/.test(text)) strength += 0.3;
    if (/\d+\s*(days?|months?|hours?|weeks?|people|users)/.test(text)) strength += 0.2;
    if (/(reduced|increased|improved|optimized)/i.test(text)) strength += 0.1;
    if (text.split(' ').length > 10) strength += 0.1;
    
    return Math.min(1.0, strength);
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