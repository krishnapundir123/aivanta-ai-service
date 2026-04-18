import { Router } from 'express';
import { generateEmbedding, generateEmbeddings } from '../../infrastructure/llm/openai-client';

const router = Router();

// Single embedding
router.post('/', async (req, res, next) => {
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
      data: {
        embedding,
        dimensions: embedding.length,
        model: 'text-embedding-3-small',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Batch embeddings
router.post('/batch', async (req, res, next) => {
  try {
    const { texts } = req.body;

    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({
        success: false,
        error: 'Texts array is required',
      });
    }

    if (texts.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 texts allowed per batch',
      });
    }

    const embeddings = await generateEmbeddings(texts);

    res.json({
      success: true,
      data: {
        embeddings,
        count: embeddings.length,
        dimensions: embeddings[0]?.length || 0,
        model: 'text-embedding-3-small',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Similarity calculation
router.post('/similarity', async (req, res) => {
  try {
    const { text1, text2 } = req.body;

    if (!text1 || !text2) {
      return res.status(400).json({
        success: false,
        error: 'Both text1 and text2 are required',
      });
    }

    const [embedding1, embedding2] = await Promise.all([
      generateEmbedding(text1),
      generateEmbedding(text2),
    ]);

    // Calculate cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));

    res.json({
      success: true,
      data: {
        similarity: Math.round(similarity * 1000) / 1000,
        text1Length: text1.length,
        text2Length: text2.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Similarity calculation failed',
    });
  }
});

export default router;
