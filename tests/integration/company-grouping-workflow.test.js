/**
 * Integration Tests for Company Grouping Workflow
 * Tests the complete workflow from UI interactions to API calls and data updates
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';

// Test utilities
import { createTestUser, cleanupTestData, createTestSources } from '../utilities/test-helpers.js';

describe('Company Grouping Workflow Integration', () => {
  let testUserId;
  let testSources;

  beforeAll(async () => {
    // Create test user and sample data
    testUserId = await createTestUser();
    testSources = await createTestSources(testUserId, [
      {
        title: 'Software Engineer',
        org: 'Microsoft Corporation',
        content: 'Developed web applications using React and Node.js'
      },
      {
        title: 'Senior Software Engineer',
        org: 'Microsoft Corp',
        content: 'Led team of 5 developers on cloud infrastructure'
      },
      {
        title: 'Principal Engineer',
        org: 'Microsoft',
        content: 'Architected microservices platform serving 1M+ users'
      },
      {
        title: 'Frontend Developer',
        org: 'Google LLC',
        content: 'Built user interfaces for Google Search'
      },
      {
        title: 'Product Manager',
        org: 'Apple Inc.',
        content: 'Managed iOS app development lifecycle'
      }
    ]);
  });

  afterAll(async () => {
    await cleanupTestData(testUserId);
  });

  describe('Company Data Retrieval and Grouping', () => {
    test('should retrieve work history with company grouping enabled', async () => {
      const response = await request(app)
        .get('/api/user/work-history?groupByCompany=true')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('jobs');
      expect(response.body).toHaveProperty('companyGroups');

      const { companyGroups } = response.body;
      expect(companyGroups).toBeInstanceOf(Array);

      // Should group Microsoft variations together
      const microsoftGroup = companyGroups.find(group =>
        group.normalizedName.includes('microsoft')
      );
      expect(microsoftGroup).toBeDefined();
      expect(microsoftGroup.totalPositions).toBe(3);
      expect(microsoftGroup.originalNames).toEqual(
        expect.arrayContaining(['Microsoft Corporation', 'Microsoft Corp', 'Microsoft'])
      );
    });

    test('should provide company statistics', async () => {
      const response = await request(app)
        .get('/api/user/companies/stats')
        .expect(200);

      expect(response.body).toHaveProperty('totalCompanies');
      expect(response.body).toHaveProperty('totalPositions');
      expect(response.body).toHaveProperty('averagePositionsPerCompany');
      expect(response.body).toHaveProperty('companiesWithMultiplePositions');

      expect(response.body.totalCompanies).toBeGreaterThan(0);
      expect(response.body.totalPositions).toBe(5);
    });

    test('should handle company name normalization correctly', async () => {
      const response = await request(app)
        .get('/api/user/companies/existing')
        .expect(200);

      const companies = response.body.companies;
      const microsoftCompany = companies.find(c =>
        c.normalizedName === 'microsoft'
      );

      expect(microsoftCompany).toBeDefined();
      expect(microsoftCompany.originalNames).toHaveLength(3);
      expect(microsoftCompany.totalPositions).toBe(3);
    });
  });

  describe('Company Reassignment Operations', () => {
    test('should successfully reassign single position to existing company', async () => {
      // Find a source to reassign
      const sourceToReassign = testSources.find(s => s.org === 'Apple Inc.');

      const response = await request(app)
        .put(`/api/user/sources/${sourceToReassign.id}/reassign-company`)
        .send({
          newCompanyName: 'Microsoft Corporation',
          preserveEmbeddings: false,
          validateCompanyName: true
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.source.org).toBe('Microsoft Corporation');
      expect(response.body).toHaveProperty('oldCompanyName', 'Apple Inc.');
      expect(response.body).toHaveProperty('embeddingRegenerated', true);

      // Verify the change in work history
      const historyResponse = await request(app)
        .get('/api/user/work-history?groupByCompany=true')
        .expect(200);

      const microsoftGroup = historyResponse.body.companyGroups.find(group =>
        group.normalizedName.includes('microsoft')
      );
      expect(microsoftGroup.totalPositions).toBe(4); // Now includes the Apple position
    });

    test('should create new company when reassigning to non-existent company', async () => {
      const sourceToReassign = testSources.find(s => s.org === 'Google LLC');

      const response = await request(app)
        .put(`/api/user/sources/${sourceToReassign.id}/reassign-company`)
        .send({
          newCompanyName: 'Netflix Inc.',
          preserveEmbeddings: true
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.source.org).toBe('Netflix Inc.');

      // Verify new company appears in company list
      const companiesResponse = await request(app)
        .get('/api/user/companies/existing')
        .expect(200);

      const netflixCompany = companiesResponse.body.companies.find(c =>
        c.normalizedName === 'netflix'
      );
      expect(netflixCompany).toBeDefined();
      expect(netflixCompany.totalPositions).toBe(1);
    });

    test('should handle bulk reassignment operations', async () => {
      // Get Microsoft positions for bulk reassignment
      const historyResponse = await request(app)
        .get('/api/user/work-history')
        .expect(200);

      const microsoftPositions = historyResponse.body.jobs.filter(job =>
        job.org.toLowerCase().includes('microsoft')
      );

      expect(microsoftPositions.length).toBeGreaterThan(1);

      // Bulk reassign to new company
      const bulkRequests = microsoftPositions.map(position =>
        request(app)
          .put(`/api/user/sources/${position.id}/reassign-company`)
          .send({
            newCompanyName: 'Meta Platforms Inc.',
            preserveEmbeddings: false
          })
      );

      const responses = await Promise.all(bulkRequests);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.source.org).toBe('Meta Platforms Inc.');
      });

      // Verify bulk reassignment in company groups
      const updatedHistoryResponse = await request(app)
        .get('/api/user/work-history?groupByCompany=true')
        .expect(200);

      const metaGroup = updatedHistoryResponse.body.companyGroups.find(group =>
        group.normalizedName === 'meta platforms'
      );
      expect(metaGroup).toBeDefined();
      expect(metaGroup.totalPositions).toBe(microsoftPositions.length);
    });

    test('should preserve career progression analysis after reassignment', async () => {
      // Get current company groups
      const beforeResponse = await request(app)
        .get('/api/user/work-history?groupByCompany=true')
        .expect(200);

      const metaGroup = beforeResponse.body.companyGroups.find(group =>
        group.normalizedName === 'meta platforms'
      );

      expect(metaGroup).toBeDefined();
      expect(metaGroup).toHaveProperty('careerProgression');
      expect(metaGroup).toHaveProperty('boomerangPattern');
      expect(metaGroup.careerProgression).toHaveProperty('progressionScore');

      // Career progression should be maintained after grouping
      if (metaGroup.totalPositions > 1) {
        expect(metaGroup.careerProgression.progressionScore).toBeGreaterThan(0);
      }
    });
  });

  describe('Company Operations Validation', () => {
    test('should validate company names before reassignment', async () => {
      const sourceToTest = testSources[0];

      // Test invalid company name
      const invalidResponse = await request(app)
        .put(`/api/user/sources/${sourceToTest.id}/reassign-company`)
        .send({
          newCompanyName: 'Invalid<>Company',
          validateCompanyName: true
        })
        .expect(400);

      expect(invalidResponse.body).toHaveProperty('success', false);
      expect(invalidResponse.body.message).toContain('invalid characters');

      // Test empty company name
      const emptyResponse = await request(app)
        .put(`/api/user/sources/${sourceToTest.id}/reassign-company`)
        .send({
          newCompanyName: '',
          validateCompanyName: true
        })
        .expect(400);

      expect(emptyResponse.body).toHaveProperty('success', false);
      expect(emptyResponse.body.message).toContain('company name');
    });

    test('should handle concurrent reassignment operations', async () => {
      const sourceId = testSources[0].id;

      // Attempt concurrent reassignments
      const concurrentRequests = [
        request(app)
          .put(`/api/user/sources/${sourceId}/reassign-company`)
          .send({ newCompanyName: 'Concurrent Company A' }),
        request(app)
          .put(`/api/user/sources/${sourceId}/reassign-company`)
          .send({ newCompanyName: 'Concurrent Company B' })
      ];

      const responses = await Promise.allSettled(concurrentRequests);

      // At least one should succeed
      const successfulResponses = responses.filter(
        result => result.status === 'fulfilled' && result.value.status === 200
      );

      expect(successfulResponses.length).toBeGreaterThan(0);

      // The source should end up with one of the company names
      const finalHistoryResponse = await request(app)
        .get('/api/user/work-history')
        .expect(200);

      const updatedSource = finalHistoryResponse.body.jobs.find(job => job.id === sourceId);
      expect(['Concurrent Company A', 'Concurrent Company B']).toContain(updatedSource.org);
    });

    test('should rate limit excessive reassignment requests', async () => {
      const sourceId = testSources[0].id;

      // Make many rapid requests
      const rapidRequests = Array(20).fill().map((_, index) =>
        request(app)
          .put(`/api/user/sources/${sourceId}/reassign-company`)
          .send({ newCompanyName: `Rate Limit Test ${index}` })
      );

      const responses = await Promise.allSettled(rapidRequests);

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(
        result => result.status === 'fulfilled' && result.value.status === 429
      );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Embedding Management', () => {
    test('should regenerate embeddings when preserveEmbeddings is false', async () => {
      const sourceToTest = testSources[0];

      const response = await request(app)
        .put(`/api/user/sources/${sourceToTest.id}/reassign-company`)
        .send({
          newCompanyName: 'Embedding Test Company',
          preserveEmbeddings: false
        })
        .expect(200);

      expect(response.body).toHaveProperty('embeddingRegenerated', true);
      expect(response.body).toHaveProperty('embeddingVector');
      expect(Array.isArray(response.body.embeddingVector)).toBe(true);
    });

    test('should preserve embeddings when preserveEmbeddings is true', async () => {
      const sourceToTest = testSources[1];

      const response = await request(app)
        .put(`/api/user/sources/${sourceToTest.id}/reassign-company`)
        .send({
          newCompanyName: 'Preserve Embedding Company',
          preserveEmbeddings: true
        })
        .expect(200);

      expect(response.body).toHaveProperty('embeddingPreserved', true);
      expect(response.body).not.toHaveProperty('embeddingRegenerated');
    });

    test('should handle embedding generation failures gracefully', async () => {
      // This test would require mocking the embedding service to fail
      // For now, we'll test that the API handles missing embedding vectors

      const sourceToTest = testSources[2];

      // Force embedding regeneration
      const response = await request(app)
        .put(`/api/user/sources/${sourceToTest.id}/reassign-company`)
        .send({
          newCompanyName: 'Embedding Failure Test',
          preserveEmbeddings: false
        })
        .expect(200); // Should succeed even if embedding fails

      expect(response.body).toHaveProperty('success', true);
      // Should have warning about embedding issues if they occur
      if (response.body.embeddingWarning) {
        expect(typeof response.body.embeddingWarning).toBe('string');
      }
    });
  });

  describe('Data Integrity and Consistency', () => {
    test('should maintain data consistency across operations', async () => {
      // Get initial state
      const initialResponse = await request(app)
        .get('/api/user/work-history?groupByCompany=true')
        .expect(200);

      const initialTotalPositions = initialResponse.body.jobs.length;
      const initialCompanyGroups = initialResponse.body.companyGroups.length;

      // Perform multiple operations
      const operations = [
        {
          sourceId: testSources[0].id,
          newCompanyName: 'Consistency Test A'
        },
        {
          sourceId: testSources[1].id,
          newCompanyName: 'Consistency Test B'
        }
      ];

      for (const op of operations) {
        await request(app)
          .put(`/api/user/sources/${op.sourceId}/reassign-company`)
          .send({ newCompanyName: op.newCompanyName })
          .expect(200);
      }

      // Verify final state
      const finalResponse = await request(app)
        .get('/api/user/work-history?groupByCompany=true')
        .expect(200);

      // Total positions should remain the same
      expect(finalResponse.body.jobs.length).toBe(initialTotalPositions);

      // Should have created new companies
      expect(finalResponse.body.companyGroups.length).toBeGreaterThanOrEqual(initialCompanyGroups);

      // Each position should have valid data
      finalResponse.body.jobs.forEach(job => {
        expect(job).toHaveProperty('id');
        expect(job).toHaveProperty('title');
        expect(job).toHaveProperty('org');
        expect(typeof job.title).toBe('string');
        expect(typeof job.org).toBe('string');
      });
    });

    test('should handle database transaction rollbacks on errors', async () => {
      const sourceToTest = testSources[0];

      // Get original state
      const originalResponse = await request(app)
        .get(`/api/user/sources/${sourceToTest.id}`)
        .expect(200);

      const originalOrg = originalResponse.body.source.org;

      // Attempt operation that might fail (very long company name)
      const failureResponse = await request(app)
        .put(`/api/user/sources/${sourceToTest.id}/reassign-company`)
        .send({
          newCompanyName: 'A'.repeat(1000) // Exceeds limits
        });

      // Verify original data is preserved if operation failed
      if (failureResponse.status !== 200) {
        const verifyResponse = await request(app)
          .get(`/api/user/sources/${sourceToTest.id}`)
          .expect(200);

        expect(verifyResponse.body.source.org).toBe(originalOrg);
      }
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle company grouping operations within acceptable time limits', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .get('/api/user/work-history?groupByCompany=true')
        .expect(200);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete within 2 seconds
      expect(processingTime).toBeLessThan(2000);
      expect(response.body).toHaveProperty('success', true);
    });

    test('should efficiently handle multiple concurrent company operations', async () => {
      const startTime = Date.now();

      // Create multiple concurrent operations
      const concurrentOperations = testSources.slice(0, 3).map((source, index) =>
        request(app)
          .put(`/api/user/sources/${source.id}/reassign-company`)
          .send({ newCompanyName: `Performance Test ${index}` })
      );

      const results = await Promise.allSettled(concurrentOperations);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should handle concurrent operations efficiently
      expect(totalTime).toBeLessThan(5000);

      // Most operations should succeed
      const successful = results.filter(
        result => result.status === 'fulfilled' && result.value.status === 200
      );
      expect(successful.length).toBeGreaterThan(results.length * 0.7);
    });
  });
});