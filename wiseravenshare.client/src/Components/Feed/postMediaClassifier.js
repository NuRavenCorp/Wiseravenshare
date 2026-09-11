export const classifyPostMedia = (post = {}, resolvedMedia = '') => {
    const source = String(resolvedMedia || '').trim();
    if (!source) {
        return { isVideoPost: false, isImagePost: false, isAudioPost: false };
    }

    // Extract ?fileName= query param (used by the stream endpoint).
    let mediaFileName = '';
    try {
        const parsed = new URL(source, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
        mediaFileName = String(parsed.searchParams.get('fileName') || '').toLowerCase();
    } catch {
        mediaFileName = '';
    }

    // Also check the last path segment for blob URLs like /videostreaming/blob/…/photo.jpg
    const pathSegment = source.split('?')[0].split('/').pop().toLowerCase();

    const fileNameSuggestsVideo = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(mediaFileName) || /\.(mp4|webm|mov|avi|mkv)$/.test(pathSegment);
    const fileNameSuggestsImage = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(mediaFileName) || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(pathSegment);
    const fileNameSuggestsAudio = /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(mediaFileName) || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(pathSegment);

    // Image/audio signals take priority — check them first so a photo streamed
    // through /videostreaming/blob/… is never misclassified as video.
    const isImagePost = post.type === 'Image'
        || post.mediaType === 'photo'
        || post.mediaType === 'image'
        || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(source)
        || source.startsWith('data:image/')
        || fileNameSuggestsImage;

    const isAudioPost = !isImagePost && (
        post.type === 'Audio'
        || post.mediaType === 'audio'
        || post.mediaType === 'music'
        || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(source)
        || source.startsWith('data:audio/')
        || fileNameSuggestsAudio
    );

    const isVideoPost = !isImagePost && !isAudioPost && (
        post.type === 'Video'
        || post.mediaType === 'video'
        || /\.(mp4|webm|mov|avi|mkv)$/i.test(source)
        || source.startsWith('data:video/')
        || fileNameSuggestsVideo
    );

    return { isVideoPost, isImagePost, isAudioPost };
};