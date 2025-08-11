#!/usr/bin/env node

import fs from 'fs/promises';
import OpenAI from 'openai';
import 'dotenv/config';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runTest() {
  console.log('🧪 Testing OpenAI extraction response...');
  
  try {
    // Read the document
    const document = await fs.readFile('.work/normalized/Scott Lovett - PMO 2023c .md', 'utf8');
    console.log(`📄 Document length: ${document.length} characters`);
    
    // Send to OpenAI with a very explicit prompt
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: `Extract ALL job experiences from this resume. For EACH company/role found, output a complete markdown document with YAML frontmatter. Separate multiple extractions with "---NEXT_EXTRACTION---".

I expect you to find these companies and create separate extractions for each:
1. ThinkOn
2. Intercontinental Hotels Group (IHG)
3. LeaseQuery
4. Equifax  
5. McKesson
6. American Cybersystems
7. Mayo Clinic (consulting)
8. Coca-Cola (consulting)
9. Lockheed Martin

For each one, use this format:

---
id: company-name-role
type: job
title: Position Title
org: Company Name
location: City, State
date_start: YYYY-MM-DD
date_end: YYYY-MM-DD or null
skills: [Program Management, AI/ML, etc]
summary: Brief role summary
---

# Context
Role details...

---NEXT_EXTRACTION---

[Next role...]

Output ALL roles found, not just the first one!`
        },
        { 
          role: 'user', 
          content: `Extract ALL job experiences from this resume document. I expect at least 8-10 separate extractions:\n\n${document}` 
        }
      ],
      temperature: 0.1
    });

    const content = response.choices[0].message.content;
    
    // Save the full response
    await fs.writeFile('openai-response-debug.txt', content);
    console.log('💾 Saved full response to openai-response-debug.txt');
    
    // Check for separators
    console.log('\n📋 Response analysis:');
    console.log(`Total response length: ${content.length} characters`);
    
    const separatorCount = (content.match(/---NEXT_EXTRACTION---/g) || []).length;
    console.log(`Found ${separatorCount} extraction separators`);
    
    if (separatorCount > 0) {
      const extractions = content.split('---NEXT_EXTRACTION---');
      console.log(`Split into ${extractions.length} parts`);
      
      for (let i = 0; i < extractions.length; i++) {
        const extraction = extractions[i].trim();
        if (extraction && extraction.includes('org:')) {
          const orgMatch = extraction.match(/org:\s*(.+)/);
          const orgName = orgMatch ? orgMatch[1].trim() : 'Unknown';
          console.log(`  ${i + 1}. ${orgName} (${extraction.length} chars)`);
        }
      }
    } else {
      console.log('❌ No extraction separators found!');
      console.log('First 1000 chars of response:');
      console.log(content.substring(0, 1000));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

runTest();
