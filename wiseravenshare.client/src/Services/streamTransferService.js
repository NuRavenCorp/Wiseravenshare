import { apiService } from './api.js';

const BASE = '/api/stream-transfer';
const GATE = '/api/stream-gatekeeper';

/**
 * Initiate a transfer from WiseRavenShare → WiseRavenStream.
 * @param {{ sourceContentId:string, videoUrl:string, title:string, description?:string, fileSizeBytes?:number, mimeType?:string }} req
 */
export async function initiateStreamTransfer(req) {
  const res = await apiService.post(BASE, req);
  return res.data;
}

/** Poll a single transfer by ID. */
export async function getStreamTransfer(id) {
  const res = await apiService.get(`${BASE}/${id}`);
  return res.data;
}

/** Cancel a pending transfer. */
export async function cancelStreamTransfer(id) {
  await apiService.delete(`${BASE}/${id}`);
}

/** Retry a failed transfer (admin or creator). */
export async function retryStreamTransfer(id) {
  await apiService.post(`${BASE}/${id}/retry`);
}

// ── Gatekeeper (admin) ──────────────────────────────────────────────────────

/** Fetch all transfers awaiting human review. */
export async function getGatekeeperQueue() {
  const res = await apiService.get(`${GATE}/queue`);
  return res.data;
}

/**
 * Submit a gatekeeper decision.
 * @param {string} id Transfer ID
 * @param {'Cleared'|'RequiresEdit'|'Escalated'|'Rejected'} action
 * @param {string} rationale
 */
export async function submitGatekeeperDecision(id, action, rationale) {
  const res = await apiService.post(`${GATE}/${id}/decision`, { action, rationale });
  return res.data;
}
