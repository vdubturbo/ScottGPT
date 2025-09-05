import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import TagManager from './tag-manager.js';
import SkillDiscoveryService from '../services/skills.js';

const IN = '.work/extracted';
const OUT = '.work/validated';

// Global variables for services (initialized in validate function)
let tagManager;
let skillService;
let skillsConfig;
let tagsConfig;

const VALID_TYPES = ['job', 'project', 'education', 'cert', 'bio'];

// PII patterns to strip from content
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // emails
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // phone numbers
  /\b\d{1,5}\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/gi // addresses
];

function stripPII(text) {
  let cleaned = text;
  PII_PATTERNS.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  });
  return cleaned;
}

async function normalizeSkills(skills, context = {}) {
  if (!Array.isArray(skills)) {return [];}
  
  const normalized = new Set();
  
  // Handle different config structures with safety checks
  const controlledVocab = skillsConfig.controlled_vocabulary || {};
  const allSkills = [
    ...(controlledVocab.technical || []),
    ...(controlledVocab.leadership || []),
    ...(controlledVocab.business || []),
    ...(controlledVocab.domain || [])
  ];
  
  for (const skill of skills) {
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
      // Use skill discovery service to handle unknown skills
      const discovery = await skillService.discoverSkill(skill, context);
      
      if (discovery.status === 'new_discovery') {
        console.log(`🔍 New skill discovered: "${skill}" (${discovery.category}) - logged for approval`);
      } else if (discovery.status === 'existing_discovery') {
        console.log(`📈 Skill "${skill}" seen again (${discovery.occurrences}x total)`);
      }
      
      // Still include the skill in output for now
      normalized.add(skill);
    }
  }
  
  return Array.from(normalized);
}

async function normalizeTags(tags, context = {}) {
  if (!Array.isArray(tags)) {return [];}
  
  const normalized = new Set();
  const allTags = tagsConfig.controlled_vocabulary;
  
  for (const tag of tags) {
    const found = allTags.find(t => 
      t.toLowerCase() === tag.toLowerCase() ||
      tagsConfig.synonyms[t]?.some(synonym => 
        synonym.toLowerCase() === tag.toLowerCase()
      )
    );
    
    if (found) {
      normalized.add(found);
    } else {
      // Use tag manager to handle unknown tags
      const status = await tagManager.processTag(tag, context);
      
      if (status === 'new-pending') {
        console.log(`🆕 New tag discovered: "${tag}" - added to pending approval`);
      } else if (status === 'pending') {
        console.log(`⏸️  Tag "${tag}" already pending approval (occurrence incremented)`);
      }
      
      // Still include the tag in normalized output for now
      normalized.add(tag);
    }
  }
  
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
    // Allow various current indicators and null values
    const currentIndicators = ['CURRENT', 'current', 'null', 'NULL', 'present', 'PRESENT'];
    const isCurrentRole = currentIndicators.includes(String(dateEnd).trim()) || dateEnd === null;
    
    if (!isCurrentRole) {
      const endDate = new Date(dateEnd);
      if (isNaN(endDate.getTime())) {
        errors.push(`Invalid date_end: ${dateEnd}`);
      } else if (dateStart) {
        const start = new Date(dateStart);
        const end = new Date(dateEnd);
        if (start > end) {
          errors.push('date_start cannot be after date_end');
        }
      }
    }
  }
  
  return errors;
}

async function validate() {
  console.log('✅ Validating content...');
  
  // Ensure required directories exist
  try {
    await fs.mkdir('logs', { recursive: true });
    await fs.mkdir('config', { recursive: true });
    await fs.mkdir(OUT, { recursive: true });
    await fs.mkdir(IN, { recursive: true });
    console.log('✅ Required directories ensured');
  } catch (error) {
    console.error('❌ Failed to create required directories:', error.message);
    throw new Error(`Directory creation failed: ${error.message}`);
  }
  
  // Initialize services with error handling
  try {
    console.log('🔧 Initializing TagManager...');
    tagManager = new TagManager();
    await tagManager.loadConfiguration();
    console.log('✅ TagManager initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize TagManager:', error.message);
    throw new Error(`TagManager initialization failed: ${error.message}`);
  }
  
  try {
    console.log('🔧 Initializing SkillDiscoveryService...');
    skillService = new SkillDiscoveryService();
    await skillService.initialize();
    console.log('✅ SkillDiscoveryService initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize SkillDiscoveryService:', error.message);
    throw new Error(`SkillDiscoveryService initialization failed: ${error.message}`);
  }
  
  // Load controlled vocabularies with error handling
  try {
    console.log('📋 Loading configuration files...');
    
    // Load skills config with fallback
    try {
      skillsConfig = JSON.parse(await fs.readFile('config/skills.json', 'utf8'));
      console.log('📊 Skills config structure:', Object.keys(skillsConfig.controlled_vocabulary || {}));
    } catch (skillsError) {
      console.warn('⚠️ skills.json not found, creating default configuration');
      skillsConfig = {
        controlled_vocabulary: {
          technical: [],
          business: [],
          leadership: []
        },
        synonyms: {}
      };
      await fs.writeFile('config/skills.json', JSON.stringify(skillsConfig, null, 2));
    }
    
    // Load tags config with fallback  
    try {
      tagsConfig = JSON.parse(await fs.readFile('config/tags.json', 'utf8'));
    } catch (tagsError) {
      console.warn('⚠️ tags.json not found, creating default configuration');
      tagsConfig = {
        controlled_vocabulary: [],
        synonyms: {},
        industry_tags: []
      };
      await fs.writeFile('config/tags.json', JSON.stringify(tagsConfig, null, 2));
    }
    
    console.log('✅ Configuration files loaded successfully');
  } catch (error) {
    console.error('❌ Failed to load configuration files:', error.message);
    throw new Error(`Configuration loading failed: ${error.message}`);
  }
  
  const files = (await fs.readdir(IN)).filter(f => f.endsWith('.md'));
  
  if (files.length === 0) {
    console.log('📄 No extracted files found to validate');
    return;
  }
  
  let validFiles = 0;
  let totalErrors = 0;
  
  for (const f of files) {
    console.log(`🔍 Validating: ${f}`);
    
    try {
      const raw = await fs.readFile(path.join(IN, f), 'utf8');
      const { data, content } = matter(raw);
      const errors = [];
      
      // Required field validation
      if (!data.id || typeof data.id !== 'string') {
        errors.push('Missing or invalid \'id\' field');
      }
      
      if (!data.type || !VALID_TYPES.includes(data.type)) {
        errors.push(`Invalid 'type' field. Must be one of: ${VALID_TYPES.join(', ')}`);
      }
      
      if (!data.title || typeof data.title !== 'string') {
        errors.push('Missing or invalid \'title\' field');
      }
      
      if (!data.org || typeof data.org !== 'string') {
        errors.push('Missing or invalid \'org\' field');
      }
      
      // Date validation and normalization
      const dateErrors = validateDates(data.date_start, data.date_end);
      errors.push(...dateErrors);
      
      // Normalize date_end for current roles
      if (data.date_end) {
        const currentIndicators = ['CURRENT', 'current', 'present', 'PRESENT'];
        if (currentIndicators.includes(String(data.date_end).trim())) {
          data.date_end = null; // Normalize to null for current roles
        }
      }
      
      // Normalize and validate skills/tags
      data.skills = await normalizeSkills(data.skills, {
        file: f,
        content: content.substring(0, 500)
      });
      data.industry_tags = await normalizeTags(data.industry_tags, {
        file: f,
        content: content.substring(0, 500),
        type: data.type,
        title: data.title,
        org: data.org
      });
      
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