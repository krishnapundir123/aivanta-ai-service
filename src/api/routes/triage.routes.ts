import { Router } from 'express';
import { triageTicket } from '../../core/classification/triage.service';
import { generateEmbedding } from '../../infrastructure/llm/openai-client';

const router = Router();

// Ticket triage endpoint
router.post('/', async (req, res, next) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required',
      });
    }

    const result = await triageTicket(title, description);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Generate embedding endpoint
router.post('/embeddings', async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required',
      });
    }

    const embedding = await generateEmbedding(text);

    res.json({
      success: true,
      data: { embedding },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
