import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const IN = '.work/normalized';
const OUT = '.work/extracted';

const SYSTEM_PROMPT = `You are a resume data extraction specialist for Scott Lovett. Extract ONE job, project, or experience from the text and format it as a complete Markdown document with YAML frontmatter AND detailed content body.

CRITICAL: You MUST output BOTH YAML frontmatter AND markdown content body. Format exactly as shown:

---
id: unique-identifier-slugified
type: job
title: Position Title
org: Company Name
location: City, State
date_start: 2023-01-01
date_end: null
industry_tags:
  - Healthcare
  - Government
skills:
  - Program Management
  - AI/ML
outcomes:
  - Achievement with specific numbers and impact
  - Another concrete result with metrics
summary: 1-2 sentence overview of role and impact
pii_allow: false
---

# Context
Detailed background about the role, company, and business context. Include what the organization does, team size, reporting structure, and key challenges faced.

## Highlights
- Specific achievement with numbers (e.g., "Reduced costs by 25%, saving $2.1M annually")
- Major project or initiative with scope and impact
- Leadership accomplishment with team size and outcomes
- Process improvement with measurable results
- Technology implementation with business impact

## Technical Details
- Technologies, frameworks, and tools used
- Methodologies and processes implemented (Agile, SCRUM, etc.)
- Architecture decisions and technical approaches
- Integration challenges and solutions
- Performance metrics and improvements

## Key Accomplishments
- Quantified business outcomes with specific metrics
- Awards, recognition, or notable achievements
- Successful project deliveries with timelines and budgets
- Team building and leadership results
- Industry recognition or thought leadership

REQUIREMENTS:
- Extract the MOST SIGNIFICANT and RECENT job/project from the text
- Use type: 'job' | 'project' | 'education' | 'cert' | 'bio'
- Skills from: AI/ML, Program Management, Cybersecurity, Healthcare, Government, Cloud Computing, Team Leadership, Strategic Planning, Agile, Compliance, Data Engineering
- Industry tags from: Healthcare, Government, Regulated Industries, AI Product, OT Security, Technical Leadership, Digital Transformation
- Include concrete numbers and metrics in ALL sections
- Use past tense for completed roles, present for current
- Strip personal information (emails, phones, addresses)
- Content body must be substantial (300+ words minimum)

Output EXACTLY ONE complete Markdown document with both YAML frontmatter AND detailed content body.`;

async function extract() {
  console.log('🔍 Extracting structured data...');
  
  await fs.mkdir(OUT, { recursive: true });

  const files = (await fs.readdir(IN)).filter(f => f.endsWith('.md'));
  
  if (files.length === 0) {
    console.log('📄 No normalized files found to extract');
    return;
  }

  let totalBlocks = 0;
  
  for (const f of files) {
    console.log(`📖 Processing: ${f}`);
    const raw = await fs.readFile(path.join(IN, f), 'utf8');

    // Split by headings to identify job/project blocks
    // Look for patterns like "## Job Title" or "# Project Name"
    const blocks = raw.split(/\n#{1,3}\s+/g)
      .map(block => block.trim())
      .filter(block => {
        // Filter for substantial content blocks (likely jobs/projects)
        return block.length > 200 && 
               (block.includes('experience') || 
                block.includes('project') || 
                block.includes('role') ||
                block.includes('position') ||
                block.includes('director') ||
                block.includes('manager') ||
                block.includes('lead'));
      });

    console.log(`📋 Found ${blocks.length} content blocks in ${f}`);

    let blockIndex = 0;
    for (const block of blocks) {
      try {
        const response = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Extract structured data from this resume section:\n\n${block}` }
          ],
          temperature: 0.2
        });

        const extractedMd = response.choices[0].message.content;
        
        if (extractedMd && extractedMd.includes('---')) {
          const fileName = f.replace('.md', `.block-${blockIndex}.md`);
          await fs.writeFile(path.join(OUT, fileName), extractedMd);
          console.log(`💾 Extracted: ${fileName}`);
          totalBlocks++;
        } else {
          console.log(`⚠️  Skipping block ${blockIndex} - no valid YAML front-matter`);
        }
        
        blockIndex++;
        
        // Rate limiting - wait between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing block ${blockIndex} in ${f}:`, error.message);
        if (error.status === 429) {
          console.log('⏳ Rate limited - waiting 30 seconds...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
    }
  }

  console.log(`✅ Extracted ${totalBlocks} structured blocks`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  extract().catch(console.error);
}

export default extract;