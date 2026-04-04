import { Formation, Position } from './types';

export const FORMATIONS: Formation[] = ['3-5-2', '4-2-3-1', '4-1-2-3', '3-4-3', '4-4-2'];

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;

// Helper to create positions
const pos = (id: string, label: string, x: number, y: number, role: 'goalkeeper' | 'outfield' = 'outfield'): Position => ({
  id, label, x: x * CANVAS_WIDTH, y: y * CANVAS_HEIGHT, role
});

export const FORMATION_POSITIONS: Record<Formation, Position[]> = {
  '4-4-2': [
    pos('gk', 'GK', 0.5, 0.845, 'goalkeeper'),
    pos('rb', 'RB', 0.83, 0.655),
    pos('rcb', 'RCB', 0.6122, 0.685),
    pos('lcb', 'LCB', 0.3878, 0.685),
    pos('lb', 'LB', 0.17, 0.655),
    pos('rm', 'RM', 0.83, 0.52),
    pos('rcm', 'RCM', 0.6, 0.51),
    pos('lcm', 'LCM', 0.4, 0.51),
    pos('lm', 'LM', 0.17, 0.52),
    pos('rs', 'RS', 0.58, 0.29),
    pos('ls', 'LS', 0.42, 0.29),
  ],
  '4-2-3-1': [
    pos('gk', 'GK', 0.5, 0.845, 'goalkeeper'),
    pos('rb', 'RB', 0.83, 0.655),
    pos('rcb', 'RCB', 0.6122, 0.685),
    pos('lcb', 'LCB', 0.3878, 0.685),
    pos('lb', 'LB', 0.17, 0.655),
    pos('rdm', 'RDM', 0.626, 0.545),
    pos('ldm', 'LDM', 0.374, 0.545),
    pos('ram', 'RAM', 0.78, 0.41),
    pos('cam', 'CAM', 0.5, 0.41),
    pos('lam', 'LAM', 0.22, 0.41),
    pos('st', 'ST', 0.5, 0.275),
  ],
  '3-5-2': [
    pos('gk', 'GK', 0.5, 0.845, 'goalkeeper'),
    pos('rcb', 'RCB', 0.7222, 0.69),
    pos('cb', 'CB', 0.5, 0.699815),
    pos('lcb', 'LCB', 0.2778, 0.69),
    pos('rwb', 'RWB', 0.861481, 0.460741),
    pos('rcm', 'RCM', 0.658519, 0.482963),
    pos('cm', 'CM', 0.5, 0.557037),
    pos('lcm', 'LCM', 0.341481, 0.482963),
    pos('lwb', 'LWB', 0.138519, 0.460741),
    pos('rs', 'RS', 0.607778, 0.305),
    pos('ls', 'LS', 0.392222, 0.305),
  ],
  '4-1-2-3': [
    pos('gk', 'GK', 0.5, 0.845, 'goalkeeper'),
    pos('rb', 'RB', 0.83, 0.655),
    pos('rcb', 'RCB', 0.6122, 0.685),
    pos('lcb', 'LCB', 0.3878, 0.685),
    pos('lb', 'LB', 0.17, 0.655),
    pos('dm', 'DM', 0.5, 0.539),
    pos('rcm', 'RCM', 0.68, 0.455),
    pos('lcm', 'LCM', 0.32, 0.455),
    pos('rw', 'RW', 0.78, 0.314),
    pos('st', 'ST', 0.5, 0.275),
    pos('lw', 'LW', 0.22, 0.314),
  ],
  '3-4-3': [
    pos('gk', 'GK', 0.5, 0.845, 'goalkeeper'),
    pos('rcb', 'RCB', 0.7222, 0.69),
    pos('cb', 'CB', 0.5, 0.685),
    pos('lcb', 'LCB', 0.2778, 0.69),
    pos('rm', 'RM', 0.83, 0.52),
    pos('rcm', 'RCM', 0.6, 0.52),
    pos('lcm', 'LCM', 0.4, 0.52),
    pos('lm', 'LM', 0.17, 0.52),
    pos('rw', 'RW', 0.78, 0.305),
    pos('st', 'ST', 0.5, 0.275),
    pos('lw', 'LW', 0.22, 0.305),
  ],
};
