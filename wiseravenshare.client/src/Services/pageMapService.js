const PAGE_NODES = [
  { id: 'feed', label: 'Feed', category: 'core', icon: 'fas fa-home', tags: ['social', 'timeline', 'posts'], related: ['discover', 'bookmarks', 'messages'] },
  { id: 'discover', label: 'Discover', category: 'core', icon: 'fas fa-compass', tags: ['trending', 'topics', 'search'], related: ['feed', 'ainews', 'bookmarks'] },
  { id: 'bookmarks', label: 'Bookmarks', category: 'core', icon: 'fas fa-bookmark', tags: ['saved', 'library'], related: ['feed', 'discover', 'my-library'] },
  { id: 'notifications', label: 'Notifications', category: 'core', icon: 'fas fa-bell', tags: ['alerts', 'activity'], related: ['messages', 'feed'] },
  { id: 'messages', label: 'Messages', category: 'core', icon: 'fas fa-envelope', tags: ['chat', 'collaboration'], related: ['notifications', 'collaboration'] },
  { id: 'planner', label: 'Planner', category: 'productivity', icon: 'fas fa-tasks', tags: ['tasks', 'scheduling'], related: ['team-launchpad', 'collaboration'] },
  { id: 'newsroom-video', label: 'Newsroom Video', category: 'studio', icon: 'fas fa-video', tags: ['recording', 'video', 'podcast'], related: ['ravensight', 'podcast-rights-studio'] },
  { id: 'amateur-journalist', label: 'Amateur Journalist', category: 'studio', icon: 'fas fa-microphone-alt', tags: ['journalism', 'capture'], related: ['newsroom-video', 'truthseeker'] },
  { id: 'canvas', label: 'Canvas Studio', category: 'studio', icon: 'fas fa-palette', tags: ['editing', 'design'], related: ['ravensight', 'collaboration'] },
  { id: 'music-player', label: 'Music Studio', category: 'audio', icon: 'fas fa-sliders-h', tags: ['music', 'audio', 'player'], related: ['music-rights-studio', 'fm-tuner', 'radio-creator'] },
  { id: 'fm-tuner', label: 'FM Tuner', category: 'audio', icon: 'fas fa-broadcast-tower', tags: ['radio', 'streaming', 'music'], related: ['music-player', 'radio-creator'] },
  { id: 'radio-creator', label: 'Radio Creator', category: 'audio', icon: 'fas fa-podcast', tags: ['radio', 'publishing'], related: ['fm-tuner', 'podcast-rights-studio'] },
  { id: 'my-library', label: 'My Library', category: 'library', icon: 'fas fa-book-open', tags: ['media', 'saved', 'music', 'video'], related: ['bookmarks', 'music-player'] },
  { id: 'music-rights-studio', label: 'Music Rights', category: 'audio', icon: 'fas fa-music', tags: ['rights', 'licensing', 'music'], related: ['music-player', 'podcast-rights-studio'] },
  { id: 'podcast-rights-studio', label: 'Podcast Rights', category: 'audio', icon: 'fas fa-podcast', tags: ['rights', 'podcast'], related: ['newsroom-video', 'music-rights-studio'] },
  { id: 'team-launchpad', label: 'Team Launchpad', category: 'team', icon: 'fas fa-people-arrows', tags: ['team', 'workflow'], related: ['planner', 'collaboration'] },
  { id: 'collaboration', label: 'Collaboration', category: 'team', icon: 'fas fa-users', tags: ['team', 'coauthoring'], related: ['messages', 'team-launchpad'] },
  { id: 'truthseeker', label: 'Truth Seeker', category: 'intelligence', icon: 'fas fa-shield-alt', tags: ['fact-check', 'verification', 'ai'], related: ['ainews', 'feed'] },
  { id: 'ai-assistant', label: 'Raven Assistant', category: 'intelligence', icon: 'fas fa-robot', tags: ['assistant', 'ai', 'help'], related: ['truthseeker', 'ainews'] },
  { id: 'ainews', label: 'AI News', category: 'news', icon: 'fas fa-newspaper', tags: ['news', 'articles', 'trends'], related: ['breakingnews', 'truthseeker'] },
  { id: 'ravensight', label: 'Ravensight', category: 'studio', icon: 'fas fa-video', tags: ['studio', 'video', 'media'], related: ['newsroom-video', 'canvas'] },
  { id: 'profile', label: 'Profile', category: 'account', icon: 'fas fa-user', tags: ['user', 'settings'], related: ['team-launchpad', 'messages'] },
  { id: 'privacy', label: 'Privacy Policy', category: 'legal', icon: 'fas fa-user-shield', tags: ['legal', 'compliance'] },
  { id: 'terms', label: 'Terms of Service', category: 'legal', icon: 'fas fa-file-contract', tags: ['legal', 'compliance'] },
  { id: 'revenue', label: 'Revenue', category: 'admin', icon: 'fas fa-chart-line', tags: ['admin', 'growth'], adminOnly: true, related: ['team-access-admin'] },
  { id: 'team-access-admin', label: 'Team Access', category: 'admin', icon: 'fas fa-user-shield', tags: ['admin', 'permissions'], adminOnly: true, related: ['team-launchpad'] }
];

