import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import slugify from '@sindresorhus/slugify';

const IN = '.work/validated';
const ROOT = 'sources';

// Function to split content containing multiple YAML frontmatter blocks
function splitMultipleYamlBlocks(content) {
  const blocks = [];
  
  // Split by the pattern: ---\n...yaml content...\n---\n (followed by optional empty lines and next block)
  const yamlBlockPattern = /---\s*\n([\s\S]*?)\n---\s*(\n|$)/g;
  
  let match;
  while ((match = yamlBlockPattern.exec(content)) !== null) {
    const yamlSection = match[1].trim();
    
    // Skip empty or invalid YAML blocks
    if (!yamlSection || !yamlSection.includes(':')) {
      console.log(`⚠️  Skipping empty or invalid YAML block`);
      continue;
    }
    
    // Reconstruct the full block with proper YAML frontmatter format
    // Since these are pure job data extractions, there's typically no content section after the YAML
    const fullBlock = `---\n${yamlSection}\n---\n`;
    blocks.push(fullBlock);
  }
  
  console.log(`🔍 Parsed ${blocks.length} YAML blocks from content with ${content.split('---').length - 1} delimiters`);
  
  // Fallback: if no blocks found but content starts with ---, treat as single block
  if (blocks.length === 0 && content.trim().startsWith('---')) {
    console.log(`🔄 Using fallback: treating entire content as single block`);
    blocks.push(content);
  }
  
  return blocks;
}

async function write() {
  console.log('💾 Writing to source files...');
  
  const files = (await fs.readdir(IN)).filter(f => f.endsWith('.md'));
  
  if (files.length === 0) {
    console.log('📄 No validated files found to write');
    return;
  }
  
  let writtenFiles = 0;
  const typeStats = {};
  
  for (const f of files) {
    try {
      const raw = await fs.readFile(path.join(IN, f), 'utf8');
      
      // Split file if it contains multiple YAML frontmatter blocks
      const yamlBlocks = splitMultipleYamlBlocks(raw);
      
      if (yamlBlocks.length === 0) {
        console.log(`⚠️  No valid YAML frontmatter found in ${f}`);
        continue;
      }
      
      console.log(`📄 Processing ${f}: Found ${yamlBlocks.length} YAML block(s)`);
      
      // Process each YAML block as a separate source record
      for (let blockIndex = 0; blockIndex < yamlBlocks.length; blockIndex++) {
        const blockRaw = yamlBlocks[blockIndex];
        const { data, content } = matter(blockRaw);
        
        if (!data.type) {
          console.log(`⚠️  Skipping block ${blockIndex} in ${f}: No type field`);
          continue;
        }
        
        // Determine target directory based on type
        let dirName;
        switch (data.type) {
        case 'job':
          dirName = 'jobs';
          break;
        case 'project':
          dirName = 'projects';
          break;
        case 'education':
          dirName = 'education';
          break;
        case 'cert':
          dirName = 'certs';
          break;
        case 'bio':
          dirName = 'bio';
          break;
        default:
          console.error(`❌ Unknown type: ${data.type} in ${f}, block ${blockIndex}`);
          continue;
        }
        
        const targetDir = path.join(ROOT, dirName);
        await fs.mkdir(targetDir, { recursive: true });
        
        // Create stable filename: YYYY-title-slug.md
        const year = data.date_start ? String(data.date_start).slice(0, 4) : '0000';
        const titleSlug = slugify(data.title || 'untitled');
        const baseFileName = `${year}-${titleSlug}`;
        
        // Add block suffix if multiple blocks in source file
        const fileName = yamlBlocks.length > 1 
          ? `${baseFileName}-${blockIndex}.md`
          : `${baseFileName}.md`;
        
        let finalPath = path.join(targetDir, fileName);
        
        // Check if file already exists and add counter if needed
        let counter = 1;
        while (true) {
          try {
            await fs.access(finalPath);
            // File exists, try with counter
            const baseName = fileName.replace('.md', '');
            finalPath = path.join(targetDir, `${baseName}-${counter}.md`);
            counter++;
          } catch {
            // File doesn't exist, we can use this path
            break;
          }
        }
        
        // Write the individual source file
        const finalContent = matter.stringify(content, data);
        await fs.writeFile(finalPath, finalContent);
        
        console.log(`📁 Written: ${path.relative(process.cwd(), finalPath)}`);
        console.log(`   📝 Type: ${data.type}, Title: ${data.title}, Org: ${data.org || 'N/A'}`);
        
        // Track statistics
        typeStats[data.type] = (typeStats[data.type] || 0) + 1;
        writtenFiles++;
      }
      
    } catch (error) {
      console.error(`❌ Error writing ${f}:`, error.message);
    }
  }
  
  console.log(`✅ Written ${writtenFiles} source files`);
  
  // Print statistics
  if (Object.keys(typeStats).length > 0) {
    console.log('📊 File breakdown by type:');
    Object.entries(typeStats).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} files`);
    });
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  write().catch(console.error);
}

export default write;