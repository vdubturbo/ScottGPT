import fs from 'fs/promises';
import path from 'path';
import { db } from '../config/database.js';

async function archiveProcessedFiles() {
  try {
    console.log('📁 Starting archive process...');
    
    const archiveBase = 'archives';
    const sourceBase = 'sources';
    
    await fs.mkdir(archiveBase, { recursive: true });
    await fs.mkdir(path.join(archiveBase, 'jobs'), { recursive: true });
    await fs.mkdir(path.join(archiveBase, 'projects'), { recursive: true });
    await fs.mkdir(path.join(archiveBase, 'education'), { recursive: true });
    await fs.mkdir(path.join(archiveBase, 'certs'), { recursive: true });
    await fs.mkdir(path.join(archiveBase, 'bio'), { recursive: true });
    
    const sourceTypes = ['jobs', 'projects', 'education', 'certs', 'bio'];
    let totalMoved = 0;
    
    for (const type of sourceTypes) {
      const sourceDir = path.join(sourceBase, type);
      const archiveDir = path.join(archiveBase, type);
      
      try {
        const files = await fs.readdir(sourceDir);
        console.log(`📂 Processing ${type}: ${files.length} files`);
        
        for (const file of files) {
          if (file.endsWith('.md')) {
            const sourcePath = path.join(sourceDir, file);
            const archivePath = path.join(archiveDir, file);
            
            const isIndexed = await checkIfFileIndexed(sourcePath);
            
            if (isIndexed) {
              await fs.rename(sourcePath, archivePath);
              console.log(`  📦 Archived: ${file}`);
              totalMoved++;
            } else {
              console.log(`  ⏳ Keeping: ${file} (not yet indexed)`);
            }
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Error processing ${type}:`, error.message);
        }
      }
    }
    
    console.log(`✅ Archive complete! Moved ${totalMoved} files to archives/`);
    console.log('💡 Next indexing run will be much faster!');
    
    const remainingFiles = await countRemainingFiles();
    console.log(`📊 Remaining in sources/: ${remainingFiles} files`);
    
  } catch (error) {
    console.error('Archive error:', error);
  }
}

async function checkIfFileIndexed(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) return false;
    
    const frontmatter = frontmatterMatch[1];
    const idMatch = frontmatter.match(/^id:\s*(.+)$/m);
    
    if (!idMatch) return false;
    
    const sourceId = idMatch[1].trim();
    
    const { data, error } = await db.supabase
      .from('content_chunks')
      .select('id')
      .eq('source_id', sourceId)
      .limit(1);
      
    return !error && data && data.length > 0;
    
  } catch (error) {
    console.error(`Error checking file ${filePath}:`, error.message);
    return false;
  }
}

async function countRemainingFiles() {
  let total = 0;
  const sourceTypes = ['jobs', 'projects', 'education', 'certs', 'bio'];
  
  for (const type of sourceTypes) {
    try {
      const files = await fs.readdir(path.join('sources', type));
      total += files.filter(f => f.endsWith('.md')).length;
    } catch (error) {
      // Directory might not exist
    }
  }
  
  return total;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  archiveProcessedFiles().catch(console.error);
}

export default archiveProcessedFiles;