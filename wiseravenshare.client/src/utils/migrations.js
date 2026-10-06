import { storage } from './storage';
import { KEYS } from './storageKeys';

const MIGRATIONS = [
  {
    id: 'v0-to-v1',
    run() {
      const legacyKeys = [
        ['mediaLibraryUI', KEYS.UI],
        ['mediaLibraryCache', KEYS.CACHE],
        ['mediaLibraryPlaylists', KEYS.PLAYLISTS],
      ];

      legacyKeys.forEach(([oldKey, newKey]) => {
        const value = storage.get(oldKey, null);
        if (value != null) {
          storage.set(newKey, value);
          storage.remove(oldKey);
        }
      });
    },
  },
];

export function runMigrations() {
  const applied = storage.get(KEYS.MIGRATION, []);
  const appliedSet = new Set(applied);

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.id)) continue;
    try {
      migration.run();
      appliedSet.add(migration.id);
    } catch (error) {
      console.warn(`[migration:${migration.id}] failed`, error);
    }
  }

  storage.set(KEYS.MIGRATION, Array.from(appliedSet));
}

