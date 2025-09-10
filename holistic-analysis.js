#!/usr/bin/env node

import { supabase } from './config/database.js';
import EmbeddingService from './services/embeddings.js';

async function holisticAnalysis() {
  console.log('🔍 HOLISTIC ANALYSIS: End-to-End Flow Investigation\n');
  
  try {
    // 1. Verify what's actually in the database
    console.log('=== 1. DATABASE CONTENT ANALYSIS ===');
    
    // Check chunks content
    const chunks = await supabase
      .from('content_chunks')
      .select('id, title, content, user_id, embedding_vector')
      .limit(5);
      
    console.log(`📊 Total chunks: ${chunks.data?.length}`);
    chunks.data?.forEach((chunk, i) => {
      console.log(`${i+1}. ID: ${chunk.id}`);
      console.log(`   Title: ${chunk.title}`);
      console.log(`   User ID: ${chunk.user_id}`);
      console.log(`   Has embedding_vector: ${chunk.embedding_vector ? 'YES' : 'NO'}`);
      console.log(`   Content preview: "${chunk.content?.substring(0, 100)}..."`);
      console.log('');
    });
    
    // 2. Test embedding generation consistency
    console.log('\n=== 2. EMBEDDING CONSISTENCY TEST ===');
    const embeddings = new EmbeddingService();
    
    const testQueries = [
      "Tell me about PMO experience",
      "Tell me about your leadership experience"
    ];
    
    for (const query of testQueries) {
      console.log(`\n🧪 Testing: "${query}"`);
      const embedding = await embeddings.embedText(query, 'search_query');
      console.log(`   Generated embedding: ${embedding.length} dimensions`);
      
      // Test direct pgvector call
      const pgResult = await supabase.rpc('fast_similarity_search', {
        query_embedding: embedding,
        similarity_threshold: 0.1,
        max_results: 5,
        filter_user_id: null  // No filter
      });
      
      console.log(`   PGVector results: ${pgResult.data?.length || 0}`);
      if (pgResult.data?.length > 0) {
        const topResult = pgResult.data[0];
        console.log(`   Top result: "${topResult.title?.substring(0, 40)}..." (${topResult.similarity?.toFixed(4)})`);
      }
    }
    
    // 3. Check profile resolution
    console.log('\n=== 3. PROFILE RESOLUTION ANALYSIS ===');
    
    // Check user_profiles table
    const profiles = await supabase
      .from('user_profiles')
      .select('*');
      
    console.log(`📊 User profiles found: ${profiles.data?.length}`);
    profiles.data?.forEach((profile, i) => {
      console.log(`${i+1}. ID: ${profile.id}`);
      console.log(`   URL Slug: ${profile.url_slug}`);
      console.log(`   Name: ${profile.full_name}`);
      console.log(`   Email: ${profile.email}`);
      console.log('');
    });
    
    // Check if slovett profile exists
    const slovettProfile = profiles.data?.find(p => p.url_slug === 'slovett');
    if (slovettProfile) {
      console.log(`✅ Found slovett profile: ${slovettProfile.id}`);
      
      // Check if this profile ID matches chunk ownership
      const profileChunks = await supabase
        .from('content_chunks')
        .select('id')
        .eq('user_id', slovettProfile.id);
        
      console.log(`📊 Chunks owned by slovett profile: ${profileChunks.data?.length || 0}`);
    } else {
      console.log(`❌ No slovett profile found!`);
    }
    
    // 4. RAG Service Flow Analysis
    console.log('\n=== 4. RAG SERVICE FLOW ANALYSIS ===');
    
    // Import and test RAG service components
    const { default: RAGService } = await import('./services/rag.js');
    const rag = new RAGService();
    
    console.log('🔧 Testing RAG service internal flow...');
    
    // Test with a known good query but trace what userFilter gets passed
    console.log('\n📋 Simulating profile chat call for "slovett"...');
    
    // This should mirror what happens in routes/chat.js line 112-119
    if (slovettProfile) {
      console.log(`   Using target profile ID: ${slovettProfile.id}`);
      
      // Test the exact call made by the profile route
      console.log('   Testing with userFilter = profile.id...');
      
      const ragResult = await rag.answerQuestion("Tell me about PMO experience", {
        maxContextChunks: 12,
        includeContext: false,
        userFilter: slovettProfile.id  // This is what the profile route passes
      });
      
      console.log(`   RAG result: ${ragResult.sources?.length || 0} sources found`);
      console.log(`   Answer generated: ${!!ragResult.answer}`);
      console.log(`   Confidence: ${ragResult.confidence}`);
      
      if (ragResult.sources?.length > 0) {
        console.log('   Sources:');
        ragResult.sources.forEach((source, i) => {
          console.log(`     ${i+1}. ${source.title}`);
        });
      }
    }
    
    // 5. Database search method analysis
    console.log('\n=== 5. DATABASE SEARCH METHOD ANALYSIS ===');
    
    const { db } = await import('./config/database.js');
    
    console.log('🔧 Testing database search methods directly...');
    
    const testEmbedding = await embeddings.embedText("PMO experience", 'search_query');
    
    // Test with different user filters
    const testCases = [
      { name: "No user filter", userFilter: null },
      { name: "Correct user ID", userFilter: '345850e8-4f02-48cb-9789-d40e9cc3ee8e' },
      { name: "Slovett profile ID", userFilter: slovettProfile?.id }
    ];
    
    for (const testCase of testCases) {
      console.log(`\n🧪 ${testCase.name}:`);
      
      const searchResult = await db.searchChunks(testEmbedding, {
        threshold: 0.1,
        limit: 5,
        userFilter: testCase.userFilter
      });
      
      console.log(`   Results: ${searchResult.length}`);
      if (searchResult.length > 0) {
        console.log(`   Top result: "${searchResult[0].title?.substring(0, 40)}..." (similarity: ${searchResult[0].similarity?.toFixed(4)})`);
      }
    }
    
    console.log('\n=== ANALYSIS COMPLETE ===');
    
  } catch (error) {
    console.error('❌ Analysis error:', error);
  }
}

holisticAnalysis().finally(() => process.exit(0));