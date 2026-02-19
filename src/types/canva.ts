// ─── Database Row Types ───

export interface CanvaTokenRow {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

export interface BrandKitRow {
  id: string;
  company_id: string;
  primary_colors: string[] | null;
  secondary_colors: string[] | null;
  fonts: string[] | null;
  logo_url: string | null;
  tone: string | null;
  compliance_notes: string | null;
  business_card_template: Record<string, unknown> | null;
  canva_flyer_template_id: string | null;
  canva_business_card_template_id: string | null;
  created_at: string;
}

// ─── OAuth2 ───

export interface CanvaOAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

// ─── Design API ───

export type CanvaDesignPreset = 'Flyer' | 'BusinessCard' | 'Poster' | 'SocialMedia';

export interface CreateDesignRequest {
  title: string;
  design_type?: {
    type: 'preset';
    name: CanvaDesignPreset;
  };
}

export interface CreateDesignResponse {
  design: {
    id: string;
    title: string;
    url: string;
    created_at: number;
    updated_at: number;
  };
}

// ─── Export API ───

export type CanvaExportFormat = 'pdf' | 'png' | 'jpg';

export interface CreateExportRequest {
  design_id: string;
  format: {
    type: CanvaExportFormat;
  };
}

export interface CreateExportResponse {
  job: {
    id: string;
    status: 'in_progress' | 'success' | 'failed';
  };
}

export interface CanvaExportJob {
  job: {
    id: string;
    status: 'in_progress' | 'success' | 'failed';
    result?: {
      urls: string[];
    };
    error?: {
      code: string;
      message: string;
    };
  };
}

// ─── Asset Upload API ───

export interface UploadAssetResponse {
  job: {
    id: string;
    status: 'in_progress' | 'success' | 'failed';
    asset?: {
      id: string;
    };
    error?: {
      code: string;
      message: string;
    };
  };
}

// ─── Autofill API ───

export interface AutofillDataset {
  [key: string]: {
    type: 'text';
    text: string;
  } | {
    type: 'image';
    asset_id: string;
  };
}

export interface CreateAutofillJobRequest {
  brand_template_id: string;
  title: string;
  data: AutofillDataset;
}

export interface AutofillJobResponse {
  job: {
    id: string;
    status: 'in_progress' | 'success' | 'failed';
    result?: {
      type: 'create_design';
      design: {
        id: string;
        title: string;
        url: string;
      };
    };
    error?: {
      code: string;
      message: string;
    };
  };
}

// ─── Deliverable Generation ───

export type DeliverableType = 'flyer' | 'business_card';

export interface GenerateDeliverableParams {
  conversationId: string;
  type: DeliverableType;
  instructions?: string;
}

export interface GenerateDeliverableResult {
  deliverableId: string;
  canvaDesignId: string;
  canvaDesignUrl: string;
  exportUrls: string[];
  version: number;
}
