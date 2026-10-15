// Entity schemas and serialization helpers for Base44 <-> PostgreSQL sync.
// No direct pg import — the actual DB connection goes through an HTTP proxy.

const PG_TYPE_MAP = {
    string: "TEXT",
    number: "DOUBLE PRECISION",
    boolean: "BOOLEAN",
    array: "JSONB",
    object: "JSONB",
    date: "DATE",
};

const BUILTIN_FIELD_TYPES = {
    id: "TEXT PRIMARY KEY",
    created_date: "TIMESTAMPTZ",
    updated_date: "TIMESTAMPTZ",
    created_by_id: "TEXT",
};

// Entity schemas: entity name -> { field: type }
export const ENTITY_SCHEMAS = {
    Post: {
        content: "string", media_uris: "array", hashtags: "array", partials: "array",
        post_type: "string", region: "string", truth_score: "number", truth_status: "string",
        status: "string", like_count: "number", comment_count: "number", share_count: "number",
        challenge_count: "number", external_source: "string",
    },
    Comment: {
        post_id: "string", content: "string", parent_id: "string",
        truth_score: "number", like_count: "number",
    },
    Podcast: {
        description: "string",
        title: "string", episode_number: "number", subject_matter: "string", script: "string",
        script_status: "string", itinerary: "array", lineup_status: "string", status: "string",
        is_premium: "boolean", episode_media_uri: "string", teaser_text: "string",
        teaser_video_uri: "string", price_monthly: "number", price_one_time: "number",
        ai_pricing: "object", team_ids: "array", view_count: "number",
    },
    PodcastPayment: {
        description: "string",
        podcast_id: "string", user_id: "string", payment_type: "string", amount: "number",
        status: "string", stripe_session_id: "string", stripe_subscription_id: "string",
    },
    UserProfile: {
        display_name: "string", bio: "string", avatar_uri: "string", cover_uri: "string",
        location: "string", website: "string", is_creator: "boolean", verified: "boolean",
        truth_reputation: "number", follower_count: "number", following_count: "number",
        post_count: "number",
    },
    MediaAsset: {
        description: "string",
        asset_type: "string", file_uri: "string", title: "string", duration: "number",
        is_proprietary: "boolean", tags: "array", is_public: "boolean",
    },
    MusicAnalysis: {
        description: "string",
        media_asset_id: "string", track_title: "string", bpm: "number", key: "string",
        energy: "number", dynamics: "number", spectral_centroid: "number", bass_energy: "number",
        mid_energy: "number", treble_energy: "number", fingerprint: "string",
        bars_analyzed: "number", confidence: "number", stamp_status: "string",
        stamp_id: "string", assessment: "string", character_tags: "array",
    },
    TruthScore: {
        target_id: "string", target_type: "string", score: "number", confidence: "number",
        factors: "array", ai_detection_flags: "array", notes: "string",
    },
    Challenge: {
        description: "string",
        post_id: "string", reason: "string", evidence: "string",
        status: "string", verdict: "string",
    },
    Like: {
        description: "string",
        target_id: "string", target_type: "string",
    },
    Follow: {
        description: "string",
        followee_id: "string", status: "string",
    },
    Bookmark: {
        description: "string",
        post_id: "string", post_content: "string", label: "string",
    },
    Block: {
        description: "string",
        blocked_id: "string", reason: "string",
    },
    Notification: {
        description: "string",
        recipient_id: "string", type: "string", message: "string",
        link: "string", read: "boolean",
    },
    Conversation: {
        description: "string",
        participants: "array", type: "string", title: "string", last_message_at: "string",
    },
    Message: {
        conversation_id: "string", participants: "array", content: "string",
        media_uri: "string", read_by: "array",
    },
    JamSession: {
        description: "string",
        title: "string", participants: "array", status: "string", track_uris: "array",
        started_at: "string", ended_at: "string", bpm: "number",
    },
    LiveStream: {
        description: "string",
        title: "string", streamer_id: "string", status: "string", current_chunk_uri: "string",
        chunk_sequence: "number", is_audio_only: "boolean", started_at: "string", ended_at: "string",
    },
    Team: {
        team_name: "string", description: "string", owner_id: "string",
        members: "array", focus: "string",
    },
    PlannerEvent: {
        title: "string", description: "string", event_date: "date", event_time: "string",
        event_type: "string", location: "string", status: "string",
    },
    Scratchboard: {
        title: "string", content: "string", tags: "array", color: "string",
    },
    Badge: {
        name: "string", description: "string", icon_uri: "string",
        category: "string", threshold: "number",
    },
    UserBadge: {
        description: "string",
        user_id: "string", badge_id: "string", awarded_reason: "string",
    },
    WiseCoinTransaction: {
        description: "string",
        user_id: "string", amount: "number", reason: "string",
        category: "string", balance_after: "number",
    },
    Invitation: {
        description: "string",
        invitee_email: "string", reward_amount: "number", status: "string",
        reward_issued: "boolean",
    },
    AdminAccessRequest: {
        requester_email: "string", requester_name: "string",
        reason: "string", status: "string",
    },
    User: {
        role: "string", status: "string",
    },
};

