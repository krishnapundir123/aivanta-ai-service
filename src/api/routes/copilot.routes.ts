import { Router } from 'express';
import { processCopilotQuery, executeCopilotAction } from '../../core/generation/copilot.service';
import { summarizeTicket } from '../../core/summarization/summarization.service';

const router = Router();

// Copilot query endpoint
router.post('/query', async (req, res, next) => {
  try {
    const { query, context, userId, sessionId } = req.body;

    if (!query || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Query and userId are required',
      });
    }

    const result = await processCopilotQuery(query, context || {}, []);

    res.json({
      success: true,
      data: {
        ...result,
        sessionId: sessionId || 'new-session',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Execute action endpoint
router.post('/action', async (req, res, next) => {
  try {
    const { action, params, userId } = req.body;

    if (!action || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Action and userId are required',
      });
    }

    const result = await executeCopilotAction(action, params || {});

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Ticket summarization via copilot
router.post('/summarize-ticket', async (req, res, next) => {
  try {
    const { title, description, messages, status, priority } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required',
      });
    }

    const result = await summarizeTicket({
      title,
      description,
      messages: messages || [],
      status: status || 'OPEN',
      priority: priority || 'P2',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Quick actions endpoints
router.post('/quick-assign', async (req, res) => {
  const { ticketId, userId } = req.body;
  res.json({
    success: true,
    data: {
      action: 'assign',
      ticketId,
      userId,
      message: 'Ticket assigned successfully',
    },
  });
});

router.post('/quick-prioritize', async (req, res) => {
  const { ticketId, priority } = req.body;
  res.json({
    success: true,
    data: {
      action: 'prioritize',
      ticketId,
      priority,
      message: `Priority updated to ${priority}`,
    },
  });
});

router.post('/quick-status', async (req, res) => {
  const { ticketId, status } = req.body;
  res.json({
    success: true,
    data: {
      action: 'status',
      ticketId,
      status,
      message: `Status updated to ${status}`,
    },
  });
});

export default router;
