import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import TagManager from './tag-manager.js';
import SkillDiscoveryService from '../services/skills.js';
import { pipelineStorage } from '../services/pipeline-storage.js';

// Legacy paths for fallback mode
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
  console.log('✅ Starting database-based validation...');
  
  // Check if database tables are available
  let useDatabase = false;
  try {
    await pipelineStorage.initializeStorage();
    
    // Test database connectivity by checking for extracted documents
    const testData = await pipelineStorage.getDocumentsByStatus('extracted');
    useDatabase = true;
    console.log('✅ Database tables available - using database storage');
  } catch (error) {
    console.log('⚠️ Database tables not available - falling back to file system');
    console.log(`   Error: ${error.message}`);
    console.log('💡 To use database storage, ensure pipeline tables exist');
    useDatabase = false;
    
    // Fallback: ensure directories exist for file-based operation
    try {
      await fs.mkdir('logs', { recursive: true });
      await fs.mkdir('config', { recursive: true });
      await fs.mkdir(OUT, { recursive: true });
      await fs.mkdir(IN, { recursive: true });
      console.log('✅ Required directories ensured for file-based fallback');
    } catch (dirError) {
      console.error('❌ Failed to create required directories:', dirError.message);
      throw new Error(`Directory creation failed: ${dirError.message}`);
    }
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
  
  let chunks = [];
  let documents = [];
  
  if (useDatabase) {
    // Get extracted documents with their chunks from database
    documents = await pipelineStorage.getDocumentsByStatus('extracted');
    console.log(`📋 Found ${documents.length} extracted documents in database`);
    
    if (documents.length === 0) {
      console.log('📄 No extracted documents found in database');
      console.log('💡 Run the extract script first to process documents');
      return;
    }
    
    // Get all chunks for validation
    for (const doc of documents) {
      const docWithChunks = await pipelineStorage.getDocumentWithChunks(doc.id);
      if (docWithChunks.pipeline_chunks && docWithChunks.pipeline_chunks.length > 0) {
        chunks.push(...docWithChunks.pipeline_chunks.map(chunk => ({ 
          ...chunk, 
          document: doc 
        })));
      }
    }
    
    console.log(`📦 Found ${chunks.length} chunks to validate`);
    
  } else {
    // Fallback to file system
    const files = (await fs.readdir(IN)).filter(f => f.endsWith('.md'));
    
    if (files.length === 0) {
      console.log('📄 No extracted files found to validate');
      return;
    }
    
    // Convert files to chunk-like objects for consistent processing
    for (const filename of files) {
      const raw = await fs.readFile(path.join(IN, filename), 'utf8');
      chunks.push({
        id: `file-${filename}`,
        content: raw,
        document: { original_name: filename },
        validation_status: 'pending'
      });
    }
    
    console.log(`📁 Processing ${chunks.length} extracted files from file system`);
  }
  
  if (chunks.length === 0) {
    console.log('📄 No chunks found to validate');
    return;
  }
  
  let validChunks = 0;
  let totalErrors = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkName = `${chunk.document.original_name} - chunk ${chunk.chunk_index || 0}`;
    console.log(`🔍 [${i + 1}/${chunks.length}] Validating: ${chunkName}`);
    
    try {
      const { data, content } = matter(chunk.content);
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
        chunk: chunkName,
        content: content.substring(0, 500)
      });
      data.industry_tags = await normalizeTags(data.industry_tags, {
        chunk: chunkName,
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
        console.error(`❌ Validation errors in ${chunkName}:`);
        errors.forEach(error => console.error(`   - ${error}`));
        totalErrors += errors.length;
        
        if (useDatabase) {
          // Update chunk validation status in database
          await pipelineStorage.updateChunkValidation(chunk.id, 'invalid', errors);
          console.log(`💾 Updated chunk validation status to 'invalid'`);
        }
        
      } else {
        // Validation passed
        const validatedContent = matter.stringify(cleanContent, data);
        
        if (useDatabase) {
          // Update chunk validation status and content in database
          await pipelineStorage.updateChunkValidation(chunk.id, 'valid', []);
          console.log(`✅ Validated chunk: ${chunkName}`);
        } else {
          // Write validated file in file system mode
          const filename = chunk.document.original_name;
          await fs.writeFile(path.join(OUT, filename), validatedContent);
          console.log(`✅ Validated file: ${filename}`);
        }
        
        validChunks++;
      }
      
    } catch (error) {
      console.error(`❌ Error validating ${chunkName}:`, error.message);
      totalErrors++;
      
      if (useDatabase) {
        try {
          await pipelineStorage.updateChunkValidation(chunk.id, 'invalid', [{
            type: 'processing_error',
            message: error.message
          }]);
        } catch (dbError) {
          console.error(`❌ Failed to record validation error in database:`, dbError.message);
        }
      }
    }
  }
  
  // Update document status if using database
  if (useDatabase && validChunks > 0) {
    // Mark documents as validated
    const documentsToUpdate = new Set(chunks.map(c => c.document.id).filter(id => id));
    
    for (const documentId of documentsToUpdate) {
      try {
        await pipelineStorage.storeValidatedContent(documentId, {
          validChunks: chunks.filter(c => c.document.id === documentId).length,
          validationTime: new Date().toISOString(),
          validationErrors: totalErrors
        });
        console.log(`💾 Updated document ${documentId} status to 'validated'`);
      } catch (error) {
        console.error(`❌ Error updating document status:`, error.message);
      }
    }
  }
  
  console.log(`✅ Validated ${validChunks} chunks`);
  if (totalErrors > 0) {
    console.log(`⚠️  Found ${totalErrors} validation errors`);
  }
  
  if (useDatabase) {
    console.log('💾 All validation results stored in database');
  } else {
    console.log('💾 Validated files written to .work/validated/');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validate().catch(console.error);
}

export default validate;