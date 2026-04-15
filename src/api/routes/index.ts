import { Router } from 'express';
import triageRoutes from './triage.routes';
import copilotRoutes from './copilot.routes';
import assistantRoutes from './assistant.routes';
import { generateRAGResponse } from '../../core/retrieval/rag.service';
import { summarizeTicket, summarizeThread, summarizePOD, generateExecutiveSummary } from '../../core/summarization/summarization.service';
import { suggestAssignee } from '../../core/routing/routing.service';
import { detectPatterns } from '../../core/detection/pattern-detection.service';
import { predictResolutionTime, predictSLABreach } from '../../core/prediction/prediction.service';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'aivanta-ai',
    timestamp: new Date().toISOString(),
  });
});

// Routes
router.use('/triage', triageRoutes);
router.use('/embeddings', triageRoutes);
router.use('/copilot', copilotRoutes);
router.use('/assistant', assistantRoutes);

// RAG Suggestions endpoint
router.post('/suggest-responses', async (req, res, next) => {
  try {
    const { ticketId, query, includeTickets, includeKbArticles, includeCustomerHistory } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required',
      });
    }

    const result = await generateRAGResponse({
      ticketId,
      query,
      includeTickets,
      includeKbArticles,
      includeCustomerHistory,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Summarization endpoints
router.post('/summarize/ticket', async (req, res, next) => {
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

router.post('/summarize/thread', async (req, res, next) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required',
      });
    }

    const result = await summarizeThread({ messages });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/summarize/pod', async (req, res, next) => {
  try {
    const { tickets, timeRange } = req.body;
    
    if (!tickets || !Array.isArray(tickets)) {
      return res.status(400).json({
        success: false,
        error: 'Tickets array is required',
      });
    }

    const result = await summarizePOD({
      tickets,
      timeRange: timeRange || 'weekly',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/summarize/executive', async (req, res, next) => {
  try {
    const { metrics, trends, criticalIssues } = req.body;
    
    const result = await generateExecutiveSummary({
      metrics: metrics || {},
      trends: trends || {},
      criticalIssues: criticalIssues || [],
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Smart Routing endpoint
router.post('/suggest-assignee', async (req, res, next) => {
  try {
    const { ticket, availableAgents } = req.body;
    
    if (!ticket || !availableAgents || !Array.isArray(availableAgents)) {
      return res.status(400).json({
        success: false,
        error: 'Ticket and availableAgents are required',
      });
    }

    const result = await suggestAssignee(ticket, availableAgents);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Pattern Detection endpoint
router.post('/detect-patterns', async (req, res, next) => {
  try {
    const { tickets, timeWindow, minClusterSize, similarityThreshold } = req.body;
    
    if (!tickets || !Array.isArray(tickets)) {
      return res.status(400).json({
        success: false,
        error: 'Tickets array is required',
      });
    }

    const result = await detectPatterns(tickets, {
      timeWindow: timeWindow || 'week',
      minClusterSize: minClusterSize || 3,
      similarityThreshold: similarityThreshold || 0.8,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Prediction endpoints
router.post('/predict/resolution', async (req, res, next) => {
  try {
    const { ticket } = req.body;
    
    if (!ticket) {
      return res.status(400).json({
        success: false,
        error: 'Ticket is required',
      });
    }

    const result = await predictResolutionTime(ticket);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/predict/sla-breach', async (req, res, next) => {
  try {
    const { ticket, slaDeadline } = req.body;
    
    if (!ticket || !slaDeadline) {
      return res.status(400).json({
        success: false,
        error: 'Ticket and slaDeadline are required',
      });
    }

    const result = await predictSLABreach(ticket, new Date(slaDeadline));

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Search endpoint
router.post('/search', async (req, res) => {
  try {
    const { query, sources, limit, threshold } = req.body;
    
    // Mock search - in production would use vector search
    res.json({
      success: true,
      data: {
        results: [],
        query,
        sources: sources || ['tickets', 'kb'],
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Search failed',
    });
  }
});

export default router;
