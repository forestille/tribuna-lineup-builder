import { useState, useEffect } from 'react';
import { Formation, Team } from '../types';
import { Search } from 'lucide-react';

interface Props {
  onTeamSelect: (team: Team) => void;
}

export default function TeamManager({ onTeamSelect }: Props) {
  const [teams, setTeams] = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [teamMeta, setTeamMeta] = useState<Record<string, { background?: string; glowColor?: string; defaultFormation?: Formation }>>({});

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
  }, []);

  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/teams');
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

  const handleTeamChange = (name: string) => {
    setSelectedTeam(name);
    const teamPlayers = allPlayers.filter(p => p.team === name).map(p => ({
      name: p.name,
      displayName: p['display-name'],
      imageUrl: p['image-url'],
      role: (typeof p.role === 'string' && p.role.toLowerCase() === 'goalkeeper') ? 'goalkeeper' : 'outfield'
    }));
    const meta = teamMeta[name] || {};
    onTeamSelect({ name, players: teamPlayers, defaultBackground: meta.background, glowColor: meta.glowColor, defaultFormation: meta.defaultFormation });
  };

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
          onChange={(e) => handleTeamChange(e.target.value)}
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
        <div className="px-4 py-2 text-slate-400 text-sm">Add teams in /admin</div>
      </div>
    </div>
  );
}
