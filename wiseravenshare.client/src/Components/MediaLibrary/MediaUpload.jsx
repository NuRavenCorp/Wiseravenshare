// wiseravenshare.client/src/Components/MediaLibrary/MediaUpload.jsx
import React, { useState } from 'react';
import { useSavedMedia } from '../../hooks/useSavedMedia';
import './MediaUpload.css';

/**
 * Media upload component for adding new items to the library
 */
const MediaUpload = ({ onMediaUploaded }) => {
  const { saveMedia, loading, error } = useSavedMedia();
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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
    // TODO: Implement file upload to cloud storage (DigitalOcean Spaces, etc.)
    // For now, we'll create a local URL
    const url = URL.createObjectURL(file);
    const inferredType = inferMediaType(file);
    setFormData(prev => ({
      ...prev,
      mediaUrl: url,
      title: file.name,
      mediaType: inferredType
    }));
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim() || !formData.mediaUrl.trim()) {
      alert('Please fill in title and media URL');
      return;
    }

    try {
      await saveMedia({
        ...formData,
        tags: formData.tags.split(',').filter(t => t.trim()),
        fileSizeBytes: null,
        mediaMetadata: null
      });

      // Reset form
      setFormData({
        title: '',
        description: '',
        mediaType: 'Photo',
        mediaUrl: '',
        tags: '',
        isVisibleInFeed: false
      });

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

        {formData.mediaUrl && (
          <div className="preview-thumbnail">
            <img src={formData.mediaUrl} alt="Preview" />
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
            required
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
