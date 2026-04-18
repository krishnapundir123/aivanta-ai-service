import { generateEmbedding, generateEmbeddings } from '../../infrastructure/llm/openai-client';

export interface TicketForAnalysis {
  id: string;
  title: string;
  description: string;
  category?: string;
  priority: string;
  createdAt: string;
  customerId: string;
  status: string;
}

export interface DetectedPattern {
  patternId: string;
  description: string;
  ticketCount: number;
  affectedCustomers: string[];
  rootCause: 'Product' | 'Data' | 'User' | 'Process' | 'Unknown';
  severity: 'High' | 'Medium' | 'Low';
  trend: 'Increasing' | 'Stable' | 'Decreasing';
  firstSeen: string;
  recommendedAction: string;
  sampleTickets: Array<{
    id: string;
    title: string;
  }>;
}

export interface PatternDetectionResult {
  detectedPatterns: DetectedPattern[];
  summary: {
    totalPatterns: number;
    highSeverityCount: number;
    totalAffectedTickets: number;
    analysisDate: string;
  };
}

// Simple clustering algorithm (in production, use HDBSCAN or similar)
interface Cluster {
  id: string;
  tickets: TicketForAnalysis[];
  centroid: number[];
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Simple k-means-like clustering
async function clusterTickets(
  tickets: TicketForAnalysis[],
  embeddings: number[][],
  minClusterSize: number = 3,
  similarityThreshold: number = 0.8
): Promise<Cluster[]> {
  const clusters: Cluster[] = [];
  const assigned = new Set<number>();
  
  for (let i = 0; i < tickets.length; i++) {
    if (assigned.has(i)) continue;
    
    const clusterTickets: TicketForAnalysis[] = [tickets[i]];
    const clusterIndices: number[] = [i];
    
    for (let j = i + 1; j < tickets.length; j++) {
      if (assigned.has(j)) continue;
      
      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
      if (similarity >= similarityThreshold) {
        clusterTickets.push(tickets[j]);
        clusterIndices.push(j);
      }
    }
    
    if (clusterTickets.length >= minClusterSize) {
      // Calculate centroid
      const centroid: number[] = [];
      const dim = embeddings[0].length;
      
      for (let d = 0; d < dim; d++) {
        let sum = 0;
        for (const idx of clusterIndices) {
          sum += embeddings[idx][d];
        }
        centroid.push(sum / clusterIndices.length);
      }
      
      clusters.push({
        id: `pattern_${clusters.length + 1}`,
        tickets: clusterTickets,
        centroid,
      });
      
      clusterIndices.forEach(idx => assigned.add(idx));
    }
  }
  
  return clusters;
}

// Analyze cluster to determine root cause
function analyzeRootCause(cluster: Cluster): DetectedPattern['rootCause'] {
  const keywords = {
    Product: ['bug', 'error', 'crash', 'feature', 'functionality', 'system'],
    Data: ['data', 'database', 'sync', 'migration', 'corruption', 'missing'],
    User: ['user', 'login', 'permission', 'access', 'training', 'confusion'],
    Process: ['process', 'workflow', 'approval', 'automation', 'integration'],
  };
  
  const text = cluster.tickets
    .map(t => `${t.title} ${t.description}`)
    .join(' ')
    .toLowerCase();
  
  const scores: Record<string, number> = {};
  
  for (const [cause, words] of Object.entries(keywords)) {
    scores[cause] = words.filter(w => text.includes(w)).length;
  }
  
  const maxCause = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return (maxCause[1] > 0 ? maxCause[0] : 'Unknown') as DetectedPattern['rootCause'];
}

// Determine severity based on ticket priority and count
function determineSeverity(cluster: Cluster): DetectedPattern['severity'] {
  const criticalCount = cluster.tickets.filter(
    t => t.priority === 'CRITICAL' || t.priority === 'P0'
  ).length;
  
  if (criticalCount > 0 || cluster.tickets.length >= 10) {
    return 'High';
  }
  
  if (cluster.tickets.length >= 5) {
    return 'Medium';
  }
  
  return 'Low';
}

// Calculate trend based on ticket dates
function calculateTrend(cluster: Cluster): DetectedPattern['trend'] {
  const tickets = [...cluster.tickets].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  if (tickets.length < 3) return 'Stable';
  
  const firstDate = new Date(tickets[0].createdAt);
  const lastDate = new Date(tickets[tickets.length - 1].createdAt);
  const daysSpan = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSpan === 0) return 'Stable';
  
