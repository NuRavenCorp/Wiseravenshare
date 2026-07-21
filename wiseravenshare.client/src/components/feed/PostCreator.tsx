// src/components/feed/PostCreator.tsx
import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { MediaUploader } from '../ui/MediaUploader';
import { useAuth } from '../../hooks/useAuth';
import { postService } from '../../services/postService';
import { truthService } from '../../services/truthService';
import {
    FiImage,
    FiVideo,
    FiMic,
    FiFile,
    FiX,
    FiAlertCircle
} from 'react-icons/fi';

interface PostCreatorProps {
    onPostCreated?: () => void;
    replyTo?: string | null;
}

export const PostCreator: React.FC<PostCreatorProps> = ({
    onPostCreated,
    replyTo = null
}) => {
    const { user } = useAuth();
    const [content, setContent] = useState('');
    const [media, setMedia] = useState<File[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isTruthChecking, setIsTruthChecking] = useState(false);
    const [truthResult, setTruthResult] = useState<any>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const queryClient = useQueryClient();

    const createPostMutation = useMutation({
        mutationFn: postService.createPost,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            setContent('');
            setMedia([]);
            setTruthResult(null);
            setIsExpanded(false);
            toast.success('Post created successfully!');
            onPostCreated?.();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to create post');
        }
    });

    const handleContentChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value;
        setContent(newContent);

        // Auto-expand when typing
        if (newContent.length > 0 && !isExpanded) {
            setIsExpanded(true);
        }

        // Real-time truth checking
        if (newContent.length > 20) {
            setIsTruthChecking(true);
            try {
                const result = await truthService.analyzeContent(newContent);
                setTruthResult(result);
            } catch (error) {
                console.error('Truth check failed:', error);
            } finally {
                setIsTruthChecking(false);
            }
        } else {
            setTruthResult(null);
        }
    };

    const handleMediaSelect = (files: File[]) => {
        setMedia(prev => [...prev, ...files]);
    };

    const handleRemoveMedia = (index: number) => {
        setMedia(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!content.trim() && media.length === 0) {
            toast.error('Please add some content or media');
            return;
        }

        const formData = new FormData();
        formData.append('content', content);
        formData.append('replyTo', replyTo || '');

        media.forEach(file => {
            formData.append('media', file);
        });

        createPostMutation.mutate(formData);
    };

    return (
        <motion.div
            className="rounded-xl border border-border bg-card p-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="flex gap-3">
                <Avatar
                    src={user?.avatarUrl}
                    alt={user?.displayName || 'User'}
                    size="md"
                />
                <div className="flex-1 space-y-3">
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={handleContentChange}
                        placeholder={replyTo ? "Write a reply..." : "What's on your mind?"}
                        className="w-full bg-transparent resize-none border-0 focus:ring-0 text-white placeholder-gray-400 text-lg"
                        rows={isExpanded ? 4 : 2}
                        onFocus={() => setIsExpanded(true)}
                    />

                    {/* Truth Check Result */}
                    {truthResult && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`flex items-start gap-2 p-3 rounded-lg ${truthResult.truthScore > 70
                                    ? 'bg-green-500/10 text-green-400'
                                    : truthResult.truthScore > 40
                                        ? 'bg-yellow-500/10 text-yellow-400'
                                        : 'bg-red-500/10 text-red-400'
                                }`}
                        >
                            <FiAlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm">
                                    Truth Score: {truthResult.truthScore}%
                                </p>
                                {truthResult.correction && (
                                    <p className="text-xs opacity-80 mt-1">
                                        {truthResult.correction}
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* Media Preview */}
                    {media.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {media.map((file, index) => (
                                <div key={index} className="relative group">
                                    {file.type.startsWith('image/') ? (
                                        <img
                                            src={URL.createObjectURL(file)}
                                            alt={`Upload ${index + 1}`}
                                            className="h-20 w-20 object-cover rounded-lg"
                                        />
                                    ) : file.type.startsWith('video/') ? (
                                        <video
                                            src={URL.createObjectURL(file)}
                                            className="h-20 w-20 object-cover rounded-lg"
                                        />
                                    ) : (
                                        <div className="h-20 w-20 flex items-center justify-center bg-white/5 rounded-lg">
                                            <FiFile className="w-8 h-8 text-gray-400" />
                                        </div>
                                    )}
                                    <button
                                        onClick={() => handleRemoveMedia(index)}
                                        className="absolute -top-1 -right-1 p-1 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition"
                                    >
                                        <FiX className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Actions */}
                    {isExpanded && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center justify-between pt-3 border-t border-border"
                        >
                            <div className="flex gap-1">
                                <MediaUploader
                                    accept="image/*"
                                    onSelect={handleMediaSelect}
                                >
                                    <button className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition">
                                        <FiImage className="w-5 h-5" />
                                    </button>
                                </MediaUploader>
                                <MediaUploader
                                    accept="video/*"
                                    onSelect={handleMediaSelect}
                                >
                                    <button className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition">
                                        <FiVideo className="w-5 h-5" />
                                    </button>
                                </MediaUploader>
                                <MediaUploader
                                    accept="audio/*"
                                    onSelect={handleMediaSelect}
                                >
                                    <button className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition">
                                        <FiMic className="w-5 h-5" />
                                    </button>
                                </MediaUploader>
                            </div>

                            <div className="flex items-center gap-3">
                                {isTruthChecking && (
                                    <span className="text-xs text-gray-400">
                                        Verifying truth...
                                    </span>
                                )}
                                <Button
                                    onClick={handleSubmit}
                                    disabled={createPostMutation.isPending}
                                    className="px-6"
                                >
                                    {createPostMutation.isPending ? 'Posting...' : 'Post'}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};