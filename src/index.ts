import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { startEmailMonitor } from './services/email-monitor';
import emailRoutes from './api/email';
import approvalRoutes from './api/approval';
import canvaRoutes from './api/canva';
import makeRoutes from './api/make';
import conversationRoutes from './api/conversations';
import companyRoutes from './api/companies';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───

app.use(express.json());

// CORS — allow dashboard dev server and same-origin production
app.use((_req, res, next) => {
  const origin = _req.headers.origin;
  const allowed = process.env.CORS_ORIGIN || 'http://localhost:5173';
  if (origin && (origin === allowed || allowed === '*')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowed);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// ─── Health Check ───

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───

app.use('/api', emailRoutes);
app.use('/api', approvalRoutes);
app.use('/api', canvaRoutes);
app.use('/api', makeRoutes);
app.use('/api', conversationRoutes);
app.use('/api', companyRoutes);

// ─── Dashboard Static Files (production) ───

const dashboardBuild = path.join(__dirname, '..', 'dashboard', 'dist');
app.use(express.static(dashboardBuild));
app.get('*', (_req, res, next) => {
  // Only serve index.html for non-API routes (SPA fallback)
  if (_req.path.startsWith('/api') || _req.path === '/health') {
    next();
    return;
  }
  res.sendFile(path.join(dashboardBuild, 'index.html'), (err) => {
    if (err) next();
  });
});

// ─── Start ───

app.listen(PORT, () => {
  console.log(`PCW Agent System running on port ${PORT}`);

  // In Vercel, email polling is handled by Cron Jobs (POST /api/emails/poll).
  // Only start the polling loop in local/self-hosted environments.
  if (!process.env.VERCEL) {
    startEmailMonitor();
  } else {
    console.log('[EmailMonitor] Running on Vercel — cron-driven polling, skipping setInterval');
  }
});
