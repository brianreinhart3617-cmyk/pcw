import express from 'express';
import dotenv from 'dotenv';
import { startEmailMonitor } from './services/email-monitor';
import emailRoutes from './api/email';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', emailRoutes);

app.listen(PORT, () => {
  console.log(`PCW Agent System running on port ${PORT}`);
  startEmailMonitor();
});
