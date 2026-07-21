import React, { useMemo, useState } from 'react';
import PostCard from '../Components/Feed/PostCard.jsx';
import { useAuth } from '../Contexts/AuthContext';

const BookmarksPage = () => {
    const { user } = useAuth();
    const [bookmarks, setBookmarks] = useState(() => JSON.parse(localStorage.getItem('wiseBookmarks') || '[]'));

    const sortedBookmarks = useMemo(
        () => [...bookmarks].sort((a, b) => Number(b.id) - Number(a.id)),
        [bookmarks]
    );

    const removeBookmark = (post) => {
        const next = bookmarks.filter((bookmark) => bookmark.id !== post.id);
        setBookmarks(next);
        localStorage.setItem('wiseBookmarks', JSON.stringify(next));
    };

    return (
        <div>
            <div
                style={{
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '20px',
                    border: '1px solid var(--border-color)'
                }}
            >
                <h2>
                    <i className="fas fa-bookmark"></i> Bookmarks
                </h2>
                <p style={{ color: 'var(--highlight-color)', marginTop: '5px' }}>Posts you saved for later.</p>
            </div>

            {sortedBookmarks.length > 0 ? (
                sortedBookmarks.map((post) => (
                    <PostCard
                        key={post.id}
                        post={post}
                        currentUser={user}
                        onBookmark={removeBookmark}
                        bookmarkLabel="Remove Bookmark"
                    />
                ))
            ) : (
                <div
                    style={{
                        textAlign: 'center',
                        padding: '50px',
                        color: 'var(--highlight-color)'
                    }}
                >
                    <i className="fas fa-bookmark" style={{ fontSize: '50px', marginBottom: '15px' }}></i>
                    <p>No bookmarks yet. Save posts from Feed to see them here.</p>
                </div>
            )}
        </div>
    );
};

export default BookmarksPage;
