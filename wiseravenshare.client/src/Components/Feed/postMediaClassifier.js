export const classifyPostMedia = (post = {}, resolvedMedia = '') => {
    const source = String(resolvedMedia || '').trim();
    if (!source) {
        return { isVideoPost: false, isImagePost: false, isAudioPost: false };
    }

    const isVideoPost = post.type === 'Video'
        || post.mediaType === 'video'
        || /\.(mp4|webm|mov|avi|mkv)$/i.test(source)
        || source.startsWith('data:video/')
        || source.includes('videostreaming');

    const isImagePost = post.type === 'Image'
        || post.mediaType === 'photo'
        || post.mediaType === 'image'
        || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(source)
        || source.startsWith('data:image/');

    const isAudioPost = post.type === 'Audio'
        || post.mediaType === 'audio'
        || post.mediaType === 'music'
        || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(source)
        || source.startsWith('data:audio/');

    return { isVideoPost, isImagePost, isAudioPost };
};