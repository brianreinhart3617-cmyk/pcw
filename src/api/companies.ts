import { Router } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

// List all companies
router.get('/companies', async (_req, res) => {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, type, gmail_address, is_active, created_at')
    .order('name');

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

// Get single company with brand kit
router.get('/companies/:id', async (req, res) => {
  const { data: company, error: compError } = await supabase
    .from('companies')
    .select('id, name, type, gmail_address, is_active, created_at')
    .eq('id', req.params.id)
    .single();

  if (compError || !company) {
    res.status(404).json({ error: 'Company not found' });
    return;
  }

  const { data: brandKit } = await supabase
    .from('brand_kits')
    .select('*')
    .eq('company_id', req.params.id)
    .limit(1)
    .single();

  res.json({ ...company, brand_kit: brandKit ?? null });
});

export default router;
