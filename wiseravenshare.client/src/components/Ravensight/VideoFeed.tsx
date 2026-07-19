import React, { useCallback, useEffect, useState } from 'react';
import { FiEye, FiHeart } from 'react-icons/fi';
import { Card } from '../ui/Card';
import { VideoItem, videoService } from '../../services/videoService';

export const VideoFeed: React.FC = () => {
    const [videos, setVideos] = useState<VideoItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadFeed = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const result = await videoService.getVideoFeed();
            setVideos(result);
        } catch (err: any) {
            setError(err?.message || 'Failed to load video feed.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadFeed();
    }, [loadFeed]);

    if (isLoading) {
        return (
            <Card className="p-6">
                <p className="text-gray-400">Loading feed...</p>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-6">
                <p className="text-red-400">{error}</p>
            </Card>
        );
    }

    if (videos.length === 0) {
        return (
            <Card className="p-6">
                <p className="text-gray-400">No videos in feed yet.</p>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {videos.map((video) => (
                <Card key={video.id} className="p-4">
                    <div className="aspect-video rounded-lg overflow-hidden bg-black/60 mb-3">
                        <video
                            src={video.videoUrl}
                            controls
                            preload="metadata"
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <h3 className="font-semibold">{video.title || 'Untitled Recording'}</h3>
                    <p className="text-sm text-gray-400 mt-1">{video.description || 'No description'}</p>
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><FiEye />{video.viewsCount ?? 0} views</span>
                        <span className="flex items-center gap-1"><FiHeart />{video.likesCount ?? 0} likes</span>
                    </div>
                </Card>
            ))}
        </div>
    );
};
