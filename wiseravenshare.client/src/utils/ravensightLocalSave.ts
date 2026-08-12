import { getAuthToken } from '../Services/authStorage';

export type RavensightMediaKind = 'video' | 'photo' | 'audio';
export type RavensightSaveRoot = 'auto' | 'videos' | 'pictures';

export type RavensightLocalFolderPermission = {
    localFolderPermissionGranted: boolean;
    localFolderAlias: string | null;
    localSaveRoot: RavensightSaveRoot;
    folderIdentityKey: string | null;
    grantedAtUtc: string | null;
    updatedAtUtc?: string | null;
};

const RAVENSIGHT_LOCAL_SAVE_ROOT_KEY = 'ravensight.localSaveRoot';

const sanitizeFileName = (value: string, fallbackName = `ravensight_${Date.now()}`) => {
    const trimmed = String(value || '').trim();
    const normalized = trimmed || fallbackName;
    return normalized.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const fallbackDownload = (file: Blob, fileName: string) => {
    const objectUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
};

const isSaveRoot = (value: string): value is RavensightSaveRoot => {
    return value === 'auto' || value === 'videos' || value === 'pictures';
};

const resolveStartIn = (mediaType: RavensightMediaKind, preference: RavensightSaveRoot) => {
    if (preference === 'videos' || preference === 'pictures') {
        return preference;
    }

    return mediaType === 'video' ? 'videos' : 'pictures';
};

type DirectoryPickerStartLocation = 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';

type SaveDirectoryHandle = {
    getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<SaveDirectoryHandle>;
    getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
        createWritable: () => Promise<{
            write: (data: Blob | BufferSource | string) => Promise<void>;
            close: () => Promise<void>;
        }>;
    }>;
};

type DirectoryPickerWindow = Window & {
    showDirectoryPicker?: (options?: {
        mode?: 'read' | 'readwrite';
        startIn?: DirectoryPickerStartLocation;
    }) => Promise<SaveDirectoryHandle>;
};

const resolveApiBase = () => {
    const configured = String(import.meta.env.VITE_API_URL || '').trim();
    if (configured) {
        return /\/api$/i.test(configured)
            ? configured.replace(/\/+$/, '')
            : `${configured.replace(/\/+$/, '')}/api`;
    }

    if (typeof window !== 'undefined') {
        return `${window.location.origin}/api`;
    }

    return '/api';
};

const getPreferencesEndpoint = () => `${resolveApiBase()}/ravensight/media/preferences/local-folder`;

const persistLocalFolderPermission = async (startIn: 'videos' | 'pictures') => {
    try {
        const token = getAuthToken();
        if (!token) {
            return;
        }

        await fetch(getPreferencesEndpoint(), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                localFolderPermissionGranted: true,
                localFolderAlias: 'Ravensight',
                localSaveRoot: startIn
            })
        });
    } catch {
        // Best-effort only; local save should not fail because preference sync failed.
    }
};

export const getRavensightLocalFolderPermission = async (): Promise<RavensightLocalFolderPermission | null> => {
    try {
        const token = getAuthToken();
        if (!token) {
            return null;
        }

        const response = await fetch(getPreferencesEndpoint(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            return null;
        }

        const payload = await response.json();
        return {
            localFolderPermissionGranted: Boolean(payload?.localFolderPermissionGranted),
            localFolderAlias: payload?.localFolderAlias ? String(payload.localFolderAlias) : null,
            localSaveRoot: isSaveRoot(String(payload?.localSaveRoot || '').trim().toLowerCase())
                ? String(payload.localSaveRoot).trim().toLowerCase() as RavensightSaveRoot
                : 'auto',
            folderIdentityKey: payload?.folderIdentityKey ? String(payload.folderIdentityKey) : null,
            grantedAtUtc: payload?.grantedAtUtc ? String(payload.grantedAtUtc) : null,
            updatedAtUtc: payload?.updatedAtUtc ? String(payload.updatedAtUtc) : null
        };
    } catch {
        return null;
    }
};

export const setRavensightLocalFolderPermission = async (
    granted: boolean,
    localSaveRoot: RavensightSaveRoot,
    localFolderAlias = 'Ravensight'
) => {
    const token = getAuthToken();
    if (!token) {
        throw new Error('Sign in required.');
    }

    const response = await fetch(getPreferencesEndpoint(), {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            localFolderPermissionGranted: granted,
            localFolderAlias: granted ? localFolderAlias : null,
            localSaveRoot
        })
    });

    if (!response.ok) {
        throw new Error('Failed to update Ravensight folder permission.');
    }

    const payload = await response.json();
    return {
        localFolderPermissionGranted: Boolean(payload?.localFolderPermissionGranted),
        localFolderAlias: payload?.localFolderAlias ? String(payload.localFolderAlias) : null,
        localSaveRoot: isSaveRoot(String(payload?.localSaveRoot || '').trim().toLowerCase())
            ? String(payload.localSaveRoot).trim().toLowerCase() as RavensightSaveRoot
            : 'auto',
        folderIdentityKey: payload?.folderIdentityKey ? String(payload.folderIdentityKey) : null,
        grantedAtUtc: payload?.grantedAtUtc ? String(payload.grantedAtUtc) : null,
        updatedAtUtc: payload?.updatedAtUtc ? String(payload.updatedAtUtc) : null
    } as RavensightLocalFolderPermission;
};

export const getRavensightLocalSaveRootPreference = (): RavensightSaveRoot => {
    try {
        const stored = String(localStorage.getItem(RAVENSIGHT_LOCAL_SAVE_ROOT_KEY) || '').trim().toLowerCase();
        return isSaveRoot(stored) ? stored : 'auto';
    } catch {
        return 'auto';
    }
};

export const setRavensightLocalSaveRootPreference = (value: RavensightSaveRoot) => {
    try {
        localStorage.setItem(RAVENSIGHT_LOCAL_SAVE_ROOT_KEY, value);
    } catch {
        // Ignore storage failures; local save still works without persistence.
    }
};

export const saveFileToRavensightFolder = async (
    file: Blob,
    fileName: string,
    mediaType: RavensightMediaKind,
    preferredRoot: RavensightSaveRoot = 'auto'
) => {
    const safeFileName = sanitizeFileName(fileName);
    const startIn = resolveStartIn(mediaType, preferredRoot);
    const pickerWindow = window as DirectoryPickerWindow;

    if (typeof pickerWindow.showDirectoryPicker !== 'function') {
        fallbackDownload(file, safeFileName);
        return {
            ok: true,
            mode: 'fallback' as const,
            startIn
        };
    }

    try {
        const baseDirectory = await pickerWindow.showDirectoryPicker({
            mode: 'readwrite',
            startIn
        });

        const ravensightDirectory = await baseDirectory.getDirectoryHandle('Ravensight', {
            create: true
        });

        const fileHandle = await ravensightDirectory.getFileHandle(safeFileName, {
            create: true
        });

        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
        await persistLocalFolderPermission(startIn);

        return {
            ok: true,
            mode: 'directory' as const,
            startIn
        };
    } catch {
        fallbackDownload(file, safeFileName);
        return {
            ok: true,
            mode: 'fallback' as const,
            startIn
        };
    }
};
