// wiseravenshare.client/src/Components/MediaLibrary/MediaUpload.jsx
import React, { useEffect, useState } from 'react';
import { useSavedMedia } from '../../hooks/useSavedMedia';
import { apiService } from '../../Services/api';
import './MediaUpload.css';

/**
 * Media upload component for adding new items to the library
 */
const MediaUpload = ({ onMediaUploaded }) => {
  const { saveMedia, loading, error } = useSavedMedia();
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    mediaType: 'Photo',
    mediaUrl: '',
    tags: '',
    isVisibleInFeed: false
  });

  const inferMediaType = (file) => {
    const mime = String(file?.type || '').toLowerCase();
    const fileName = String(file?.name || '').toLowerCase();

    if (mime.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(fileName)) return 'Video';
    if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|weba)$/i.test(fileName)) return 'Music';
    if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|svg)$/i.test(fileName)) return 'Photo';
    return 'Photo';
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file) => {
    setSelectedFile(file);
    setUploadProgress(0);
    const url = URL.createObjectURL(file);
    setPreviewUrl((previous) => {
      if (previous && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return url;
    });

    const inferredType = inferMediaType(file);
    setFormData(prev => ({
      ...prev,
      title: file.name,
      mediaType: inferredType
    }));
  };

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const manualMediaUrl = String(formData.mediaUrl || '').trim();

    if (!formData.title.trim() || (!selectedFile && !manualMediaUrl)) {
      alert('Please fill in title and provide a file or media URL');
      return;
    }

    if (!selectedFile && /^(blob:|file:)/i.test(manualMediaUrl)) {
      alert('Temporary local URLs cannot be saved. Upload the file first or use a hosted URL.');
      return;
    }

    try {
      let persistedMediaUrl = manualMediaUrl;

      if (selectedFile) {
        const mediaType = inferMediaType(selectedFile);
        const uploadType = mediaType === 'Video'
          ? 'video'
          : mediaType === 'Music' || mediaType === 'Audio' || mediaType === 'Podcast'
            ? 'audio'
            : 'photo';

        const uploadResult = await apiService.uploadMedia(selectedFile, uploadType, {
          title: formData.title,
          description: formData.description,
          onProgress: setUploadProgress
        });

        persistedMediaUrl = String(
          uploadResult?.data?.mediaUrl
          || uploadResult?.data?.filePath
          || uploadResult?.data?.url
          || ''
        ).trim();

        if (!persistedMediaUrl) {
          throw new Error('Upload completed but no media URL was returned.');
        }
      }

      await saveMedia({
        ...formData,
        mediaUrl: persistedMediaUrl,
        tags: formData.tags.split(',').filter(t => t.trim()),
        fileSizeBytes: null,
        mediaMetadata: null
      });

      // Reset form
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setFormData({
        title: '',
        description: '',
        mediaType: 'Photo',
        mediaUrl: '',
        tags: '',
        isVisibleInFeed: false
      });
      setSelectedFile(null);
      setPreviewUrl('');
      setUploadProgress(0);

      onMediaUploaded?.();
    } catch (err) {
      console.error('Error saving media:', err);
    }
  };

  return (
    <div className="media-upload">
      <div className="upload-header">
        <h3>📤 Upload Media</h3>
        <p>Add to your library</p>
      </div>

      <form onSubmit={handleSubmit} className="upload-form">
        {/* Drop Zone */}
        <div 
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input 
            type="file"
            id="file-input"
            multiple
            accept="image/*,video/*,audio/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileUpload(file);
              }
            }}
            style={{ display: 'none' }}
          />
          <label htmlFor="file-input" className="drop-label">
            <span className="icon">📁</span>
            <span className="text">
              Drag & drop your media here
              <br />
              <small>or click to browse</small>
            </span>
          </label>
        </div>

        {(previewUrl || formData.mediaUrl) && (
          <div className="preview-thumbnail">
            <img src={previewUrl || formData.mediaUrl} alt="Preview" />
          </div>
        )}

        {selectedFile && uploadProgress > 0 && uploadProgress < 100 && (
          <div className="upload-progress" role="status" aria-live="polite">
            Uploading {uploadProgress}%
          </div>
        )}

        {/* Form Fields */}
        <div className="form-group">
          <label htmlFor="title">Title *</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            placeholder="Media title"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Optional description"
            rows="3"
          />
        </div>

        <div className="form-group">
          <label htmlFor="mediaType">Media Type *</label>
          <select
            id="mediaType"
            name="mediaType"
            value={formData.mediaType}
            onChange={handleInputChange}
            required
          >
            <option value="Photo">🖼️ Photo</option>
            <option value="Video">🎥 Video</option>
            <option value="Music">🎵 Music</option>
            <option value="Audio">🎧 Audio</option>
            <option value="Podcast">🎙️ Podcast</option>
            <option value="Document">📄 Document</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="mediaUrl">Media URL *</label>
          <input
            type="url"
            id="mediaUrl"
            name="mediaUrl"
            value={formData.mediaUrl}
            onChange={handleInputChange}
            placeholder="https://example.com/media.jpg"
            required={!selectedFile}
          />
        </div>

        <div className="form-group">
          <label htmlFor="tags">Tags</label>
          <input
            type="text"
            id="tags"
            name="tags"
            value={formData.tags}
            onChange={handleInputChange}
            placeholder="tag1, tag2, tag3"
          />
          <small>Separate tags with commas</small>
        </div>

        <div className="form-group checkbox">
          <input
            type="checkbox"
            id="isVisibleInFeed"
            name="isVisibleInFeed"
            checked={formData.isVisibleInFeed}
            onChange={handleInputChange}
          />
          <label htmlFor="isVisibleInFeed">Show in feed immediately</label>
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        <button 
          type="submit" 
          className="btn-upload"
          disabled={loading}
        >
          {loading ? 'Uploading...' : '✓ Save to Library'}
        </button>
      </form>
    </div>
  );
};

export default MediaUpload;
