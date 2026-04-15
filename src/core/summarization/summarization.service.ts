import { generateChatCompletion } from '../../infrastructure/llm/openai-client';

export type SummaryType = 'ticket' | 'thread' | 'pod' | 'executive';

export interface TicketSummaryInput {
  title: string;
  description: string;
  messages: Array<{
    author: string;
    content: string;
    isInternal: boolean;
  }>;
  status: string;
  priority: string;
}

export interface ThreadSummaryInput {
  messages: Array<{
    author: string;
    content: string;
    timestamp: string;
  }>;
}

export interface PODSummaryInput {
  tickets: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
    resolvedAt?: string;
  }>;
  timeRange: 'daily' | 'weekly' | 'monthly';
}

export interface ExecutiveSummaryInput {
  metrics: {
    totalTickets: number;
    resolvedTickets: number;
    avgResolutionTime: number;
    slaCompliance: number;
    csatScore: number;
  };
  trends: {
    ticketsTrend: 'up' | 'down' | 'stable';
    resolutionTrend: 'up' | 'down' | 'stable';
  };
  criticalIssues: string[];
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  actionItems?: string[];
  metadata: {
    generatedAt: string;
    confidence: number;
    tokenCount: number;
  };
}

export async function summarizeTicket(input: TicketSummaryInput): Promise<SummaryResult> {
  const messageTexts = input.messages
    .filter(m => !m.isInternal)
    .map(m => `${m.author}: ${m.content}`)
    .join('\n\n');

  const prompt = `Summarize the following support ticket concisely:

Title: ${input.title}
Description: ${input.description}
Status: ${input.status}
Priority: ${input.priority}

Conversation:
${messageTexts}

Provide a summary that includes:
1. The main issue (2-3 sentences)
2. Key actions taken
3. Current status and next steps

Output as JSON with fields: summary (string), keyPoints (string[]), actionItems (string[])`;

  const response = await generateChatCompletion(
    [
      {
        role: 'system',
        content: 'You are a helpful assistant that summarizes support tickets. Always respond with valid JSON.',
      },
      { role: 'user', content: prompt },
    ],
    {
      temperature: 0.3,
      maxTokens: 500,
    }
  );

  try {
    const parsed = JSON.parse(response);
    return {
      summary: parsed.summary,
      keyPoints: parsed.keyPoints || [],
      actionItems: parsed.actionItems || [],
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.9,
        tokenCount: response.length / 4,
      },
    };
  } catch {
    return {
      summary: response,
      keyPoints: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.7,
        tokenCount: response.length / 4,
      },
    };
  }
}

export async function summarizeThread(input: ThreadSummaryInput): Promise<SummaryResult> {
  const conversationText = input.messages
    .map(m => `[${m.timestamp}] ${m.author}: ${m.content}`)
    .join('\n');

  const prompt = `Summarize the following conversation thread:

${conversationText}

Provide:
1. A chronological digest of key events and decisions
2. Any pending items or blockers
3. Next steps

Output as JSON with fields: summary (string), keyPoints (string[]), actionItems (string[])`;

  const response = await generateChatCompletion(
    [
      {
        role: 'system',
        content: 'You are a helpful assistant that summarizes conversation threads. Always respond with valid JSON.',
      },
      { role: 'user', content: prompt },
    ],
    {
      temperature: 0.3,
      maxTokens: 600,
    }
  );

  try {
    const parsed = JSON.parse(response);
    return {
      summary: parsed.summary,
      keyPoints: parsed.keyPoints || [],
      actionItems: parsed.actionItems || [],
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.9,
        tokenCount: response.length / 4,
      },
    };
  } catch {
    return {
      summary: response,
      keyPoints: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.7,
        tokenCount: response.length / 4,
      },
    };
  }
}

export async function summarizePOD(input: PODSummaryInput): Promise<SummaryResult> {
  const ticketsText = input.tickets
    .map(t => `- ${t.title} (${t.status}, ${t.priority})`)
    .join('\n');

  const stats = {
    total: input.tickets.length,
    open: input.tickets.filter(t => t.status === 'OPEN').length,
    resolved: input.tickets.filter(t => t.status === 'RESOLVED').length,
    critical: input.tickets.filter(t => t.priority === 'CRITICAL' || t.priority === 'P0').length,
  };

  const prompt = `Generate a ${input.timeRange} summary for the support team:

Statistics:
- Total tickets: ${stats.total}
- Open: ${stats.open}
- Resolved: ${stats.resolved}
- Critical: ${stats.critical}

Tickets:
${ticketsText}

Provide:
1. Key trends and patterns
2. Common issues
3. Performance highlights
4. Recommendations

Output as JSON with fields: summary (string), keyPoints (string[]), actionItems (string[])`;

  const response = await generateChatCompletion(
    [
      {
        role: 'system',
        content: 'You are a helpful assistant that generates team summaries. Always respond with valid JSON.',
      },
      { role: 'user', content: prompt },
    ],
    {
      temperature: 0.4,
      maxTokens: 700,
    }
  );

  try {
    const parsed = JSON.parse(response);
    return {
      summary: parsed.summary,
      keyPoints: parsed.keyPoints || [],
      actionItems: parsed.actionItems || [],
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.85,
        tokenCount: response.length / 4,
      },
    };
  } catch {
    return {
      summary: response,
      keyPoints: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.7,
        tokenCount: response.length / 4,
      },
    };
  }
}

export async function generateExecutiveSummary(input: ExecutiveSummaryInput): Promise<SummaryResult> {
  const prompt = `Generate an executive summary for leadership:

Key Metrics:
- Total tickets: ${input.metrics.totalTickets}
- Resolved: ${input.metrics.resolvedTickets}
- Avg resolution time: ${input.metrics.avgResolutionTime} hours
- SLA compliance: ${input.metrics.slaCompliance}%
- CSAT score: ${input.metrics.csatScore}/5

Trends:
- Ticket volume: ${input.trends.ticketsTrend}
- Resolution time: ${input.trends.resolutionTrend}

Critical Issues:
${input.criticalIssues.map(i => `- ${i}`).join('\n')}

Provide:
1. Executive summary (3-5 sentences)
2. Key insights and concerns
3. Strategic recommendations

Output as JSON with fields: summary (string), keyPoints (string[]), actionItems (string[])`;

  const response = await generateChatCompletion(
    [
      {
        role: 'system',
        content: 'You are a helpful assistant that generates executive summaries. Always respond with valid JSON.',
      },
      { role: 'user', content: prompt },
    ],
    {
      temperature: 0.4,
      maxTokens: 800,
    }
  );

  try {
    const parsed = JSON.parse(response);
    return {
      summary: parsed.summary,
      keyPoints: parsed.keyPoints || [],
      actionItems: parsed.actionItems || [],
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.9,
        tokenCount: response.length / 4,
      },
    };
  } catch {
    return {
      summary: response,
      keyPoints: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        confidence: 0.7,
        tokenCount: response.length / 4,
      },
    };
  }
}
