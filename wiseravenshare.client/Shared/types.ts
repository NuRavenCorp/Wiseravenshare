// ============================================================
// WiseRavenShare — Data Transfer Objects (DTOs)
// Shared type definitions for all backend services and controllers
// ============================================================

// --- Music Analysis DTOs ---

export interface MusicAnalysisInput {
    media_asset_id?: string | null;
    track_title: string;
    bpm: number;
    key: string;
    energy: number;
    dynamics: number;
    spectral_centroid: number;
    bass_energy: number;
    mid_energy: number;
    treble_energy: number;
    fingerprint: string;
    confidence: number;
}

export interface MusicStampResult {
    stamp_id: string;
    stamp_status: "certified" | "original" | "flagged";
    assessment: string;
    character_tags: string[];
    originality_note: string;
    analysis_id: string;
}

export interface MusicAnalysisQuery {
    stamp_status?: string;
    key?: string;
    min_bpm?: number;
    max_bpm?: number;
    created_by_id?: string;
    limit?: number;
    sort?: string;
}

export interface MusicAnalysisListResult {
    items: any[];
    total: number;
}

export interface MusicAnalysisUpdateInput {
    action: "update" | "delete";
    analysis_id: string;
    stamp_status?: "certified" | "original" | "flagged";
    assessment?: string;
}

export interface MusicAnalysisUpdateResult {
    success: boolean;
    action: string;
    analysis_id: string;
}

// --- Truth Score DTOs ---

export interface TruthScoreInput {
    post_id: string;
}

export interface TruthScoreResult {
    post_id: string;
    truth_score: number;
    confidence: number;
    status: string;
    factors: string[];
    ai_detection_flags: string[];
    truth_score_id: string;
}

export interface TruthScoreQuery {
    target_id?: string;
    target_type?: string;
    min_score?: number;
    max_score?: number;
    limit?: number;
    sort?: string;
}

export interface TruthScoreListResult {
    items: any[];
    total: number;
}

export interface TruthScoreUpdateInput {
    action: "update" | "delete";
    score_id: string;
    score?: number;
    notes?: string;
}

export interface TruthScoreUpdateResult {
    success: boolean;
    action: string;
    score_id: string;
}