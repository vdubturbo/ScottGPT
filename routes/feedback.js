import express from 'express';
import { supabase } from '../config/database.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Software version - update this when releasing new versions
const SOFTWARE_VERSION = 'v0.5';

// POST /api/feedback - Submit user feedback
router.post('/', async (req, res) => {
  try {
    const { comment } = req.body;
    const userEmail = req.user?.email;
    const userId = req.user?.id;

    // Validate input
    if (!comment || typeof comment !== 'string') {
      return res.status(400).json({
        error: 'Comment is required and must be a string'
      });
    }

    if (comment.trim().length === 0) {
      return res.status(400).json({
        error: 'Comment cannot be empty'
      });
    }

    if (comment.length > 1000) {
      return res.status(400).json({
        error: 'Comment cannot exceed 1000 characters'
      });
    }

    if (!userEmail || !userId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    // Insert feedback into database using service role client to bypass RLS
    const { data, error } = await supabase
      .from('user_feedback')
      .insert([
        {
          user_id: userId,
          user_email: userEmail,
          comment: comment.trim(),
          software_version: SOFTWARE_VERSION
        }
      ])
      .select()
      .single();

    if (error) {
      logger.error('Failed to insert feedback:', {
        error: error.message,
        userEmail,
        commentLength: comment.length
      });

      return res.status(500).json({
        error: 'Failed to submit feedback'
      });
    }

    logger.info('Feedback submitted successfully', {
      feedbackId: data.id,
      userEmail,
      commentLength: comment.length,
      softwareVersion: SOFTWARE_VERSION
    });

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: {
        id: data.id,
        created_at: data.created_at
      }
    });

  } catch (err) {
    logger.error('Feedback submission error:', {
      error: err.message,
      stack: err.stack,
      userEmail: req.user?.email
    });

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// GET /api/feedback - Get feedback statistics (admin only)
router.get('/stats', async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user?.is_admin) {
      return res.status(403).json({
        error: 'Admin access required'
      });
    }

    // Get feedback counts and latest submissions
    const { data: stats, error: statsError } = await supabase
      .from('user_feedback')
      .select('created_at, software_version')
      .order('created_at', { ascending: false });

    if (statsError) {
      throw statsError;
    }

    // Calculate statistics
    const totalFeedback = stats.length;
    const last24Hours = stats.filter(f =>
      new Date(f.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length;
    const last7Days = stats.filter(f =>
      new Date(f.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    // Version breakdown
    const versionCounts = stats.reduce((acc, f) => {
      acc[f.software_version] = (acc[f.software_version] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        totalFeedback,
        last24Hours,
        last7Days,
        versionCounts,
        currentVersion: SOFTWARE_VERSION
      }
    });

  } catch (err) {
    logger.error('Feedback stats error:', {
      error: err.message,
      stack: err.stack,
      userEmail: req.user?.email
    });

    res.status(500).json({
      error: 'Failed to fetch feedback statistics'
    });
  }
});

export default router;