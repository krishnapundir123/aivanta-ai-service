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

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORE_SERVICE_URL || 'http://localhost:3000',
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

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '50'),
  message: 'Too many requests from this IP',
});
app.use(limiter);

// API Key validation middleware
const apiKey = process.env.API_KEY;
if (apiKey) {
  app.use((req, res, next) => {
    if (req.path === '/health') {
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

// Routes
app.use('/', routes);
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

app.listen(PORT, () => {
  console.log(`AI Service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
