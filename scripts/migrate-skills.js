import { supabase } from '../config/database.js';
import DatabaseSkillsService from '../services/skills.js';

/**
 * Migration script to populate the skills reference table
 * from existing content_chunks data
 */

async function migrateSkillsFromContentChunks() {
  console.log('🔄 Starting database-based skills migration...');
  
  try {
    // Initialize database skills service
    const skillService = new DatabaseSkillsService();
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
    
    // Check which skills are already in the skills table
    const skillsArray = Array.from(allSkills);
    const unapprovedSkills = [];
    
    for (const skill of skillsArray) {
      const isApproved = await skillService.isApprovedSkill(skill);
      if (!isApproved) {
        unapprovedSkills.push(skill);
      }
    }
    
    console.log(`🔍 Found ${unapprovedSkills.length} skills not yet in skills table`);
    
    if (unapprovedSkills.length === 0) {
      console.log('✅ All discovered skills are already in the skills table');
      return { inserted: [], skipped: skillsArray.length, failed: [] };
    }
    
    // Categorize and insert discovered skills
    const results = {
      inserted: [],
      failed: [],
      skipped: allSkills.size - unapprovedSkills.length
    };
    
    console.log('🔧 Adding discovered skills to skills table...');
    
    for (const skill of unapprovedSkills) {
      try {
        // Simple categorization based on common patterns
        let category = 'Other';
        const skillLower = skill.toLowerCase();
        
        if (skillLower.includes('javascript') || skillLower.includes('python') || skillLower.includes('react') || skillLower.includes('node')) {
          category = 'technical';
        } else if (skillLower.includes('management') || skillLower.includes('leadership') || skillLower.includes('team')) {
          category = 'leadership';
        } else if (skillLower.includes('strategy') || skillLower.includes('business') || skillLower.includes('process')) {
          category = 'business';
        }
        
        const result = await skillService.addSkill(skill, category);
        
        if (result) {
          results.inserted.push({ name: skill, category: category });
          console.log(`✅ Added: ${skill} (${category})`);
        } else {
          results.skipped++;
          console.log(`⏭️ Skipped: ${skill} (already exists)`);
        }
        
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