const DEFAULT_NAV_ORDER = [
  'feed',
  'discover',
  'bookmarks',
  'notifications',
  'messages',
  'planner',
  'newsroom-video',
  'amateur-journalist',
  'canvas',
  'music-player',
  'fm-tuner',
  'radio-creator',
  'my-library',
  'music-rights-studio',
  'podcast-rights-studio',
  'team-launchpad',
  'truthseeker',
  'ai-assistant',
  'ainews',
  'ravensight',
  'profile'
];

const ADMIN_INSERT_AFTER = 'canvas';
const ADMIN_NODES = ['revenue', 'team-access-admin'];

const PAGE_INDEX = new Map(PAGE_NODES.map((node) => [node.id, node]));

const normalizeNode = (node) => ({
  id: node.id,
  label: node.label,
  icon: node.icon || '',
  category: node.category || 'general',
  tags: Array.isArray(node.tags) ? [...node.tags] : [],
  related: Array.isArray(node.related) ? [...node.related] : [],
  adminOnly: Boolean(node.adminOnly)
});

const toGuid = (seed) => {
  const text = String(seed || 'page').trim().toLowerCase();
  let hashA = 2166136261;
  let hashB = 16777619;

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 16777619);
    hashB ^= code;
    hashB = Math.imul(hashB, 1099511627);
  }

  const hex = [hashA >>> 0, hashB >>> 0, (hashA ^ hashB) >>> 0, (hashA + hashB) >>> 0]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');

  const a = hex.slice(0, 8);
  const b = hex.slice(8, 12);
  const c = `4${hex.slice(13, 16)}`;
  const dRaw = parseInt(hex.slice(16, 20), 16);
  const d = ((dRaw & 0x3fff) | 0x8000).toString(16).padStart(4, '0');
  const e = hex.slice(20, 32);

  return `${a}-${b}-${c}-${d}-${e}`;
};

export const pageMapService = {
  getPageMap: () => PAGE_NODES.map((node) => normalizeNode(node)),

  getPageNode: (pageId) => {
    const node = PAGE_INDEX.get(String(pageId || '').trim());
    return node ? normalizeNode(node) : null;
  },

  getSidebarMenu: ({ isAdminUser = false } = {}) => {
    const ordered = [...DEFAULT_NAV_ORDER];

    if (isAdminUser) {
      const insertIndex = Math.max(0, ordered.indexOf(ADMIN_INSERT_AFTER) + 1);
      ordered.splice(insertIndex, 0, ...ADMIN_NODES);
    }

    return ordered
      .map((id) => PAGE_INDEX.get(id))
      .filter(Boolean)
      .filter((node) => !node.adminOnly || isAdminUser)
      .map((node) => ({ id: node.id, icon: node.icon, label: node.label }));
  },

  toCrawlerPayload: ({ countryCode = 'GLOBAL' } = {}) => {
    const normalizedCountry = String(countryCode || 'GLOBAL').trim().toUpperCase() || 'GLOBAL';

    return PAGE_NODES.map((node) => ({
      contentType: 'PageMap',
      contentId: toGuid(node.id),
      content: [
        `page:${node.id}`,
        `label:${node.label}`,
        `category:${node.category || 'general'}`,
        `related:${(node.related || []).join('|')}`
      ].join(';'),
      tags: ['page-map', node.id, node.category || 'general', ...(node.tags || [])],
      countryCode: normalizedCountry
    }));
  },

  getFeatureConnectionGraph: () => {
    const nodes = PAGE_NODES.map((node) => ({
      id: node.id,
      label: node.label,
      category: node.category || 'general',
      tags: Array.isArray(node.tags) ? [...node.tags] : []
    }));

    const edges = [];
    const seen = new Set();

    for (const node of PAGE_NODES) {
      const sourceTags = new Set(node.tags || []);

      for (const targetId of node.related || []) {
        const target = PAGE_INDEX.get(targetId);
        if (!target) continue;

        const edgeId = `${node.id}->${target.id}`;
        if (seen.has(edgeId)) continue;
        seen.add(edgeId);

        const sharedTags = (target.tags || []).filter((tag) => sourceTags.has(tag));
        const sameCategory = node.category && target.category && node.category === target.category;

        edges.push({
          sourceId: node.id,
          targetId: target.id,
          relationship: 'related',
          weight: 1 + sharedTags.length + (sameCategory ? 1 : 0),
          sharedTags
        });
      }
    }

    return { nodes, edges };
  },

  getRelatedPages: (pageId, availablePageIds = [], limit = 6) => {
    const node = PAGE_INDEX.get(String(pageId || '').trim());
    if (!node) return [];

    const available = new Set((Array.isArray(availablePageIds) ? availablePageIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean));

    const sourceTags = new Set(node.tags || []);

    const related = PAGE_NODES
      .filter((candidate) => candidate.id !== node.id)
      .map((candidate) => {
        const directRelationship = (node.related || []).includes(candidate.id) ? 3 : 0;
        const sharedTags = (candidate.tags || []).filter((tag) => sourceTags.has(tag));
        const sameCategory = candidate.category === node.category ? 1 : 0;
        const availableBoost = available.size === 0 || available.has(candidate.id) ? 1 : 0;
        const score = directRelationship + sharedTags.length + sameCategory + availableBoost;

        return {
          ...normalizeNode(candidate),
          score,
          sharedTags
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Number(limit) || 6));

    return related;
  }
};

export const mapPageIdToGuid = (pageId) => toGuid(pageId);
