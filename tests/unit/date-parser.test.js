import { describe, test, expect } from '@jest/globals';
import { DateParser } from '../../utils/date-parser.js';

describe('DateParser', () => {
  
  describe('parseToPostgresDate', () => {
    
    test('handles null and invalid inputs', () => {
      expect(DateParser.parseToPostgresDate(null)).toBeNull();
      expect(DateParser.parseToPostgresDate(undefined)).toBeNull();
      expect(DateParser.parseToPostgresDate('')).toBeNull();
      expect(DateParser.parseToPostgresDate('   ')).toBeNull();
      expect(DateParser.parseToPostgresDate(123)).toBeNull();
      expect(DateParser.parseToPostgresDate({})).toBeNull();
    });
    
    test('handles ongoing position indicators', () => {
      expect(DateParser.parseToPostgresDate('Present')).toBeNull();
      expect(DateParser.parseToPostgresDate('present')).toBeNull();
      expect(DateParser.parseToPostgresDate('PRESENT')).toBeNull();
      expect(DateParser.parseToPostgresDate('Current')).toBeNull();
      expect(DateParser.parseToPostgresDate('current')).toBeNull();
      expect(DateParser.parseToPostgresDate('Ongoing')).toBeNull();
      expect(DateParser.parseToPostgresDate('Now')).toBeNull();
    });
    
    test('parses year-only formats', () => {
      expect(DateParser.parseToPostgresDate('2023', false)).toBe('2023-01-01');
      expect(DateParser.parseToPostgresDate('2023', true)).toBe('2023-12-31');
      expect(DateParser.parseToPostgresDate('2025', false)).toBe('2025-01-01');
      expect(DateParser.parseToPostgresDate('2025', true)).toBe('2025-12-31');
      expect(DateParser.parseToPostgresDate('1985', false)).toBe('1985-01-01');
      
      // Invalid years
      expect(DateParser.parseToPostgresDate('1850')).toBeNull();
      expect(DateParser.parseToPostgresDate('2040')).toBeNull();
      expect(DateParser.parseToPostgresDate('123')).toBeNull();
      expect(DateParser.parseToPostgresDate('12345')).toBeNull();
    });
    
    test('parses month/year formats', () => {
      expect(DateParser.parseToPostgresDate('6/2025', false)).toBe('2025-06-01');
      expect(DateParser.parseToPostgresDate('6/2025', true)).toBe('2025-06-30');
      expect(DateParser.parseToPostgresDate('12/2024', false)).toBe('2024-12-01');
      expect(DateParser.parseToPostgresDate('12/2024', true)).toBe('2024-12-31');
      expect(DateParser.parseToPostgresDate('01/2023', false)).toBe('2023-01-01');
      expect(DateParser.parseToPostgresDate('02/2024', true)).toBe('2024-02-29'); // Leap year
      
      // Invalid month/year
      expect(DateParser.parseToPostgresDate('13/2024')).toBeNull();
      expect(DateParser.parseToPostgresDate('0/2024')).toBeNull();
      expect(DateParser.parseToPostgresDate('6/1850')).toBeNull();
    });
    
    test('parses European DD/MM/YYYY formats', () => {
      expect(DateParser.parseToPostgresDate('31/12/2023')).toBe('2023-12-31');
      expect(DateParser.parseToPostgresDate('15/06/2022')).toBe('2022-06-15');
      expect(DateParser.parseToPostgresDate('25/03/2025')).toBe('2025-03-25');
      expect(DateParser.parseToPostgresDate('29/02/2024')).toBe('2024-02-29'); // Leap year
      
      // Ambiguous dates should not parse as European if day <= 12
      expect(DateParser.parseToPostgresDate('10/06/2022')).toBeNull(); // Could be US or European
      expect(DateParser.parseToPostgresDate('02/03/2022')).toBeNull(); // Could be US or European
    });
    
    test('parses US MM/DD/YYYY formats', () => {
      expect(DateParser.parseToPostgresDate('12/31/2023')).toBe('2023-12-31');
      expect(DateParser.parseToPostgresDate('06/15/2022')).toBe('2022-06-15');
      expect(DateParser.parseToPostgresDate('03/25/2025')).toBe('2025-03-25');
      expect(DateParser.parseToPostgresDate('02/29/2024')).toBe('2024-02-29'); // Leap year
      
      // Invalid US dates
      expect(DateParser.parseToPostgresDate('13/31/2023')).toBeNull(); // Month > 12
      expect(DateParser.parseToPostgresDate('02/30/2023')).toBeNull(); // Invalid day for February
    });
    
    test('parses ISO YYYY-MM-DD formats', () => {
      expect(DateParser.parseToPostgresDate('2023-12-31')).toBe('2023-12-31');
      expect(DateParser.parseToPostgresDate('2022-06-15')).toBe('2022-06-15');
      expect(DateParser.parseToPostgresDate('2025-01-01')).toBe('2025-01-01');
      expect(DateParser.parseToPostgresDate('2024-02-29')).toBe('2024-02-29');
      
      // Invalid ISO dates
      expect(DateParser.parseToPostgresDate('2023-13-31')).toBeNull();
      expect(DateParser.parseToPostgresDate('2023-02-30')).toBeNull();
    });
    
    test('parses textual date formats', () => {
      expect(DateParser.parseToPostgresDate('December 2023', false)).toBe('2023-12-01');
      expect(DateParser.parseToPostgresDate('December 2023', true)).toBe('2023-12-31');
      expect(DateParser.parseToPostgresDate('Jun 2025', false)).toBe('2025-06-01');
      expect(DateParser.parseToPostgresDate('Jun 2025', true)).toBe('2025-06-30');
      expect(DateParser.parseToPostgresDate('January 2024', false)).toBe('2024-01-01');
      
      // Full textual dates
      expect(DateParser.parseToPostgresDate('March 15, 2023')).toBe('2023-03-15');
      expect(DateParser.parseToPostgresDate('Jun 15, 2023')).toBe('2023-06-15');
      expect(DateParser.parseToPostgresDate('15 March 2023')).toBe('2023-03-15');
      expect(DateParser.parseToPostgresDate('15 Jun 2023')).toBe('2023-06-15');
    });
    
    test('validates career date ranges', () => {
      // Valid career dates
      expect(DateParser.validateCareerDate('2023')).toBe(true);
      expect(DateParser.validateCareerDate('1985')).toBe(true);
      expect(DateParser.validateCareerDate('2025')).toBe(true);
      
      // Invalid career dates (too old or too future)
      expect(DateParser.validateCareerDate('1950')).toBe(false);
      expect(DateParser.validateCareerDate('2040')).toBe(false);
      
      // Invalid formats
      expect(DateParser.validateCareerDate('invalid')).toBe(false);
      expect(DateParser.validateCareerDate(null)).toBe(false);
    });
    
    test('handles edge cases gracefully', () => {
      // Leap year handling
      expect(DateParser.parseToPostgresDate('2/2024', true)).toBe('2024-02-29');
      expect(DateParser.parseToPostgresDate('2/2023', true)).toBe('2023-02-28');
      
      // Whitespace handling
      expect(DateParser.parseToPostgresDate('  2023  ')).toBe('2023-01-01');
      expect(DateParser.parseToPostgresDate(' 6/2025 ', false)).toBe('2025-06-01');
      
      // Case insensitivity for ongoing indicators
      expect(DateParser.parseToPostgresDate('PRESENT')).toBeNull();
      expect(DateParser.parseToPostgresDate('Present')).toBeNull();
      expect(DateParser.parseToPostgresDate('present')).toBeNull();
    });
  });
  
  describe('parseDateRange', () => {
    
    test('parses various range formats', () => {
      const range1 = DateParser.parseDateRange('2020 - 2023');
      expect(range1.startDate).toBe('2020-01-01');
      expect(range1.endDate).toBe('2023-12-31');
      
      const range2 = DateParser.parseDateRange('Jan 2020 - Mar 2023');
      expect(range2.startDate).toBe('2020-01-01');
      expect(range2.endDate).toBe('2023-03-31');
      
      const range3 = DateParser.parseDateRange('2020-01-01–2023-12-31');
      expect(range3.startDate).toBe('2020-01-01');
      expect(range3.endDate).toBe('2023-12-31');
    });
    
    test('handles invalid range formats', () => {
      const result1 = DateParser.parseDateRange('just a date');
      expect(result1.startDate).toBeNull();
      expect(result1.endDate).toBeNull();
      
      const result2 = DateParser.parseDateRange(null);
      expect(result2.startDate).toBeNull();
      expect(result2.endDate).toBeNull();
      
      const result3 = DateParser.parseDateRange('');
      expect(result3.startDate).toBeNull();
      expect(result3.endDate).toBeNull();
    });
  });
  
  describe('formatForDisplay', () => {
    
    test('formats dates for display', () => {
      expect(DateParser.formatForDisplay('2023', 'YYYY')).toBe('2023');
      expect(DateParser.formatForDisplay('6/2025', 'MMMM YYYY')).toBe('June 2025');
      expect(DateParser.formatForDisplay('2023-06-15', 'MMM DD, YYYY')).toBe('Jun 15, 2023');
    });
    
    test('returns original string for invalid dates', () => {
      expect(DateParser.formatForDisplay('invalid')).toBe('invalid');
      expect(DateParser.formatForDisplay(null)).toBe(null);
    });
  });
  
  describe('getParsingDebugInfo', () => {
    
    test('provides debugging information', () => {
      const debugInfo = DateParser.getParsingDebugInfo('2023');
      expect(debugInfo.input).toBe('2023');
      expect(debugInfo.finalResult).toBe('2023-01-01');
      expect(debugInfo.strategiesAttempted).toHaveLength(7);
      
      // Should show that Year Only strategy succeeded
      const yearOnlyStrategy = debugInfo.strategiesAttempted.find(s => s.name === 'Year Only');
      expect(yearOnlyStrategy.success).toBe(true);
      expect(yearOnlyStrategy.result).toBe('2023-01-01');
    });
    
    test('shows all failed strategies for invalid input', () => {
      const debugInfo = DateParser.getParsingDebugInfo('invalid date');
      expect(debugInfo.input).toBe('invalid date');
      expect(debugInfo.finalResult).toBeNull();
      expect(debugInfo.strategiesAttempted.every(s => !s.success)).toBe(true);
    });
  });
  
  describe('Real-world extraction scenarios', () => {
    
    test('handles common resume date formats', () => {
      // Common formats found in resumes
      const testCases = [
        { input: '2013', expected: '2013-01-01', isEndDate: false },
        { input: '6/2025', expected: '2025-06-01', isEndDate: false },
        { input: '6/2025', expected: '2025-06-30', isEndDate: true },
        { input: '12/2024', expected: '2024-12-01', isEndDate: false },
        { input: '2018', expected: '2018-01-01', isEndDate: false },
        { input: 'January 2020', expected: '2020-01-01', isEndDate: false },
        { input: 'Dec 2023', expected: '2023-12-01', isEndDate: false },
        { input: '2023-01-15', expected: '2023-01-15', isEndDate: false },
        { input: 'Present', expected: null, isEndDate: true },
        { input: 'Current', expected: null, isEndDate: true }
      ];
      
      testCases.forEach(({ input, expected, isEndDate }) => {
        const result = DateParser.parseToPostgresDate(input, isEndDate);
        expect(result).toBe(expected);
      });
    });
    
    test('handles international formats correctly', () => {
      // European formats (day > 12 indicates DD/MM/YYYY)
      expect(DateParser.parseToPostgresDate('31/12/2023')).toBe('2023-12-31');
      expect(DateParser.parseToPostgresDate('25/06/2022')).toBe('2022-06-25');
      
      // US formats (clear MM/DD/YYYY cases)
      expect(DateParser.parseToPostgresDate('12/25/2023')).toBe('2023-12-25');
      expect(DateParser.parseToPostgresDate('06/04/2022')).toBe('2022-06-04');
    });
  });
});

