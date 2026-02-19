import { canvaFetch } from '../config/canva';
import type {
  CanvaDesignPreset,
  CanvaExportFormat,
  CreateDesignResponse,
  CreateExportResponse,
  CanvaExportJob,
  UploadAssetResponse,
} from '../types/canva';

const LOG = '[CanvaService]';

// ─── Design ───

export async function createDesign(
  title: string,
  preset?: CanvaDesignPreset,
): Promise<CreateDesignResponse['design']> {
  const body: Record<string, unknown> = { title };
  if (preset) {
    body.design_type = { type: 'preset', name: preset };
  }

  const res = await canvaFetch('/designs', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as CreateDesignResponse;
  console.log(`${LOG} Created design "${title}" (${data.design.id})`);
  return data.design;
}

// ─── Export ───

export async function exportDesign(
  designId: string,
  format: CanvaExportFormat = 'pdf',
): Promise<string> {
  const res = await canvaFetch('/exports', {
    method: 'POST',
    body: JSON.stringify({
      design_id: designId,
      format: { type: format },
    }),
  });

  const data = (await res.json()) as CreateExportResponse;
  console.log(`${LOG} Export job started for design ${designId}: ${data.job.id}`);
  return data.job.id;
}

export async function getExportStatus(exportId: string): Promise<CanvaExportJob['job']> {
  const res = await canvaFetch(`/exports/${exportId}`, { method: 'GET' });
  const data = (await res.json()) as CanvaExportJob;
  return data.job;
}

export async function waitForExport(
  exportId: string,
  maxWaitMs: number = 60_000,
  pollIntervalMs: number = 2_000,
): Promise<string[]> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const job = await getExportStatus(exportId);

    if (job.status === 'success' && job.result) {
      console.log(`${LOG} Export ${exportId} completed with ${job.result.urls.length} file(s)`);
      return job.result.urls;
    }

    if (job.status === 'failed') {
      const errMsg = job.error?.message ?? 'Unknown export error';
      throw new Error(`Canva export failed: ${errMsg}`);
    }

    // Still in progress — wait and poll again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Canva export timed out after ${maxWaitMs}ms`);
}

// ─── Asset Upload ───

export async function uploadAssetFromUrl(
  url: string,
  name: string,
): Promise<string> {
  const res = await canvaFetch('/imports', {
    method: 'POST',
    body: JSON.stringify({
      import_data: { type: 'url', url },
      title: name,
    }),
  });

  const data = (await res.json()) as UploadAssetResponse;

  if (data.job.status === 'failed') {
    throw new Error(`Canva asset upload failed: ${data.job.error?.message ?? 'Unknown error'}`);
  }

  if (data.job.asset) {
    console.log(`${LOG} Asset uploaded: ${data.job.asset.id}`);
    return data.job.asset.id;
  }

  // If still in progress, poll (asset uploads are usually fast)
  const maxWait = 30_000;
  const deadline = Date.now() + maxWait;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const statusRes = await canvaFetch(`/imports/${data.job.id}`, { method: 'GET' });
    const statusData = (await statusRes.json()) as UploadAssetResponse;

    if (statusData.job.status === 'success' && statusData.job.asset) {
      console.log(`${LOG} Asset uploaded: ${statusData.job.asset.id}`);
      return statusData.job.asset.id;
    }

    if (statusData.job.status === 'failed') {
      throw new Error(`Canva asset upload failed: ${statusData.job.error?.message ?? 'Unknown error'}`);
    }
  }

  throw new Error('Canva asset upload timed out');
}
