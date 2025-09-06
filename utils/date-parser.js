/**
 * Comprehensive date parser for international and varied formats
 * Handles career date parsing for ScottGPT extraction system
 */

import moment from 'moment';

export class DateParser {
  
  /**
   * Parse various date formats to PostgreSQL DATE format (YYYY-MM-DD)
   * @param {string|number} dateStr - Date string/number in various formats
   * @param {boolean} isEndDate - If true, defaults to end of period for partial dates
   * @returns {string|null} - PostgreSQL DATE format or null if unparseable
   */
  static parseToPostgresDate(dateStr, isEndDate = false) {
    if (!dateStr && dateStr !== 0) {
      return null;
    }
    
    // Convert numbers to strings for consistent processing
    if (typeof dateStr === 'number') {
      dateStr = dateStr.toString();
    }
    
    // Ensure we have a string at this point
    if (typeof dateStr !== 'string') {
      return null;
    }
    
    const cleanDate = dateStr.trim();
    
    // Handle "Present", "Current", or similar ongoing indicators
    if (/^(present|current|ongoing|now)$/i.test(cleanDate)) {
      return null; // Let database handle NULL for ongoing positions
    }
    
    // Handle various formats
    const parsedDate = this.tryParseFormats(cleanDate, isEndDate);
    
    if (parsedDate && parsedDate.isValid()) {
      return parsedDate.format('YYYY-MM-DD');
    }
    
    console.warn(`Unable to parse date: "${dateStr}"`);
    return null;
  }
  
