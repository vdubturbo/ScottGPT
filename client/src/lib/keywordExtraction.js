// client/src/lib/keywordExtraction.js
// Keyword extraction and matching utilities for ATS optimization

// Common technical skills patterns
const TECH_SKILLS_PATTERNS = [
  // Programming languages
  /\b(javascript|js|typescript|ts|python|java|c\+\+|c#|php|ruby|go|rust|swift|kotlin|scala)\b/gi,
  // Frameworks & libraries
  /\b(react|angular|vue|svelte|node\.?js|express|django|flask|spring|laravel|rails|\.net)\b/gi,
  // Databases
  /\b(mysql|postgresql|mongodb|redis|elasticsearch|oracle|sql server|sqlite|dynamodb)\b/gi,
  // Cloud & DevOps
  /\b(aws|azure|gcp|docker|kubernetes|jenkins|github actions|terraform|ansible|nginx)\b/gi,
  // Tools & methodologies
  /\b(git|jira|confluence|agile|scrum|kanban|ci\/cd|tdd|microservices|api|rest|graphql)\b/gi
];

// Soft skills patterns
const SOFT_SKILLS_PATTERNS = [
  /\b(leadership|management|communication|collaboration|problem.solving|analytical|creative)\b/gi,
  /\b(teamwork|project.management|stakeholder.management|presentation|documentation)\b/gi
];

// Extract keywords from text using multiple strategies
export const extractKeywords = (text) => {
  if (!text || typeof text !== 'string') {
    return { technical: [], soft: [], other: [] };
  }

  const technical = new Set();
  const soft = new Set();
  const other = new Set();

  // Extract technical skills
  TECH_SKILLS_PATTERNS.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => technical.add(match.toLowerCase().trim()));
  });

  // Extract soft skills
  SOFT_SKILLS_PATTERNS.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => soft.add(match.toLowerCase().replace(/\./g, ' ').trim()));
  });

  // Extract other important keywords (nouns, adjectives)
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .filter(word => !isStopWord(word));

  // Simple frequency analysis for other keywords
  const frequency = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  // Get top frequent words that aren't already categorized
  Object.entries(frequency)
    .filter(([word]) => !technical.has(word) && !soft.has(word))
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20)
    .forEach(([word]) => other.add(word));

  return {
    technical: Array.from(technical),
    soft: Array.from(soft),
    other: Array.from(other)
  };
};

// Calculate keyword match score between job description and resume
export const calculateMatchScore = (jobKeywords, resumeContent) => {
  if (!jobKeywords || !resumeContent) return 0;

  const allJobKeywords = [
    ...jobKeywords.technical,
    ...jobKeywords.soft,
    ...jobKeywords.other
  ];

  if (allJobKeywords.length === 0) return 0;

  const resumeLower = resumeContent.toLowerCase();
  const matchedKeywords = allJobKeywords.filter(keyword => 
    resumeLower.includes(keyword.toLowerCase())
  );

  const score = (matchedKeywords.length / allJobKeywords.length) * 100;
  return Math.round(score);
};

// Prioritize resume content based on keyword matches
export const prioritizeContent = (resumeContent, jobKeywords) => {
  if (!resumeContent || !jobKeywords) return [];

  const allKeywords = [
    ...jobKeywords.technical,
    ...jobKeywords.soft,
    ...jobKeywords.other
  ];

  // Split resume into sections/bullet points
  const sections = resumeContent.split(/\n\s*\n/);
  
  return sections.map(section => {
    // Count keyword matches in this section
    const matches = allKeywords.filter(keyword =>
      section.toLowerCase().includes(keyword.toLowerCase())
    ).length;

    return {
      content: section,
      matchScore: matches,
      priority: matches > 0 ? 'high' : 'normal'
    };
  }).sort((a, b) => b.matchScore - a.matchScore);
};

// Extract hard skills specifically for ATS optimization
export const extractHardSkills = (text) => {
  const keywords = extractKeywords(text);
  return [...keywords.technical, ...keywords.other].slice(0, 15);
};

// Simple stop words list
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'will', 'just', 'should', 'now', 'this', 'that', 'these',
  'those', 'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'whose', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'doing', 'would', 'could',
  'may', 'might', 'must', 'shall', 'was', 'were', 'are', 'is', 'am', 'be'
]);

const isStopWord = (word) => STOP_WORDS.has(word.toLowerCase());