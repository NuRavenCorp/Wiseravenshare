import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';

export const usePosts = (initialFilters = {}) => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState(initialFilters);
    const { user } = useAuth();
    const { addToast } = useNotification();

    const loadPosts = useCallback(async (reset = false) => {
        setLoading(true);
        setError(null);

        try {
            const currentPage = reset ? 1 : page;
            const response = await apiService.getPosts({
                page: currentPage,
                ...filters
            });

            if (reset) {
                setPosts(response.data);
                setPage(2);
            } else {
                setPosts(prev => [...prev, ...response.data]);
                setPage(prev => prev + 1);
            }

            setHasMore(response.hasMore);
        } catch (err) {
            setError(err.message);
            addToast('Failed to load posts', 'error');
        } finally {
            setLoading(false);
        }
    }, [page, filters, addToast]);

    const createPost = useCallback(async (postData) => {
        setLoading(true);
        try {
            const newPost = await apiService.createPost(postData);
            setPosts(prev => [newPost, ...prev]);
            addToast('Post created successfully!', 'success');
            return newPost;
        } catch (err) {
            setError(err.message);
            addToast('Failed to create post', 'error');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    const likePost = useCallback(async (postId) => {
        try {
            const updated = await apiService.likePost(postId);
            setPosts(prev => prev.map(post =>
                post.id === postId
                    ? { ...post, likes: updated.likes, isLiked: updated.isLiked }
                    : post
            ));
        } catch (err) {
            addToast('Failed to like post', 'error');
        }
    }, [addToast]);

    const repostPost = useCallback(async (postId) => {
        try {
            const updated = await apiService.repostPost(postId);
            setPosts(prev => prev.map(post =>
                post.id === postId
                    ? { ...post, reposts: updated.reposts }
                    : post
            ));
            addToast('Reposted successfully!', 'success');
        } catch (err) {
            addToast('Failed to repost', 'error');
        }
    }, [addToast]);

    const deletePost = useCallback(async (postId) => {
        try {
            await apiService.deletePost(postId);
            setPosts(prev => prev.filter(post => post.id !== postId));
            addToast('Post deleted', 'info');
        } catch (err) {
            addToast('Failed to delete post', 'error');
        }
    }, [addToast]);

    const updateFilters = useCallback((newFilters) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
        setPage(1);
        loadPosts(true);
    }, [loadPosts]);

    useEffect(() => {
        loadPosts(true);
    }, [filters]);

    return {
        posts,
        loading,
        error,
        hasMore,
        createPost,
        likePost,
        repostPost,
        deletePost,
        updateFilters,
        loadMore: () => loadPosts(false)
    };
};