#!/usr/bin/env node
import DatabaseSkillsService from '../services/skills.js';
import { supabase } from '../config/database.js';

/**
 * Skills Management CLI Tool
 * Manages the skills database table and approval workflow
 */

const skillsService = new DatabaseSkillsService();

// Command line argument parsing
const command = process.argv[2];
const args = process.argv.slice(3);

async function showHelp() {
  console.log(`
📋 Skills Manager - Database Skills Management Tool

USAGE:
  node scripts/skills-manager.js <command> [options]

COMMANDS:
  stats                    Show skills database statistics
  list [category]          List all skills, optionally by category
  search <term>            Search for skills by name or alias
  add <name> <category>    Add a new skill to database
  suggest <partial>        Get skill suggestions for partial match
  validate <skill1,skill2> Validate comma-separated skills
  populate                 Populate database with discovered skills
  export                   Export skills to JSON
  import <file>           Import skills from JSON file
  clean-duplicates        Remove duplicate skills

EXAMPLES:
  node scripts/skills-manager.js stats
  node scripts/skills-manager.js list technical
  node scripts/skills-manager.js search "project"
  node scripts/skills-manager.js add "Kubernetes" technical
  node scripts/skills-manager.js validate "JavaScript,React,Unknown Skill"
  node scripts/skills-manager.js populate
`);
}

async function showStats() {
  console.log('📊 Skills Database Statistics');
  console.log('=' .repeat(50));
  
  try {
    await skillsService.initialize();
    const stats = await skillsService.getSkillsStats();
    
    console.log(`Total Skills: ${stats.totalSkills}`);
    console.log(`Total Aliases: ${stats.totalAliases}`);
    console.log('\nSkills by Category:');
    
    Object.entries(stats.byCategory)
      .sort(([,a], [,b]) => b - a)
      .forEach(([category, count]) => {
        console.log(`  ${category}: ${count} skills`);
      });
      
  } catch (error) {
    console.error('❌ Failed to get statistics:', error.message);
  }
}

async function listSkills(category = null) {
  try {
    await skillsService.initialize();
    const skillsByCategory = await skillsService.getSkillsByCategory(category);
    
    if (category) {
      console.log(`📋 Skills in category: ${category}`);
      console.log('=' .repeat(40));
      const skills = skillsByCategory || [];
      skills.sort().forEach(skill => console.log(`  • ${skill}`));
      console.log(`\nTotal: ${skills.length} skills`);
    } else {
      console.log('📋 All Skills by Category');
      console.log('=' .repeat(40));
      
      Object.entries(skillsByCategory)
        .sort(([,a], [,b]) => b.length - a.length)
        .forEach(([cat, skills]) => {
          console.log(`\n🔸 ${cat.toUpperCase()} (${skills.length})`);
          skills.sort().forEach(skill => console.log(`  • ${skill}`));
        });
    }
  } catch (error) {
    console.error('❌ Failed to list skills:', error.message);
  }
}

async function searchSkills(searchTerm) {
  if (!searchTerm) {
    console.log('❌ Please provide a search term');
    return;
  }
  
  try {
    await skillsService.initialize();
    const suggestions = await skillsService.getSkillSuggestions(searchTerm, 20);
    
    console.log(`🔍 Search results for: "${searchTerm}"`);
    console.log('=' .repeat(40));
    
    if (suggestions.length === 0) {
      console.log('No matching skills found.');
      
      // Show similar skills
      const similar = await skillsService.findSimilarSkills(searchTerm);
      if (similar.length > 0) {
        console.log('\n💡 Similar skills:');
        similar.forEach(sim => {
          console.log(`  • ${sim.skill} (${sim.confidence.toFixed(2)} match)`);
        });
      }
    } else {
      suggestions.forEach(suggestion => {
        const matchInfo = suggestion.match === 'alias' ? ` [alias: ${suggestion.matchedAlias}]` : '';
        console.log(`  • ${suggestion.name} (${suggestion.category})${matchInfo}`);
      });
    }
  } catch (error) {
    console.error('❌ Search failed:', error.message);
  }
}

async function addSkill(name, category) {
  if (!name || !category) {
    console.log('❌ Usage: add <name> <category>');
    return;
  }
  
  try {
    await skillsService.initialize();
    const result = await skillsService.addSkill(name, category);
    
    if (result) {
      console.log(`✅ Added skill: "${name}" (${category})`);
    } else {
      console.log(`⏭️  Skill "${name}" already exists`);
    }
  } catch (error) {
    console.error(`❌ Failed to add skill: ${error.message}`);
  }
}

