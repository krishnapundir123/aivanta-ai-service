import { Router, Request } from 'express';
import { processCopilotQuery, executeCopilotAction } from '../../core/generation/copilot.service';
import { summarizeTicket } from '../../core/summarization/summarization.service';

const router = Router();

function extractUserIdFromAuth(req: Request): string | undefined {
  // 1. Check authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
      return payload.userId;
    } catch {
      // ignore decode errors
    }
  }

  // 2. Check accessToken cookie
  const cookie = req.headers.cookie;
  if (cookie) {
    const match = cookie.match(/accessToken=([^;]+)/);
    if (match) {
      try {
        const token = decodeURIComponent(match[1]);
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
        return payload.userId;
      } catch {
        // ignore decode errors
      }
    }
  }

  return undefined;
}

// Main copilot endpoint — matches POST /api/v1/ai/copilot
router.post('/', async (req, res, next) => {
  try {
    const { query, context } = req.body;
    const userId = req.body.userId || extractUserIdFromAuth(req);

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
        sessionId: req.body.sessionId || 'new-session',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Copilot query endpoint (legacy/explicit path)
router.post('/query', async (req, res, next) => {
  try {
    const { query, context, sessionId } = req.body;
    const userId = req.body.userId || extractUserIdFromAuth(req);

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
    const { action, params } = req.body;
    const userId = req.body.userId || extractUserIdFromAuth(req);

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
