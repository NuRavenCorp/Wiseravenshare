import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiClock, FiRefreshCw, FiVideo } from 'react-icons/fi';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { VideoItem, videoService } from '../../services/videoService';

export const VideoLibrary: React.FC = () => {
    const [videos, setVideos] = useState<VideoItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadLibrary = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const result = await videoService.getMyLibraryVideos();
            setVideos(result);
        } catch (err: any) {
            const message = err?.message || 'Failed to load My Library.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadLibrary();
    }, [loadLibrary]);

    useEffect(() => {
        const handler = () => {
            void loadLibrary();
            toast.success('My Library updated');
        };

        window.addEventListener('ravensight:video-saved', handler);
        return () => window.removeEventListener('ravensight:video-saved', handler);
    }, [loadLibrary]);

    const sortedVideos = useMemo(() => {
        return [...videos].sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });
    }, [videos]);

    if (isLoading) {
        return (
            <Card className="p-6">
                <p className="text-gray-400">Loading your library...</p>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-red-400">{error}</p>
                <Button onClick={() => void loadLibrary()} variant="ghost">
                    <FiRefreshCw className="mr-2" />
                    Retry
                </Button>
            </Card>
        );
    }

    if (sortedVideos.length === 0) {
        return (
            <Card className="p-8 text-center">
                <FiVideo className="mx-auto mb-3 text-gray-500" size={28} />
                <h3 className="text-lg font-semibold">My Library is empty</h3>
                <p className="text-gray-400 mt-1">
                    Record in Studio and your saved videos will appear here.
                </p>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedVideos.map((video) => (
                <Card key={video.id} className="p-4">
                    <div className="aspect-video rounded-lg overflow-hidden bg-black/60 mb-3">
                        <video
                            src={video.videoUrl}
                            controls
                            preload="metadata"
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <h4 className="font-semibold line-clamp-1">{video.title || 'Untitled Recording'}</h4>
                    <p className="text-sm text-gray-400 line-clamp-2 mt-1">{video.description || 'No description'}</p>
                    <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                        <span className="uppercase">{video.privacy || 'Unlisted'}</span>
                        <span className="flex items-center gap-1">
                            <FiClock />
                            {video.createdAt ? new Date(video.createdAt).toLocaleString() : 'Unknown time'}
                        </span>
                    </div>
                </Card>
            ))}
        </div>
    );
};
