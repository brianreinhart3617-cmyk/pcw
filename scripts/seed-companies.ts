/**
 * Seed script — populates the companies and brand_kits tables.
 *
 * Usage:
 *   npx tsx scripts/seed-companies.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface CompanySeed {
  name: string;
  type: 'marketing_company' | 'bh_center';
  gmail_address: string;
  is_active: boolean;
}

interface BrandKitSeed {
  primary_colors: string[];
  secondary_colors: string[];
  fonts: string[];
  tone: string;
  compliance_notes: string | null;
}

const COMPANIES: (CompanySeed & { brand_kit: BrandKitSeed })[] = [
  {
    name: 'Phoenix Creative Works',
    type: 'marketing_company',
    gmail_address: process.env.GMAIL_ADDRESS_PCW || 'pcw@phoenixcreativeworks.com',
    is_active: true,
    brand_kit: {
      primary_colors: ['#E85D26', '#1A1A2E'],
      secondary_colors: ['#F5A623', '#FFFFFF'],
      fonts: ['Montserrat', 'Open Sans'],
      tone: 'Professional yet creative, approachable and solution-oriented',
      compliance_notes: null,
    },
  },
  {
    name: 'Behavioral Health Center 1',
    type: 'bh_center',
    gmail_address: process.env.GMAIL_ADDRESS_BH1 || 'admin@bhcenter1.com',
    is_active: true,
    brand_kit: {
      primary_colors: ['#2E86AB', '#FFFFFF'],
      secondary_colors: ['#A23B72', '#F18F01'],
      fonts: ['Lato', 'Merriweather'],
      tone: 'Warm, compassionate, and professional. Patient-first language.',
      compliance_notes: 'HIPAA-compliant. Never include PHI in outbound communications.',
    },
  },
  {
    name: 'Behavioral Health Center 2',
    type: 'bh_center',
    gmail_address: process.env.GMAIL_ADDRESS_BH2 || 'admin@bhcenter2.com',
    is_active: true,
    brand_kit: {
      primary_colors: ['#3D5A80', '#FFFFFF'],
      secondary_colors: ['#98C1D9', '#EE6C4D'],
      fonts: ['Nunito', 'Source Serif Pro'],
      tone: 'Caring, trustworthy, and accessible. Empathetic without being clinical.',
      compliance_notes: 'HIPAA-compliant. Never include PHI in outbound communications.',
    },
  },
];

async function seed() {
  console.log('Seeding companies and brand kits...\n');

  for (const entry of COMPANIES) {
    const { brand_kit, ...companyData } = entry;

    // Upsert company by gmail_address
    const { data: existing } = await supabase
      .from('companies')
      .select('id')
      .eq('gmail_address', companyData.gmail_address)
      .limit(1);

    let companyId: string;

    if (existing && existing.length > 0) {
      companyId = existing[0].id;
      await supabase
        .from('companies')
        .update(companyData)
        .eq('id', companyId);
      console.log(`  Updated: ${companyData.name} (${companyId})`);
    } else {
      const { data: inserted, error } = await supabase
        .from('companies')
        .insert(companyData)
        .select('id')
        .single();

      if (error || !inserted) {
        console.error(`  Failed to insert ${companyData.name}:`, error?.message);
        continue;
      }

      companyId = inserted.id;
      console.log(`  Created: ${companyData.name} (${companyId})`);
    }

    // Upsert brand kit
    const { data: existingKit } = await supabase
      .from('brand_kits')
      .select('id')
      .eq('company_id', companyId)
      .limit(1);

    if (existingKit && existingKit.length > 0) {
      await supabase
        .from('brand_kits')
        .update({ ...brand_kit, company_id: companyId })
        .eq('id', existingKit[0].id);
      console.log(`    Brand kit updated`);
    } else {
      const { error: kitError } = await supabase
        .from('brand_kits')
        .insert({ ...brand_kit, company_id: companyId });

      if (kitError) {
        console.error(`    Brand kit insert failed:`, kitError.message);
      } else {
        console.log(`    Brand kit created`);
      }
    }
  }

  console.log('\nSeed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
