import { generateChatCompletion, generateEmbedding } from '../../infrastructure/llm/openai-client';

export interface RAGContext {
  ticketId?: string;
  query: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  includeTickets?: boolean;
  includeKbArticles?: boolean;
  includeCustomerHistory?: boolean;
}

export interface RetrievedDocument {
  type: 'ticket' | 'kb_article' | 'customer_history';
  id: string;
  title: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface RAGSuggestion {
  text: string;
  confidence: number;
  type: 'full_response' | 'template' | 'follow_up';
  sources: Array<{
    type: string;
    id: string;
    title: string;
  }>;
}

export interface RAGResponse {
  suggestions: RAGSuggestion[];
  contextUsed: {
    tickets: number;
    articles: number;
    customerHistory: number;
  };
  generationTimeMs: number;
}

// Mock vector search - in production this would query pgvector
async function vectorSearch(
  queryEmbedding: number[],
  sourceTypes: string[],
  limit: number = 5,
  threshold: number = 0.75
): Promise<RetrievedDocument[]> {
  // This would typically query the database with pgvector
  // For now, returning mock data structure
  return [];
}

// Assemble context from retrieved documents
function assembleContext(
  similarTickets: RetrievedDocument[],
  kbArticles: RetrievedDocument[],
  customerHistory: RetrievedDocument[],
  currentTicket?: string
): string {
  const sections: string[] = [];

  // Similar resolved tickets
  if (similarTickets.length > 0) {
    sections.push('## Similar Resolved Tickets');
    similarTickets.forEach((ticket, idx) => {
      sections.push(`\nSimilar Ticket #${idx + 1} (Similarity: ${(ticket.similarity * 100).toFixed(1)}%)`);
      sections.push(`Issue: ${ticket.title}`);
      sections.push(`Resolution: ${ticket.metadata?.resolution || 'See ticket details'}`);
    });
  }

  // Knowledge base articles
  if (kbArticles.length > 0) {
    sections.push('\n## Relevant Knowledge Base Articles');
    kbArticles.forEach((article, idx) => {
      sections.push(`\nArticle: ${article.title}`);
      sections.push(`Content: ${article.content.substring(0, 500)}...`);
    });
  }

  // Customer history
  if (customerHistory.length > 0) {
    sections.push('\n## Customer History');
    customerHistory.forEach((ticket, idx) => {
      sections.push(`\nPrevious Ticket #${idx + 1}: ${ticket.title}`);
      sections.push(`Status: ${ticket.metadata?.status || 'Unknown'}`);
    });
  }

  // Current ticket context
  if (currentTicket) {
    sections.push('\n## Current Ticket');
    sections.push(currentTicket);
  }

  return sections.join('\n');
}

export async function generateRAGResponse(context: RAGContext): Promise<RAGResponse> {
  const startTime = Date.now();

  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(context.query);

    // Retrieve relevant documents in parallel
    const [similarTickets, kbArticles, customerHistory] = await Promise.all([
      context.includeTickets !== false 
        ? vectorSearch(queryEmbedding, ['ticket'], 5, 0.75)
        : Promise.resolve([]),
      context.includeKbArticles !== false
        ? vectorSearch(queryEmbedding, ['kb_article'], 3, 0.7)
        : Promise.resolve([]),
      context.includeCustomerHistory !== false && context.ticketId
        ? vectorSearch(queryEmbedding, ['customer_history'], 3, 0.7)
        : Promise.resolve([]),
    ]);

    // Assemble context
    const assembledContext = assembleContext(
      similarTickets,
      kbArticles,
      customerHistory,
      context.query
    );

    // Build prompt
    const systemPrompt = `You are an expert support assistant. Use the provided context to suggest 3 professional responses to the customer's issue.

Guidelines:
- Be concise and professional
- Address the specific issue mentioned
- Reference relevant solutions from similar tickets
- Provide actionable next steps
- Tone should be helpful and empathetic

Output format: JSON array with suggestions containing text, confidence (0-1), type, and sources.`;

    const userPrompt = `${assembledContext}

## Query
${context.query}

Generate 3 suggested responses as a JSON array. Each suggestion should have:
- text: The response text
- confidence: Confidence score 0-1
- type: One of "full_response", "template", "follow_up"
- sources: Array of source references used`;

    // Generate response
    const response = await generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.3,
        maxTokens: 800,
      }
    );

    // Parse suggestions
    let suggestions: RAGSuggestion[] = [];
    try {
      const parsed = JSON.parse(response);
      suggestions = Array.isArray(parsed) ? parsed : parsed.suggestions || [];
    } catch {
      // Fallback if JSON parsing fails
      suggestions = [{
        text: response,
        confidence: 0.8,
        type: 'full_response',
        sources: [],
      }];
    }

    const generationTimeMs = Date.now() - startTime;

    return {
      suggestions: suggestions.slice(0, 3),
      contextUsed: {
        tickets: similarTickets.length,
        articles: kbArticles.length,
        customerHistory: customerHistory.length,
      },
      generationTimeMs,
    };
  } catch (error) {
    console.error('RAG generation failed:', error);
    throw error;
  }
}

// Generate embeddings for a batch of texts
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  // Process in batches of 100
  const batchSize = 100;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchEmbeddings = await Promise.all(
      batch.map(text => generateEmbedding(text))
    );
    embeddings.push(...batchEmbeddings);
  }
  
  return embeddings;
}
