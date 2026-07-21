// src/pages/FeedPage.tsx
import React, { useState, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { MainLayout } from '../components/layout/MainLayout';
import { PostCreator } from '../components/feed/PostCreator';
import { PostCard } from '../components/feed/PostCard';
import { FeedFilters } from '../components/feed/FeedFilters';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../hooks/useAuth';
import { postService } from '../services/postService';

const FeedPage: React.FC = () => {
    const { user } = useAuth();
    const [filter, setFilter] = useState<'all' | 'following' | 'trending'>('following');
    const { ref, inView } = useInView();

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        error,
    } = useInfiniteQuery({
        queryKey: ['feed', filter],
        queryFn: ({ pageParam = 1 }) =>
            postService.getFeed({
                filter,
                page: pageParam,
                limit: 20
            }),
        getNextPageParam: (lastPage) =>
            lastPage.hasMore ? lastPage.page + 1 : undefined,
        staleTime: 1000 * 60 * 5,
    });

    useEffect(() => {
        if (inView && hasNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, fetchNextPage]);

    if (isLoading) {
        return (
            <MainLayout>
                <div className="flex justify-center py-12">
                    <LoadingSpinner size="lg" />
                </div>
            </MainLayout>
        );
    }

    if (error) {
        return (
            <MainLayout>
                <EmptyState
                    icon="⚠️"
                    title="Failed to load feed"
                    description="Please try refreshing the page"
                />
            </MainLayout>
        );
    }

    const posts = data?.pages.flatMap(page => page.data) || [];

    return (
        <MainLayout>
            <div className="max-w-2xl mx-auto space-y-6">
                <PostCreator onPostCreated={() => { }} />

                <FeedFilters
                    activeFilter={filter}
                    onFilterChange={setFilter}
                />

                {posts.length === 0 ? (
                    <EmptyState
                        icon="📭"
                        title="No posts yet"
                        description="Follow more users or create your first post!"
                    />
                ) : (
                    <>
                        {posts.map((post) => (
                            <PostCard
                                key={post.id}
                                post={post}
                                onLike={() => { }}
                                onRepost={() => { }}
                                onComment={() => { }}
                            />
                        ))}

                        <div ref={ref} className="py-4">
                            {isFetchingNextPage && (
                                <div className="flex justify-center">
                                    <LoadingSpinner size="sm" />
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </MainLayout>
    );
};

export default FeedPage;