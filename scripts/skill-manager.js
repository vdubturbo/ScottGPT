#!/usr/bin/env node
import SkillDiscoveryService from '../services/skills.js';
import readline from 'readline';

const skillService = new SkillDiscoveryService();

async function main() {
  await skillService.initialize();
  
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'report':
      console.log(skillService.getDiscoveredSkillsReport());
      break;
      
    case 'approve-high':
      await skillService.approveSkills({ priority: 'high' });
      break;
      
    case 'approve-category':
      if (args.length === 0) {
        console.error('❌ Please specify a category');
        process.exit(1);
      }
      await skillService.approveSkills({ category: args[0] });
      break;
      
    case 'approve':
      if (args.length === 0) {
        console.error('❌ Please specify skills to approve');
        process.exit(1);
      }
      await skillService.approveSkills({ skills: args });
      break;
      
    case 'interactive':
      await interactiveApproval();
      break;
      
    default:
      showHelp();
      break;
  }
}

async function interactiveApproval() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const discoveredSkills = skillService.discoveredSkills
    .sort((a, b) => b.occurrences - a.occurrences);

  if (discoveredSkills.length === 0) {
    console.log('✅ No skills pending approval');
    rl.close();
    return;
  }

  console.log(`\n🎯 Interactive Skill Approval (${discoveredSkills.length} skills)\n`);

  for (const skill of discoveredSkills) {
    console.log(`\n📋 Skill: "${skill.skill}"`);
    console.log(`   Category: ${skill.category} | Priority: ${skill.priority} | Occurrences: ${skill.occurrences}`);
    
    if (skill.similar.length > 0) {
      console.log(`   Similar existing: ${skill.similar.slice(0, 2).map(s => s.skill).join(', ')}`);
    }
    
    if (skill.suggestions.length > 0) {
      console.log(`   💡 Suggestion: ${skill.suggestions[0].suggestion}`);
    }

    const answer = await question(rl, '   Action: [a]pprove, [s]kip, [r]ename, [q]uit? ');
    
    switch (answer.toLowerCase()) {
      case 'a':
      case 'approve':
        await skillService.approveSkills({ skills: [skill.skill] });
        break;
        
      case 'r':
      case 'rename':
        const newName = await question(rl, '   Enter new skill name: ');
        if (newName.trim()) {
          // Remove old, add new
          const index = skillService.discoveredSkills.findIndex(s => s.skill === skill.skill);
          if (index !== -1) {
            skillService.discoveredSkills.splice(index, 1);
          }
          await skillService.approveSkills({ skills: [newName.trim()] });
        }
        break;
        
      case 's':
      case 'skip':
        console.log('   ⏭️  Skipped');
        break;
        
      case 'q':
      case 'quit':
        console.log('👋 Approval session ended');
        rl.close();
        return;
        
      default:
        console.log('   ❓ Unknown action, skipping');
        break;
    }
  }

  console.log('\n✅ Interactive approval complete!');
  rl.close();
}

function question(rl, prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

function showHelp() {
  console.log(`
📊 Skill Manager Commands:

  report              Show discovered skills report
  approve-high        Approve all high priority skills  
  approve-category    Approve skills by category
  approve <skills>    Approve specific skills
  interactive         Interactive approval process

Examples:
  npm run skills:report
  npm run skills:approve-high
  npm run skills:approve-category -- "Security"
  npm run skills:approve -- "Cloud Security" "Risk Management"
  npm run skills:interactive
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}