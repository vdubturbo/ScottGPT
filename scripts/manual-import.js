const fs = require('fs/promises');
const path = require('path');
const matter = require('gray-matter');
const crypto = require('crypto');

// Simple manual import tool for documents that bypass the extraction pipeline
async function manualImport() {
  console.log('🔧 Manual import tool for ScottGPT');
  
  const incomingDir = 'incoming';
  const sourcesDir = 'sources';
  
  try {
    const files = await fs.readdir(incomingDir);
    const docFiles = files.filter(f => f.match(/\.(md|txt)$/i));
    
    if (docFiles.length === 0) {
      console.log('📂 No .md or .txt files found in incoming/ directory');
      console.log('   Place markdown files with YAML frontmatter in incoming/ to import');
      return;
    }
    
    console.log(`📄 Found ${docFiles.length} files to import:`);
    
    for (const file of docFiles) {
      console.log(`\n🔍 Processing: ${file}`);
      
      const filePath = path.join(incomingDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      
      try {
        const parsed = matter(content);
        const data = parsed.data;
        
        // Validate required fields
        const required = ['id', 'type', 'title', 'org'];
        const missing = required.filter(field => !data[field]);
        
        if (missing.length > 0) {
          console.log(`❌ Missing required fields: ${missing.join(', ')}`);
          console.log('   Add these to the YAML frontmatter and try again');
          continue;
        }
        
        // Validate type
        const validTypes = ['job', 'project', 'education', 'cert', 'bio'];
        if (!validTypes.includes(data.type)) {
          console.log(`❌ Invalid type: ${data.type}. Must be one of: ${validTypes.join(', ')}`);
          continue;
        }
        
        // Determine output directory and filename
        const typeDir = path.join(sourcesDir, data.type === 'cert' ? 'certs' : `${data.type}s`);
        await fs.mkdir(typeDir, { recursive: true });
        
        const outputFile = path.join(typeDir, file);
        
        // Check if file already exists
        try {
          await fs.access(outputFile);
          console.log(`⚠️  File already exists: ${outputFile}`);
          console.log('   Skipping to avoid overwrite');
          continue;
        } catch (e) {
          // File doesn't exist, proceed
        }
        
        // Copy file to sources directory
        await fs.writeFile(outputFile, content);
        console.log(`✅ Imported: ${outputFile}`);
        
        // Move original to processed
        const processedDir = 'processed';
        await fs.mkdir(processedDir, { recursive: true });
        const timestamp = Date.now();
        const processedFile = path.join(processedDir, `${timestamp}-${file}`);
        await fs.rename(filePath, processedFile);
        console.log(`📦 Moved original to: ${processedFile}`);
        
      } catch (error) {
        console.log(`❌ Error parsing ${file}: ${error.message}`);
        console.log('   Make sure the file has valid YAML frontmatter');
      }
    }
    
    console.log('\n✅ Manual import complete!');
    console.log('🔗 Run "npm run ingest:index" to create embeddings for new content');
    
  } catch (error) {
    console.error('💥 Import failed:', error);
  }
}

if (require.main === module) {
  manualImport().catch(console.error);
}

module.exports = manualImport;