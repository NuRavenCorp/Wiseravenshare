import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { FiExternalLink, FiRefreshCcw, FiSend } from 'react-icons/fi';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { socialService, type PublishSocialContentRequest } from '../../services/socialService';

export const SocialBridge: React.FC = () => {
  const [message, setMessage] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [facebookPageId, setFacebookPageId] = useState('');
  const [tiktokUsername, setTiktokUsername] = useState('');
  const [publishToFacebook, setPublishToFacebook] = useState(true);
  const [publishToTikTok, setPublishToTikTok] = useState(true);

  const feedQuery = useQuery({
    queryKey: ['social-feed', facebookPageId, tiktokUsername],
    queryFn: () => socialService.getCombinedFeed(10, facebookPageId || undefined, tiktokUsername || undefined),
    staleTime: 15_000,
  });

  const publishMutation = useMutation({
    mutationFn: (payload: PublishSocialContentRequest) => socialService.publishContent(payload),
    onSuccess: (result) => {
      const successful = result.results.filter(r => r.success).map(r => r.platform);
      const failed = result.results.filter(r => !r.success);

      if (successful.length > 0) {
        toast.success(`Published to: ${successful.join(', ')}`);
      }

      failed.forEach(item => {
        toast.error(`${item.platform}: ${item.error || 'Publish failed'}`);
      });

      void feedQuery.refetch();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to publish update');
    },
  });

  const canSubmit = useMemo(() => {
    return message.trim().length > 0 && (publishToFacebook || publishToTikTok);
  }, [message, publishToFacebook, publishToTikTok]);

  const submit = () => {
    if (!canSubmit) {
      toast.error('Add a message and select at least one platform.');
      return;
    }

    publishMutation.mutate({
      message: message.trim(),
      linkUrl: linkUrl.trim() || undefined,
      videoUrl: videoUrl.trim() || undefined,
      publishToFacebook,
      publishToTikTok,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <Card className="lg:col-span-2 p-4" hoverable={false}>
        <h3 className="text-lg font-semibold mb-3">Cross-Post Update</h3>

        <div className="space-y-3">
          <label className="block text-sm text-gray-300">
            Message
            <textarea
              className="mt-1 w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary"
              rows={5}
              maxLength={4000}
              placeholder="Write one update and publish to Facebook + TikTok"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>

          <label className="block text-sm text-gray-300">
            Optional Link URL
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://wise-ravens.com/post/..."
            />
          </label>

          <label className="block text-sm text-gray-300">
            Optional Public Video URL (required by TikTok direct publish)
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://wise-ravens.com/uploads/videos/..."
            />
          </label>

          <div className="flex gap-4 pt-1 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={publishToFacebook} onChange={(e) => setPublishToFacebook(e.target.checked)} />
              Facebook
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={publishToTikTok} onChange={(e) => setPublishToTikTok(e.target.checked)} />
              TikTok
            </label>
          </div>

          <Button
            variant="primary"
            onClick={submit}
            loading={publishMutation.isPending}
            disabled={!canSubmit}
            icon={<FiSend />}
            className="w-full"
          >
            Publish Update
          </Button>
        </div>
      </Card>

      <Card className="lg:col-span-3 p-4" hoverable={false}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Facebook + TikTok Feed</h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => feedQuery.refetch()}
            loading={feedQuery.isFetching}
            icon={<FiRefreshCcw />}
          >
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <label className="block text-sm text-gray-300">
            Facebook Page ID (optional override)
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary"
              value={facebookPageId}
              onChange={(e) => setFacebookPageId(e.target.value)}
              placeholder="your-page-id"
            />
          </label>

          <label className="block text-sm text-gray-300">
            TikTok Username (optional override)
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary"
              value={tiktokUsername}
              onChange={(e) => setTiktokUsername(e.target.value)}
              placeholder="yourtiktokhandle"
            />
          </label>
        </div>

        {feedQuery.isLoading && <p className="text-sm text-gray-400">Loading social feed...</p>}
        {feedQuery.isError && <p className="text-sm text-red-400">Failed to load social feed.</p>}

        <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
          {(feedQuery.data || []).map((item) => (
            <div key={`${item.platform}-${item.externalId}`} className="rounded-lg border border-border bg-white/5 p-3">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span className="uppercase tracking-wide">{item.platform}</span>
                <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown date'}</span>
              </div>

              <p className="text-sm text-gray-200 whitespace-pre-wrap">{item.text || 'No text provided.'}</p>

              {item.mediaUrl && (
                <img
                  src={item.mediaUrl}
                  alt="social media preview"
                  className="mt-2 w-full max-h-64 object-cover rounded"
                />
              )}

              {item.permalinkUrl && (
                <a
                  href={item.permalinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
                >
                  Open original
                  <FiExternalLink />
                </a>
              )}
            </div>
          ))}

          {!feedQuery.isLoading && (feedQuery.data || []).length === 0 && (
            <p className="text-sm text-gray-400">
              No feed items returned. Configure Social tokens/page/username in server settings.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};
