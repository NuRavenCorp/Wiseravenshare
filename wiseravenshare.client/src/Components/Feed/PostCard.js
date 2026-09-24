import React, { useState } from 'react';
import { truthEngine } from '../../Services/TruthDetectionEngine';

const PostCard = ({ post, onLike, onRepost, onDispute, currentUser, isFollowing, onFollow }) => {
    const [showCorrection, setShowCorrection] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [comments, setComments] = useState(post.comments || []);

    const truthBadge = truthEngine.getTruthBadge(post.truthScore || truthEngine.getTruthScore(post.content));

    const handleDispute = async () => {
        const reason = prompt('Why are you disputing this post?');
        if (reason) {
            const result = await truthEngine.disputePost(post.id, post.content, reason);
            if (result.corrections) {
                setShowCorrection(true);
                setTimeout(() => setShowCorrection(false), 8000);
            }
        }
    };

    const handleAddComment = () => {
        if (commentText.trim()) {
            const newComment = {
                id: Date.now(),
                user: currentUser,
                content: commentText,
                createdAt: new Date()
            };
            setComments([...comments, newComment]);
            setCommentText('');
        }
    };

    return (
        <div style={{
            background: 'var(--card-bg)