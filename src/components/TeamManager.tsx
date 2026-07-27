import { useState, useEffect } from 'react';
import { AppMode, Formation, Team } from '../types';
import { Search } from 'lucide-react';
import { COMPETITION_CONFIG } from '../competitionConfig';

interface Props {
  mode: AppMode;
  onTeamSelect: (team: Team) => void;
  includeLinkedTeam: boolean;
  onIncludeLinkedTeamChange: (value: boolean) => void;
}

export default function TeamManager({ mode, onTeamSelect, includeLinkedTeam, onIncludeLinkedTeamChange }: Props) {
  const config = COMPETITION_CONFIG[mode];
  const [teams, setTeams] = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [teamMeta, setTeamMeta] = useState<Record<string, { background?: string; glowColor?: string; defaultFormation?: Formation; linkedTeam?: string }>>({});

  useEffect(() => {
    fetchTeams();
    const onFocus = () => fetchTeams();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'teamsUpdated') fetchTeams();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [mode]);

  const fetchTeams = async () => {
    try {
      const res = await fetch(`${config.apiBase}/teams`);
      if (!res.ok) throw new Error('Failed to load teams');
      const data = await res.json();
      setTeams(Array.isArray(data.teams) ? data.teams : []);
      setAllPlayers(Array.isArray(data.players) ? data.players : []);
      setTeamMeta(data.meta || {});
    } catch {
      setTeams([]);
      setAllPlayers([]);
    }
  };

  const normalizeSearch = (value: string) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’'ʼ]/g, '')
      .toLowerCase();

  const mapTeamPlayers = (teamName: string) =>
    allPlayers.filter(p => p.team === teamName).map(p => ({
      name: p.name,
      displayName: p['display-name'],
      imageUrl: p['image-url'],
      role: (typeof p.role === 'string' && p.role.toLowerCase() === 'goalkeeper') ? 'goalkeeper' : 'outfield',
      teamName
    }));

  const getMergedPlayers = (teamName: string, linkedTeamName?: string) => {
    const merged = [...mapTeamPlayers(teamName)];
    if (linkedTeamName) {
      const seen = new Set(merged.map(player => normalizeSearch(player.displayName || player.name)));
      for (const player of mapTeamPlayers(linkedTeamName)) {
        const key = normalizeSearch(player.displayName || player.name);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(player);
      }
    }
    return merged;
  };

  useEffect(() => {
    if (!selectedTeam) return;
    const meta = teamMeta[selectedTeam] || {};
    const linkedTeam = includeLinkedTeam ? String(meta.linkedTeam || '').trim() : '';
    onTeamSelect({
      name: selectedTeam,
      players: getMergedPlayers(selectedTeam, linkedTeam || undefined),
      defaultBackground: meta.background,
      glowColor: meta.glowColor,
      defaultFormation: meta.defaultFormation,
      linkedTeam: meta.linkedTeam,
    });
  }, [selectedTeam, includeLinkedTeam, allPlayers, teamMeta]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Search className="w-5 h-5 text-indigo-600" />
        Team Selection
      </h2>
      
      <div className="flex gap-4 mb-4 items-center">
        <select 
          className="flex-1 p-2 border border-slate-300 rounded-lg bg-slate-50"
          value={selectedTeam}
          onChange={(e) => {
            setSelectedTeam(e.target.value);
            onIncludeLinkedTeamChange(false);
          }}
        >
          <option value="">Select a team...</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          onClick={() => fetchTeams()}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
