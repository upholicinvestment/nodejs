import express, { Request, Response, NextFunction } from 'express';
import { MongoClient, Db } from 'mongodb';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import helmet from 'helmet';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Security Middleware
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS Configuration
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'https://www.upholictech.com',
  'https://shepherd-workflow-phys-harassment.trycloudflare.com'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(limiter);

// MongoDB Connection
let db: Db;
let mongoClient: MongoClient;

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI || !process.env.MONGO_DB_NAME) {
      throw new Error('Missing MongoDB configuration in .env');
    }

    mongoClient = new MongoClient(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      retryReads: true
    });

    await mongoClient.connect();
    db = mongoClient.db(process.env.MONGO_DB_NAME);
    
    // Test the connection
    await db.command({ ping: 1 });
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
};

// Connect to DB before starting server
connectDB();

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    db: db ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// ✅ API: Fetch selected stocks with LTP and volume
app.get('/api/stocks', async (_req, res) => {
  try {
    const securityIds = [
      3499, 4306, 10604, 1363, 13538, 11723, 5097, 25, 2475, 1594, 2031,
      16669, 1964, 11483, 1232, 7229, 2885, 16675, 11536, 10999, 18143, 3432,
      3506, 467, 910, 3787, 15083, 21808, 1660, 3045, 157, 881, 4963, 383, 317,
      11532, 11630, 3351, 14977, 1922, 5258, 5900, 17963, 1394, 1333, 1348, 694,
      236, 3456
    ];

    const stocks = await db.collection('nse_equity')
      .find({ security_id: { $in: securityIds } })
      .project({
        _id: 0,
        security_id: 1,
        LTP: 1,
        volume: 1,
        close: 1 // Include the close price (previous day's close)
      })
      .toArray();

    res.json(stocks);
  } catch (err) {
    console.error('Error fetching stocks:', err);
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
});


// Express route handler
app.get('/api/advdec', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!db) throw new Error('Database not connected');

    // Define the time range (last 60 minutes)
    const since = new Date(Date.now() - 60 * 60 * 1000);

    // Ensure an index on the 'timestamp' field for efficient sorting
    await db.collection('nse_equity').createIndex({ timestamp: 1 });

    // Fetch records from the last 60 minutes
    const records = await db.collection('nse_equity')
      .find({ timestamp: { $gte: since } }, { projection: { LTP: 1, close: 1, timestamp: 1 } })
      .sort({ timestamp: 1 })
      .toArray();

    if (!records.length) {
      res.status(404).json({ error: 'No data available' });
      return;
    }

    // Group records by time (HH:MM)
    const formatTime = (isoString: string) => {
      const d = new Date(isoString);
      const hours = d.getUTCHours().toString().padStart(2, '0');
      const minutes = d.getUTCMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const grouped: Record<string, any[]> = {};
    for (const doc of records) {
      const time = formatTime(doc.timestamp);
      if (!grouped[time]) grouped[time] = [];
      grouped[time].push(doc);
    }

    // Calculate advances and declines for each time group
    const chartData = Object.entries(grouped).map(([time, group]) => {
      let advances = 0, declines = 0;
      for (const stock of group) {
        const ltp = parseFloat(stock.LTP);
        const close = parseFloat(stock.close);
        if (ltp > close) advances++;
        else if (ltp < close) declines++;
      }
      return { time, advances, declines };
    });

    const latest = chartData.at(-1);

    const current = {
      advances: latest?.advances ?? 0,
      declines: latest?.declines ?? 0,
      total: (latest?.advances ?? 0) + (latest?.declines ?? 0)
    };

    res.json({ current, chartData });
  } catch (err) {
    console.error('Error in /api/advdec:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

// Error Handling Middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Socket.IO Configuration
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});


io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected (${socket.id}):`, reason);
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

// Server Startup
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
  console.log(`🔗 Allowed CORS origins: ${allowedOrigins.join(', ')}`);
});

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await mongoClient?.close();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { app, io };