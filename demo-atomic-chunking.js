#!/usr/bin/env node

import { AtomicChunker } from './services/atomic-chunker.js';
import { TokenBudget } from './utils/token-budget.js';

// Demo the atomic chunking system
console.log('🚀 Atomic Chunking System Demo\n');

const chunker = new AtomicChunker();
const budget = new TokenBudget();

// Simulate the old "enhanced content" approach
const createLegacyChunk = (yamlData, descriptiveContent, yamlContent) => {
  let enhancedContent = `---\n${yamlContent}\n---\n\n`;
  enhancedContent += `# ${yamlData.title} at ${yamlData.org}\n\n`;
  
  if (yamlData.location) {
    enhancedContent += `**Location:** ${yamlData.location}\n`;
  }
  
  if (yamlData.date_start || yamlData.date_end) {
    const dateRange = `${yamlData.date_start || 'Unknown'} - ${yamlData.date_end || 'Present'}`;
    enhancedContent += `**Duration:** ${dateRange}\n`;
  }
  
  enhancedContent += '\n';
  
  if (yamlData.summary) {
    enhancedContent += `**Summary:** ${yamlData.summary}\n\n`;
  }
  
  if (descriptiveContent && descriptiveContent.length > 10) {
    enhancedContent += descriptiveContent + '\n\n';
  }
  
  if (Array.isArray(yamlData.skills) && yamlData.skills.length > 0) {
    enhancedContent += `**Key Skills Used:** ${yamlData.skills.join(', ')}\n\n`;
  }
  
  if (Array.isArray(yamlData.outcomes) && yamlData.outcomes.length > 0) {
    enhancedContent += `**Key Achievements:**\n`;
    yamlData.outcomes.forEach(outcome => {
      enhancedContent += `- ${outcome}\n`;
    });
    enhancedContent += '\n';
  }
  
  if (Array.isArray(yamlData.industry_tags) && yamlData.industry_tags.length > 0) {
    enhancedContent += `**Industry Context:** ${yamlData.industry_tags.join(', ')}\n`;
  }
  
  return enhancedContent;
};

// Sample job data
const yamlData = {
  id: "principal_engineer_microsoft_2020_present",
  type: "job",
  title: "Principal Software Engineer",
  org: "Microsoft",
  location: "Seattle, WA",
  date_start: "2020-03-01",
  date_end: "Present",
  industry_tags: ["Cloud Computing", "Enterprise Software"],
  skills: ["C#", "Azure", "Kubernetes", "Python", "Terraform", "React", "TypeScript"],
  outcomes: [
    "Reduced cloud infrastructure costs by 35% through optimization",
    "Led team of 12 engineers on microservices migration",
    "Improved system reliability from 99.5% to 99.95% uptime",
    "Delivered 8 major features ahead of schedule",
    "Mentored 15 junior engineers with 100% promotion rate"
  ],
  summary: "Lead engineer for cloud platform serving 50M+ users"
};

const yamlContent = `id: "principal_engineer_microsoft_2020_present"
type: job
title: "Principal Software Engineer"
org: "Microsoft"
location: "Seattle, WA"
date_start: "2020-03-01"
date_end: "Present"
industry_tags:
  - "Cloud Computing"
  - "Enterprise Software"
skills:
  - "C#"
  - "Azure"
  - "Kubernetes"
  - "Python"
  - "Terraform"
  - "React"
  - "TypeScript"
outcomes:
  - "Reduced cloud infrastructure costs by 35% through optimization"
  - "Led team of 12 engineers on microservices migration"
  - "Improved system reliability from 99.5% to 99.95% uptime"
  - "Delivered 8 major features ahead of schedule"
  - "Mentored 15 junior engineers with 100% promotion rate"
summary: "Lead engineer for cloud platform serving 50M+ users"`;

