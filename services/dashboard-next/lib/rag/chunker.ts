/**
 * Text Chunker
 * Splits text into overlapping chunks for embedding and retrieval
 */

export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

export interface TextChunk {
  text: string;
  index: number;
  startChar: number;
  endChar: number;
}

export class TextChunker {
  private readonly defaultChunkSize: number = 512;
  private readonly defaultOverlap: number = 50;

  /**
   * Split text into overlapping chunks
   */
  chunkText(text: string, options?: ChunkOptions): TextChunk[] {
    const chunkSize = options?.chunkSize ?? this.defaultChunkSize;
    const overlap = options?.overlap ?? this.defaultOverlap;

    if (chunkSize <= 0) {
      throw new Error('chunkSize must be greater than 0');
    }

    if (overlap < 0 || overlap >= chunkSize) {
      throw new Error('overlap must be >= 0 and < chunkSize');
    }

    const chunks: TextChunk[] = [];
    let startChar = 0;
    let chunkIndex = 0;

    // Handle empty text
    if (!text || text.length === 0) {
      return chunks;
    }

    while (startChar < text.length) {
      // Calculate end position
      let endChar = Math.min(startChar + chunkSize, text.length);

      // Try to break at word boundaries if not at end of text
      if (endChar < text.length && endChar > startChar + Math.floor(chunkSize * 0.1)) {
        // Look for last space within reasonable range
        const searchStart = Math.max(startChar + Math.floor(chunkSize * 0.7), startChar);
        const lastSpaceIndex = text.lastIndexOf(' ', endChar - 1);

        if (lastSpaceIndex > searchStart) {
          endChar = lastSpaceIndex + 1; // Include the space
        }
      }

      // Extract chunk
      const chunkText = text.substring(startChar, endChar).trim();

      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          index: chunkIndex,
          startChar,
          endChar,
        });
        chunkIndex++;
      }

      // Move to next chunk with overlap
      startChar = endChar - overlap;

      // Prevent infinite loop for very small texts or large overlaps
      if (startChar <= (chunks[chunks.length - 1]?.startChar ?? 0)) {
        startChar = endChar;
      }
    }

    return chunks;
  }

  /**
   * Split text into chunks with semantic awareness (paragraphs, sentences)
   */
  chunkTextByParagraph(text: string, options?: ChunkOptions): TextChunk[] {
    const chunkSize = options?.chunkSize ?? this.defaultChunkSize;
    const overlap = options?.overlap ?? this.defaultOverlap;

    // Split by paragraphs first
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

    const chunks: TextChunk[] = [];
    let chunkIndex = 0;
    let currentChunk = '';
    let chunkStartChar = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      const potentialChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;

      if (potentialChunk.length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex,
          startChar: chunkStartChar,
          endChar: chunkStartChar + currentChunk.length,
        });

        // Start new chunk with overlap
        const overlapText = currentChunk.substring(Math.max(0, currentChunk.length - overlap));
        currentChunk = overlapText + '\n\n' + paragraph;
        chunkStartChar += currentChunk.length - paragraph.length - 2; // -2 for \n\n
        chunkIndex++;
      } else {
        currentChunk = potentialChunk;
        if (chunks.length === 0) {
          chunkStartChar = text.indexOf(paragraph);
        }
      }
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        startChar: chunkStartChar,
        endChar: chunkStartChar + currentChunk.length,
      });
    }

    return chunks;
  }

  /**
   * Calculate average token count (rough estimate: ~4 chars per token)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get chunk statistics
   */
  getChunkStats(chunks: TextChunk[]): {
    totalChunks: number;
    totalCharacters: number;
    avgChunkSize: number;
    minChunkSize: number;
    maxChunkSize: number;
  } {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        totalCharacters: 0,
        avgChunkSize: 0,
        minChunkSize: 0,
        maxChunkSize: 0,
      };
    }

    const sizes = chunks.map((c) => c.text.length);
    return {
      totalChunks: chunks.length,
      totalCharacters: sizes.reduce((a, b) => a + b, 0),
      avgChunkSize: Math.round(sizes.reduce((a, b) => a + b, 0) / chunks.length),
      minChunkSize: Math.min(...sizes),
      maxChunkSize: Math.max(...sizes),
    };
  }
}
