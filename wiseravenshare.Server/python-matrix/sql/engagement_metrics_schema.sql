CREATE TABLE IF NOT EXISTS user_metrics (
    user_id BIGINT PRIMARY KEY,
    total_posts INT DEFAULT 0,
    total_reposts INT DEFAULT 0,
    total_comments INT DEFAULT 0,
    total_likes INT DEFAULT 0,
    total_dislikes INT DEFAULT 0,
    engagement_score FLOAT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hashtag_trends (
    hashtag VARCHAR(100),
    window_start TIMESTAMPTZ,
    post_count INT DEFAULT 0,
    unique_users INT DEFAULT 0,
    velocity FLOAT DEFAULT 0,
    trending_score FLOAT DEFAULT 0,
    PRIMARY KEY (hashtag, window_start)
);

CREATE TABLE IF NOT EXISTS partial_engagement (
    partial_pattern VARCHAR(100),
    user_id BIGINT,
    interaction_count INT DEFAULT 0,
    last_used TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (partial_pattern, user_id)
);
