import { AppMode } from './types';

export type CompetitionConfig = {
  mode: AppMode;
  title: string;
  apiBase: string;
  backgroundsApiPath: string;
  playerImageFolders: string[];
  preprocessFolder: string;
  importLabel: string;
};

export const COMPETITION_CONFIG: Record<AppMode, CompetitionConfig> = {
  uefa: {
    mode: 'uefa',
    title: 'UEFA Lineup Builder',
    apiBase: '/api',
    backgroundsApiPath: '/api/backgrounds',
    playerImageFolders: ['/img/players', '/img/players-uefa'],
    preprocessFolder: 'players-uefa',
    importLabel: 'Paste UEFA Squad HTML Source',
  },
  'world-cup': {
    mode: 'world-cup',
    title: 'World Cup Lineup Builder',
    apiBase: '/api/world-cup',
    backgroundsApiPath: '/api/backgrounds',
    playerImageFolders: ['/img/players-world-cup', '/img/players'],
    preprocessFolder: 'players-world-cup',
    importLabel: 'Paste FIFA Squad HTML Source',
  },
};
