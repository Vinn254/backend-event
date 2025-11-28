const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();

// Connect to database
connectDB();

// Middleware
// Allow configuring frontend origin in production via FRONTEND_URL env var
const allowedOrigin = 'https://events-organizer-fr.netlify.app';
app.set('trust proxy', 1);
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());

// Serve static files from frontend directory (assumes frontend build is placed in ../frontend)
const frontendPath = fs.existsSync(path.join(__dirname, '../frontend/dist')) ? path.join(__dirname, '../frontend/dist') : path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Serve uploaded files (note: Render's filesystem is ephemeral; consider using S3 for persistent uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Event Management API is running', env: process.env.NODE_ENV || 'development' });
});

// SPA fallback: serve index.html for client-side routes
app.use((req, res, next) => {
  // If request is for an API route or uploads, skip
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }

  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) {
      res.status(500).send('Could not load frontend');
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;