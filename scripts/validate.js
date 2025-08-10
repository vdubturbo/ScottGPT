import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";

const IN = ".work/extracted";
const OUT = ".work/validated";

// Load controlled vocabularies
const skillsConfig = JSON.parse(await fs.readFile("config/skills.json", "utf8"));
const tagsConfig = JSON.parse(await fs.readFile("config/tags.json", "utf8"));

const VALID_TYPES = ["job", "project", "education", "cert", "bio"];

// PII patterns to strip from content
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // emails
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // phone numbers
  /\b\d{1,5}\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/gi, // addresses
];

function stripPII(text) {
  let cleaned = text;
  PII_PATTERNS.forEach(pattern => {
    cleaned = cleaned.replace(pattern, "[REDACTED]");
  });
  return cleaned;
}

function normalizeSkills(skills) {
  if (!Array.isArray(skills)) return [];
  
  const normalized = new Set();
  const allSkills = [
    ...skillsConfig.controlled_vocabulary.technical,
    ...skillsConfig.controlled_vocabulary.leadership,
    ...skillsConfig.controlled_vocabulary.domain
  ];
  
  skills.forEach(skill => {
    // Check if skill is in controlled vocabulary
    const found = allSkills.find(s => 
      s.toLowerCase() === skill.toLowerCase() ||
      skillsConfig.synonyms[s]?.some(synonym => 
        synonym.toLowerCase() === skill.toLowerCase()
      )
    );
    
    if (found) {
      normalized.add(found);
    } else {
      // Keep skill but log for review
      console.log(`⚠️  Unknown skill: "${skill}" - consider adding to controlled vocabulary`);
      normalized.add(skill);
    }
  });
  
  return Array.from(normalized);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  
  const normalized = new Set();
  const allTags = tagsConfig.controlled_vocabulary;
  
  tags.forEach(tag => {
    const found = allTags.find(t => 
      t.toLowerCase() === tag.toLowerCase() ||
      tagsConfig.synonyms[t]?.some(synonym => 
        synonym.toLowerCase() === tag.toLowerCase()
      )
    );
    
    if (found) {
      normalized.add(found);
    } else {
      console.log(`⚠️  Unknown tag: "${tag}" - consider adding to controlled vocabulary`);
      normalized.add(tag);
    }
  });
  
  return Array.from(normalized);
}

function validateDates(dateStart, dateEnd) {
  const errors = [];
  
  if (dateStart) {
    const startDate = new Date(dateStart);
    if (isNaN(startDate.getTime())) {
      errors.push(`Invalid date_start: ${dateStart}`);
    }
  }
  
  if (dateEnd) {
    const endDate = new Date(dateEnd);
    if (isNaN(endDate.getTime())) {
      errors.push(`Invalid date_end: ${dateEnd}`);
    }
    
    if (dateStart && dateEnd) {
      const start = new Date(dateStart);
      const end = new Date(dateEnd);
      if (start > end) {
        errors.push("date_start cannot be after date_end");
      }
    }
  }
  
  return errors;
}

async function validate() {
  console.log("✅ Validating content...");
  
  await fs.mkdir(OUT, { recursive: true });
  
  const files = (await fs.readdir(IN)).filter(f => f.endsWith(".md"));
  
  if (files.length === 0) {
    console.log("📄 No extracted files found to validate");
    return;
  }
  
  let validFiles = 0;
  let totalErrors = 0;
  
  for (const f of files) {
    console.log(`🔍 Validating: ${f}`);
    
    try {
      const raw = await fs.readFile(path.join(IN, f), "utf8");
      const { data, content } = matter(raw);
      const errors = [];
      
      // Required field validation
      if (!data.id || typeof data.id !== "string") {
        errors.push("Missing or invalid 'id' field");
      }
      
      if (!data.type || !VALID_TYPES.includes(data.type)) {
        errors.push(`Invalid 'type' field. Must be one of: ${VALID_TYPES.join(", ")}`);
      }
      
      if (!data.title || typeof data.title !== "string") {
        errors.push("Missing or invalid 'title' field");
      }
      
      if (!data.org || typeof data.org !== "string") {
        errors.push("Missing or invalid 'org' field");
      }
      
      // Date validation
      const dateErrors = validateDates(data.date_start, data.date_end);
      errors.push(...dateErrors);
      
      // Normalize and validate skills/tags
      data.skills = normalizeSkills(data.skills);
      data.industry_tags = normalizeTags(data.industry_tags);
      
      // Strip PII from content
      const cleanContent = stripPII(content);
      
      // Ensure pii_allow is false
      data.pii_allow = false;
      
      if (errors.length > 0) {
        console.error(`❌ Validation errors in ${f}:`);
        errors.forEach(error => console.error(`   - ${error}`));
        totalErrors += errors.length;
      } else {
        // Write validated file
        const validatedContent = matter.stringify(cleanContent, data);
        await fs.writeFile(path.join(OUT, f), validatedContent);
        console.log(`✅ Validated: ${f}`);
        validFiles++;
      }
      
    } catch (error) {
      console.error(`❌ Error validating ${f}:`, error.message);
      totalErrors++;
    }
  }
  
  console.log(`✅ Validated ${validFiles} files`);
  if (totalErrors > 0) {
    console.log(`⚠️  Found ${totalErrors} validation errors`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validate().catch(console.error);
}

export default validate;