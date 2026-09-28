import { useCallback, useState } from 'react';

/**
 * useWorkspacePages: Manage persistent workspace pages (scripts, props, references, etc.)
 * Pages belong to a session and persist until the team removes them.
 *
 * Usage:
 * const pages = useWorkspacePages(sessionId);
 * await pages.createPage('script', 'Episode 5 Script', 'Welcome to...', 'episode-5,intro');
 * const allPages = await pages.getSessionPages();
 * const scripts = await pages.getPagesByType('script');
 */

export interface WorkspacePage {
  id: string;
  sessionId: string;
  teamId: string;
  pageType: 'script' | 'subject-matter' | 'props' | 'references' | 'custom';
  title: string;
  description?: string;
  content: string;
  version: number;
  tags?: string;
  createdAt: string;
  updatedAt: string;
  lastEditedByUserId?: string;
  isArchived: boolean;
}

interface UseWorkspacePagesReturn {
  pages: WorkspacePage[];
  isLoading: boolean;
  error: string | null;
  createPage: (
    pageType: string,
    title: string,
    content: string,
    tags?: string,
    description?: string
  ) => Promise<WorkspacePage>;
  updatePage: (
    pageId: string,
    title: string,
    content: string,
    tags?: string,
    description?: string
  ) => Promise<WorkspacePage>;
  getSessionPages: () => Promise<WorkspacePage[]>;
  getPagesByType: (pageType: string) => Promise<WorkspacePage[]>;
  getPage: (pageId: string) => Promise<WorkspacePage | null>;
  archivePage: (pageId: string) => Promise<boolean>;
  deletePage: (pageId: string) => Promise<boolean>;
  searchPages: (query: string) => Promise<WorkspacePage[]>;
}

export const useWorkspacePages = (sessionId: string): UseWorkspacePagesReturn => {
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = '/api/workspace-pages';

  const createPage = useCallback(
    async (
      pageType: string,
      title: string,
      content: string,
      tags?: string,
      description?: string
    ): Promise<WorkspacePage> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            pageType,
            title,
            content,
            tags,
            description,
          }),
        });

        if (!res.ok) throw new Error(`Failed to create page: ${res.statusText}`);

        const newPage: WorkspacePage = await res.json();
        setPages((prev) => [newPage, ...prev]);
        return newPage;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId]
  );

  const updatePage = useCallback(
    async (
      pageId: string,
      title: string,
      content: string,
      tags?: string,
      description?: string
    ): Promise<WorkspacePage> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/${pageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            title,
            content,
            tags,
            description,
          }),
        });

        if (!res.ok) throw new Error(`Failed to update page: ${res.statusText}`);

        const updatedPage: WorkspacePage = await res.json();
        setPages((prev) => prev.map((p) => (p.id === pageId ? updatedPage : p)));
        return updatedPage;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId]
  );

  const getSessionPages = useCallback(async (): Promise<WorkspacePage[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/session/${sessionId}`);
      if (!res.ok) throw new Error(`Failed to get pages: ${res.statusText}`);

      const pageList: WorkspacePage[] = await res.json();
      setPages(pageList);
      return pageList;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const getPagesByType = useCallback(
    async (pageType: string): Promise<WorkspacePage[]> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/session/${sessionId}/type/${pageType}`);
        if (!res.ok) throw new Error(`Failed to get pages: ${res.statusText}`);

        const pageList: WorkspacePage[] = await res.json();
        return pageList;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId]
  );

  const getPage = useCallback(
    async (pageId: string): Promise<WorkspacePage | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/${pageId}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Failed to get page: ${res.statusText}`);

        return await res.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const archivePage = useCallback(
    async (pageId: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/${pageId}/archive`, {
          method: 'POST',
        });

        if (!res.ok) throw new Error(`Failed to archive page: ${res.statusText}`);

        setPages((prev) => prev.filter((p) => p.id !== pageId));
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const deletePage = useCallback(
    async (pageId: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/${pageId}`, {
          method: 'DELETE',
        });

        if (!res.ok) throw new Error(`Failed to delete page: ${res.statusText}`);

        setPages((prev) => prev.filter((p) => p.id !== pageId));
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const searchPages = useCallback(
    async (query: string): Promise<WorkspacePage[]> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/session/${sessionId}/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(`Failed to search: ${res.statusText}`);

        return await res.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId]
  );

  return {
    pages,
    isLoading,
    error,
    createPage,
    updatePage,
    getSessionPages,
    getPagesByType,
    getPage,
    archivePage,
    deletePage,
    searchPages,
  };
};
