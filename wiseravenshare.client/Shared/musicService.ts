// ============================================================
// WiseRavenShare — Music Analysis Service
// Business logic layer for music stamping, querying, and management
// ============================================================

import type {
    MusicAnalysisInput,
    MusicStampResult,
    MusicAnalysisQuery,
    MusicAnalysisListResult,
    MusicAnalysisUpdateInput,
    MusicAnalysisUpdateResult,
} from "./types";

/**
 * Stamp a music track with an originality certification.
 * Checks fingerprint uniqueness, generates stamp ID, runs LLM assessment.
 */
export async function stampMusicAnalysis(
    base44: any,
    user: any,
    input: MusicAnalysisInput
): Promise<MusicStampResult> {
    // Originality check: search for an existing fingerprint
    const existing = await base44.asServiceRole.entities.MusicAnalysis.filter(
        { fingerprint: input.fingerprint },
        { limit: 1 }
    );

    let stamp_status: "certified" | "original" | "flagged" = "certified";
    let originality_note = "";

    if (existing.items && existing.items.length > 0) {
        const existingAnalysis = existing.items[0];
        if (existingAnalysis.created_by_id === user.id) {
            return {
                stamp_id: existingAnalysis.stamp_id,
                stamp_status: existingAnalysis.stamp_status,
                assessment: existingAnalysis.assessment || "",
                character_tags: existingAnalysis.character_tags || [],
                originality_note: "This track has already been stamped by you.",
                analysis_id: existingAnalysis.id,
            };
        } else {
            stamp_status = "flagged";
            originality_note =
                "A matching fingerprint was found from another creator. This work has been flagged for review.";
        }
    }

    // Generate unique stamp ID
    const stamp_id =
        "WRS-STAMP-" +
        Date.now().toString(36).toUpperCase() +
        "-" +
        Math.random().toString(36).substring(2, 6).toUpperCase();

    // LLM musical assessment of the extracted features
    const assessment = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are the WiseRavenShare music certification engine. Based on the following audio analysis of the first 10 bars of a song, provide a concise musical assessment (2-3 sentences) describing the character and identity of this work.

Track: ${input.track_title}
BPM: ${input.bpm}
Key: ${input.key}
Energy (RMS): ${Number(input.energy).toFixed(4)}
Dynamics (crest factor): ${Number(input.dynamics).toFixed(2)}
Spectral centroid: ${Number(input.spectral_centroid).toFixed(1)} Hz
Bass/Mid/Treble balance: ${(Number(input.bass_energy) * 100).toFixed(0)}% / ${(Number(input.mid_energy) * 100).toFixed(0)}% / ${(Number(input.treble_energy) * 100).toFixed(0)}%
Confidence: ${(Number(input.confidence) * 100).toFixed(0)}%
Fingerprint: ${input.fingerprint}
Originality: ${stamp_status === "flagged" ? "FLAGGED - potential duplicate" : "Original"}

Describe the song's character, energy level, tonal balance, and what makes it unique based on these metrics. Be specific and musical. Return a JSON object with an "assessment" field (string) and a "character_tags" field (array of 3-5 short descriptive tags like "energetic", "bass-heavy", "bright", "dynamic").`,
        response_json_schema: {
            type: "object",
            properties: {
                assessment: { type: "string" },
                character_tags: { type: "array", items: { type: "string" } },
            },
            required: ["assessment", "character_tags"],
        },
    });

    // Persist the stamped analysis
    const analysis = await base44.entities.MusicAnalysis.create({
        media_asset_id: input.media_asset_id || null,
        track_title: input.track_title,
        bpm: input.bpm,
        key: input.key,
        energy: input.energy,
        dynamics: input.dynamics,
        spectral_centroid: input.spectral_centroid,
        bass_energy: input.bass_energy,
        mid_energy: input.mid_energy,
        treble_energy: input.treble_energy,
        fingerprint: input.fingerprint,
        bars_analyzed: 10,
        confidence: input.confidence,
        stamp_status,
        stamp_id,
        assessment: assessment.assessment,
        character_tags: assessment.character_tags || [],
    });

    return {
        stamp_id,
        stamp_status,
        assessment: assessment.assessment,
        character_tags: assessment.character_tags || [],
        originality_note,
        analysis_id: analysis.id,
    };
}

/**
 * List music analyses with optional filtering.
 */
export async function listMusicAnalyses(
    base44: any,
    user: any,
    query: MusicAnalysisQuery
): Promise<MusicAnalysisListResult> {
    const filter: any = {};

    if (query.stamp_status) filter.stamp_status = query.stamp_status;
    if (query.key) filter.key = query.key;
    if (query.created_by_id) filter.created_by_id = query.created_by_id;
    if (query.min_bpm !== undefined || query.max_bpm !== undefined) {
        filter.bpm = {};
        if (query.min_bpm !== undefined) filter.bpm.$gte = query.min_bpm;
        if (query.max_bpm !== undefined) filter.bpm.$lte = query.max_bpm;
    }

    const limit = query.limit || 50;
    const sort = query.sort || "-created_date";

    const page = await base44.entities.MusicAnalysis.filter(
        Object.keys(filter).length > 0 ? filter : {},
        { sort, limit }
    );

    const total = await base44.entities.MusicAnalysis.count(
        Object.keys(filter).length > 0 ? filter : {}
    );

    return {
        items: page.items || [],
        total,
    };
}

/**
 * Update or delete a music analysis. Only the owner or admins can manage.
 */
export async function manageMusicAnalysis(
    base44: any,
    user: any,
    input: MusicAnalysisUpdateInput
): Promise<MusicAnalysisUpdateResult> {
    const analysis = await base44.entities.MusicAnalysis.get(input.analysis_id);
    if (!analysis) {
        throw new Error("Analysis not found");
    }

    const isOwner = analysis.created_by_id === user.id;
    const isAdmin = user.role === "admin";

    if (!isOwner && !isAdmin) {
        throw new Error("Forbidden: you can only manage your own analyses");
    }

    if (input.action === "delete") {
        await base44.entities.MusicAnalysis.delete(input.analysis_id);
        return { success: true, action: "delete", analysis_id: input.analysis_id };
    }

    if (input.action === "update") {
        // Only admins can change stamp_status; owners can update assessment
        const updateData: any = {};
        if (input.stamp_status !== undefined) {
            if (!isAdmin) throw new Error("Only admins can change stamp status");
            updateData.stamp_status = input.stamp_status;
        }
        if (input.assessment !== undefined) {
            updateData.assessment = input.assessment;
        }
        await base44.entities.MusicAnalysis.update(input.analysis_id, updateData);
        return { success: true, action: "update", analysis_id: input.analysis_id };
    }

    throw new Error("Invalid action");
}