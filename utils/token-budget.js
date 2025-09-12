import { encoding_for_model } from 'tiktoken';

export class TokenBudget {
  constructor() {
    this.encoder = encoding_for_model('gpt-4');
    
    this.BUDGET = {
      TARGET_MIN: 60,
      TARGET_MAX: 120,
      HARD_CAP: 180,
      CHAR_ESTIMATE_MIN: 240,
      CHAR_ESTIMATE_MAX: 480
    };
    
    this.metrics = {
      totalChunks: 0,
      tokenCounts: [],
      overBudgetChunks: 0,
      underBudgetChunks: 0,
      spilloverChunks: 0
    };
  }

  countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    try {
      const tokens = this.encoder.encode(text);
      return tokens.length;
    } catch (error) {
      console.warn('Token counting failed, using estimate:', error.message);
      return Math.ceil(text.length / 4);
    }
  }

  isWithinBudget(text) {
    const tokenCount = this.countTokens(text);
    return tokenCount >= this.BUDGET.TARGET_MIN && tokenCount <= this.BUDGET.TARGET_MAX;
  }

  enforceHardCap(text) {
    const tokenCount = this.countTokens(text);
    
    if (tokenCount <= this.BUDGET.HARD_CAP) {
      return { text, tokenCount, truncated: false };
    }
    
    const tokens = this.encoder.encode(text);
    const truncatedTokens = tokens.slice(0, this.BUDGET.HARD_CAP);
    const truncatedText = this.encoder.decode(truncatedTokens);
    
    this.metrics.overBudgetChunks++;
    
    return {
      text: truncatedText,
      tokenCount: this.BUDGET.HARD_CAP,
      truncated: true,
      originalTokenCount: tokenCount
    };
  }

  splitIntoChunks(text, preserveBoundaries = true) {
    const chunks = [];
    const tokenCount = this.countTokens(text);
    
    if (tokenCount <= this.BUDGET.TARGET_MAX) {
      return [{ text, tokenCount }];
    }
    
    let sentences = preserveBoundaries ? this.splitBySentence(text) : [text];
    let currentChunk = '';
    let currentTokens = 0;
    
    for (const sentence of sentences) {
      const sentenceTokens = this.countTokens(sentence);
      
      if (sentenceTokens > this.BUDGET.HARD_CAP) {
        const enforced = this.enforceHardCap(sentence);
        if (currentChunk) {
          chunks.push({ text: currentChunk.trim(), tokenCount: currentTokens });
          currentChunk = '';
          currentTokens = 0;
        }
        chunks.push({ text: enforced.text, tokenCount: enforced.tokenCount });
        this.metrics.spilloverChunks++;
        continue;
      }
      
      if (currentTokens + sentenceTokens > this.BUDGET.TARGET_MAX) {
        if (currentChunk) {
          chunks.push({ text: currentChunk.trim(), tokenCount: currentTokens });
        }
        currentChunk = sentence;
        currentTokens = sentenceTokens;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentTokens += sentenceTokens;
      }
    }
    
    if (currentChunk) {
      chunks.push({ text: currentChunk.trim(), tokenCount: currentTokens });
    }
    
    return chunks;
  }

  splitBySentence(text) {
    const bulletPattern = /^[\s]*[•\-\*]\s+/gm;
    const sentencePattern = /[.!?]+[\s]+/g;
    
    if (bulletPattern.test(text)) {
      return text.split(/\n/).filter(line => line.trim());
    }
    
    const sentences = text.split(sentencePattern);
    return sentences.filter(s => s.trim()).map(s => s.trim() + '.');
  }

  recordChunk(text) {
    const tokenCount = this.countTokens(text);
    this.metrics.totalChunks++;
    this.metrics.tokenCounts.push(tokenCount);
    
    if (tokenCount < this.BUDGET.TARGET_MIN) {
      this.metrics.underBudgetChunks++;
    } else if (tokenCount > this.BUDGET.TARGET_MAX) {
      this.metrics.overBudgetChunks++;
    }
    
    return tokenCount;
  }

  getMetrics() {
    const tokenCounts = this.metrics.tokenCounts;
    const average = tokenCounts.length > 0
      ? tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length
      : 0;
    
    const histogram = this.generateHistogram(tokenCounts);
    
    return {
      totalChunks: this.metrics.totalChunks,
      averageTokens: Math.round(average),
      minTokens: Math.min(...tokenCounts),
      maxTokens: Math.max(...tokenCounts),
      underBudget: this.metrics.underBudgetChunks,
      withinBudget: this.metrics.totalChunks - this.metrics.underBudgetChunks - this.metrics.overBudgetChunks,
      overBudget: this.metrics.overBudgetChunks,
      spillovers: this.metrics.spilloverChunks,
      histogram
    };
  }

  generateHistogram(tokenCounts) {
    const bins = {
      '0-40': 0,
      '41-60': 0,
      '61-120': 0,
      '121-180': 0,
      '181+': 0
    };
    
    tokenCounts.forEach(count => {
      if (count <= 40) bins['0-40']++;
      else if (count <= 60) bins['41-60']++;
      else if (count <= 120) bins['61-120']++;
      else if (count <= 180) bins['121-180']++;
      else bins['181+']++;
    });
    
    return bins;
  }

  reset() {
    this.metrics = {
      totalChunks: 0,
      tokenCounts: [],
      overBudgetChunks: 0,
      underBudgetChunks: 0,
      spilloverChunks: 0
    };
  }
}

export default TokenBudget;