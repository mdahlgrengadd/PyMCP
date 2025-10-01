/**
 * In-browser vector database using SQLite WASM
 * Stores and searches embeddings for semantic similarity
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import sqlite3WasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url';

export interface VectorSearchResult {
  uri: string;
  score: number;
  metadata: any;
}

export class VectorStore {
  private db: any = null;
  private sqlite3: any = null;
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;

    console.log('🔄 Initializing SQLite WASM vector store...');
    console.log('📂 WASM URL:', sqlite3WasmUrl);

    try {
      this.sqlite3 = await sqlite3InitModule({
        print: console.log,
        printErr: console.error,
        locateFile: (file: string) => {
          if (file.endsWith('.wasm')) {
            return sqlite3WasmUrl;
          }
          return file;
        }
      });

      // Create in-memory database
      this.db = new this.sqlite3.oo1.DB(':memory:', 'c');

      // Create tables for vector storage
      // Since sqlite-vec might not be available, we'll use a simple table
      // and implement vector operations in JavaScript
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS resource_embeddings (
          resource_uri TEXT PRIMARY KEY,
          embedding BLOB NOT NULL,
          metadata TEXT NOT NULL,
          indexed_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_indexed_at ON resource_embeddings(indexed_at);
      `);

      this.isInitialized = true;
      console.log('✅ Vector store initialized');
    } catch (error) {
      console.error('Failed to initialize vector store:', error);
      throw error;
    }
  }

  /**
   * Add or update a resource with its embedding
   */
  async addResource(
    uri: string,
    text: string,
    embedding: Float32Array
  ): Promise<void> {
    if (!this.db) throw new Error('VectorStore not initialized');

    console.log(`💾 Storing embedding for ${uri}: ${embedding.length} dimensions`);

    // Convert Float32Array to Blob
    const embeddingBlob = new Uint8Array(embedding.buffer);

    const metadata = JSON.stringify({
      text: text.substring(0, 10000), // Store up to 10K chars (~2500 tokens)
      textLength: text.length,
      indexed_at: Date.now(),
      embeddingDim: embedding.length
    });

    try {
      this.db.exec({
        sql: `INSERT OR REPLACE INTO resource_embeddings (resource_uri, embedding, metadata, indexed_at)
              VALUES (?, ?, ?, ?)`,
        bind: [uri, embeddingBlob, metadata, Date.now()]
      });

      // Verify the data was stored correctly
      const verify = this.db.exec({
        sql: 'SELECT length(embedding) as len FROM resource_embeddings WHERE resource_uri = ?',
        bind: [uri],
        returnValue: 'resultRows'
      });

      if (verify && verify.length > 0) {
        const storedBytes = verify[0][0];
        console.log(`✅ Stored ${storedBytes} bytes for ${uri} (expected ${embeddingBlob.length})`);
      }
    } catch (error) {
      console.error(`Failed to add resource ${uri}:`, error);
      throw error;
    }
  }

  /**
   * Search for similar resources using cosine similarity
   */
  async search(
    queryEmbedding: Float32Array,
    limit = 3,
    threshold = 0.7
  ): Promise<VectorSearchResult[]> {
    if (!this.db) throw new Error('VectorStore not initialized');

    try {
      // Get all resources
      const stmt = this.db.prepare('SELECT resource_uri, embedding, metadata FROM resource_embeddings');

      const results: VectorSearchResult[] = [];

      while (stmt.step()) {
        // SQLite WASM: Use indexed get for each column
        const uri = stmt.get(0);
        const embeddingBlob = stmt.get(1);
        const metadataStr = stmt.get(2);

        // Parse metadata with fallback
        let metadata = {};
        if (metadataStr) {
          try {
            metadata = JSON.parse(metadataStr);
          } catch (e) {
            console.warn(`Failed to parse metadata for ${uri}:`, e);
            metadata = { text: '', textLength: 0 };
          }
        }

        // Convert blob back to Float32Array
        let embedding: Float32Array;
        if (!embeddingBlob || embeddingBlob.length === 0) {
          console.warn(`Empty embedding blob for ${uri}, skipping`);
          continue;
        }

        try {
          // SQLite might return Uint8Array directly or need conversion
          const uint8Array = embeddingBlob instanceof Uint8Array
            ? embeddingBlob
            : new Uint8Array(embeddingBlob);

          embedding = new Float32Array(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength / 4);

          if (embedding.length === 0) {
            console.warn(`Zero-length embedding for ${uri} after conversion, skipping`);
            continue;
          }
        } catch (error) {
          console.error(`Failed to convert embedding for ${uri}:`, error);
          continue;
        }

        // Calculate cosine similarity
        const score = this.cosineSimilarity(queryEmbedding, embedding);

        // Collect all results for debugging
        results.push({ uri, score, metadata });
      }

      stmt.finalize();

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      // Debug: Log all scores to understand threshold issues
      if (results.length > 0) {
        const topScores = results.slice(0, 5).map(r => 
          `${r.uri.split('://')[1] || r.uri}: ${r.score.toFixed(3)}`
        );
        console.log(`🔍 Top similarity scores: ${topScores.join(', ')}`);
      }

      // Filter by threshold and limit
      return results
        .filter(r => r.score >= threshold)
        .slice(0, limit);
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  /**
   * Get all stored resource URIs
   */
  async getAllResourceUris(): Promise<string[]> {
    if (!this.db) return [];

    try {
      const stmt = this.db.prepare('SELECT resource_uri FROM resource_embeddings');
      const uris: string[] = [];

      while (stmt.step()) {
        uris.push(stmt.get(0));
      }

      stmt.finalize();
      return uris;
    } catch (error) {
      console.error('Failed to get resource URIs:', error);
      return [];
    }
  }

  /**
   * Remove a resource by URI
   */
  async removeResource(uri: string): Promise<void> {
    if (!this.db) return;

    try {
      this.db.exec({
        sql: 'DELETE FROM resource_embeddings WHERE resource_uri = ?',
        bind: [uri]
      });
    } catch (error) {
      console.error(`Failed to remove resource ${uri}:`, error);
    }
  }

  /**
   * Clear all resources
   */
  async clear(): Promise<void> {
    if (!this.db) return;

    try {
      this.db.exec('DELETE FROM resource_embeddings');
      console.log('✅ Vector store cleared');
    } catch (error) {
      console.error('Failed to clear vector store:', error);
    }
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{ count: number; totalSize: number }> {
    if (!this.db) return { count: 0, totalSize: 0 };

    try {
      const stmt = this.db.prepare('SELECT COUNT(*), SUM(LENGTH(embedding)) FROM resource_embeddings');
      stmt.step();
      const count = stmt.get(0) || 0;
      const totalSize = stmt.get(1) || 0;
      stmt.finalize();

      return {
        count,
        totalSize
      };
    } catch (error) {
      return { count: 0, totalSize: 0 };
    }
  }

  /**
   * Compute cosine similarity between two embeddings
   * OPTIMIZED: Assumes embeddings are already L2-normalized (norm = 1.0)
   * For normalized vectors: cosine_similarity = dot_product
   * This is ~5× faster than computing norms.
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      console.warn(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
      return 0;
    }

    // For L2-normalized vectors, cosine similarity = dot product
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }

    return dotProduct;
  }

  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }
}

// Export singleton instance
export const vectorStore = new VectorStore();
