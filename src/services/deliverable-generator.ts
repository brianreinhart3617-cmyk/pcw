import { supabase } from '../config/supabase';
import { createDesign, exportDesign, waitForExport, uploadAssetFromUrl } from './canva';
import { notifyApprovalNeeded } from './slack';
import type {
  DeliverableType,
  CanvaDesignPreset,
  CanvaExportFormat,
  BrandKitRow,
  GenerateDeliverableParams,
  GenerateDeliverableResult,
} from '../types/canva';
import type { CompanyRecord } from '../types/email';

const LOG = '[DeliverableGenerator]';

// ─── Helpers ───

const PRESET_MAP: Record<DeliverableType, CanvaDesignPreset> = {
  flyer: 'Flyer',
  business_card: 'BusinessCard',
};

const EXPORT_FORMAT_MAP: Record<DeliverableType, CanvaExportFormat> = {
  flyer: 'pdf',
  business_card: 'png',
};

function buildDesignTitle(
  companyName: string,
  type: DeliverableType,
  version: number,
): string {
  const typeLabel = type === 'business_card' ? 'Business Card' : 'Flyer';
  return `${companyName} — ${typeLabel} v${version}`;
}

async function getBrandKit(companyId: string): Promise<BrandKitRow | null> {
  const { data } = await supabase
    .from('brand_kits')
    .select('*')
    .eq('company_id', companyId)
    .limit(1)
    .single();

  return data as BrandKitRow | null;
}

async function getNextVersion(
  conversationId: string,
  type: DeliverableType,
): Promise<number> {
  const { data } = await supabase
    .from('deliverables')
    .select('version')
    .eq('conversation_id', conversationId)
    .eq('type', type)
    .order('version', { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    return data[0].version + 1;
  }
  return 1;
}

// ─── Main Generation ───

export async function generateDeliverable(
  params: GenerateDeliverableParams,
): Promise<GenerateDeliverableResult> {
  const { conversationId, type, instructions } = params;

  // 1. Look up conversation + company
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*, companies(*)')
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const company = conversation.companies as CompanyRecord;

  // 2. Fetch brand kit
  const brandKit = await getBrandKit(company.id);

  // 3. Upload logo to Canva if available
  let logoAssetId: string | null = null;
  if (brandKit?.logo_url) {
    try {
      logoAssetId = await uploadAssetFromUrl(brandKit.logo_url, `${company.name} Logo`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${LOG} Logo upload failed (non-fatal): ${msg}`);
    }
  }

  // 4. Create Canva design
  const version = await getNextVersion(conversationId, type);
  const title = buildDesignTitle(company.name, type, version);
  const preset = PRESET_MAP[type];

  const design = await createDesign(title, preset);

  // 5. Export design
  const exportFormat = EXPORT_FORMAT_MAP[type];
  const exportId = await exportDesign(design.id, exportFormat);
  const exportUrls = await waitForExport(exportId);

  // 6. Build content metadata
  const content: Record<string, unknown> = {
    canva_editor_url: design.url,
    instructions: instructions ?? null,
    brand_kit: brandKit
      ? {
          primary_colors: brandKit.primary_colors,
          secondary_colors: brandKit.secondary_colors,
          fonts: brandKit.fonts,
          tone: brandKit.tone,
          logo_asset_id: logoAssetId,
        }
      : null,
  };

  // 7. Insert deliverable row
  const { data: deliverable, error: insertError } = await supabase
    .from('deliverables')
    .insert({
      conversation_id: conversationId,
      type,
      version,
      content,
      file_urls: exportUrls,
      preview_urls: exportUrls,
      approval_status: 'pending',
      canva_design_id: design.id,
      canva_export_url: exportUrls[0] ?? null,
    })
    .select('id')
    .single();

  if (insertError || !deliverable) {
    throw new Error(`Failed to insert deliverable: ${insertError?.message}`);
  }

  // 8. Slack notification
  notifyApprovalNeeded({
    itemType: 'deliverable',
    companyName: company.name,
    clientEmail: conversation.client_email,
    subject: title,
    summary: `${type === 'business_card' ? 'Business card' : 'Flyer'} v${version} ready for review`,
  }).catch((err) => {
    console.error(`${LOG} Slack notification failed:`, err);
  });

  console.log(
    `${LOG} Deliverable created: ${deliverable.id} (${type} v${version}) for conversation ${conversationId}`,
  );

  return {
    deliverableId: deliverable.id,
    canvaDesignId: design.id,
    canvaDesignUrl: design.url,
    exportUrls,
    version,
  };
}

// ─── Regeneration ───

export async function regenerateDeliverable(
  deliverableId: string,
  feedback: string,
): Promise<GenerateDeliverableResult> {
  const { data: existing, error } = await supabase
    .from('deliverables')
    .select('*, conversations(*, companies(*))')
    .eq('id', deliverableId)
    .single();

  if (error || !existing) {
    throw new Error(`Deliverable ${deliverableId} not found`);
  }

  // Update the old deliverable with feedback
  await supabase
    .from('deliverables')
    .update({
      approval_status: 'changes_requested',
      brian_feedback: feedback,
    })
    .eq('id', deliverableId);

  // Generate a new version with the feedback as instructions
  return generateDeliverable({
    conversationId: existing.conversation_id,
    type: existing.type as DeliverableType,
    instructions: feedback,
  });
}
