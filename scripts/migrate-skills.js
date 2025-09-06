import { supabase } from '../config/database.js';
import SkillDiscoveryService from '../services/skills.js';

/**
 * Migration script to populate the skills reference table
 * from existing content_chunks data
 */

async function migrateSkillsFromContentChunks() {
  console.log('🔄 Starting skills migration from content_chunks...');
  
  try {
    // Initialize skill discovery service
    const skillService = new SkillDiscoveryService();
    await skillService.initialize();
    
    // Get all unique skills from content_chunks
    console.log('📊 Gathering existing skills from content_chunks...');
    const { data: chunks, error: chunksError } = await supabase
      .from('content_chunks')
      .select('skills')
      .not('skills', 'is', null);
    
    if (chunksError) throw chunksError;
    
    // Collect all unique skills
    const allSkills = new Set();
    chunks.forEach(chunk => {
      if (Array.isArray(chunk.skills)) {
        chunk.skills.forEach(skill => {
          if (skill && skill.trim()) {
            allSkills.add(skill.trim());
          }
        });
      }
    });
    
    console.log(`📋 Found ${allSkills.size} unique skills in content_chunks`);
    
    // Get all unique skills from sources table too
    console.log('📊 Gathering existing skills from sources...');
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('skills')
      .not('skills', 'is', null);
    
    if (sourcesError) throw sourcesError;
    
    sources.forEach(source => {
      if (Array.isArray(source.skills)) {
        source.skills.forEach(skill => {
          if (skill && skill.trim()) {
            allSkills.add(skill.trim());
          }
        });
      }
    });
    
    console.log(`📋 Total unique skills across both tables: ${allSkills.size}`);
    
    // Categorize and insert each skill
    const skillsArray = Array.from(allSkills).sort();
    const results = {
      inserted: [],
      failed: [],
      skipped: []
    };
    
    console.log('🔧 Processing skills with categorization...');
    
    for (const skill of skillsArray) {
      try {
        // Use skill discovery service to categorize
        const category = skillService.categorizeSkill(skill);
        
        // Check if skill already exists in database
        const { data: existing, error: selectError } = await supabase
          .from('skills')
          .select('name')
          .eq('name', skill)
          .single();
        
        if (selectError && selectError.code !== 'PGRST116') { // Not "no rows found"
          throw selectError;
        }
        
        if (existing) {
          results.skipped.push(skill);
          continue;
        }
        
        // Insert the skill
        const { error: insertError } = await supabase
          .from('skills')
          .insert({
            name: skill,
            category: category.category,
            aliases: [],
            created_at: new Date().toISOString()
          });
        
        if (insertError) throw insertError;
        
        results.inserted.push({ name: skill, category: category.category, priority: category.priority });
        console.log(`✅ Added: ${skill} (${category.category}, ${category.priority})`);
        
      } catch (error) {
        results.failed.push({ skill, error: error.message });
        console.error(`❌ Failed to process "${skill}":`, error.message);
      }
    }
    
    // Display results summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 SKILLS MIGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`✅ Successfully inserted: ${results.inserted.length} skills`);
    console.log(`⏭️  Skipped (already exist): ${results.skipped.length} skills`);
    console.log(`❌ Failed: ${results.failed.length} skills`);
    console.log(`📊 Total processed: ${skillsArray.length} skills`);
    
    // Show breakdown by category
    if (results.inserted.length > 0) {
      console.log('\n📋 Skills added by category:');
      const byCategory = results.inserted.reduce((acc, skill) => {
        acc[skill.category] = (acc[skill.category] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(byCategory)
        .sort(([,a], [,b]) => b - a)
        .forEach(([category, count]) => {
          console.log(`  ${category}: ${count} skills`);
        });
      
      console.log('\n🔍 Sample skills by category:');
      const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
      results.inserted
        .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
        .slice(0, 10)
        .forEach(skill => {
          console.log(`  • ${skill.name} (${skill.category}, ${skill.priority} priority)`);
        });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed skills:');
      results.failed.slice(0, 5).forEach(failure => {
        console.log(`  • "${failure.skill}": ${failure.error}`);
      });
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Skills table is now ready for vocabulary management and filtering.');
    
    return results;
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Verify the migration results
async function verifySkillsTable() {
  console.log('\n🔍 Verifying skills table...');
  
  try {
    // Get all skills grouped by category
    const { data: skills, error } = await supabase
      .from('skills')
      .select('name, category')
      .order('category, name');
    
    if (error) throw error;
    
    // Group by category
    const byCategory = skills.reduce((acc, skill) => {
      acc[skill.category] = (acc[skill.category] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📊 Skills table summary:');
    Object.entries(byCategory)
      .sort(([,a], [,b]) => b - a)
      .forEach(([category, count]) => {
        console.log(`  ${category}: ${count} skills`);
      });
    
    console.log(`📈 Total skills in reference table: ${skills.length}`);
    
    // Show sample skills
    if (skills.length > 0) {
      console.log('\n📋 Sample skills:');
      skills.slice(0, 10).forEach(skill => {
        console.log(`  • ${skill.name} (${skill.category})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateSkillsFromContentChunks()
    .then(() => verifySkillsTable())
    .catch(console.error);
}

export { migrateSkillsFromContentChunks, verifySkillsTable };