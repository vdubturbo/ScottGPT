import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import slugify from "@sindresorhus/slugify";

const IN = ".work/validated";
const ROOT = "sources";

async function write() {
  console.log("💾 Writing to source files...");
  
  const files = (await fs.readdir(IN)).filter(f => f.endsWith(".md"));
  
  if (files.length === 0) {
    console.log("📄 No validated files found to write");
    return;
  }
  
  let writtenFiles = 0;
  const typeStats = {};
  
  for (const f of files) {
    try {
      const raw = await fs.readFile(path.join(IN, f), "utf8");
      const { data, content } = matter(raw);
      
      // Determine target directory based on type
      let dirName;
      switch (data.type) {
        case "job":
          dirName = "jobs";
          break;
        case "project":
          dirName = "projects";
          break;
        case "education":
          dirName = "education";
          break;
        case "cert":
          dirName = "certs";
          break;
        case "bio":
          dirName = "bio";
          break;
        default:
          console.error(`❌ Unknown type: ${data.type} in ${f}`);
          continue;
      }
      
      const targetDir = path.join(ROOT, dirName);
      await fs.mkdir(targetDir, { recursive: true });
      
      // Create stable filename: YYYY-title-slug.md
      const year = data.date_start ? data.date_start.slice(0, 4) : "0000";
      const titleSlug = slugify(data.title || "untitled");
      const fileName = `${year}-${titleSlug}.md`;
      const filePath = path.join(targetDir, fileName);
      
      // Check if file already exists
      let finalPath = filePath;
      let counter = 1;
      while (true) {
        try {
          await fs.access(finalPath);
          // File exists, try with counter
          const baseName = fileName.replace(".md", "");
          finalPath = path.join(targetDir, `${baseName}-${counter}.md`);
          counter++;
        } catch {
          // File doesn't exist, we can use this path
          break;
        }
      }
      
      // Write the file
      const finalContent = matter.stringify(content, data);
      await fs.writeFile(finalPath, finalContent);
      
      console.log(`📁 Written: ${path.relative(process.cwd(), finalPath)}`);
      
      // Track statistics
      typeStats[data.type] = (typeStats[data.type] || 0) + 1;
      writtenFiles++;
      
    } catch (error) {
      console.error(`❌ Error writing ${f}:`, error.message);
    }
  }
  
  console.log(`✅ Written ${writtenFiles} source files`);
  
  // Print statistics
  if (Object.keys(typeStats).length > 0) {
    console.log("📊 File breakdown by type:");
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