export const READONLY_ENTITIES = ["User"];

export function getAllFields(schema) {
    return ["id", "created_date", "updated_date", "created_by_id", ...Object.keys(schema)];
}

export function getColumnDefs(schema) {
    return getAllFields(schema).map(f => ({
        name: f,
        type: BUILTIN_FIELD_TYPES[f] || PG_TYPE_MAP[schema[f]] || "TEXT",
    }));
}

export function serializeForPg(record, schema) {
    const row = {
        id: record.id,
        created_date: record.created_date || null,
        updated_date: record.updated_date || null,
        created_by_id: record.created_by_id || null,
    };
    for (const [field, type] of Object.entries(schema)) {
        const val = record[field];
        if (val === undefined || val === null) {
            row[field] = null;
        } else if (type === "array" || type === "object") {
            row[field] = JSON.stringify(val);
        } else {
            row[field] = val;
        }
    }
    return row;
}

export function deserializeFromPg(row, schema) {
    const record = { id: row.id };
    if (row.created_date) record.created_date = row.created_date;
    if (row.updated_date) record.updated_date = row.updated_date;
    if (row.created_by_id) record.created_by_id = row.created_by_id;
    for (const [field, type] of Object.entries(schema)) {
        const val = row[field];
        if (val === null || val === undefined) continue;
        if (type === "array" || type === "object") {
            try {
                record[field] = typeof val === "string" ? JSON.parse(val) : val;
            } catch {
                record[field] = val;
            }
        } else {
            record[field] = val;
        }
    }
    return record;
}

// Shared sync logic used by both the admin-triggered and scheduled sync functions.
// Takes a base44 client (from createClientFromRequest) and the proxy credentials.
export async function runPgSync(base44, proxyUrl, proxyKey) {
    const results = {};

    for (const [entityName, schema] of Object.entries(ENTITY_SCHEMAS)) {
        try {
            let allRecords = [];
            if (entityName === 'User') {
                allRecords = await base44.asServiceRole.entities.User.list();
            } else {
                let cursor = undefined;
                do {
                    const page = await base44.asServiceRole.entities[entityName].filter(
                        {},
                        { sort: '-created_date', limit: 500, cursor }
                    );
                    allRecords = allRecords.concat(page.items || []);
                    cursor = page.has_more ? page.next_cursor : undefined;
                } while (cursor);
            }

            const columns = getColumnDefs(schema);
            const serialized = allRecords.map(r => serializeForPg(r, schema));

            for (let i = 0; i < serialized.length; i += 200) {
                const batch = serialized.slice(i, i + 200);
                const resp = await fetch(`${proxyUrl}/upsert`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${proxyKey}`,
                    },
                    body: JSON.stringify({ table: entityName, columns, records: batch }),
                    signal: AbortSignal.timeout(30000),
                });
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({ error: resp.statusText }));
                    throw new Error(err.error || `Proxy returned ${resp.status}`);
                }
            }

            results[entityName] = { synced: allRecords.length };
        } catch (e) {
            results[entityName] = { error: e.message };
        }
    }

    const totalSynced = Object.values(results).reduce((sum, r) => sum + (r.synced || 0), 0);
    const errors = Object.entries(results).filter(([, r]) => r.error).map(([name]) => name);

    return {
        status: 'complete',
        totalRecords: totalSynced,
        entities: Object.keys(ENTITY_SCHEMAS).length,
        errors: errors.length ? errors : undefined,
        results,
    };
}