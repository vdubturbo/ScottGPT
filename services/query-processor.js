import { db } from '../config/database.js';

class QueryProcessor {
  constructor() {
    this.acronymCache = new Map();
  }

  async expandAcronyms(query) {
    const words = query.split(/\s+/);
    const acronyms = words.filter(word => 
      word.length >= 2 && 
      word.length <= 6 && 
      word === word.toUpperCase() && 
      /^[A-Z]+$/.test(word)
    );

    if (acronyms.length === 0) return query;

    let expandedQuery = query;
    
    for (const acronym of acronyms) {
      if (this.acronymCache.has(acronym)) {
        const expansion = this.acronymCache.get(acronym);
        expandedQuery = expandedQuery.replace(new RegExp(`\\b${acronym}\\b`, 'g'), expansion);
        continue;
      }

      // Search for acronym definitions in the knowledge base
      const { data } = await db.supabase
        .from('content_chunks')
        .select('content')
        .ilike('content', `%${acronym}%`)
        .limit(20);

      if (data && data.length > 0) {
        const expansion = this.extractAcronymDefinition(acronym, data);
        if (expansion) {
          this.acronymCache.set(acronym, expansion);
          expandedQuery = expandedQuery.replace(new RegExp(`\\b${acronym}\\b`, 'g'), expansion);
        }
      }
    }

    if (expandedQuery !== query) {
      console.log(`🔄 Query expanded: "${query}" → "${expandedQuery}"`);
    }

    return expandedQuery;
  }

  extractAcronymDefinition(acronym, chunks) {
    for (const chunk of chunks) {
      const content = chunk.content.toLowerCase();
      const acronymLower = acronym.toLowerCase();
      
      // Look for patterns like "Operations Leadership Development Program (OLDP)"
      const parenthesesPattern = new RegExp(`([^.()]+)\\s*\\(${acronymLower}\\)`, 'i');
      const match = content.match(parenthesesPattern);
      if (match) {
        return match[1].trim();
      }
      
      // Look for patterns like "OLDP at Company was designed"
      const definitionPattern = new RegExp(`${acronymLower}\\s+(?:at\\s+\\w+\\s+)?(?:was|is)\\s+([^.]+)`, 'i');
      const defMatch = content.match(definitionPattern);
      if (defMatch) {
        return defMatch[1].trim();
      }
    }
    return null;
  }
}

export default QueryProcessor;