  const ticketsPerDay = tickets.length / daysSpan;
  
  if (ticketsPerDay > 2) return 'Increasing';
  if (ticketsPerDay < 0.5) return 'Decreasing';
  return 'Stable';
}

// Generate recommended action based on pattern
function generateRecommendedAction(pattern: DetectedPattern): string {
  const actions: Record<DetectedPattern['rootCause'], string> = {
    Product: 'Schedule engineering review. Consider hotfix if critical.',
    Data: 'Investigate data pipeline. Run validation checks.',
    User: 'Create knowledge base article. Schedule training session.',
    Process: 'Review workflow documentation. Consider automation improvements.',
    Unknown: 'Conduct deeper analysis. Escalate to senior team.',
  };
  
  return actions[pattern.rootCause];
}

export async function detectPatterns(
  tickets: TicketForAnalysis[],
  options: {
    timeWindow?: 'week' | 'month';
    minClusterSize?: number;
    similarityThreshold?: number;
  } = {}
): Promise<PatternDetectionResult> {
  const { timeWindow = 'week', minClusterSize = 3, similarityThreshold = 0.8 } = options;
  
  if (tickets.length < minClusterSize) {
    return {
      detectedPatterns: [],
      summary: {
        totalPatterns: 0,
        highSeverityCount: 0,
        totalAffectedTickets: 0,
        analysisDate: new Date().toISOString(),
      },
    };
  }
  
  try {
    // Generate embeddings for all tickets
    const texts = tickets.map(t => `${t.title} ${t.description}`);
    const embeddings = await generateEmbeddings(texts);
    
    // Cluster tickets
    const clusters = await clusterTickets(
      tickets,
      embeddings,
      minClusterSize,
      similarityThreshold
    );
    
    // Analyze each cluster
    const detectedPatterns: DetectedPattern[] = clusters.map(cluster => {
      const rootCause = analyzeRootCause(cluster);
      const severity = determineSeverity(cluster);
      const trend = calculateTrend(cluster);
      
      const affectedCustomers = [...new Set(cluster.tickets.map(t => t.customerId))];
      
      const pattern: DetectedPattern = {
        patternId: cluster.id,
        description: generatePatternDescription(cluster),
        ticketCount: cluster.tickets.length,
        affectedCustomers,
        rootCause,
        severity,
        trend,
        firstSeen: cluster.tickets[0].createdAt,
        recommendedAction: '',
        sampleTickets: cluster.tickets.slice(0, 5).map(t => ({
          id: t.id,
          title: t.title,
        })),
      };
      
      pattern.recommendedAction = generateRecommendedAction(pattern);
      
      return pattern;
    });
    
    // Sort by severity and ticket count
    detectedPatterns.sort((a, b) => {
      const severityOrder = { High: 3, Medium: 2, Low: 1 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[b.severity] - severityOrder[a.severity];
      }
      return b.ticketCount - a.ticketCount;
    });
    
    return {
      detectedPatterns,
      summary: {
        totalPatterns: detectedPatterns.length,
        highSeverityCount: detectedPatterns.filter(p => p.severity === 'High').length,
        totalAffectedTickets: detectedPatterns.reduce((sum, p) => sum + p.ticketCount, 0),
        analysisDate: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('Pattern detection failed:', error);
    throw error;
  }
}

function generatePatternDescription(cluster: Cluster): string {
  // Extract common keywords from titles
  const titles = cluster.tickets.map(t => t.title.toLowerCase());
  const commonWords = findCommonWords(titles);
  
  if (commonWords.length > 0) {
    return `Issues related to ${commonWords.slice(0, 3).join(', ')}`;
  }
  
  // Fallback to category if available
  const categories = [...new Set(cluster.tickets.map(t => t.category).filter(Boolean))];
  if (categories.length > 0) {
    return `${categories[0]} related issues`;
  }
  
  return 'Recurring similar issues';
}

function findCommonWords(texts: string[]): string[] {
  const wordFreq: Record<string, number> = {};
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'and', 'or', 'not', 'error', 'issue', 'problem']);
  
  for (const text of texts) {
    const words = text.split(/\s+/);
    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, '');
      if (clean.length > 3 && !stopWords.has(clean)) {
        wordFreq[clean] = (wordFreq[clean] || 0) + 1;
      }
    }
  }
  
  return Object.entries(wordFreq)
    .filter(([_, count]) => count >= texts.length / 2)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}
