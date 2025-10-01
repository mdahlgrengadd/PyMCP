/**
 * Browser-native embedding service using Xenova Transformers
 * Generates 384-dimensional embeddings for semantic search
 */

import { pipeline, env } from '@xenova/transformers';

// Configure Transformers.js for browser
env.allowLocalModels = false;
env.useBrowserCache = true;

export class EmbeddingService {
  private model: any = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log('🔄 Loading embedding model (all-MiniLM-L6-v2, 22MB)...');

      try {
        // Use lightweight model optimized for semantic similarity
        this.model = await pipeline(
          'feature-extraction',
          'Xenova/all-MiniLM-L6-v2', // 384 dimensions, very fast
          {
            quantized: true, // Use quantized version for smaller size
            progress_callback: (progress: any) => {
              if (progress.status === 'progress') {
                console.log(`📥 Downloading model: ${Math.round(progress.progress)}%`);
              }
            }
          }
        );

        this.isInitialized = true;
        console.log('✅ Embedding model loaded successfully');
      } catch (error) {
        console.error('Failed to load embedding model:', error);
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<Float32Array> {
    await this.init();

    if (!this.model) {
      throw new Error('Embedding model not initialized');
    }

    try {
      const output = await this.model(text, {
        pooling: 'mean',      // Mean pooling over token embeddings
        normalize: true       // L2 normalization for cosine similarity
      });

      return output.data;
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    await this.init();

    if (!this.model) {
      throw new Error('Embedding model not initialized');
    }

    // Process in batches of 10 to avoid memory issues
    const BATCH_SIZE = 10;
    const results: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(text => this.embed(text))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Compute cosine similarity between two embeddings
   */
  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Check if model is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.model !== null;
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();
