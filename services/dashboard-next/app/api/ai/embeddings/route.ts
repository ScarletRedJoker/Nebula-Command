/**
 * Embeddings API
 * POST /api/ai/embeddings - Generate embeddings for text
 * GET /api/ai/embeddings/sources - List knowledge sources
 */

import { NextRequest, NextResponse } from 'next/server';
import { EmbeddingService, TextChunker, KnowledgeRetriever } from '@/lib/rag';

const embeddingService = new EmbeddingService();
const chunker = new TextChunker();
const retriever = new KnowledgeRetriever();

interface EmbeddingRequest {
  text: string | string[];
  model?: 'nomic-embed-text' | 'text-embedding-ada-002';
}

interface SearchRequest {
  query: string;
  topK?: number;
  sourceId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (body.action === 'embed') {
      const { text, model } = body as EmbeddingRequest;
      
      if (!text) {
        return NextResponse.json(
          { error: 'Text is required' },
          { status: 400 }
        );
      }
      
      console.log(`[Embeddings API] Generating embeddings for ${Array.isArray(text) ? text.length + ' texts' : '1 text'}`);
      
      if (Array.isArray(text)) {
        const embeddings = await embeddingService.generateBatchEmbeddings(text, { model });
        return NextResponse.json({
          success: true,
          embeddings,
          count: embeddings.length,
          dimensions: embeddings[0]?.length || 0,
        });
      } else {
        const embedding = await embeddingService.generateEmbedding(text, { model });
        return NextResponse.json({
          success: true,
          embedding,
          dimensions: embedding.length,
        });
      }
    }
    
    if (body.action === 'search') {
      const { query, topK = 5, sourceId } = body as SearchRequest;
      
      if (!query) {
        return NextResponse.json(
          { error: 'Search query is required' },
          { status: 400 }
        );
      }
      
      console.log(`[Embeddings API] Searching for "${query.substring(0, 50)}..."`);
      
      const results = await retriever.search(query, topK);
      
      return NextResponse.json({
        success: true,
        results,
        query,
        count: results.length,
      });
    }
    
    if (body.action === 'chunk') {
      const { text, chunkSize = 512, overlap = 50 } = body;
      
      if (!text) {
        return NextResponse.json(
          { error: 'Text is required' },
          { status: 400 }
        );
      }
      
      const chunks = chunker.chunkText(text, { chunkSize, overlap });
      
      return NextResponse.json({
        success: true,
        chunks,
        count: chunks.length,
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use: embed, search, chunk' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('[Embeddings API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Embedding operation failed',
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const stats = retriever.getStats();
    
    return NextResponse.json({
      success: true,
      stats,
      models: ['nomic-embed-text', 'text-embedding-ada-002'],
      description: 'Embeddings API for semantic search and RAG',
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    }, { status: 500 });
  }
}
