import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import 'dotenv/config';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const IN = '.work/normalized';
const OUT = '.work/extracted';

const SYSTEM_PROMPT = `You are a resume data extraction specialist for Scott Lovett. You will receive an ENTIRE resume document and must extract ALL jobs, projects, experiences, and roles found within it.

CRITICAL INSTRUCTIONS:
1. Scan the ENTIRE document carefully from top to bottom
2. Extract EVERY job, role, project, consulting engagement, and significant experience
3. Look for company names, job titles, dates, and descriptions throughout the document
4. For EACH role/experience found, output a complete Markdown document with YAML frontmatter AND detailed content body
5. Separate multiple extractions with "---NEXT_EXTRACTION---"
6. Do NOT stop after finding one role - extract ALL of them

CRITICAL: For EACH role/experience found, output a complete Markdown document with YAML frontmatter AND detailed content body. Separate multiple extractions with "---NEXT_EXTRACTION---".

Format each extraction exactly as shown:

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

---NEXT_EXTRACTION---

[Repeat for each additional role/experience found]

REQUIREMENTS:
- Extract ALL jobs, projects, and significant experiences from the text
- Use type: 'job' | 'project' | 'education' | 'cert' | 'bio'
- Skills from: AI/ML, Program Management, Cybersecurity, Healthcare, Government, Cloud Computing, Team Leadership, Strategic Planning, Agile, Compliance, Data Engineering, IoT, Internet of Things
- Industry tags from: Healthcare, Government, Regulated Industries, AI Product, OT Security, Technical Leadership, Digital Transformation, IoT
- Include concrete numbers and metrics in ALL sections
- Use past tense for completed roles, present for current
- Strip personal information (emails, phones, addresses)
- Content body must be substantial (200+ words minimum)
- If you find IoT, Internet of Things, or connected device experience, make sure to extract it

Output ALL experiences found, separated by "---NEXT_EXTRACTION---".`;

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

    // Instead of trying to parse individual sections, send the ENTIRE document
    // to OpenAI and let it intelligently extract ALL experiences at once
    console.log(`   📄 Document length: ${raw.length} characters`);
    
    // For very large documents, we might need to chunk them, but for now
    // let's process the entire document and let OpenAI extract everything
    const blocks = [raw]; // Single block containing the entire document

    console.log(`📋 Found ${blocks.length} content blocks in ${f}`);

    let blockIndex = 0;
    for (const block of blocks) {
      try {
        console.log(`   🤖 Calling OpenAI API for block ${blockIndex + 1}/${blocks.length}...`);
        console.log(`   📝 Sending ${block.length} characters to OpenAI...`);
        process.stdout.write(''); // Force flush
        const response = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `This is a COMPLETE resume document. Please extract ALL jobs, roles, projects, and experiences found anywhere in this document. I expect multiple extractions separated by "---NEXT_EXTRACTION---". Look for:\n\n- ThinkOn (Cloud Provider)\n- Intercontinental Hotels Group (IHG)\n- LeaseQuery\n- Equifax\n- McKesson\n- American Cybersystems\n- IoT Subject Matter Expert role\n- Mayo Clinic consulting\n- Coca-Cola consulting\n- Lockheed Martin\n\nDocument:\n\n${block}` }
          ],
          temperature: 0.2
        });

        const extractedContent = response.choices[0].message.content;
        
        // Debug logging
        console.log(`   📊 Response length: ${extractedContent.length} characters`);
        const separatorCount = (extractedContent.match(/---NEXT_EXTRACTION---/g) || []).length;
        console.log(`   🔍 Found ${separatorCount} extraction separators`);
        
        // Save response for debugging
        await fs.writeFile(path.join(OUT, `debug-response-${f}-block-${blockIndex}.txt`), extractedContent);
        console.log(`   💾 Saved debug response`);
        
        if (extractedContent && extractedContent.includes('---')) {
          // Split multiple extractions
          const extractions = extractedContent.split('---NEXT_EXTRACTION---');
          
          for (let i = 0; i < extractions.length; i++) {
            const extraction = extractions[i].trim();
            if (extraction && extraction.includes('---')) {
              const fileName = f.replace('.md', `.block-${blockIndex}-${i}.md`);
              await fs.writeFile(path.join(OUT, fileName), extraction);
              console.log(`💾 Extracted: ${fileName}`);
              totalBlocks++;
            }
          }
          
          process.stdout.write(''); // Force flush
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