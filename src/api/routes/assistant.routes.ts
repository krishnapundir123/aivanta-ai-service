import { Router } from 'express';
import { processAssistantQuery, summarizeConversation } from '../../core/generation/assistant.service';

const router = Router();

// Assistant query endpoint
router.post('/query', async (req, res, next) => {
  try {
    const { query, sessionId, tenantId, history } = req.body;

    if (!query || !tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Query and tenantId are required',
      });
    }

    const result = await processAssistantQuery(
      query,
      tenantId,
      history || []
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Summarize conversation endpoint
router.post('/summarize', async (req, res, next) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required',
      });
    }

    const summary = await summarizeConversation(messages);

    res.json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
