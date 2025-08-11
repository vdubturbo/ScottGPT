import OpenAI from 'openai';
import fs from 'fs/promises';
import 'dotenv/config';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a resume data extraction specialist for Scott Lovett. You will receive an ENTIRE resume document and must extract ALL jobs, projects, experiences, and roles found within it.

CRITICAL INSTRUCTIONS:
1. Scan the ENTIRE document carefully from top to bottom
2. Extract EVERY job, role, project, consulting engagement, and significant experience
3. Look for company names, job titles, dates, and descriptions throughout the document
4. For EACH role/experience found, output a complete Markdown document with YAML frontmatter AND detailed content body
5. Separate multiple extractions with "---NEXT_EXTRACTION---"
6. Do NOT stop after finding one role - extract ALL of them

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
Brief context about the role...

## Highlights
- Key achievements...

---NEXT_EXTRACTION---

[Repeat for each additional role/experience found]

Output ALL experiences found, separated by "---NEXT_EXTRACTION---".`;

async function testExtraction() {
  console.log('🧪 Testing extraction logic...');
  
  // Read the normalized document
  const raw = await fs.readFile('.work/normalized/Scott Lovett - PMO 2023c .md', 'utf8');
  console.log(`📄 Document length: ${raw.length} characters`);
  
  try {
    console.log('🤖 Calling OpenAI API...');
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `This is a COMPLETE resume document. Please extract ALL jobs, roles, projects, and experiences found anywhere in this document. I expect multiple extractions separated by "---NEXT_EXTRACTION---". Look for:

- ThinkOn (Cloud Provider)
- Intercontinental Hotels Group (IHG) 
- LeaseQuery
- Equifax
- McKesson
- American Cybersystems
- IoT Subject Matter Expert role
- Mayo Clinic consulting
- Coca-Cola consulting
- Lockheed Martin

Document:

${raw}` }
      ],
      temperature: 0.2
    });

    const extractedContent = response.choices[0].message.content;
    
    console.log('📋 Raw response length:', extractedContent.length);
    console.log('🔍 Looking for extraction separator...');
    
    if (extractedContent.includes('---NEXT_EXTRACTION---')) {
      const extractions = extractedContent.split('---NEXT_EXTRACTION---');
      console.log(`✅ Found ${extractions.length} extractions!`);
      
      for (let i = 0; i < extractions.length; i++) {
        const extraction = extractions[i].trim();
        if (extraction && extraction.includes('---')) {
          // Extract the org name from the YAML for logging
          const orgMatch = extraction.match(/org:\s*(.+)/);
          const orgName = orgMatch ? orgMatch[1].trim() : `extraction-${i}`;
          console.log(`  ${i + 1}. ${orgName} (${extraction.length} chars)`);
        }
      }
      
      // Save the full response for inspection
      await fs.writeFile('test-extraction-full-response.txt', extractedContent);
      console.log('💾 Saved full response to test-extraction-full-response.txt');
      
    } else {
      console.log('❌ No extraction separator found!');
      console.log('First 500 chars of response:');
      console.log(extractedContent.substring(0, 500));
      
      // Save the response anyway for debugging
      await fs.writeFile('test-extraction-debug-response.txt', extractedContent);
      console.log('💾 Saved debug response to test-extraction-debug-response.txt');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testExtraction().catch(console.error);
