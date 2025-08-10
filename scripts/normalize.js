import { execa } from "execa";
import fs from "fs/promises";
import path from "path";

const IN = "incoming";
const OUT = ".work/normalized";

async function normalize() {
  console.log("🔄 Normalizing documents...");
  
  // Ensure output directory exists
  await fs.mkdir(OUT, { recursive: true });

  // Get list of files in incoming directory
  let files;
  try {
    files = await fs.readdir(IN);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log("📁 No incoming directory found - creating it");
      await fs.mkdir(IN, { recursive: true });
      files = [];
    } else {
      throw error;
    }
  }

  if (files.length === 0) {
    console.log("📄 No files found in incoming/ directory");
    return;
  }

  let processed = 0;
  for (const f of files) {
    const src = path.join(IN, f);
    const stats = await fs.stat(src);
    
    if (!stats.isFile()) continue;
    
    const ext = f.split(".").pop()?.toLowerCase();
    
    // Skip files that aren't documents
    if (!["pdf", "docx", "doc", "txt", "md"].includes(ext)) {
      console.log(`⏭️  Skipping ${f} (unsupported format)`);
      continue;
    }

    const baseName = f.replace(/\.(pdf|docx|doc|txt|md)$/i, "");
    const outPath = path.join(OUT, `${baseName}.md`);

    try {
      if (ext === "md") {
        // Just copy markdown files
        await fs.copyFile(src, outPath);
        console.log(`📋 Copied: ${f} → ${baseName}.md`);
      } else if (ext === "txt") {
        // Convert txt to markdown with basic formatting
        const content = await fs.readFile(src, "utf8");
        await fs.writeFile(outPath, content);
        console.log(`📄 Converted: ${f} → ${baseName}.md`);
      } else {
        // Use pandoc for PDF and DOCX files
        await execa("pandoc", [src, "-t", "gfm", "-o", outPath]);
        console.log(`🔄 Converted: ${f} → ${baseName}.md`);
      }
      processed++;
    } catch (error) {
      console.error(`❌ Error processing ${f}:`, error.message);
      console.error(`💡 Make sure pandoc is installed: brew install pandoc`);
    }
  }

  console.log(`✅ Normalized ${processed} files to markdown`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  normalize().catch(console.error);
}

export default normalize;