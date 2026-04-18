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

// Unified summarize endpoint — fetches entity from core service then summarizes
router.post('/summarize', async (req, res, next) => {
  try {
    const { type, ticketId, threadId } = req.body;

    if (!type) {
      return res.status(400).json({ success: false, error: 'type is required' });
    }

    const coreUrl = process.env.CORE_SERVICE_URL || 'http://localhost:3000';
    const coreKey = process.env.CORE_SERVICE_API_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (coreKey) headers['x-api-key'] = coreKey;

    // Forward the caller's auth token so the core service can authorize the request
    const authHeader = req.headers['authorization'];
    if (authHeader) headers['authorization'] = authHeader as string;
    const cookieHeader = req.headers['cookie'];
    if (cookieHeader) headers['cookie'] = cookieHeader as string;

    if (type === 'ticket') {
      const id = ticketId;
      if (!id) {
        return res.status(400).json({ success: false, error: 'ticketId is required for type=ticket' });
      }

      const ticketRes = await fetch(`${coreUrl}/api/v1/tickets/${id}`, { headers });
      if (!ticketRes.ok) {
        return res.status(ticketRes.status).json({ success: false, error: `Core service returned ${ticketRes.status}` });
      }
      const ticketData = (await ticketRes.json()) as { data?: any; [k: string]: any };
      const ticket = ticketData.data ?? ticketData;

      const messagesRes = await fetch(`${coreUrl}/api/v1/tickets/${id}/messages`, { headers });
      let messages: any[] = [];
      if (messagesRes.ok) {
        const messagesData = (await messagesRes.json()) as { data?: any[] };
        messages = messagesData.data ?? [];
      }

      const result = await summarizeTicket({
        title: ticket.title || ticket.subject || '',
        description: ticket.description || ticket.body || '',
        messages: messages.map((m: any) => ({
          author: m.authorName || m.author || 'Unknown',
          content: m.content || m.body || '',
          isInternal: m.isInternal ?? false,
        })),
        status: ticket.status || 'OPEN',
        priority: ticket.priority || 'P2',
      });

      return res.json({ success: true, data: result });
    }

    if (type === 'thread') {
      const id = threadId || ticketId;
      if (!id) {
        return res.status(400).json({ success: false, error: 'threadId is required for type=thread' });
      }

      const threadRes = await fetch(`${coreUrl}/api/v1/threads/${id}/messages`, { headers });
      if (!threadRes.ok) {
        return res.status(threadRes.status).json({ success: false, error: `Core service returned ${threadRes.status}` });
      }
      const threadData = (await threadRes.json()) as { data?: any[] };
      const messages: any[] = threadData.data ?? [];

      const result = await summarizeThread({
        messages: messages.map((m: any) => ({
          author: m.authorName || m.author || 'Unknown',
          content: m.content || m.body || '',
          timestamp: m.createdAt || m.timestamp || new Date().toISOString(),
        })),
      });

      return res.json({ success: true, data: result });
    }

    return res.status(400).json({ success: false, error: `Unsupported type: ${type}` });
  } catch (error) {
    next(error);
  }
});

// Search endpoint
router.post('/search', async (req, res, next) => {
  try {
    const { query, type, sources, limit = 5, threshold } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const coreUrl = process.env.CORE_SERVICE_URL || 'http://localhost:3000';
    const coreKey = process.env.CORE_SERVICE_API_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (coreKey) headers['x-api-key'] = coreKey;

    const authHeader = req.headers['authorization'];
    if (authHeader) headers['authorization'] = authHeader as string;
    const cookieHeader = req.headers['cookie'];
    if (cookieHeader) headers['cookie'] = cookieHeader as string;

    // Determine which entity to search based on type
    const entityPath = type === 'ticket' ? 'tickets' : type === 'kb' ? 'kb-articles' : type || 'tickets';

    const searchRes = await fetch(
      `${coreUrl}/api/v1/${entityPath}?search=${encodeURIComponent(query)}&limit=${limit}`,
      { headers }
    );

    if (!searchRes.ok) {
      // Degrade gracefully — return empty results rather than a hard error
      return res.json({
        success: true,
        data: { results: [], query, type: type || 'ticket', total: 0 },
      });
    }

    const searchData = (await searchRes.json()) as { data?: any[]; items?: any[]; [k: string]: any };
    const items: any[] = searchData.data ?? searchData.items ?? [];

    return res.json({
      success: true,
      data: {
        results: items.slice(0, limit),
        query,
        type: type || 'ticket',
        total: items.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
