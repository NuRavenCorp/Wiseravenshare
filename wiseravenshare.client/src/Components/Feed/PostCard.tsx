// src/components/feed/PostCard.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { MediaViewer } from '../ui/MediaViewer';
import { useAuth } from '../../hooks/useAuth';
import { postService } from '../../services/postService';
import {
    FiHeart,
    FiMessageCircle,
    FiRepeat,
    FiShare2,
    FiBookmark,
    FiMoreHorizontal,
    FiChevronDown,
    FiChevronUp
} from 'react-icons/fi';

interface PostCardProps {
    post: any;
    onLike?: () => void;
    onRepost?: () => void;
    onComment?: () => void;
    onBookmark?: () => void;
    showActions?: boolean;
    isDetail?: boolean;
}

export const PostCard: React.FC<PostCardProps> = ({
    post,
    onLike,
    onRepost,
    onComment,
    onBookmark,
    showActions = true,
    isDetail = false,
}) => {
    const { user } = useAuth();
    const [isLiked, setIsLiked] = useState(post.isLiked || false);
    const [likeCount, setLikeCount] = useState(post.likesCount || 0);
    const [isReposted, setIsReposted] = useState(post.isReposted || false);
    const [repostCount, setRepostCount] = useState(post.repostsCount || 0);
    const [isBookmarked, setIsBookmarked] = useState(post.isBookmarked || false);
    const [showComments, setShowComments] = useState(false);
    const [showMore, setShowMore] = useState(false);

    const handleLike = async () => {
        try {
            if (isLiked) {
                await postService.unlikePost(post.id);
                setLikeCount(prev => prev - 1);
            } else {
                await postService.likePost(post.id);
                setLikeCount(prev => prev + 1);
            }
            setIsLiked(!isLiked);
            onLike?.();
        } catch (error) {
            console.error('Failed to toggle like:', error);
        }
    };

    const handleRepost = async () => {
        try {
            if (isReposted) {
                await postService.unrepostPost(post.id);
                setRepostCount(prev => prev - 1);
            } else {
                await postService.repostPost(post.id);
                setRepostCount(prev => prev + 1);
            }
            setIsReposted(!isReposted);
            onRepost?.();
        } catch (error) {
            console.error('Failed to toggle repost:', error);
        }
    };

    const handleBookmark = async () => {
        try {
            if (isBookmarked) {
                await postService.unbookmarkPost(post.id);
            } else {
                await postService.bookmarkPost(post.id);
            }
            setIsBookmarked(!isBookmarked);
            onBookmark?.();
        } catch (error) {
            console.error('Failed to toggle bookmark:', error);
        }
    };

    const shouldShowMore = post.content?.length > 280;

    return (
        <motion.div
            className="rounded-xl border border-border bg-card p-4 hover:border-primary/20 transition"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            {/* Header */}
            <div className="flex items-start gap-3">
                <Link to={`/profile/${post.user.id}`}>
                    <Avatar
                        src={post.user.avatarUrl}
                        alt={post.user.displayName}
                        size="md"
                    />
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <Link
                            to={`/profile/${post.user.id}`}
                            className="font-medium hover:underline"
                        >
                            {post.user.displayName}
                        </Link>
                        <span className="text-gray-400">@{post.user.username}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-400 text-sm">
                            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                        </span>
                        {post.truthScore && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${post.truthScore > 70 ? 'bg-green-500/20 text-green-400' :
                                    post.truthScore > 40 ? 'bg-yellow-500/20 text-yellow-400' :
                                        'bg-red-500/20 text-red-400'
                                }`}>
                                Truth {post.truthScore}%
                            </span>
                        )}
                    </div>

                    {/* Content */}
                    <div className="mt-2 text-white whitespace-pre-wrap">
                        {shouldShowMore ? (
                            <>
                                {showMore ? post.content : post.content.slice(0, 280)}
                                <button
                                    onClick={() => setShowMore(!showMore)}
                                    className="text-primary hover:underline ml-1"
                                >
                                    {showMore ? 'Show less' : 'Show more'}
                                </button>
                            </>
                        ) : (
                            post.content
                        )}
                    </div>

                    {/* Media */}
                    {post.mediaUrls && post.mediaUrls.length > 0 && (
                        <div className="mt-3 rounded-lg overflow-hidden">
                            <MediaViewer media={post.mediaUrls} />
                        </div>
                    )}

                    {/* Truth Correction */}
                    {post.truthCorrection && (
                        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                            <p className="text-sm text-yellow-400">
                                <span className="font-medium">⚠️ Correction:</span> {post.truthCorrection}
                            </p>
                        </div>
                    )}

                    {/* Stats */}
                    <div className="mt-3 flex items-center gap-4 text-gray-400 text-sm">
                        <button
                            onClick={handleLike}
                            className="flex items-center gap-1 hover:text-white transition"
                        >
                            <FiHeart className={isLiked ? 'fill-red-500 text-red-500' : ''} />
                            <span className={isLiked ? 'text-red-500' : ''}>{likeCount}</span>
                        </button>
                        <button
                            onClick={() => setShowComments(!showComments)}
                            className="flex items-center gap-1 hover:text-white transition"
                        >
                            <FiMessageCircle />
                            <span>{post.commentsCount || 0}</span>
                        </button>
                        <button
                            onClick={handleRepost}
                            className="flex items-center gap-1 hover:text-white transition"
                        >
                            <FiRepeat className={isReposted ? 'text-green-500' : ''} />
                            <span className={isReposted ? 'text-green-500' : ''}>{repostCount}</span>
                        </button>
                        <button
                            onClick={handleBookmark}
                            className="hover:text-white transition"
                        >
                            <FiBookmark className={isBookmarked ? 'fill-primary text-primary' : ''} />
                        </button>
                        <button className="hover:text-white transition ml-auto">
                            <FiShare2 />
                        </button>
                    </div>

                    {/* Comments */}
                    {showComments && (
                        <div className="mt-4 pt-4 border-t border-border">
                            <CommentsSection postId={post.id} />
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};