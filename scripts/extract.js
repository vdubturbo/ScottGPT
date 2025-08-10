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
  
  // Check environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('API')));
    process.exit(1);
  }
  
  console.log('✅ OpenAI API key found');
  await fs.mkdir(OUT, { recursive: true });

  const files = (await fs.readdir(IN)).filter(f => f.endsWith('.md'));
  
  if (files.length === 0) {
    console.log('📄 No normalized files found to extract');
    return;
  }

  let totalBlocks = 0;
  
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`📖 Processing: ${f} (${i + 1}/${files.length})`);
    console.log(`   🔍 Reading file content...`);
    const raw = await fs.readFile(path.join(IN, f), 'utf8');

    // Find the "Full Professional Experience" section first
    const experienceStart = raw.indexOf('Full Professional Experience');
    let experienceSection = '';
    
    if (experienceStart !== -1) {
      experienceSection = raw.substring(experienceStart);
    } else {
      // Fallback to full document if no experience section found
      experienceSection = raw;
    }
    
    // Split by company names followed by dates
    // Pattern: Company Name followed by date (MM/YYYY-Present or MM/YYYY-MM/YYYY)
    const jobSections = experienceSection.split(/\n(?=[A-Z][A-Za-z0-9\s&,.'-]+\s+\d{1,2}\/\d{4}[-–—])/);
    
    const blocks = jobSections
      .map(section => section.trim())
      .filter(section => {
        // Must contain job title patterns and substantial content
        return section.length > 100 && 
               section.includes('**') && // Bold job titles
               (section.includes('Director') || 
                section.includes('Manager') || 
                section.includes('Lead') ||
                section.includes('Engineer') ||
                section.includes('Consultant') ||
                section.includes('Architect') ||
                section.includes('Analyst') ||
                section.includes('-')); // Bullet points with accomplishments
      });

    console.log(`📋 Found ${blocks.length} content blocks in ${f}`);

    let blockIndex = 0;
    for (const block of blocks) {
      try {
        console.log(`   🤖 Calling OpenAI API for block ${blockIndex + 1}/${blocks.length}...`);
        process.stdout.write(''); // Force flush
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
          process.stdout.write(''); // Force flush
          totalBlocks++;
        } else {
          console.log(`⚠️  Skipping block ${blockIndex} - no valid YAML front-matter`);
        }
        
        blockIndex++;
        
        // No artificial delay needed - OpenAI handles rate limiting well
        
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