// Integration tests for the complete date parsing workflow
describe('DateParser Integration', () => {
  
  test('simulates complete extraction workflow', () => {
    // Simulate extracted career data with various date formats
    const extractedData = [
      { title: 'Software Engineer', org: 'TechCorp', date_start: '2018', date_end: '6/2025' },
      { title: 'Senior Developer', org: 'StartupCo', date_start: 'Jan 2016', date_end: 'Present' },
      { title: 'Consultant', org: 'ConsultFirm', date_start: '2020-03-15', date_end: '2023-12-31' },
      { title: 'Invalid Date Job', org: 'BadCorp', date_start: 'invalid', date_end: '99/99/9999' }
    ];
    
    const processedData = extractedData.map(job => ({
      ...job,
      date_start: DateParser.parseToPostgresDate(job.date_start, false),
      date_end: DateParser.parseToPostgresDate(job.date_end, true)
    }));
    
    // Verify parsing results
    expect(processedData[0].date_start).toBe('2018-01-01');
    expect(processedData[0].date_end).toBe('2025-06-30');
    
    expect(processedData[1].date_start).toBe('2016-01-01');
    expect(processedData[1].date_end).toBeNull(); // Present should be null
    
    expect(processedData[2].date_start).toBe('2020-03-15');
    expect(processedData[2].date_end).toBe('2023-12-31');
    
    expect(processedData[3].date_start).toBeNull(); // Invalid format
    expect(processedData[3].date_end).toBeNull(); // Invalid format
  });
});