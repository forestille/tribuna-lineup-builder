import { useState, useEffect } from 'react';
import { Player, Team } from '../types';
import { parseUEFAHtml } from '../services/parser';
import { Search, Plus, Save, Edit2, Trash2 } from 'lucide-react';

interface Props {
  onTeamSelect: (team: Team) => void;
  backgrounds: string[];
}

export default function TeamManager({ onTeamSelect, backgrounds }: Props) {
  const [teams, setTeams] = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [htmlInput, setHtmlInput] = useState('');
  const [parsedPlayers, setParsedPlayers] = useState<Player[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [defaultBackground, setDefaultBackground] = useState('');
  const [glowColor, setGlowColor] = useState('');
  const [preprocessUefa, setPreprocessUefa] = useState(false);
  const [preprocessStatus, setPreprocessStatus] = useState<string>('');
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [teamMeta, setTeamMeta] = useState<Record<string, { background?: string; glowColor?: string }>>({});

  useEffect(() => {
    fetchTeams();
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

  const handleParse = () => {
    const players = parseUEFAHtml(htmlInput);
    setParsedPlayers(players);
  };

  const handleSaveNewTeam = async () => {
    if (!newTeamName || parsedPlayers.length === 0) return;

    const doPreprocess = preprocessUefa;
    if (doPreprocess) {
      setPreprocessStatus('Starting...');
      setIsPreprocessing(true);
    }

    console.log('Saving team with preprocessUefa:', doPreprocess);
    const res = await fetch('/api/save-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamName: newTeamName,
        players: parsedPlayers,
        background: defaultBackground,
        glowColor,
        preprocessUefa: doPreprocess
      }),
    });
    if (doPreprocess) {
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !res.body) {
        setPreprocessStatus('Failed');
        setIsPreprocessing(false);
        return;
      }
      if (!contentType.includes('application/x-ndjson')) {
        try {
          const data = await res.json();
          setPreprocessStatus(`No progress (server skipped). preprocessUefa=${data.preprocessUefa}`);
        } catch {
          setPreprocessStatus(`No progress (server skipped). Content-Type: ${contentType || 'none'}`);
        }
        setIsPreprocessing(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          const chunk = decoder.decode(result.value);
          const lines = chunk.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const evt = JSON.parse(line);
              if (evt.type === 'progress') {
                setPreprocessStatus(`${evt.current}/${evt.total}`);
              }
              if (evt.type === 'error') {
                setPreprocessStatus(`Error: ${evt.player || ''} ${evt.current}/${evt.total}`);
              }
              if (evt.type === 'done') {
                setPreprocessStatus('Done');
                setIsPreprocessing(false);
                await fetchTeams();
                setShowAddForm(false);
                setHtmlInput('');
                setParsedPlayers([]);
                setNewTeamName('');
                setDefaultBackground('');
                setGlowColor('');
                setPreprocessUefa(false);
                setPreprocessStatus('');
                return;
              }
            } catch {}
          }
        }
      }
      setIsPreprocessing(false);
      await fetchTeams();
      setShowAddForm(false);
      setHtmlInput('');
      setParsedPlayers([]);
      setNewTeamName('');
      setDefaultBackground('');
      setGlowColor('');
      setPreprocessUefa(false);
      setPreprocessStatus('');
      return;
    }

    await fetchTeams();
    setHtmlInput('');
    setParsedPlayers([]);
    setNewTeamName('');
    setDefaultBackground('');
    setGlowColor('');
    setPreprocessUefa(false);
    setPreprocessStatus('');
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
    onTeamSelect({ name, players: teamPlayers, defaultBackground: meta.background, glowColor: meta.glowColor });
  };

  const updateParsedPlayer = (index: number, field: keyof Player, value: string) => {
    const updated = [...parsedPlayers];
    updated[index] = { ...updated[index], [field]: value };
    setParsedPlayers(updated);
  };

  useEffect(() => {
    if (!newTeamName || defaultBackground) return;
    const match = backgrounds.find(b => b.toLowerCase() === `${newTeamName.toLowerCase()}.png`)
      || backgrounds.find(b => b.toLowerCase() === `${newTeamName.toLowerCase()}.jpg`)
      || backgrounds.find(b => b.toLowerCase() === `${newTeamName.toLowerCase()}.jpeg`)
      || backgrounds.find(b => b.toLowerCase() === `${newTeamName.toLowerCase()}.webp`);
    if (match) setDefaultBackground(match);
  }, [newTeamName, backgrounds, defaultBackground]);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Search className="w-5 h-5 text-indigo-600" />
        Team Selection
      </h2>
      
      <div className="flex gap-4 mb-4">
        <select 
          className="flex-1 p-2 border border-slate-300 rounded-lg bg-slate-50"
          value={selectedTeam}
          onChange={(e) => handleTeamChange(e.target.value)}
        >
          <option value="">Select a team...</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button 
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add New
        </button>
      </div>

      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold">Add New Team from UEFA Squad Page</h3>
              <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Team Name</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-slate-300 rounded-lg"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Galatasaray"
                />
              </div>
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Default Background</label>
                  <select
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50"
                    value={defaultBackground}
                    onChange={(e) => setDefaultBackground(e.target.value)}
                  >
                    <option value="">Select Background...</option>
                    {backgrounds.map(bg => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Glow Color (optional)</label>
                  <input
                    type="text"
                    className="w-full p-2 border border-slate-300 rounded-lg"
                    value={glowColor}
                    onChange={(e) => setGlowColor(e.target.value)}
                    placeholder="#00aeff"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Paste UEFA Squad HTML Source</label>
                <textarea 
                  className="w-full h-40 p-3 border border-slate-300 rounded-lg font-mono text-xs bg-slate-50"
                  value={htmlInput}
                  onChange={(e) => setHtmlInput(e.target.value)}
                  placeholder="Right click on UEFA squad page -> View Page Source -> Copy all and paste here"
                />
                <button 
                  onClick={handleParse}
                  className="mt-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors"
                >
                  Parse Players
                </button>
                <div className="mt-3 flex items-start gap-2">
                  <input
                    id="preprocess-uefa"
                    type="checkbox"
                    checked={preprocessUefa}
                    onChange={(e) => setPreprocessUefa(e.target.checked)}
                  />
                  <label htmlFor="preprocess-uefa" className="text-sm text-slate-600">
                    Run AI background removal and save to <span className="font-mono">/public/img/players-uefa/&lt;TEAM&gt;</span>
                  </label>
                </div>
                {preprocessStatus && (
                  <div className="mt-2 text-sm text-slate-500">
                    Processing: {preprocessStatus}
                  </div>
                )}
              </div>

              {parsedPlayers.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-4 flex items-center justify-between">
                    Parsed Players ({parsedPlayers.length})
                    <span className="text-xs font-normal text-slate-500">Edit display names if needed</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {parsedPlayers.map((player, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <img src={player.imageUrl} alt="" className="w-12 h-12 rounded-full object-cover bg-white" />
                        <div className="flex-1 min-w-0">
                          <input 
                            type="text" 
                            className="w-full bg-transparent font-medium text-sm focus:bg-white px-1 rounded"
                            value={player.name}
                            onChange={(e) => updateParsedPlayer(idx, 'name', e.target.value)}
                          />
                          <input 
                            type="text" 
                            className="w-full bg-transparent text-xs text-indigo-600 focus:bg-white px-1 rounded mt-1"
                            value={player.displayName}
                            onChange={(e) => updateParsedPlayer(idx, 'displayName', e.target.value)}
                          />
                        </div>
                        <div className="text-[10px] font-bold uppercase px-2 py-1 bg-slate-200 rounded text-slate-600">
                          {player.role === 'goalkeeper' ? 'GK' : 'OUT'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setShowAddForm(false)}
                className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveNewTeam}
                disabled={!newTeamName || parsedPlayers.length === 0}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                <Save className="w-4 h-4" /> Save Team to CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
