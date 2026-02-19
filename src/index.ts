import express from 'express';
import dotenv from 'dotenv';
import { startEmailMonitor } from './services/email-monitor';
import emailRoutes from './api/email';
import approvalRoutes from './api/approval';
import canvaRoutes from './api/canva';
import makeRoutes from './api/make';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', emailRoutes);
app.use('/api', approvalRoutes);
app.use('/api', canvaRoutes);
app.use('/api', makeRoutes);

app.listen(PORT, () => {
  console.log(`PCW Agent System running on port ${PORT}`);
  startEmailMonitor();
});
