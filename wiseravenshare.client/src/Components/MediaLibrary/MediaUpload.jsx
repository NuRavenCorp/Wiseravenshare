// wiseravenshare.client/src/Components/MediaLibrary/MediaUpload.jsx

import React, { useCallback, useEffect, useState } from 'react';
import { useSavedMedia } from '../../hooks/useSavedMedia';
import { apiService } from '../../Services/api';
import './MediaUpload.css';

const DRAFT_STORAGE_KEY = 'media-upload-draft';
const FILE_INFO_STORAGE_KEY = 'media-upload-file-info';

const INITIAL_FORM_STATE = {
  title: '',
  description: '',
  mediaType: 'Photo',
  mediaUrl: '',
  tags: '',
  isVisibleInFeed: false
};

const MediaUpload = ({ onMediaUploaded }) => {
  const { saveMedia, loading, error } = useSavedMedia();

  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [draftFileInfo, setDraftFileInfo] = useState(null);

  const [formData, setFormData] = useState(INITIAL_FORM_STATE);

  const inferMediaType = useCallback((file) => {
    const mime = String(file?.type || '').toLowerCase();
    const fileName = String(file?.name || '').toLowerCase();

    if (
      mime.startsWith('video/') ||
      /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(fileName)
    ) {
      return 'Video';
    }

    if (
      mime.startsWith('audio/') ||
      /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|weba)$/i.test(fileName)
    ) {
      return 'Music';
    }

    if (
      mime.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|svg)$/i.test(fileName)
    ) {
      return 'Photo';
    }

    return 'Photo';
  }, []);

  const createCleanTitle = (filename) =>
    String(filename || '').replace(/\.[^/.]+$/, '');

  const extractMediaUrl = (response) => {
    const url =
      response?.data?.mediaUrl ||
      response?.data?.filePath ||
      response?.data?.url;

    if (!url) {
      throw new Error(
        'Upload succeeded but no persisted media URL was returned.'
      );
    }

    return String(url).trim();
  };

  // Restore draft on load
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);

      if (savedDraft) {
        setFormData((prev) => ({
          ...prev,
          ...JSON.parse(savedDraft)
        }));
      }

      const savedFileInfo = localStorage.getItem(FILE_INFO_STORAGE_KEY);

      if (savedFileInfo) {
        setDraftFileInfo(JSON.parse(savedFileInfo));
      }
    } catch (err) {
      console.error('Failed to restore upload draft', err);
    }
  }, []);

  // Persist draft
  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify(formData)
      );
    } catch (err) {
      console.error('Failed to persist draft', err);
    }
  }, [formData]);

  // Store file metadata
  useEffect(() => {
    if (!selectedFile) return;

    try {
      localStorage.setItem(
        FILE_INFO_STORAGE_KEY,
        JSON.stringify({
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
          lastModified: selectedFile.lastModified
        })
      );
    } catch (err) {
      console.error('Failed saving file metadata', err);
    }
  }, [selectedFile]);

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      e.type === 'dragenter' ||
      e.type === 'dragover'
    ) {
      setDragActive(true);
    }

    if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleFileUpload = async (file) => {
    setSelectedFile(file);
    setUploadProgress(0);

    const blobUrl = URL.createObjectURL(file);

    setPreviewUrl((previous) => {
      if (previous?.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }

      return blobUrl;
    });

    const mediaType = inferMediaType(file);

    setFormData((prev) => ({
      ...prev,
      title: prev.title || createCleanTitle(file.name),
      mediaType
    }));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];

    if (file) {
      handleFileUpload(file);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, checked, type } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name\]:
        type === 'checkbox'
          ? checked
          : value
    }));
  };

  const clearDraftData = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(FILE_INFO_STORAGE_KEY);
    setDraftFileInfo(null);
  };

  const resetForm = () => {
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    clearDraftData();

    setSelectedFile(null);
    setPreviewUrl('');
    setUploadProgress(0);
    setFormData(INITIAL_FORM_STATE);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isUploading) return;

    const manualMediaUrl = String(
      formData.mediaUrl || ''
    ).trim();

    if (
      !formData.title.trim() ||
      (!selectedFile && !manualMediaUrl)
    ) {
      alert(
        'Please provide a title and either upload a file or enter a media URL.'
      );
      return;
    }

    if (
      !selectedFile &&
      /^(blob:|file:)/i.test(manualMediaUrl)
    ) {
      alert(
        'Temporary local URLs cannot be saved.'
      );
      return;
    }

    try {
      setIsUploading(true);

      let persistedMediaUrl = manualMediaUrl;

      if (selectedFile) {
        const mediaType = inferMediaType(selectedFile);

        const uploadType =
          mediaType === 'Video'
            ? 'video'
            : mediaType === 'Music' ||
              mediaType === 'Audio' ||
              mediaType === 'Podcast'
            ? 'audio'
            : 'photo';

        const uploadResult =
          await apiService.uploadMedia(
            selectedFile,
            uploadType,
            {
              title: formData.title,
              description: formData.description,
              onProgress: setUploadProgress
            }
          );

        persistedMediaUrl =
          extractMediaUrl(uploadResult);
      }

      const mediaPayload = {
        ...formData,
        mediaUrl: persistedMediaUrl,

        tags: formData.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),

        fileSizeBytes:
          selectedFile?.size || null,

        mediaMetadata: selectedFile
          ? {
              fileName: selectedFile.name,
              mimeType: selectedFile.type,
              lastModified:
                selectedFile.lastModified,
              fileSize:
                selectedFile.size
            }
          : null
      };

      const savedItem = await saveMedia(
        mediaPayload
      );

      try {
        localStorage.setItem(
          'lastUploadedMedia',
          JSON.stringify(savedItem)
        );
      } catch {
        // ignore
      }

      resetForm();

      onMediaUploaded?.(savedItem);
    } catch (err) {
      console.error(
        'Error saving media:',
        err
      );

      alert(
        err?.message ||
          'Failed to upload media.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const previewSource =
    previewUrl || formData.mediaUrl;

  const isAudio =
    formData.mediaType === 'Music' ||
    formData.mediaType === 'Audio' ||
    formData.mediaType === 'Podcast';

  return (
    <div className="media-upload">
      <div className="upload-header">
        <h3>📤 Upload Media</h3>
        <p>Add to your library</p>
      </div>

      {draftFileInfo && !selectedFile && (
        <div className="draft-warning">
          <strong>Draft recovered</strong>
          <br />
          Previous file:
          {' '}
          {draftFileInfo.name}
          <br />
          Please reselect it to continue.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="upload-form"
      >
        <div
          className={`drop-zone ${
            dragActive ? 'active' : ''
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            id="file-input"
            type="file"
            accept="image/*,video/*,audio/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file =
                e.target.files?.[0];

              if (file) {
                handleFileUpload(file);
              }
            }}
          />

          <label
            htmlFor="file-input"
            className="drop-label"
          >
            <span className="icon">📁</span>
            <span className="text">
              Drag & drop your media here
              <br />
              <small>
                or click to browse
              </small>
            </span>
          </label>
        </div>

        {previewSource &&
          formData.mediaType ===
            'Photo' && (
            <div className="preview-thumbnail">
              {previewSource}
            </div>
          )}

        {previewSource &&
          formData.mediaType ===
            'Video' && (
            <div className="preview-thumbnail">
              {previewSource}
            </div>
          )}

        {previewSource &&
          isAudio && (
            <div className="preview-thumbnail">
              {previewSource}
            </div>
          )}

        {uploadProgress > 0 &&
          uploadProgress < 100 && (
            <div
              className="upload-progress"
              role="status"
              aria-live="polite"
            >
              Uploading {uploadProgress}%
            </div>
          )}

        <div className="form-group">
          <label htmlFor="title">
            Title *
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            value={formData.title}
            onChange={
              handleInputChange
            }
            placeholder="Media title"
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows="3"
            value={
              formData.description
            }
            onChange={
              handleInputChange
            }
            placeholder="Optional description"
          />
        </div>

        <div className="form-group">
          <label htmlFor="mediaType">
            Media Type
          </label>

          <select
            id="mediaType"
            name="mediaType"
            value={
              formData.mediaType
            }
            onChange={
              handleInputChange
            }
          >
            <option value="Photo">
              🖼️ Photo
            </option>
            <option value="Video">
              🎥 Video
            </option>
            <option value="Music">
              🎵 Music
            </option>
            <option value="Audio">
              🎧 Audio
            </option>
            <option value="Podcast">
              🎙️ Podcast
            </option>
            <option value="Document">
              📄 Document
            </option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="mediaUrl">
            Media URL
          </label>

          <input
            id="mediaUrl"
            name="mediaUrle="url"
            value={
              formData.mediaUrl
            }
            onChange={
              handleInputChange
            }
            placeholder="https://example.com/media.jpg"
            required={!selectedFile}
          />
        </div>

        <div className="form-group">
          <label htmlFor="tags">
            Tags
          </label>

          <input
            id="tags"
            name="tags"
            type="text"
            value={formData.tags}
            onChange={
              handleInputChange
            }
            placeholder="nature, travel, sunset"
          />

          <small>
            Separate tags with commas
          </small>
        </div>

        <div className="form-group checkbox">
          <input
            id="isVisibleInFeed"
            name="isVisibleInFeed"
            type="checkbox"
            checked={
              formData.isVisibleInFeed
            }
            onChange={
              handleInputChange
            }
          />

          <label htmlFor="isVisibleInFeed">
            Show in feed immediately
          </label>
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-upload"
          disabled={
            loading || isUploading
          }
        >
          {loading || isUploading
            ? 'Uploading...'
            : '✓ Save to Library'}
        </button>
      </form>
    </div>
  );
};

export default MediaUpload;