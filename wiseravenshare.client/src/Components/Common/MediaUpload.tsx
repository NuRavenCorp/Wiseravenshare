import React, { useState } from 'react';
import axios from 'axios';

const MediaUploader: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [publishToYouTube, setPublishToYouTube] = useState(false);
    const [publishToTikTok, setPublishToTikTok] = useState(false);
    const [publishToFacebook, setPublishToFacebook] = useState(false);
    const [youTubeChannelOrEmail, setYouTubeChannelOrEmail] = useState('');
    const [tikTokUsername, setTikTokUsername] = useState('');
    const [facebookPageOrProfile, setFacebookPageOrProfile] = useState('');
    const [youTubePermissionGranted, setYouTubePermissionGranted] = useState(false);
    const [tikTokPermissionGranted, setTikTokPermissionGranted] = useState(false);
    const [facebookPermissionGranted, setFacebookPermissionGranted] = useState(false);
    const canPublishVideo = Boolean(file?.type.startsWith('video/'));

    const handleUpload = async () => {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('publishToYouTube', String(publishToYouTube));
        formData.append('publishToTikTok', String(publishToTikTok));
        formData.append('publishToFacebook', String(publishToFacebook));
        formData.append('youTubeChannelOrEmail', youTubeChannelOrEmail);
        formData.append('tikTokUsername', tikTokUsername);
        formData.append('facebookPageOrProfile', facebookPageOrProfile);
        formData.append('youTubePermissionGranted', String(youTubePermissionGranted));
        formData.append('tikTokPermissionGranted', String(tikTokPermissionGranted));
        formData.append('facebookPermissionGranted', String(facebookPermissionGranted));
        formData.append('title', file.name);

        try {
            const response = await axios.post('/api/media/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / (progressEvent.total || 1)
                    );
                    setUploadProgress(percentCompleted);
                }
            });

            console.log('Upload successful:', response.data);
        } catch (error) {
            console.error('Upload failed:', error);
        }
    };

    return (
        <div className="upload-container">
            <input
                type="file"
                accept="video/*,image/*,audio/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
            />

            <label>
                <input
                    type="checkbox"
                    checked={publishToYouTube}
                    disabled={!canPublishVideo}
                    onChange={(e) => setPublishToYouTube(e.target.checked)}
                />
                Publish to YouTube (Ravensight)
            </label>

            <label>
                <input
                    type="checkbox"
                    checked={publishToTikTok}
                    disabled={!canPublishVideo}
                    onChange={(e) => setPublishToTikTok(e.target.checked)}
                />
                Publish to TikTok (Ravensight)
            </label>

            <label>
                <input
                    type="checkbox"
                    checked={publishToFacebook}
                    disabled={!canPublishVideo}
                    onChange={(e) => setPublishToFacebook(e.target.checked)}
                />
                Publish to Facebook (Ravensight)
            </label>

            {publishToYouTube && canPublishVideo && (
                <>
                    <input
                        type="text"
                        value={youTubeChannelOrEmail}
                        placeholder="YouTube channel or account email"
                        onChange={(e) => setYouTubeChannelOrEmail(e.target.value)}
                    />
                    <label>
                        <input
                            type="checkbox"
                            checked={youTubePermissionGranted}
                            onChange={(e) => setYouTubePermissionGranted(e.target.checked)}
                        />
                        I authorize Ravensight to upload this video to my YouTube account.
                    </label>
                </>
            )}

            {publishToTikTok && canPublishVideo && (
                <>
                    <input
                        type="text"
                        value={tikTokUsername}
                        placeholder="TikTok username (without @)"
                        onChange={(e) => setTikTokUsername(e.target.value)}
                    />
                    <label>
                        <input
                            type="checkbox"
                            checked={tikTokPermissionGranted}
                            onChange={(e) => setTikTokPermissionGranted(e.target.checked)}
                        />
                        I authorize Ravensight to upload this video to my TikTok account.
                    </label>
                </>
            )}

            {publishToFacebook && canPublishVideo && (
                <>
                    <input
                        type="text"
                        value={facebookPageOrProfile}
                        placeholder="Facebook page/profile"
                        onChange={(e) => setFacebookPageOrProfile(e.target.value)}
                    />
                    <label>
                        <input
                            type="checkbox"
                            checked={facebookPermissionGranted}
                            onChange={(e) => setFacebookPermissionGranted(e.target.checked)}
                        />
                        I authorize Ravensight to upload this video to my Facebook account.
                    </label>
                </>
            )}

            <button onClick={handleUpload}>Upload</button>

            {uploadProgress > 0 && (
                <progress value={uploadProgress} max="100" />
            )}
        </div>
    );
};

export default MediaUploader;