import { generateChatCompletion, generateEmbedding } from '../../infrastructure/llm/openai-client';

export interface TriageResult {
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  suggestedAssignee?: string;
  summary: string;
  embedding: number[];
}

const CATEGORIES = [
  'Bug Report',
  'Feature Request',
  'Technical Support',
  'Account Issue',
  'Billing Question',
  'Integration Help',
  'Performance Issue',
  'Security Concern',
  'General Inquiry',
];

const TRIAGE_SYSTEM_PROMPT = `You are an expert ticket triage system for a customer support platform.
Analyze the ticket title and description to classify and prioritize it.

Categories: ${CATEGORIES.join(', ')}

Priority levels:
- CRITICAL: Production outage, security breach, data loss, blocking all users
- HIGH: Major feature broken, significant performance degradation, security concern
- MEDIUM: Partial functionality affected, workaround available
- LOW: Minor issues, questions, enhancement requests

Respond in JSON format:
{
  "category": "selected category",
  "priority": "LOW|MEDIUM|HIGH|CRITICAL",
  "confidence": 0.0-1.0,
  "summary": "brief 1-2 sentence summary"
}`;

export async function triageTicket(title: string, description: string): Promise<TriageResult> {
  const content = `Title: ${title}\n\nDescription: ${description}`;
  
  // Generate triage classification
  const response = await generateChatCompletion(
    [
      { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    {
      temperature: 0.3,
      responseFormat: { type: 'json_object' },
    }
  );

  let triage: {
    category: string;
    priority: string;
    confidence: number;
    summary: string;
  };

  try {
    triage = JSON.parse(response);
  } catch {
    // Fallback if parsing fails
    triage = {
      category: 'General Inquiry',
      priority: 'MEDIUM',
      confidence: 0.5,
      summary: `${title}: ${description.slice(0, 100)}...`,
    };
  }

  // Validate priority
  const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  if (!validPriorities.includes(triage.priority)) {
    triage.priority = 'MEDIUM';
  }

  // Generate embedding for similarity search
  const embeddingText = `${triage.category}: ${title} ${description}`;
  const embedding = await generateEmbedding(embeddingText);

  return {
    category: triage.category,
    priority: triage.priority as TriageResult['priority'],
    confidence: triage.confidence,
    summary: triage.summary,
    embedding,
  };
}
