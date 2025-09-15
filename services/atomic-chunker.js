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

    console.log(`📝 [CHUNKER] Processing ${yamlData.title} with ${descriptiveContent?.length || 0} chars of descriptive content`);

    // Create comprehensive chunks with full context utilization
    const contextualChunks = this.createContextualEvidenceChunks(yamlData, descriptiveContent, metadata);

    for (const chunk of contextualChunks) {
      if (this.isDuplicate(chunk.content)) continue;
      chunks.push(chunk);
    }

    // Apply token validation and enhancement
    const validatedChunks = this.validateAndEnhanceChunks(chunks, yamlData, descriptiveContent, metadata);

    console.log(`📊 [CHUNKER] Created ${validatedChunks.length} validated chunks (${validatedChunks.map(c => c.token_count).join(', ')} tokens)`);

    return validatedChunks.filter(chunk => chunk && chunk.content);
  }

  createContextualEvidenceChunks(yamlData, descriptiveContent, metadata) {
    const chunks = [];
    const jobHeader = this.buildJobHeader(yamlData);

    // Create exactly 3 comprehensive chunks per job (250-400 tokens each)

    // 1. Role Overview: header + summary + key responsibilities + top 3 achievements
    const roleOverviewChunk = this.createRoleOverviewChunk(yamlData, descriptiveContent, metadata, jobHeader);
    if (roleOverviewChunk) chunks.push(roleOverviewChunk);

    // 2. Technical Details: header + skills with context + projects + technical outcomes
    const technicalDetailsChunk = this.createTechnicalDetailsChunk(yamlData, descriptiveContent, metadata, jobHeader);
    if (technicalDetailsChunk) chunks.push(technicalDetailsChunk);

    // 3. Impact & Leadership: header + leadership examples + quantified results + team context
    const impactLeadershipChunk = this.createImpactLeadershipChunk(yamlData, descriptiveContent, metadata, jobHeader);
    if (impactLeadershipChunk) chunks.push(impactLeadershipChunk);

    return chunks;
  }

  buildJobHeader(yamlData) {
    const parts = [];

    if (yamlData.org) parts.push(yamlData.org);
    if (yamlData.title) parts.push(yamlData.title);

    const dateRange = this.buildDateRange(yamlData.date_start, yamlData.date_end);
    if (dateRange) parts.push(dateRange);

    return parts.join(' • ');
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

  // Legacy methods - removed to focus on comprehensive chunking

  createRoleOverviewChunk(yamlData, descriptiveContent, metadata, jobHeader) {
    // Role Overview: comprehensive role context utilizing full descriptive content
    let content = `${jobHeader}\n\n`;

    // Use extensive descriptive content for richer context
    const descriptiveSentences = descriptiveContent ?
      descriptiveContent.split(/[.!?]+/).filter(s => s.trim().length > 20) : [];

    // Primary role description with rich context
    if (yamlData.summary) {
      content += `${yamlData.summary} `;
    } else if (descriptiveSentences.length > 0) {
      // Use first 3-4 sentences for comprehensive role overview
      const roleIntro = descriptiveSentences.slice(0, 4).join('. ') + '.';
      content += `${roleIntro} `;
    } else {
      content += `Professional ${yamlData.title} role specializing in ${metadata.skills.slice(0, 6).join(', ')} technologies, driving technical excellence and strategic business outcomes. `;
    }

    // Add detailed organizational context using descriptive content
    if (descriptiveSentences.length > 4) {
      const organizationalContext = descriptiveSentences.slice(4, 7).join('. ') + '.';
      content += `${organizationalContext} `;
    }

    // Enhanced responsibilities with descriptive context
    const keyResponsibilities = this.extractKeyResponsibilities(descriptiveContent);
    if (keyResponsibilities.length > 0) {
      content += `Core responsibilities included ${keyResponsibilities.slice(0, 5).join(', ')}, while consistently delivering high-quality solutions that exceeded stakeholder expectations and maintained industry-leading technical standards. `;
    }

    // Comprehensive skill context
    if (metadata.skills.length > 0) {
      content += `Technical expertise encompassed ${metadata.skills.slice(0, 10).join(', ')}, enabling delivery of complex, scalable solutions across diverse technology stacks and business domains. `;
    }

    // Industry and location context
    if (yamlData.location) {
      content += `Based in ${yamlData.location}, `;
    }
    if (metadata.domain && metadata.domain.length > 0) {
      content += `specializing in ${metadata.domain.join(', ')} industry applications and market-specific requirements. `;
    }

    // Additional context from remaining descriptive content
    if (descriptiveSentences.length > 7) {
      const additionalContext = descriptiveSentences.slice(7, 10).join('. ') + '.';
      content += `${additionalContext} `;
    }

    // Target 250-400 tokens with comprehensive content
    const targetContent = this.enforceTargetTokenRange(content, 250, 400);

    return {
      content: targetContent.text,
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
      skills: metadata.skills.slice(0, 8),
      achievements: yamlData.outcomes || [],
      token_count: targetContent.tokenCount
    };
  }

  createTechnicalDetailsChunk(yamlData, descriptiveContent, metadata, jobHeader) {
    // Technical Details: header + skills with context + projects + technical outcomes
    let content = `${jobHeader}\n\n`;

    // Add comprehensive technical skills with practical context
    const skills = metadata.skills.slice(0, 10);
    if (skills.length > 0) {
      content += `Demonstrated expertise across ${skills.length} core technologies: ${skills.join(', ')}. `;
    }

    // Add detailed skill groups with rich application context
    const skillGroups = this.groupSkillsByContext(yamlData, descriptiveContent);
    for (const skillGroup of skillGroups.slice(0, 3)) {
      content += `Leveraged ${skillGroup.skills.join(', ')} technologies for ${skillGroup.context}, achieving measurable improvements in system performance and developer productivity. `;
      if (skillGroup.examples && skillGroup.examples.length > 0) {
        content += `Notable implementations: ${skillGroup.examples.slice(0, 3).join('; ')}. `;
      }
    }

    // Add comprehensive technical projects and outcomes
    const technicalOutcomes = this.extractTechnicalOutcomes(descriptiveContent);
    if (technicalOutcomes.length > 0) {
      content += `Technical deliverables encompassed: ${technicalOutcomes.slice(0, 4).join('; ')}. `;
    }

    // Add detailed architecture and system design context
    const architectureContext = this.extractArchitectureContext(descriptiveContent);
    if (architectureContext) {
      content += `${architectureContext}, ensuring scalability, maintainability, and alignment with organizational technical standards. `;
    }

    // Add technical problem-solving examples from descriptive content
    const problemSolvingExamples = this.extractProblemSolvingExamples(descriptiveContent);
    if (problemSolvingExamples.length > 0) {
      content += `Resolved complex technical challenges including: ${problemSolvingExamples.slice(0, 2).join('; ')}. `;
    }

    // Target 250-400 tokens
    const targetContent = this.enforceTargetTokenRange(content, 250, 400);

    return {
      content: targetContent.text,
      content_summary: `Technical details: ${skills.slice(0, 3).join(', ')}`,
      metadata: {
        ...metadata,
        chunk_type: 'technical_details',
        primary_skills: skills
      },
      title: metadata.title,
      role: metadata.role,
      organization: metadata.organization,
      start_date: metadata.start_date,
      end_date: metadata.end_date,
      domain: metadata.domain,
      skills: skills,
      achievements: [],
      token_count: targetContent.tokenCount
    };
  }

  createImpactLeadershipChunk(yamlData, descriptiveContent, metadata, jobHeader) {
    // Impact & Leadership: comprehensive impact stories with business context and quantified results
    let content = `${jobHeader}\n\n`;

    // Extract and analyze all achievements for comprehensive impact narrative
    const achievements = yamlData.outcomes || [];
    const quantifiedResults = this.extractQuantifiedResults(yamlData, descriptiveContent);

    // Combine and deduplicate impacts
    const allImpactsSet = new Set([...achievements, ...quantifiedResults]);
    const allImpacts = Array.from(allImpactsSet);

    if (allImpacts.length > 0) {
      content += `Delivered exceptional business impact through strategic leadership and technical excellence across multiple initiatives:\n\n`;

      // Create detailed impact stories for top achievements
      const topImpacts = allImpacts.slice(0, 6);
      topImpacts.forEach((impact, index) => {
        content += `• ${impact}`;

        // Add business context and implications for each achievement
        const businessContext = this.generateDetailedBusinessContext(impact, yamlData.org, metadata.domain);
        if (businessContext) {
          content += ` This initiative ${businessContext}`;
        }

        // Add industry relevance
        const industryContext = this.generateIndustryContext(impact, metadata.domain);
        if (industryContext) {
          content += ` Within the ${metadata.domain?.[0] || 'technology'} sector, ${industryContext}`;
        }

        content += '\n';
      });
    }

    // Add comprehensive leadership narrative with team scale and impact
    const leadershipExamples = this.extractLeadershipExamples(descriptiveContent);
    const teamContext = this.extractTeamContext(descriptiveContent);
    const mentoringContext = this.extractMentoringContext(descriptiveContent);

    if (leadershipExamples.length > 0 || teamContext || mentoringContext) {
      content += `\nLeadership Excellence: `;

      if (teamContext) {
        content += `Managed and coordinated ${teamContext}, establishing collaborative frameworks that enhanced productivity and innovation. `;
      }

      if (leadershipExamples.length > 0) {
        const leadershipSummary = leadershipExamples.slice(0, 2).map(example =>
          example.length > 80 ? example.substring(0, 80) + '...' : example
        ).join(' and ');
        content += `Demonstrated strategic leadership through ${leadershipSummary}, resulting in improved team performance and accelerated project delivery. `;
      }

      if (mentoringContext) {
        content += `Invested in organizational growth through ${mentoringContext}, creating lasting impact on team capabilities and professional development. `;
      }
    }

    // Add strategic business value and organizational impact
    const businessImpact = this.extractBusinessImpactContext(descriptiveContent);
    const processImprovements = this.extractProcessImprovements(descriptiveContent);

    if (businessImpact || processImprovements.length > 0) {
      content += `\nStrategic Business Value: `;

      if (businessImpact) {
        content += `Contributed to organizational success through ${businessImpact}, driving competitive advantage and market positioning. `;
      }

      if (processImprovements.length > 0) {
        content += `Implemented operational excellence initiatives including ${processImprovements.slice(0, 3).join(', ')}, resulting in enhanced efficiency and scalability across the organization. `;
      }
    }

    // Ensure comprehensive industry and market context
    if (metadata.domain && metadata.domain.length > 0) {
      const industrySpecificImpact = this.generateIndustrySpecificImpact(yamlData, metadata.domain);
      if (industrySpecificImpact) {
        content += `\n${industrySpecificImpact}`;
      }
    }

    // Target 250-400 tokens with emphasis on reaching minimum threshold
    const targetContent = this.enforceTargetTokenRange(content, 250, 400);

    return {
      content: targetContent.text,
      content_summary: `Impact and leadership: ${yamlData.title}`,
      metadata: {
        ...metadata,
        chunk_type: 'impact_leadership',
        leadership_focused: true
      },
      title: metadata.title,
      role: metadata.role,
      organization: metadata.organization,
      start_date: metadata.start_date,
      end_date: metadata.end_date,
      domain: metadata.domain,
      skills: metadata.skills,
      achievements: quantifiedResults,
      token_count: targetContent.tokenCount
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

    // Enhanced patterns for responsibility extraction
    const respPatterns = [
      /(?:responsible for|accountable for|tasked with)\s+([^.]{20,80})/gi,
      /(?:led|managed|oversaw|coordinated|directed)\s+([^.]{25,90})/gi,
      /(?:designed|architected|developed|implemented|built)\s+([^.]{30,100})/gi,
      /(?:established|created|launched|initiated)\s+([^.]{25,85})/gi
    ];

    for (const pattern of respPatterns) {
      const matches = descriptiveContent.matchAll(pattern);
      for (const match of matches) {
        const responsibility = match[1].trim();
        if (!responsibilities.includes(responsibility)) {
          responsibilities.push(responsibility);
          if (responsibilities.length >= 5) break;
        }
      }
      if (responsibilities.length >= 5) break;
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

  validateAndEnhanceChunks(chunks, yamlData, descriptiveContent, metadata) {
    const MINIMUM_TOKENS = 150;
    const TARGET_MIN = 200;
    const TARGET_MAX = 400;
    const enhancedChunks = [];
    const smallChunks = [];

    console.log(`🔍 [VALIDATION] Validating ${chunks.length} chunks against ${MINIMUM_TOKENS} token minimum`);

    // First pass: identify chunks that need enhancement
    for (const chunk of chunks) {
      const tokenCount = this.tokenBudget.countTokens(chunk.content);
      chunk.token_count = tokenCount;

      if (tokenCount >= MINIMUM_TOKENS) {
        enhancedChunks.push(chunk);
        console.log(`✅ [VALIDATION] ${chunk.metadata.chunk_type}: ${tokenCount} tokens (valid)`);
      } else {
        smallChunks.push(chunk);
        console.log(`⚠️  [VALIDATION] ${chunk.metadata.chunk_type}: ${tokenCount} tokens (needs enhancement)`);
      }
    }

    // Second pass: enhance small chunks
    for (const smallChunk of smallChunks) {
      const enhancedChunk = this.enhanceSmallChunk(smallChunk, yamlData, descriptiveContent, metadata);
      if (enhancedChunk.token_count >= MINIMUM_TOKENS) {
        enhancedChunks.push(enhancedChunk);
        console.log(`🚀 [ENHANCEMENT] ${enhancedChunk.metadata.chunk_type}: ${enhancedChunk.token_count} tokens (enhanced)`);
      } else {
        // If still too small, merge with the largest existing chunk
        const mergedChunk = this.mergeWithLargestChunk(enhancedChunk, enhancedChunks, yamlData, descriptiveContent);
        if (mergedChunk) {
          console.log(`🔀 [MERGE] Merged ${enhancedChunk.metadata.chunk_type} into larger chunk`);
        }
      }
    }

    // Final validation: ensure all chunks meet standards
    return enhancedChunks.map(chunk => this.enforceTargetTokenRange(chunk.content, TARGET_MIN, TARGET_MAX, chunk)).filter(chunk => chunk.token_count >= MINIMUM_TOKENS);
  }

  enhanceSmallChunk(chunk, yamlData, descriptiveContent, metadata) {
    console.log(`🔧 [ENHANCE] Enhancing ${chunk.metadata.chunk_type} chunk with additional context`);

    let enhancedContent = chunk.content;
    const chunkType = chunk.metadata.chunk_type;

    // Add more descriptive content based on chunk type
    const descriptiveSentences = descriptiveContent ?
      descriptiveContent.split(/[.!?]+/).filter(s => s.trim().length > 20) : [];

    if (chunkType === 'role_overview' && descriptiveSentences.length > 3) {
      enhancedContent += `\n\nAdditional Context: ${descriptiveSentences.slice(3, 7).join('. ')}.`;
      enhancedContent += ` This role required comprehensive expertise in ${metadata.skills.slice(0, 8).join(', ')}, enabling successful delivery of complex technical initiatives and strategic business objectives.`;
    }

    if (chunkType === 'technical_details' && descriptiveSentences.length > 7) {
      enhancedContent += `\n\nTechnical Implementation: ${descriptiveSentences.slice(7, 11).join('. ')}.`;
      enhancedContent += ` These technical capabilities enabled the development of robust, scalable solutions that met demanding performance and reliability requirements.`;
    }

    if (chunkType === 'impact_leadership' && descriptiveSentences.length > 11) {
      enhancedContent += `\n\nAdditional Impact: ${descriptiveSentences.slice(11, 15).join('. ')}.`;
      enhancedContent += ` These leadership initiatives contributed to long-term organizational success and established foundations for continued growth and innovation.`;
    }

    // Add industry-specific context if available
    if (metadata.domain && metadata.domain.length > 0) {
      const industryContext = this.generateIndustrySpecificEnhancement(yamlData, metadata.domain, chunkType);
      if (industryContext) {
        enhancedContent += `\n\n${industryContext}`;
      }
    }

    const enhancedTokenCount = this.tokenBudget.countTokens(enhancedContent);

    return {
      ...chunk,
      content: enhancedContent,
      token_count: enhancedTokenCount
    };
  }

  mergeWithLargestChunk(smallChunk, existingChunks, yamlData, descriptiveContent) {
    if (existingChunks.length === 0) return null;

    // Find the largest chunk that can accommodate the merge
    const sortedChunks = existingChunks.sort((a, b) => b.token_count - a.token_count);
    const targetChunk = sortedChunks[0];

    if (targetChunk.token_count > 350) {
      console.log(`⚠️  [MERGE] Target chunk too large (${targetChunk.token_count} tokens), creating combined chunk instead`);
      return this.createCombinedChunk(smallChunk, targetChunk, yamlData, descriptiveContent);
    }

    // Merge the small chunk content into the larger one
    targetChunk.content += `\n\nAdditional Information: ${smallChunk.content.split('\n\n').slice(1).join(' ')}`;
    targetChunk.token_count = this.tokenBudget.countTokens(targetChunk.content);
    targetChunk.metadata.chunk_type = 'comprehensive';

    return targetChunk;
  }

  createCombinedChunk(chunk1, chunk2, yamlData, descriptiveContent) {
    const jobHeader = this.buildJobHeader(yamlData);
    const combinedContent = `${jobHeader}\n\nComprehensive Professional Overview:\n\n${chunk1.content.split('\n\n').slice(1).join('\n\n')}\n\n${chunk2.content.split('\n\n').slice(1).join('\n\n')}`;

    return {
      content: combinedContent,
      content_summary: `Comprehensive overview: ${yamlData.title}`,
      metadata: {
        ...chunk1.metadata,
        chunk_type: 'comprehensive',
        combined: true
      },
      title: chunk1.title,
      role: chunk1.role,
      organization: chunk1.organization,
      start_date: chunk1.start_date,
      end_date: chunk1.end_date,
      domain: chunk1.domain,
      skills: [...(chunk1.skills || []), ...(chunk2.skills || [])].slice(0, 15),
      achievements: [...(chunk1.achievements || []), ...(chunk2.achievements || [])].slice(0, 10),
      token_count: this.tokenBudget.countTokens(combinedContent)
    };
  }

  generateIndustrySpecificEnhancement(yamlData, domain, chunkType) {
    const industryDomain = domain?.[0]?.toLowerCase() || 'technology';

    if (chunkType === 'role_overview') {
      if (industryDomain.includes('technology')) {
        return `Technology Sector Context: This role positioned the professional at the forefront of technological innovation, requiring expertise in emerging technologies and scalable system design essential for competitive advantage in fast-paced technology markets.`;
      }
      if (industryDomain.includes('enterprise')) {
        return `Enterprise Context: This position demanded deep understanding of complex organizational requirements and enterprise-scale solution delivery, crucial for supporting large-scale business operations and strategic initiatives.`;
      }
    }

    if (chunkType === 'technical_details') {
      if (industryDomain.includes('technology')) {
        return `Technical Excellence: These technical capabilities reflect the advanced skill set required for leadership roles in technology organizations, enabling delivery of innovative solutions that drive business differentiation and market leadership.`;
      }
    }

    if (chunkType === 'impact_leadership') {
      if (industryDomain.includes('technology')) {
        return `Leadership Impact: These achievements demonstrate the strategic leadership capabilities essential for technology sector success, combining technical expertise with business acumen to drive organizational growth and innovation.`;
      }
    }

    return null;
  }

  enforceTargetTokenRange(content, minTokens, maxTokens, existingChunk = null) {
    let tokenCount = this.tokenBudget.countTokens(content);

    if (tokenCount >= minTokens && tokenCount <= maxTokens) {
      const result = existingChunk ? { ...existingChunk, content, token_count: tokenCount } : { text: content, tokenCount };
      return result;
    }

    if (tokenCount > maxTokens) {
      // Truncate to max tokens
      const { text, tokenCount: newCount } = this.tokenBudget.enforceHardCap(content.substring(0, Math.floor(content.length * (maxTokens / tokenCount))));
      return existingChunk ? { ...existingChunk, content: text, token_count: newCount } : { text, tokenCount: newCount };
    }

    // If under minimum, return as-is since we've already tried enhancement
    return existingChunk ? { ...existingChunk, content, token_count: tokenCount } : { text: content, tokenCount };
  }

  extractTechnicalOutcomes(descriptiveContent) {
    if (!descriptiveContent) return [];

    const outcomes = [];
    const techOutcomePatterns = [
      /(built|created|developed|implemented|designed|architected|deployed)\s+([^.]{30,120})/gi,
      /(integrated|migrated|refactored|optimized|enhanced)\s+([^.]{30,120})/gi,
      /(established|configured|automated|streamlined)\s+([^.]{30,120})/gi
    ];

    for (const pattern of techOutcomePatterns) {
      const matches = descriptiveContent.matchAll(pattern);
      for (const match of matches) {
        const outcome = match[0].trim();
        if (!outcomes.includes(outcome)) {
          outcomes.push(outcome);
          if (outcomes.length >= 5) break;
        }
      }
      if (outcomes.length >= 5) break;
    }

    return outcomes;
  }

  extractArchitectureContext(descriptiveContent) {
    if (!descriptiveContent) return null;

    const archPattern = /(architected|designed|built).*?(system|architecture|platform|infrastructure|framework).*?([^.]{20,80})/i;
    const match = descriptiveContent.match(archPattern);

    return match ? match[0].trim() : null;
  }

  extractLeadershipExamples(descriptiveContent) {
    if (!descriptiveContent) return [];

    const examples = [];
    const leadershipPatterns = [
      /(led|managed|directed|supervised|coordinated|mentored)\s+([^.]{25,100})/gi,
      /(guided|coached|trained|facilitated|championed)\s+([^.]{25,100})/gi,
      /(initiated|drove|spearheaded|pioneered|established)\s+([^.]{25,100})/gi,
      /(collaborated with|partnered with|worked with).*?(teams?|stakeholders?).*?([^.]{20,80})/gi
    ];

    for (const pattern of leadershipPatterns) {
      const matches = descriptiveContent.matchAll(pattern);
      for (const match of matches) {
        const example = match[0].trim();
        if (!examples.includes(example)) {
          examples.push(example);
          if (examples.length >= 6) break;
        }
      }
      if (examples.length >= 6) break;
    }

    return examples;
  }

  extractQuantifiedResults(yamlData, descriptiveContent) {
    const results = [];

    // Get from achievements first
    if (yamlData.outcomes) {
      results.push(...yamlData.outcomes.slice(0, 2));
    }

    if (!descriptiveContent) return results;

    // Extract quantified results from text
    const quantPattern = /(reduced|increased|improved|saved|generated|achieved).*?(\d+[%\$KMB]|\d+\s*(days?|months?|hours?|weeks?|people|users))/gi;
    const matches = descriptiveContent.matchAll(quantPattern);

    for (const match of matches) {
      const result = match[0].trim();
      if (!results.includes(result)) {
        results.push(result);
        if (results.length >= 4) break;
      }
    }

    return results;
  }

  extractTeamContext(descriptiveContent) {
    if (!descriptiveContent) return null;

    const teamPattern = /(team of \d+|\d+\s*(?:engineers?|developers?|people)|cross-functional team|collaborated with)/i;
    const match = descriptiveContent.match(teamPattern);

    if (match) {
      const sentences = descriptiveContent.split(/[.!?]+/);
      for (const sentence of sentences) {
        if (sentence.includes(match[0])) {
          return sentence.trim().slice(0, 100);
        }
      }
    }

    return null;
  }

  extractMentoringContext(descriptiveContent) {
    if (!descriptiveContent) return null;

    const mentoringPattern = /(mentored|coached|trained|guided|developed).*?(engineers?|developers?|team members?|junior)/i;
    const match = descriptiveContent.match(mentoringPattern);

    return match ? match[0].trim() : null;
  }

  extractBusinessImpactContext(descriptiveContent) {
    if (!descriptiveContent) return null;

    const impactPattern = /(revenue|cost|efficiency|productivity|customer satisfaction|user experience).*?([^.]{20,60})/i;
    const match = descriptiveContent.match(impactPattern);

    return match ? match[0].trim() : null;
  }

  extractIntroductorySentences(descriptiveContent, count = 2) {
    if (!descriptiveContent) return '';

    const sentences = descriptiveContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences.slice(0, count).join('. ').trim() + (sentences.length > 0 ? '.' : '');
  }

  extractProblemSolvingExamples(descriptiveContent) {
    if (!descriptiveContent) return [];

    const examples = [];
    const problemPattern = /(solved|resolved|addressed|fixed|debugged|troubleshot|optimized).*?([^.]{30,100})/gi;
    const matches = descriptiveContent.matchAll(problemPattern);

    for (const match of matches) {
      examples.push(match[0].trim());
      if (examples.length >= 3) break;
    }

    return examples;
  }

  generateBusinessValueContext(result) {
    if (/reduced.*cost.*\d+/i.test(result)) {
      return "This cost optimization directly contributed to improved profit margins and enabled reinvestment in strategic initiatives";
    }
    if (/increased.*revenue.*\d+/i.test(result)) {
      return "This revenue growth supported business expansion and enhanced market competitiveness";
    }
    if (/improved.*performance.*\d+/i.test(result)) {
      return "These performance enhancements resulted in better user experience and increased customer retention";
    }
    if (/reduced.*time.*\d+/i.test(result)) {
      return "This efficiency gain accelerated delivery cycles and improved team productivity";
    }
    if (/increased.*adoption.*\d+/i.test(result)) {
      return "Higher adoption rates validated product-market fit and drove sustainable growth";
    }
    return null;
  }

  extractProcessImprovements(descriptiveContent) {
    if (!descriptiveContent) return [];

    const improvements = [];
    const processPattern = /(streamlined|automated|standardized|optimized|improved).*?(process|workflow|procedure|pipeline).*?([^.]{20,80})/gi;
    const matches = descriptiveContent.matchAll(processPattern);

    for (const match of matches) {
      improvements.push(match[0].trim());
      if (improvements.length >= 3) break;
    }

    return improvements;
  }

  generateDetailedBusinessContext(impact, organization, domain) {
    // Generate detailed business context based on impact type and domain
    if (/reduced.*cost.*\d+/i.test(impact)) {
      return "directly enhanced profitability and operational efficiency, enabling strategic reinvestment in growth initiatives and competitive positioning";
    }
    if (/increased.*revenue.*\d+/i.test(impact)) {
      return "accelerated business growth and market expansion, strengthening the organization's financial foundation and market leadership";
    }
    if (/improved.*performance.*\d+/i.test(impact)) {
      return "enhanced user experience and customer satisfaction, driving retention and competitive advantage in the marketplace";
    }
    if (/reduced.*time.*\d+/i.test(impact)) {
      return "accelerated time-to-market and improved operational agility, enabling faster response to market opportunities and customer demands";
    }
    if (/led.*team.*\d+/i.test(impact)) {
      return "strengthened organizational capabilities and leadership bench strength, creating sustainable competitive advantages through human capital development";
    }
    if (/(architected|implemented|designed).*system/i.test(impact)) {
      return "established scalable technical foundation supporting long-term business growth and innovation capacity";
    }
    if (/mentored.*\d+/i.test(impact)) {
      return "enhanced organizational knowledge retention and capability development, creating lasting value through talent development and succession planning";
    }
    return "contributed to sustainable business value creation and organizational excellence";
  }

  generateIndustryContext(impact, domain) {
    const industryDomain = domain?.[0]?.toLowerCase() || 'technology';

    if (industryDomain.includes('technology') || industryDomain.includes('software')) {
      if (/performance|optimization|scalability/i.test(impact)) {
        return "such performance optimizations are critical for maintaining competitive advantage in rapidly evolving technology markets";
      }
      if (/team|leadership|mentoring/i.test(impact)) {
        return "leadership and talent development are essential for sustaining innovation in the dynamic technology sector";
      }
      return "this achievement demonstrates technical excellence essential for technology sector leadership";
    }

    if (industryDomain.includes('finance') || industryDomain.includes('fintech')) {
      return "this accomplishment reflects the precision and reliability required in financial services operations";
    }

    if (industryDomain.includes('healthcare')) {
      return "this contribution aligns with healthcare industry demands for quality, compliance, and patient-centric outcomes";
    }

    if (industryDomain.includes('enterprise')) {
      return "this enterprise-focused achievement demonstrates capability to deliver solutions at organizational scale";
    }

    return "this professional accomplishment reflects industry best practices and market leadership";
  }

  generateIndustrySpecificImpact(yamlData, domain) {
    const industryDomain = domain?.[0]?.toLowerCase() || 'technology';
    const organization = yamlData.org || 'the organization';

    if (industryDomain.includes('technology') || industryDomain.includes('software')) {
      return `These achievements positioned ${organization} for sustained growth in the competitive technology landscape, demonstrating the technical leadership and innovation capacity essential for market differentiation and customer success.`;
    }

    if (industryDomain.includes('enterprise')) {
      return `Within the enterprise software sector, these contributions enhanced ${organization}'s ability to deliver complex, scalable solutions that meet the demanding requirements of large-scale organizational customers.`;
    }

    if (industryDomain.includes('saas')) {
      return `These accomplishments strengthened ${organization}'s SaaS platform capabilities, supporting the recurring revenue model and customer retention metrics critical for sustainable SaaS business growth.`;
    }

    return `These professional contributions enhanced ${organization}'s market position and operational excellence within the ${industryDomain} industry.`;
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

    if (!descriptiveContent) return achievements.slice(0, 8);

    // Enhanced achievement patterns for more comprehensive extraction
    const achievementPatterns = [
      // Bullet-pointed achievements with quantifiable results
      /[•\-\*]\s*(Reduced|Increased|Led|Built|Delivered|Achieved|Improved|Saved|Generated|Launched|Implemented|Optimized|Created|Designed|Developed|Managed).*?(\d+[%\$KMB]|\d+\s*(days?|months?|hours?|weeks?|people|users|developers))/gi,
      // Achievement verbs with detailed outcomes
      /(Successfully|Effectively)\s+(delivered|completed|launched|implemented|built|created|designed|developed).*?([^.]{40,120})/gi,
      // Results and impact statements
      /(Resulted in|Led to|Achieved|Accomplished|Delivered).*?([^.]{30,100})/gi,
      // Recognition and awards
      /(Recognized|Awarded|Selected|Promoted|Nominated).*?([^.]{25,80})/gi
    ];

    for (const pattern of achievementPatterns) {
      const matches = descriptiveContent.matchAll(pattern);
      for (const match of matches) {
        let achievement = match[0];

        // Clean up bullet points
        achievement = achievement.replace(/^[•\-\*]\s*/, '').trim();

        if (!achievements.includes(achievement) && achievement.length > 20) {
          achievements.push(achievement);
          if (achievements.length >= 10) break;
        }
      }
      if (achievements.length >= 10) break;
    }

    return achievements.slice(0, 10); // Allow more achievements for richer content
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