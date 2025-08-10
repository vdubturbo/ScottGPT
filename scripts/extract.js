import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const IN = ".work/normalized";
const OUT = ".work/extracted";

const SYSTEM_PROMPT = `You are a resume data extraction specialist for Scott Lovett. Convert resume/project text into structured Markdown with YAML front-matter.

Required YAML fields:
- id: unique identifier (use slugified title)
- type: 'job' | 'project' | 'education' | 'cert' | 'bio'
- title: position or project name
- org: company/school/organization
- location: city, state/country
- date_start: ISO date (YYYY-MM-DD) 
- date_end: ISO date or null for current
- industry_tags: array from controlled vocab
- skills: array from controlled vocab
- outcomes: array of concrete achievements with numbers
- summary: 1-2 sentence overview
- pii_allow: false (strip personal info)

Controlled vocabulary for skills: AI/ML, RAG, Vector Database, Prompt Engineering, Program Management, Cybersecurity, Healthcare, Government, Federal Contracting, Cloud Computing, Team Leadership, Strategic Planning, Agile, Compliance, Data Engineering.

Controlled vocabulary for industry_tags: Healthcare, Government, Regulated Industries, AI Product, OT Security, Supply Chain, Technical Leadership, Digital Transformation, Platform Development.

Body sections:
# Context
Brief background and role overview

## Highlights  
- Key achievements with metrics
- Major projects or initiatives
- Leadership accomplishments

## Technical Details
Technologies, methodologies, tools used

Keep outcomes concrete with numbers. Use past tense for completed roles. Output valid Markdown with proper YAML front-matter. Extract ONE entity per block.`;

async function extract() {
  console.log("🔍 Extracting structured data...");
  
  await fs.mkdir(OUT, { recursive: true });

  const files = (await fs.readdir(IN)).filter(f => f.endsWith(".md"));
  
  if (files.length === 0) {
    console.log("📄 No normalized files found to extract");
    return;
  }

  let totalBlocks = 0;
  
  for (const f of files) {
    console.log(`📖 Processing: ${f}`);
    const raw = await fs.readFile(path.join(IN, f), "utf8");

    // Split by headings to identify job/project blocks
    // Look for patterns like "## Job Title" or "# Project Name"
    const blocks = raw.split(/\n#{1,3}\s+/g)
      .map(block => block.trim())
      .filter(block => {
        // Filter for substantial content blocks (likely jobs/projects)
        return block.length > 200 && 
               (block.includes("experience") || 
                block.includes("project") || 
                block.includes("role") ||
                block.includes("position") ||
                block.includes("director") ||
                block.includes("manager") ||
                block.includes("lead"));
      });

    console.log(`📋 Found ${blocks.length} content blocks in ${f}`);

    let blockIndex = 0;
    for (const block of blocks) {
      try {
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Extract structured data from this resume section:\n\n${block}` }
          ],
          temperature: 0.2
        });

        const extractedMd = response.choices[0].message.content;
        
        if (extractedMd && extractedMd.includes("---")) {
          const fileName = f.replace(".md", `.block-${blockIndex}.md`);
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
          console.log("⏳ Rate limited - waiting 30 seconds...");
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