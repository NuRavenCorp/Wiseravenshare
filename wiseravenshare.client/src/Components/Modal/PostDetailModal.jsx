import React, { useState } from 'react';
import PostCard from '../feed/PostCard';
import { apiService } from '../../services/api';
import { useAuth } from '../../Contexts/AuthContext';

const PostDetailModal = ({ isOpen, onClose, post }) => {
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);
    const { user } = useAuth();

    React.useEffect(() => {
        if (isOpen && post) {
            loadComments();
        }
    }, [isOpen, post]);

    const loadComments = async () => {
        setLoading(true);
        try {
            const response = await apiService.getComments(post.id);
            setComments(response.data);
        } catch (error) {
            console.error('Failed to load comments:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;

        try {
            const response = await apiService.addComment(post.id, newComment);
            setComments(prev => [response.data, ...prev]);
            setNewComment('');
        } catch (error) {
            console.error('Failed to add comment:', error);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px'
        }} onClick={onClose}>
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                width: '90%',
                maxWidth: '800px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h3>Post Details</h3>
                    <button onClick={onClose} style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-color)',
                        cursor: 'pointer',
                        fontSize: '20px'
                    }}>×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    <PostCard post={post} currentUser={user} />

                    <div style={{ marginTop: '20px' }}>
                        <h4 style={{ marginBottom: '15px' }}>
                            Comments ({comments.length})
                        </h4>

                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                            <input
                                type="text"
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Write a comment..."
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '20px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    color: 'var(--text-color)'
                                }}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') handleAddComment();
                                }}
                            />
                            <button
                                onClick={handleAddComment}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '20px',
                                    background: 'var(--highlight-color)',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                Post
                            </button>
                        </div>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '20px' }}>
                                <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                            </div>
                        ) : (
                            comments.map(comment => (
                                <div
                                    key={comment.id}
                                    style={{
                                        padding: '12px',
                                        marginBottom: '10px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '8px'
                                    }}
                                >
                                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                                        {comment.user.name}
                                    </div>
                                    <div>{comment.content}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--highlight-color)', marginTop: '5px' }}>
                                        {new Date(comment.createdAt).toLocaleString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PostDetailModal;