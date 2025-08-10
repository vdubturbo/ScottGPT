import express from 'express';
import TagManager from '../scripts/tag-manager.js';
import { api as logger } from '../utils/logger.js';

const router = express.Router();

// GET /api/tags/pending - Get all pending tags
router.get('/pending', async (req, res) => {
  try {
    const tagManager = new TagManager();
    await tagManager.loadConfiguration();
    
    const pendingTags = tagManager.getPendingTags();
    
    logger.info('Retrieved pending tags', { count: pendingTags.length });
    
    res.json({
      success: true,
      tags: pendingTags,
      count: pendingTags.length
    });
  } catch (error) {
    logger.error('Failed to get pending tags', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve pending tags' });
  }
});

// GET /api/tags/approved - Get all approved tags
router.get('/approved', async (req, res) => {
  try {
    const tagManager = new TagManager();
    await tagManager.loadConfiguration();
    
    logger.info('Retrieved approved tags', { count: tagManager.controlledVocabulary.length });
    
    res.json({
      success: true,
      tags: tagManager.controlledVocabulary.sort(),
      count: tagManager.controlledVocabulary.length
    });
  } catch (error) {
    logger.error('Failed to get approved tags', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve approved tags' });
  }
});

// POST /api/tags/approve - Approve pending tags
router.post('/approve', async (req, res) => {
  try {
    const { tags } = req.body;
    
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ error: 'Please provide tags to approve' });
    }
    
    const tagManager = new TagManager();
    await tagManager.loadConfiguration();
    
    const approved = await tagManager.approveTags(tags);
    
    logger.info('Tags approved', { 
      approved: approved,
      count: approved.length,
      ip: req.ip 
    });
    
    res.json({
      success: true,
      approved: approved,
      message: `Successfully approved ${approved.length} tags`
    });
  } catch (error) {
    logger.error('Failed to approve tags', { error: error.message });
    res.status(500).json({ error: 'Failed to approve tags' });
  }
});

// POST /api/tags/reject - Reject pending tags
router.post('/reject', async (req, res) => {
  try {
    const { tags } = req.body;
    
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ error: 'Please provide tags to reject' });
    }
    
    const tagManager = new TagManager();
    await tagManager.loadConfiguration();
    
    const rejected = await tagManager.rejectTags(tags);
    
    logger.info('Tags rejected', { 
      rejected: rejected,
      count: rejected.length,
      ip: req.ip 
    });
    
    res.json({
      success: true,
      rejected: rejected,
      message: `Successfully rejected ${rejected.length} tags`
    });
  } catch (error) {
    logger.error('Failed to reject tags', { error: error.message });
    res.status(500).json({ error: 'Failed to reject tags' });
  }
});

// GET /api/tags/report - Get a text report of pending tags
router.get('/report', async (req, res) => {
  try {
    const tagManager = new TagManager();
    await tagManager.loadConfiguration();
    
    const report = tagManager.generatePendingTagsReport();
    
    logger.info('Generated tags report');
    
    res.json({
      success: true,
      report: report
    });
  } catch (error) {
    logger.error('Failed to generate tags report', { error: error.message });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;