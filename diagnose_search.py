#!/usr/bin/env python3
"""
Complete Search System Diagnosis Script
Run this once to identify all search issues
"""

import os
import sys
import traceback
from sentence_transformers import SentenceTransformer
from supabase import create_client
import numpy as np

def print_section(title):
    print("\n" + "="*50)
    print(f" {title}")
    print("="*50)

def test_basic_libraries():
    print_section("1. BASIC LIBRARY CHECK")
    
    try:
        print("Testing SentenceTransformers...")
        model = SentenceTransformer('all-MiniLM-L6-v2')
        test_embedding = model.encode(["test"])
        print(f"✅ SentenceTransformers working - embedding shape: {test_embedding.shape}")
        return model
    except Exception as e:
        print(f"❌ SentenceTransformers error: {e}")
        return None

def test_environment():
    print_section("2. ENVIRONMENT CHECK")
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_ANON_KEY')
    
    print(f"SUPABASE_URL: {url}")
    print(f"SUPABASE_ANON_KEY exists: {bool(key)}")
    
    if not url or not key:
        print("❌ Missing environment variables!")
        return None, None
    
    print("✅ Environment variables found")
    return url, key

def test_database_connection(url, key):
    print_section("3. DATABASE CONNECTION")
    
    try:
        supabase = create_client(url, key)
        print("✅ Supabase client created")
        
        # Test basic connection
        result = supabase.table("document_chunks").select("count", count="exact").execute()
        total_chunks = result.count
        print(f"✅ Database connected - Total chunks: {total_chunks}")
        
        if total_chunks == 0:
            print("❌ No document chunks found in database!")
            return None
        
        # Check embeddings
        result = supabase.table("document_chunks").select("id").not_.is_("embedding", "null").limit(1).execute()
        has_embeddings = len(result.data) > 0
        print(f"✅ Chunks with embeddings: {'Yes' if has_embeddings else 'No'}")
        
        if not has_embeddings:
            print("❌ No embeddings found!")
            return None
            
        return supabase
        
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        traceback.print_exc()
        return None

def test_rpc_function(supabase):
    print_section("4. RPC FUNCTION TEST")
    
    try:
        # Create a dummy embedding (384 dimensions for all-MiniLM-L6-v2)
        dummy_embedding = [0.1] * 384
        
        result = supabase.rpc(
            'match_documents',
            {
                'query_embedding': dummy_embedding,
                'match_threshold': 0.0,  # Very low threshold
                'match_count': 5
            }
        ).execute()
        
        print(f"✅ RPC function works - returned {len(result.data)} results")
        return True
        
    except Exception as e:
        print(f"❌ RPC function error: {e}")
        print("This might be the main issue!")
        traceback.print_exc()
        return False

def test_sample_data(supabase):
    print_section("5. SAMPLE DATA CHECK")
    
    try:
        # Get sample chunks
        result = supabase.table("document_chunks").select("content, metadata, embedding").limit(3).execute()
        
        for i, chunk in enumerate(result.data):
            print(f"\n--- Chunk {i+1} ---")
            print(f"Content: {chunk.get('content', '')[:100]}...")
            print(f"Metadata: {chunk.get('metadata', {})}")
            
            embedding = chunk.get('embedding')
            if embedding:
                if isinstance(embedding, list):
                    print(f"Embedding: List with {len(embedding)} dimensions")
                elif isinstance(embedding, str):
                    print(f"Embedding: String (length {len(embedding)})")
                else:
                    print(f"Embedding: {type(embedding)}")
            else:
                print("Embedding: None")
                
    except Exception as e:
        print(f"❌ Sample data error: {e}")

def test_actual_search(supabase, model):
    print_section("6. ACTUAL SEARCH TEST")
    
    queries = [
        "software development process",
        "agile methodology",
        "testing procedures",
        "system architecture"
    ]
    
    for query in queries:
        print(f"\nTesting query: '{query}'")
        
        try:
            # Generate embedding
            query_embedding = model.encode([query])
            embedding_list = query_embedding[0].tolist()
            
            # Search with very low threshold
            result = supabase.rpc(
                'match_documents',
                {
                    'query_embedding': embedding_list,
                    'match_threshold': 0.0,
                    'match_count': 5
                }
            ).execute()
            
            print(f"  Results: {len(result.data)}")
            
            if result.data:
                best_match = result.data[0]
                similarity = best_match.get('similarity', 'Unknown')
                content = best_match.get('content', '')[:100]
                print(f"  Best match (similarity: {similarity}): {content}...")
            else:
                print("  ❌ No results found!")
                
        except Exception as e:
            print(f"  ❌ Search failed: {e}")

def main():
    print("🔍 COMPREHENSIVE SEARCH SYSTEM DIAGNOSIS")
    print("This will identify exactly what's wrong with your search")
    
    # Test each component
    model = test_basic_libraries()
    if not model:
        print("\n❌ FATAL: Cannot proceed without working embeddings")
        return
    
    url, key = test_environment()
    if not url or not key:
        print("\n❌ FATAL: Cannot proceed without environment variables")
        return
    
    supabase = test_database_connection(url, key)
    if not supabase:
        print("\n❌ FATAL: Cannot proceed without database connection")
        return
    
    rpc_works = test_rpc_function(supabase)
    test_sample_data(supabase)
    
    if rpc_works:
        test_actual_search(supabase, model)
    else:
        print("\n❌ SKIPPING search test - RPC function broken")
    
    print_section("DIAGNOSIS COMPLETE")
    print("Share this output to get targeted fixes!")

if __name__ == "__main__":
    main()
