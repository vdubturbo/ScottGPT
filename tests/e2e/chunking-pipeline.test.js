import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { StreamlinedProcessor } from '../../services/streamlined-processor.js';
import { supabase } from '../../config/database.js';
import fs from 'fs/promises';

describe('Atomic Chunking Pipeline E2E', () => {
  let processor;
  let testUserId = '345850e8-4f02-48cb-9789-d40e9cc3ee8e';
  let createdChunkIds = [];
  let createdSourceIds = [];

  beforeAll(async () => {
    processor = new StreamlinedProcessor();
    
    // Clean up any existing test data
    await supabase.from('content_chunks').delete().eq('user_id', testUserId);
    await supabase.from('sources').delete().eq('user_id', testUserId);
  });

  afterAll(async () => {
    // Clean up test data
    if (createdChunkIds.length > 0) {
      await supabase.from('content_chunks').delete().in('id', createdChunkIds);
    }
    if (createdSourceIds.length > 0) {
      await supabase.from('sources').delete().in('id', createdSourceIds);
    }
  });

  it('should process document end-to-end with atomic chunking', async () => {
    const testResume = `
Software Engineer
TechCorp
San Francisco, CA
2022 - Present

• Reduced deployment time by 45% through CI/CD automation
• Led team of 8 developers on microservices migration
• Built 12 React components improving user engagement by 30%
• Implemented monitoring reducing incident response by 2 hours

Skills: JavaScript, React, Node.js, Docker, AWS, Python
    `.trim();

    const buffer = Buffer.from(testResume, 'utf-8');
    
    const result = await processor.processUploadedFile(
      buffer,
      'test-resume.txt',
      'text/plain',
      testUserId
    );

    expect(result.success).toBe(true);
    expect(result.chunksStored).toBeGreaterThan(1);
    
    // Query created chunks
    const { data: chunks } = await supabase
      .from('content_chunks')
      .select('*')
      .eq('user_id', testUserId)
      .eq('extraction_method', 'streamlined-atomic-v2');

    expect(chunks.length).toBeGreaterThan(1);
    createdChunkIds = chunks.map(c => c.id);

    // Verify atomic chunking constraints
    chunks.forEach(chunk => {
      expect(chunk.token_count).toBeLessThanOrEqual(180);
      expect(chunk.token_count).toBeGreaterThan(10);
      expect(chunk.content).not.toContain('---'); // No YAML in content
      expect(chunk.metadata).toBeTruthy();
      expect(chunk.metadata.chunk_type).toBeTruthy();
    });

    // Verify different chunk types exist
    const chunkTypes = chunks.map(c => c.metadata.chunk_type);
    expect(chunkTypes).toContain('achievement');
    
    // Verify quantified achievements
    const achievementChunks = chunks.filter(c => c.metadata.chunk_type === 'achievement');
    expect(achievementChunks.length).toBeGreaterThan(0);
    
    const hasQuantifiedAchievement = achievementChunks.some(c => 
      c.content.includes('45%') || c.content.includes('30%') || c.content.includes('2 hours')
    );
    expect(hasQuantifiedAchievement).toBe(true);

    // Verify embeddings exist
    chunks.forEach(chunk => {
      expect(chunk.embedding).toBeTruthy();
    });

    console.log(`✅ E2E Test: Created ${chunks.length} atomic chunks`);
    console.log(`   Token range: ${Math.min(...chunks.map(c => c.token_count))} - ${Math.max(...chunks.map(c => c.token_count))}`);
  }, 30000);
});