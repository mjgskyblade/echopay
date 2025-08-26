const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const logger = require('./utils/logger');

// Import routes
const walletRoutes = require('./routes/wallet');
const transactionRoutes = require('./routes/transactions');
const authRoutes = require('./routes/auth');
const fraudRoutes = require('./routes/fraud');
const deviceRoutes = require('./routes/devices');
const multiWalletRoutes = require('./routes/multi-wallet');
const reversalRoutes = require('./routes/reversals');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/fraud', fraudRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/multi-wallet', multiWalletRoutes);
app.use('/api/reversals', reversalRoutes);

// Serve main app for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'wallet-interface'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested resource was not found'
  });
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  logger.info('User connected:', socket.id);

  // Authentication middleware for socket connections
  socket.use((packet, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      // In a real implementation, verify the JWT token here
      socket.userId = 'user-from-token'; // Extract from token
      next();
    } else {
      next(new Error('Authentication error'));
    }
  });

  socket.on('join-wallet', (walletId) => {
    socket.join(`wallet-${walletId}`);
    logger.info(`User ${socket.id} joined wallet ${walletId}`);
  });

  socket.on('join-case', (caseId) => {
    socket.join(`case-${caseId}`);
    socket.join(`user-${socket.userId}`);
    logger.info(`User ${socket.id} joined fraud case ${caseId}`);
  });

  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
    logger.info(`User ${socket.id} joined user room ${userId}`);
  });

  socket.on('request-case-update', (caseId) => {
    // Send immediate case status update
    socket.emit('case-status-requested', { caseId, timestamp: new Date().toISOString() });
  });

  socket.on('disconnect', () => {
    logger.info('User disconnected:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

const PORT = process.env.PORT || 3003;

server.listen(PORT, () => {
  logger.info(`Wallet Interface service running on port ${PORT}`);
});

module.exports = { app, server, io };