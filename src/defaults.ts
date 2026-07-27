import { AppMode } from './types';

export const DEFAULT_LOGO_VALUES_BY_MODE: Record<
  AppMode,
  {
    tournamentLogo: string;
    homeLogo: string;
    awayLogo: string;
    matchday: string;
  }
> = {
  uefa: {
    tournamentLogo: 'local:U17 Euro',
    homeLogo: 'local:Spain',
    awayLogo: 'local:Spain',
    matchday: 'Final',
  },
  'world-cup': {
    tournamentLogo: 'local:World Cup',
    homeLogo: '',
    awayLogo: '',
    matchday: 'Matchday 1',
  },
} as const;
