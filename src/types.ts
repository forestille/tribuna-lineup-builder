export interface Player {
  name: string;
  displayName: string;
  imageUrl: string;
  role: 'goalkeeper' | 'outfield';
  teamName?: string;
}

export type AppMode = 'uefa' | 'world-cup';

export interface Team {
  name: string;
  players: Player[];
  defaultBackground?: string;
  glowColor?: string;
  defaultFormation?: Formation;
  linkedTeam?: string;
}

export type Formation = '3-5-2' | '4-2-3-1' | '4-1-2-3' | '3-4-3' | '3-4-2-1' | '4-4-2';

export interface Position {
  id: string;
  label: string;
  x: number;
  y: number;
  role: 'goalkeeper' | 'outfield';
}

export interface LineupState {
  teamName: string;
  formation: Formation;
  players: Record<string, Player | null>;
  subs: string;
  tournamentLogo: string;
  tournamentLogoMonochrome: boolean;
  matchday: string;
  homeLogo: string;
  awayLogo: string;
  background: string;
  glowColor: string;
  possibleLineup: boolean;
  possibleLineupText: string;
}