  /**
   * Try multiple date parsing strategies in order of likelihood
   */
  static tryParseFormats(dateStr, isEndDate = false) {
    const strategies = [
      () => this.parseYearOnly(dateStr, isEndDate),
      () => this.parseMonthYear(dateStr, isEndDate),
      () => this.parseISOFormat(dateStr),
      () => this.parseEuropeanFormat(dateStr),
      () => this.parseUSFormat(dateStr),
      () => this.parseTextualDate(dateStr, isEndDate),
      () => this.parseFlexibleFormat(dateStr)
    ];
    
    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result && result.isValid()) {
          return result;
        }
      } catch (error) {
        // Continue to next strategy
        continue;
      }
    }
    
    return null;
  }
  
  /**
   * Parse year-only formats: "2013", "2025"
   */
  static parseYearOnly(dateStr, isEndDate = false) {
    const yearMatch = dateStr.match(/^(\d{4})$/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      if (year >= 1900 && year <= 2035) {
        return isEndDate 
          ? moment(`${year}-12-31`)
          : moment(`${year}-01-01`);
      }
    }
    return null;
  }
  
  /**
   * Parse month/year formats: "6/2025", "12/2024", "06/2025"
   */
  static parseMonthYear(dateStr, isEndDate = false) {
    const monthYearMatch = dateStr.match(/^(\d{1,2})\/(\d{4})$/);
    if (monthYearMatch) {
      const month = parseInt(monthYearMatch[1]);
      const year = parseInt(monthYearMatch[2]);
      
      if (month >= 1 && month <= 12 && year >= 1900 && year <= 2035) {
        return isEndDate
          ? moment(`${year}-${month.toString().padStart(2, '0')}`).endOf('month')
          : moment(`${year}-${month.toString().padStart(2, '0')}-01`);
      }
    }
    return null;
  }
  
  /**
   * Parse European DD/MM/YYYY formats: "31/12/2023", "15/06/2022"
   */
  static parseEuropeanFormat(dateStr) {
    const europeanMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (europeanMatch) {
      const day = parseInt(europeanMatch[1]);
      const month = parseInt(europeanMatch[2]);
      const year = parseInt(europeanMatch[3]);
      
      // Validate European format (day > 12 likely indicates DD/MM/YYYY)
      if (day > 12 && month <= 12 && day <= 31) {
        return moment(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`);
      }
    }
    return null;
  }
  
  /**
   * Parse US MM/DD/YYYY formats: "12/31/2023", "06/15/2022"
   */
  static parseUSFormat(dateStr) {
    const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      const month = parseInt(usMatch[1]);
      const day = parseInt(usMatch[2]);
      const year = parseInt(usMatch[3]);
      
      // Validate US format
      if (month <= 12 && day <= 31 && year >= 1900 && year <= 2035) {
        return moment(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`);
      }
    }
    return null;
  }
  
  /**
   * Parse ISO formats: "2023-12-31", "2023-06-15", "2023-12-01T00:00:00.000Z"
   */
  static parseISOFormat(dateStr) {
    // Handle both basic ISO and ISO with time/timezone
    const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})([T\s]\d{2}:\d{2}:\d{2})?/);
    if (isoMatch) {
      // Use UTC parsing to avoid timezone issues for date-only values
      const parsed = moment.utc(dateStr);
      return parsed.isValid() ? parsed : null;
    }
    return null;
  }
  
  /**
   * Parse textual dates: "December 2023", "Jun 2025", "March 15, 2023"
   */
  static parseTextualDate(dateStr, isEndDate = false) {
    // Try moment's flexible parsing for textual dates
    const formats = [
      'MMMM YYYY',      // "December 2023"
      'MMM YYYY',       // "Jun 2025"
      'MMMM DD, YYYY',  // "March 15, 2023"
      'MMM DD, YYYY',   // "Jun 15, 2023"
      'DD MMMM YYYY',   // "15 March 2023"
      'DD MMM YYYY',    // "15 Jun 2023"
      'YYYY-MM',        // "2023-06"
      'MM-YYYY',        // "06-2023"
      'MM/YYYY'         // Alternative month/year format
    ];
    
    for (const format of formats) {
      const parsed = moment(dateStr, format, true);
      if (parsed.isValid()) {
        // For month-year only formats, set appropriate day
        if ((format.includes('YYYY') && !format.includes('DD')) || format.includes('MM')) {
          return isEndDate ? parsed.endOf('month') : parsed.startOf('month');
        }
        return parsed;
      }
    }
    
    return null;
  }
  
  /**
   * Flexible parsing using moment's default parser as last resort
   */
  static parseFlexibleFormat(dateStr) {
    const parsed = moment(dateStr);
    return parsed.isValid() && this.validateCareerDateRange(parsed) ? parsed : null;
  }
  
  /**
   * Validate date is within reasonable career range
   */
  static validateCareerDateRange(momentDate) {
    if (!momentDate || !momentDate.isValid()) return false;
    
    const minDate = moment('1960-01-01');
    const maxDate = moment().add(10, 'years'); // Allow future dates up to 10 years
    
    return momentDate.isBetween(minDate, maxDate, null, '[]');
  }
  
  /**
   * Validate date string for career data (reasonable employment dates)
   */
  static validateCareerDate(dateStr) {
    const parsed = this.parseToPostgresDate(dateStr);
    if (!parsed) return false;
    
    const date = moment(parsed);
    return this.validateCareerDateRange(date);
  }
  
  /**
   * Parse date range strings like "2020-2023" or "Jan 2020 - Mar 2023"
   */
  static parseDateRange(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') {
      return { startDate: null, endDate: null };
    }
    
    // Split on common range separators
    const rangeSeparators = [' - ', ' to ', '-', '–', '—'];
    let parts = null;
    
    for (const separator of rangeSeparators) {
      if (rangeStr.includes(separator)) {
        parts = rangeStr.split(separator).map(p => p.trim());
        break;
      }
    }
    
    if (!parts || parts.length !== 2) {
      return { startDate: null, endDate: null };
    }
    
    return {
      startDate: this.parseToPostgresDate(parts[0], false),
      endDate: this.parseToPostgresDate(parts[1], true)
    };
  }
  
  /**
   * Format date for display purposes
   */
  static formatForDisplay(dateStr, format = 'MMMM YYYY') {
    const parsed = this.parseToPostgresDate(dateStr);
    if (!parsed) return dateStr;
    
    return moment(parsed).format(format);
  }
  
  /**
   * Get debugging information about date parsing
   */
  static getParsingDebugInfo(dateStr) {
    const strategies = [
      { name: 'Year Only', result: this.parseYearOnly(dateStr, false) },
      { name: 'Month/Year', result: this.parseMonthYear(dateStr, false) },
      { name: 'ISO Format', result: this.parseISOFormat(dateStr) },
      { name: 'European Format', result: this.parseEuropeanFormat(dateStr) },
      { name: 'US Format', result: this.parseUSFormat(dateStr) },
      { name: 'Textual Date', result: this.parseTextualDate(dateStr, false) },
      { name: 'Flexible Format', result: this.parseFlexibleFormat(dateStr) }
    ];
    
    return {
      input: dateStr,
      finalResult: this.parseToPostgresDate(dateStr),
      strategiesAttempted: strategies.map(s => ({
        name: s.name,
        success: s.result && s.result.isValid(),
        result: s.result && s.result.isValid() ? s.result.format('YYYY-MM-DD') : null
      }))
    };
  }
}

// Export singleton instance for convenience
export const dateParser = new DateParser();

// Default export
export default DateParser;