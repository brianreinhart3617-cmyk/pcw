/**
 * Vercel Serverless Function entry point.
 *
 * Re-exports the Express app so Vercel can route /api/* and /health
 * through the same server logic used in local development.
 *
 * NOTE: Email polling is NOT started here — Vercel Cron Jobs call
 * POST /api/emails/poll on a schedule instead.
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import emailRoutes from '../src/api/email';
import approvalRoutes from '../src/api/approval';
import canvaRoutes from '../src/api/canva';
import makeRoutes from '../src/api/make';
import conversationRoutes from '../src/api/conversations';
import companyRoutes from '../src/api/companies';

const app = express();

// ─── Middleware ───

app.use(express.json());

app.use((_req, res, next) => {
  const origin = _req.headers.origin;
  const allowed = process.env.CORS_ORIGIN || '*';
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

export default app;
