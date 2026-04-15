import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function generateChatCompletion(
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' };
  } = {}
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
    response_format: options.responseFormat,
  });

  return response.choices[0]?.message?.content || '';
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  return response.data.map(d => d.embedding);
}

export async function streamChatCompletion(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<void> {
  const stream = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      onChunk(content);
    }
  }
}

export default openai;
