import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import routes from './api/routes';
import embeddingRoutes from './api/routes/embeddings.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0';

// Process-level error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting — skip health checks
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '50'),
  message: 'Too many requests from this IP',
  skip: (req) => req.path === '/health' || req.path === '/api/v1/ai/health',
});
app.use(limiter);

// API Key validation middleware
const apiKey = process.env.API_KEY;
if (apiKey) {
  app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/api/v1/ai/health') {
      return next();
    }

    const providedKey = req.headers['x-api-key'];
    if (providedKey !== apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
      });
    }
    next();
  });
}

// Root health check (for Railway / direct container checks)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'aivanta-ai',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/v1/ai', routes);
app.use('/embeddings', embeddingRoutes);

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

const server = app.listen(Number(PORT), HOST, () => {
  console.log(`AI Service running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
  console.log(`API health check: http://${HOST}:${PORT}/api/v1/ai/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