async function validateSkills(skillsList) {
  if (!skillsList) {
    console.log('❌ Usage: validate <skill1,skill2,skill3>');
    return;
  }
  
  const skills = skillsList.split(',').map(s => s.trim());
  
  try {
    await skillsService.initialize();
    const result = await skillsService.validateSkills(skills);
    
    console.log('✅ Skills Validation Results');
    console.log('=' .repeat(40));
    
    if (result.valid.length > 0) {
      console.log('\n✅ Valid Skills:');
      result.valid.forEach(skill => console.log(`  • ${skill}`));
    }
    
    if (result.invalid.length > 0) {
      console.log('\n❌ Invalid Skills:');
      result.invalid.forEach(skill => console.log(`  • ${skill}`));
      
      if (result.suggestions.length > 0) {
        console.log('\n💡 Suggestions:');
        result.suggestions.forEach(suggestion => {
          console.log(`  "${suggestion.original}" → suggestions:`);
          suggestion.suggestions.forEach(sug => {
            console.log(`    - ${sug.skill} (${sug.confidence.toFixed(2)} match)`);
          });
        });
      }
    }
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
  }
}

async function populateFromDiscovered() {
  try {
    console.log('🔄 Scanning for discovered skills...');
    
    // Get all unique skills from content_chunks and sources
    const { data: chunks } = await supabase
      .from('content_chunks')
      .select('skills')
      .not('skills', 'is', null);
      
    const { data: sources } = await supabase
      .from('sources')
      .select('skills')
      .not('skills', 'is', null);
    
    const allDiscoveredSkills = new Set();
    
    // Collect from chunks
    if (chunks) {
      chunks.forEach(chunk => {
        if (Array.isArray(chunk.skills)) {
          chunk.skills.forEach(skill => allDiscoveredSkills.add(skill.trim()));
        }
      });
    }
    
    // Collect from sources
    if (sources) {
      sources.forEach(source => {
        if (Array.isArray(source.skills)) {
          source.skills.forEach(skill => allDiscoveredSkills.add(skill.trim()));
        }
      });
    }
    
    console.log(`📊 Found ${allDiscoveredSkills.size} unique skills in documents`);
    
    await skillsService.initialize();
    
    // Check which ones are not yet approved
    const unapprovedSkills = [];
    for (const skill of allDiscoveredSkills) {
      const isApproved = await skillsService.isApprovedSkill(skill);
      if (!isApproved) {
        unapprovedSkills.push(skill);
      }
    }
    
    console.log(`🔍 Found ${unapprovedSkills.length} unapproved skills`);
    
    if (unapprovedSkills.length === 0) {
      console.log('✅ All discovered skills are already approved');
      return;
    }
    
    // Show first 10 for review
    console.log('\n📋 Sample unapproved skills:');
    unapprovedSkills.slice(0, 10).forEach(skill => console.log(`  • ${skill}`));
    
    if (unapprovedSkills.length > 10) {
      console.log(`  ... and ${unapprovedSkills.length - 10} more`);
    }
    
    console.log('\n💡 To approve these skills, use:');
    console.log('   node scripts/skills-manager.js add "<skill-name>" <category>');
    
  } catch (error) {
    console.error('❌ Population scan failed:', error.message);
  }
}

async function exportSkills() {
  try {
    await skillsService.initialize();
    
    const { data: skills, error } = await supabase
      .from('skills')
      .select('*')
      .order('category, name');
      
    if (error) throw error;
    
    const exportData = {
      exported_at: new Date().toISOString(),
      total_skills: skills.length,
      skills: skills
    };
    
    const filename = `skills-export-${new Date().toISOString().split('T')[0]}.json`;
    console.log(JSON.stringify(exportData, null, 2));
    console.log(`\n💾 To save to file: node scripts/skills-manager.js export > ${filename}`);
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
  }
}

// Main command router
async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    await showHelp();
    return;
  }
  
  switch (command) {
    case 'stats':
      await showStats();
      break;
      
    case 'list':
      await listSkills(args[0]);
      break;
      
    case 'search':
      await searchSkills(args[0]);
      break;
      
    case 'add':
      await addSkill(args[0], args[1]);
      break;
      
    case 'validate':
      await validateSkills(args[0]);
      break;
      
    case 'populate':
      await populateFromDiscovered();
      break;
      
    case 'export':
      await exportSkills();
      break;
      
    case 'suggest':
      await searchSkills(args[0]); // Same as search for now
      break;
      
    default:
      console.log(`❌ Unknown command: ${command}`);
      await showHelp();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}