const descriptiveContent = `
# Position Details for Principal Software Engineer at Microsoft

## Role Overview
This Principal Software Engineer position at Microsoft focuses on leading cloud platform development for enterprise customers. The role involves both technical leadership and hands-on development of scalable systems serving over 50 million users worldwide.

## Key Responsibilities & Achievements
- Architected and implemented cost optimization strategies that reduced cloud infrastructure expenses by 35%
- Led cross-functional team of 12 engineers through complex microservices migration project
- Improved overall system reliability from 99.5% to 99.95% uptime through monitoring and automation
- Successfully delivered 8 major product features ahead of scheduled deadlines
- Mentored and developed 15 junior engineers, achieving 100% promotion rate within the team
- Designed and deployed Kubernetes-based container orchestration improving deployment efficiency
- Built React-based internal tools reducing manual processes by 60%

## Skills & Technologies Used
- C# for backend service development and API design
- Azure cloud platform for infrastructure and deployment
- Kubernetes for container orchestration and management
- Python for automation scripts and data processing
- Terraform for infrastructure as code management
- React for building internal developer tools and dashboards
- TypeScript for type-safe frontend development

## Program/Context Information
This position is part of Microsoft's cloud infrastructure division, focusing on enterprise-grade solutions and platform reliability. The role involves collaboration with multiple product teams and direct contribution to systems used by Fortune 500 companies.
`.trim();

console.log('📊 BEFORE: Legacy Enhanced Content Approach');
console.log('=' .repeat(60));

const legacyChunk = createLegacyChunk(yamlData, descriptiveContent, yamlContent);
const legacyTokens = budget.countTokens(legacyChunk);

console.log(`📝 Legacy chunk content (${legacyTokens} tokens):`);
console.log(legacyChunk.substring(0, 300) + '...\n');

console.log('📊 AFTER: New Atomic Chunking Approach');
console.log('=' .repeat(60));

const atomicChunks = await chunker.createAtomicChunks(yamlData, descriptiveContent);

console.log(`🔬 Created ${atomicChunks.length} atomic chunks:\n`);

let totalAtomicTokens = 0;
atomicChunks.forEach((chunk, i) => {
  totalAtomicTokens += chunk.token_count;
  console.log(`${i + 1}. ${chunk.metadata.chunk_type.toUpperCase()} (${chunk.token_count} tokens)`);
  console.log(`   Content: "${chunk.content}"`);
  console.log(`   Summary: "${chunk.content_summary}"`);
  if (chunk.metadata.evidence_strength) {
    console.log(`   Evidence Strength: ${chunk.metadata.evidence_strength.toFixed(2)}`);
  }
  if (chunk.skills.length > 0) {
    console.log(`   Skills: [${chunk.skills.join(', ')}]`);
  }
  console.log('');
});

console.log('📈 COMPARISON RESULTS');
console.log('=' .repeat(60));
console.log(`Legacy approach: 1 chunk, ${legacyTokens} tokens`);
console.log(`Atomic approach: ${atomicChunks.length} chunks, ${totalAtomicTokens} total tokens`);
console.log(`Average tokens per atomic chunk: ${Math.round(totalAtomicTokens / atomicChunks.length)}`);
console.log(`Token efficiency: ${((legacyTokens - totalAtomicTokens) / legacyTokens * 100).toFixed(1)}% reduction`);

const withinBudget = atomicChunks.filter(c => c.token_count >= 80 && c.token_count <= 150).length;
const complianceRate = (withinBudget / atomicChunks.length * 100).toFixed(1);

console.log(`\n🎯 Budget Compliance: ${complianceRate}% (${withinBudget}/${atomicChunks.length})`);

const tokenDistribution = {};
atomicChunks.forEach(chunk => {
  const tokens = chunk.token_count;
  let bucket;
  if (tokens <= 50) bucket = '0-50';
  else if (tokens <= 80) bucket = '51-80';
  else if (tokens <= 150) bucket = '81-150';
  else if (tokens <= 180) bucket = '151-180';
  else bucket = '181+';
  
  tokenDistribution[bucket] = (tokenDistribution[bucket] || 0) + 1;
});

console.log(`📊 Token Distribution: ${JSON.stringify(tokenDistribution)}`);

console.log('\n✅ Atomic chunking system successfully creates:');
console.log('   • Small, focused chunks (80-150 token target)');
console.log('   • Evidence-centric content (achievements with metrics)');
console.log('   • Structured metadata (separate from content)');
console.log('   • Deduplication and token budget enforcement');
console.log('   • Multiple chunk types (achievement, skill, context)');

console.log('\n🚀 Ready for production deployment!');