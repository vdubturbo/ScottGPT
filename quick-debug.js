#!/usr/bin/env node

/**
 * Quick debug script to check for C++ content contamination
 */

import { supabase } from './config/database.js';

const userId = process.argv[2];

if (!userId) {
  console.log('Usage: node quick-debug.js <user_id>');
  process.exit(1);
}

console.log(`🔍 Checking C++ contamination for user: ${userId}`);
console.log('==================================================');

// Check content chunks
const { data: chunks, error: chunksError } = await supabase
  .from('content_chunks')
  .select('id, content, created_at')
  .eq('user_id', userId)
  .ilike('content', '%C++%');

console.log(`\n📊 Content chunks with C++: ${chunks?.length || 0}`);
if (chunks?.length > 0) {
  chunks.forEach(chunk => {
    console.log(`  - ID: ${chunk.id}, Created: ${chunk.created_at}`);
    console.log(`    Content: ${chunk.content.substring(0, 100)}...`);
  });
}

// Check extracted skills
const { data: skills, error: skillsError } = await supabase
  .from('extracted_skills')
  .select('*')
  .eq('user_id', userId)
  .ilike('skill_name', '%C++%');

console.log(`\n🎯 Extracted skills with C++: ${skills?.length || 0}`);
if (skills?.length > 0) {
  skills.forEach(skill => {
    console.log(`  - Skill: ${skill.skill_name}, Source: ${skill.source_file}`);
  });
}

// Check work history
const { data: work, error: workError } = await supabase
  .from('work_history')
  .select('*')
  .eq('user_id', userId);

if (work) {
  const workWithCpp = work.filter(w =>
    JSON.stringify(w).toLowerCase().includes('c++')
  );
  console.log(`\n💼 Work history entries with C++: ${workWithCpp.length}`);
  workWithCpp.forEach(w => {
    console.log(`  - Position: ${w.position}, Company: ${w.company}`);
  });
}

console.log('\n✅ Debug complete!');
process.exit(0);