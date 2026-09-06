export const classifyPostMedia = (post = {}, resolvedMedia = '') => {
    const source = String(resolvedMedia || '').trim();
    if (!source) {
        return { isVideoPost: false, isImagePost: false, isAudioPost: false };
    }

    let mediaFileName = '';
    try {
        const parsed = new URL(source, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
        mediaFileName = String(parsed.searchParams.get('fileName') || '').toLowerCase();
    } catch {
        mediaFileName = '';
    }

    const fileNameSuggestsVideo = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(mediaFileName);
    const fileNameSuggestsImage = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(mediaFileName);
    const fileNameSuggestsAudio = /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(mediaFileName);

    const isVideoPost = post.type === 'Video'
        || post.mediaType === 'video'
        || /\.(mp4|webm|mov|avi|mkv)$/i.test(source)
        || source.startsWith('data:video/')
        || fileNameSuggestsVideo;

    const isImagePost = post.type === 'Image'
        || post.mediaType === 'photo'
        || post.mediaType === 'image'
        || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(source)
        || source.startsWith('data:image/')
        || fileNameSuggestsImage;

    const isAudioPost = post.type === 'Audio'
        || post.mediaType === 'audio'
        || post.mediaType === 'music'
        || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(source)
        || source.startsWith('data:audio/')
        || fileNameSuggestsAudio;

    return { isVideoPost, isImagePost, isAudioPost };
};