import { describe, it, expect, beforeEach } from '@jest/globals';
import { TokenBudget } from '../../utils/token-budget.js';

describe('TokenBudget', () => {
  let tokenBudget;

  beforeEach(() => {
    tokenBudget = new TokenBudget();
  });

  describe('token counting', () => {
    it('should count tokens accurately for various text lengths', () => {
      const shortText = 'Hello world';
      const mediumText = 'This is a medium length text that should have more tokens than the short one.';
      const longText = 'This is a much longer text that contains many more words and should demonstrate the token counting functionality working correctly across different text lengths and complexities.';

      const shortCount = tokenBudget.countTokens(shortText);
      const mediumCount = tokenBudget.countTokens(mediumText);
      const longCount = tokenBudget.countTokens(longText);

      expect(shortCount).toBeGreaterThan(0);
      expect(mediumCount).toBeGreaterThan(shortCount);
      expect(longCount).toBeGreaterThan(mediumCount);
    });

    it('should handle edge cases gracefully', () => {
      expect(tokenBudget.countTokens('')).toBe(0);
      expect(tokenBudget.countTokens(null)).toBe(0);
      expect(tokenBudget.countTokens(undefined)).toBe(0);
      expect(tokenBudget.countTokens(123)).toBe(0);
    });

    it('should provide fallback estimation for encoding errors', () => {
      const text = 'Some text content';
      
      // Mock encoder to throw error
      tokenBudget.encoder.encode = () => {
        throw new Error('Encoding failed');
      };

      const count = tokenBudget.countTokens(text);
      
      // Should fallback to character-based estimation
      expect(count).toBeGreaterThan(0);
      expect(count).toBe(Math.ceil(text.length / 4));
    });
  });

  describe('budget validation', () => {
    it('should correctly identify text within target budget', () => {
      // Approximately 100 tokens (400 chars)
      const withinBudgetText = 'This text is carefully crafted to be approximately within the target token budget of eighty to one hundred fifty tokens. It should pass the budget validation check and be considered appropriately sized for atomic chunking purposes. This ensures optimal retrieval performance.';
      
      expect(tokenBudget.isWithinBudget(withinBudgetText)).toBe(true);
    });

    it('should identify text that is too short', () => {
      const tooShortText = 'Too short';
      
      expect(tokenBudget.isWithinBudget(tooShortText)).toBe(false);
    });

    it('should identify text that is too long', () => {
      const tooLongText = 'This is an extremely long text that far exceeds the target token budget and should be identified as being outside the acceptable range. '.repeat(10);
      
      expect(tokenBudget.isWithinBudget(tooLongText)).toBe(false);
    });
  });

  describe('hard cap enforcement', () => {
    it('should allow text under hard cap to pass through unchanged', () => {
      const shortText = 'This is a reasonable length text that is well under the hard cap.';
      
      const result = tokenBudget.enforceHardCap(shortText);
      
      expect(result.text).toBe(shortText);
      expect(result.truncated).toBe(false);
      expect(result.tokenCount).toBeLessThanOrEqual(180);
    });

    it('should truncate text that exceeds hard cap', () => {
      const longText = 'This is a very long text that definitely exceeds the hard token cap and should be truncated. '.repeat(20);
      
      const result = tokenBudget.enforceHardCap(longText);
      
      expect(result.text).not.toBe(longText);
      expect(result.text.length).toBeLessThan(longText.length);
      expect(result.truncated).toBe(true);
      expect(result.tokenCount).toBeLessThanOrEqual(180);
      expect(result.originalTokenCount).toBeGreaterThan(180);
    });

    it('should update metrics when truncation occurs', () => {
      const longText = 'Very long text that exceeds the hard cap. '.repeat(50);
      
      tokenBudget.enforceHardCap(longText);
      
      const metrics = tokenBudget.getMetrics();
      expect(metrics.overBudget).toBeGreaterThan(0);
    });
  });

  describe('text splitting', () => {
    it('should split long text into multiple chunks', () => {
      const longText = 'This is a long document that needs to be split into multiple chunks because it exceeds our target token budget. Each sentence should ideally be preserved as a complete unit. The splitting algorithm should respect sentence boundaries when possible to maintain readability and context. This ensures that each resulting chunk contains complete thoughts and maintains semantic coherence for better retrieval performance.';
      
      const chunks = tokenBudget.splitIntoChunks(longText);
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(tokenBudget.BUDGET.TARGET_MAX);
        expect(chunk.text).toBeTruthy();
      });
    });

    it('should preserve sentence boundaries when splitting', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
      
      const chunks = tokenBudget.splitIntoChunks(text, true);
      
      chunks.forEach(chunk => {
        // Each chunk should end with proper punctuation or be complete
        expect(chunk.text.trim()).toMatch(/[.!?]$|^[^.!?]*$/);
      });
    });

    it('should handle bullet points correctly', () => {
      const bulletText = `
• First important point with details
• Second important point with more information
• Third important point with additional context
• Fourth important point with comprehensive details
• Fifth important point with extensive information
      `.trim();
      
      const chunks = tokenBudget.splitIntoChunks(bulletText);
      
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(tokenBudget.BUDGET.TARGET_MAX);
      });
    });

    it('should return single chunk for short text', () => {
      const shortText = 'This is a short text.';
      
      const chunks = tokenBudget.splitIntoChunks(shortText);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(shortText);
    });
  });

  describe('metrics tracking', () => {
    it('should track chunk metrics accurately', () => {
      const texts = [
        'Short text',
        'Medium length text with more content',
        'Very long text with extensive content that exceeds normal expectations and provides comprehensive information about various topics'
      ];
      
      texts.forEach(text => tokenBudget.recordChunk(text));
      
      const metrics = tokenBudget.getMetrics();
      
      expect(metrics.totalChunks).toBe(3);
      expect(metrics.averageTokens).toBeGreaterThan(0);
      expect(metrics.minTokens).toBeGreaterThan(0);
      expect(metrics.maxTokens).toBeGreaterThan(metrics.minTokens);
      expect(metrics.histogram).toHaveProperty('0-50');
      expect(metrics.histogram).toHaveProperty('81-150');
    });

    it('should generate histogram with correct bins', () => {
      // Add chunks of known sizes to different bins
      tokenBudget.recordChunk('Very short'); // Should be in 0-50
      tokenBudget.recordChunk('Medium length text with reasonable content'); // Should be in 51-80 or 81-150
      
      const metrics = tokenBudget.getMetrics();
      const histogram = metrics.histogram;
      
      expect(histogram).toHaveProperty('0-50');
      expect(histogram).toHaveProperty('51-80');
      expect(histogram).toHaveProperty('81-150');
      expect(histogram).toHaveProperty('151-180');
      expect(histogram).toHaveProperty('181+');
      
      const totalBinCounts = Object.values(histogram).reduce((sum, count) => sum + count, 0);
      expect(totalBinCounts).toBe(metrics.totalChunks);
    });

    it('should track under and over budget chunks', () => {
      const shortText = 'Short';
      const longText = 'This is an extremely long text that definitely exceeds our target budget range and should be counted as over budget. '.repeat(5);
      
      tokenBudget.recordChunk(shortText);
      tokenBudget.recordChunk(longText);
      
      const metrics = tokenBudget.getMetrics();
      
      expect(metrics.underBudget).toBeGreaterThan(0);
      expect(metrics.overBudget).toBeGreaterThan(0);
    });

    it('should reset metrics correctly', () => {
      tokenBudget.recordChunk('Some text');
      tokenBudget.recordChunk('More text');
      
      expect(tokenBudget.getMetrics().totalChunks).toBe(2);
      
      tokenBudget.reset();
      
      const metrics = tokenBudget.getMetrics();
      expect(metrics.totalChunks).toBe(0);
      expect(metrics.averageTokens).toBe(0);
      expect(Object.values(metrics.histogram).every(count => count === 0)).toBe(true);
    });
  });

  describe('sentence splitting', () => {
    it('should split text by sentences correctly', () => {
      const text = 'First sentence. Second sentence! Third sentence? Fourth sentence.';
      
      const sentences = tokenBudget.splitBySentence(text);
      
      expect(sentences.length).toBe(4);
      expect(sentences[0]).toContain('First sentence');
      expect(sentences[1]).toContain('Second sentence');
      expect(sentences[2]).toContain('Third sentence');
      expect(sentences[3]).toContain('Fourth sentence');
    });

    it('should handle bullet points as separate units', () => {
      const bulletText = `• First bullet point
• Second bullet point  
• Third bullet point`;
      
      const sentences = tokenBudget.splitBySentence(bulletText);
      
      expect(sentences.length).toBe(3);
      sentences.forEach(sentence => {
        expect(sentence).toContain('•');
      });
    });

    it('should filter out empty sentences', () => {
      const text = 'Real sentence. . . Another real sentence.';
      
      const sentences = tokenBudget.splitBySentence(text);
      
      sentences.forEach(sentence => {
        expect(sentence.trim().length).toBeGreaterThan(1);
      });
    });
  });

  describe('budget constants', () => {
    it('should have reasonable budget constants', () => {
      const budget = tokenBudget.BUDGET;
      
      expect(budget.TARGET_MIN).toBe(80);
      expect(budget.TARGET_MAX).toBe(150);
      expect(budget.HARD_CAP).toBe(180);
      expect(budget.TARGET_MIN).toBeLessThan(budget.TARGET_MAX);
      expect(budget.TARGET_MAX).toBeLessThan(budget.HARD_CAP);
      
      expect(budget.CHAR_ESTIMATE_MIN).toBe(500);
      expect(budget.CHAR_ESTIMATE_MAX).toBe(900);
    });
  });
});