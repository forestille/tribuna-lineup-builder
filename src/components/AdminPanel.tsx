import { useEffect, useMemo, useState } from 'react';
import { FORMATIONS } from '../constants';
import { AppMode, Formation, Player } from '../types';
import { parseFifaHtml, parseUEFAHtml } from '../services/parser';
import { COMPETITION_CONFIG } from '../competitionConfig';

type MetaRow = {
  team: string;
  background: string;
  glowColor: string;
  defaultFormation: string;
  linkedTeam: string;
};

type PlayerRow = {
  name: string;
  'display-name': string;
  'image-url': string;
  role: string;
};

type FileEntry = {
  name: string;
  type: 'file' | 'dir';
};

const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u02BC']/g, '')
    .toLowerCase();

type Props = {
  mode: AppMode;
};

export default function AdminPanel({ mode }: Props) {
  const config = COMPETITION_CONFIG[mode];
  const [metaRows, setMetaRows] = useState<MetaRow[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamPlayers, setTeamPlayers] = useState<PlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [uploadTarget, setUploadTarget] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [backgrounds, setBackgrounds] = useState<string[]>([]);
  const [htmlInput, setHtmlInput] = useState('');
  const [parsedPlayers, setParsedPlayers] = useState<Player[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [defaultBackground, setDefaultBackground] = useState('');
  const [glowColor, setGlowColor] = useState('');
  const [defaultFormation, setDefaultFormation] = useState<Formation>('4-2-3-1');
  const [preprocessUefa, setPreprocessUefa] = useState(false);
  const [preprocessStatus, setPreprocessStatus] = useState('');
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  const teams = useMemo(() => metaRows.map(r => r.team).filter(Boolean), [metaRows]);

  const loadMeta = async () => {
    setMetaLoading(true);
    try {
      const res = await fetch(`${config.apiBase}/admin/meta`);
      const data = await res.json();
      setMetaRows((data.rows || []) as MetaRow[]);
    } finally {
      setMetaLoading(false);
    }
  };

  const loadPlayers = async (team: string) => {
    if (!team) return;
    setPlayersLoading(true);
    try {
      const res = await fetch(`${config.apiBase}/admin/teams/${encodeURIComponent(team)}/players`);
      const data = await res.json();
      setTeamPlayers((data.rows || []) as PlayerRow[]);
    } finally {
      setPlayersLoading(false);
    }
  };

  const loadFiles = async (path: string) => {
    setFileLoading(true);
    try {
      const res = await fetch(`/api/admin/files?path=${encodeURIComponent(path || '')}`);
      const data = await res.json();
      setFileEntries((data.entries || []) as FileEntry[]);
    } finally {
      setFileLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
    loadFiles('');
    fetch(config.backgroundsApiPath).then(res => res.json()).then(setBackgrounds);
  }, [mode]);

  useEffect(() => {
    if (teamName) loadPlayers(teamName);
  }, [teamName]);

  const validateTeamPlayers = (rows: PlayerRow[]) => {
    const map = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const key = normalizeSearch(r['display-name'] || '');
      if (!key) return;
      const list = map.get(key) || [];
      list.push(i);
      map.set(key, list);
    });
    const duplicates = Array.from(map.entries()).filter(([, idx]) => idx.length > 1);
    if (duplicates.length) {
      return duplicates.map(([name, idx]) => `Duplicate display-name "${name}" at rows ${idx.map(i => i + 1).join(', ')}`);
    }
    return [];
  };

  const getDuplicateDisplayNames = (players: Player[]) => {
    const map = new Map<string, number[]>();
    players.forEach((p, idx) => {
      const key = normalizeSearch(p.displayName || '');
      if (!key) return;
      const list = map.get(key) || [];
      list.push(idx);
      map.set(key, list);
    });
    return Array.from(map.entries()).filter(([, list]) => list.length > 1);
  };

  const saveMeta = async () => {
    await fetch(`${config.apiBase}/admin/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers: ['team', 'background', 'glowColor', 'defaultFormation', 'linkedTeam'], rows: metaRows }),
    });
    await loadMeta();
    localStorage.setItem('teamsUpdated', String(Date.now()));
  };

  const savePlayers = async () => {
    const dupes = validateTeamPlayers(teamPlayers);
    if (dupes.length) {
      setErrors(dupes);
      return;
    }
    setErrors([]);
    await fetch(`${config.apiBase}/admin/teams/${encodeURIComponent(teamName)}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: teamPlayers }),
    });
    await loadPlayers(teamName);
    localStorage.setItem('teamsUpdated', String(Date.now()));
  };

  const deleteTeam = async (team: string) => {
    const normalizedTeam = team.trim();
    if (!normalizedTeam) return;
    const confirmed = window.confirm(`Delete "${normalizedTeam}" and all related player images?`);
    if (!confirmed) return;

    await fetch(`${config.apiBase}/admin/teams/${encodeURIComponent(normalizedTeam)}/delete`, {
      method: 'POST',
    });

    if (teamName === normalizedTeam) {
      setTeamName('');
      setTeamPlayers([]);
    }

    setMetaRows(prev => prev.filter(row => row.team.trim() !== normalizedTeam));
    await loadMeta();
    localStorage.setItem('teamsUpdated', String(Date.now()));
  };

  const addTeamRow = () => {
    setMetaRows(prev => [...prev, { team: '', background: '', glowColor: '', defaultFormation: '', linkedTeam: '' }]);
  };

  const addPlayerRow = () => {
    setTeamPlayers(prev => [...prev, { name: '', 'display-name': '', 'image-url': '', role: 'outfield' }]);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    const arrayBuffer = await uploadFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    await fetch('/api/admin/files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: uploadTarget, name: uploadFile.name, contentBase64: base64 }),
    });
    setUploadFile(null);
    await loadFiles(uploadTarget);
    localStorage.setItem('teamsUpdated', String(Date.now()));
  };

  const updateParsedPlayer = (index: number, field: keyof Player, value: string) => {
    setParsedPlayers(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
    setParseErrors([]);
  };

  const handleParse = () => {
    const players = mode === 'world-cup' ? parseFifaHtml(htmlInput) : parseUEFAHtml(htmlInput);
    setParsedPlayers(players);
    setParseErrors([]);
  };

  const handleSaveNewTeam = async () => {
    if (!newTeamName || parsedPlayers.length === 0) return;
    const duplicates = getDuplicateDisplayNames(parsedPlayers);
    if (duplicates.length) {
      setParseErrors(
        duplicates.map(([name, idx]) => `Duplicate display-name \"${name}\" at rows ${idx.map(i => i + 1).join(', ')}`)
      );
      return;
    }
    const doPreprocess = mode === 'world-cup' || preprocessUefa;
    if (doPreprocess) {
      setPreprocessStatus(mode === 'world-cup' ? 'Downloading portraits...' : 'Starting...');
      setIsPreprocessing(true);
    }
    const res = await fetch(`${config.apiBase}/save-team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamName: newTeamName,
        players: parsedPlayers,
        background: defaultBackground,
        glowColor,
        defaultFormation,
        preprocessUefa: mode === 'world-cup' ? false : doPreprocess
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
                setPreprocessStatus(mode === 'world-cup' ? `Downloading portraits ${evt.current}/${evt.total}` : `${evt.current}/${evt.total}`);
              }
              if (evt.type === 'error') {
                setPreprocessStatus(`Error: ${evt.player || ''} ${evt.current}/${evt.total}`);
              }
              if (evt.type === 'done') {
                setPreprocessStatus('Done');
                setIsPreprocessing(false);
                await loadMeta();
                setHtmlInput('');
                setParsedPlayers([]);
                setNewTeamName('');
                setDefaultBackground('');
                setGlowColor('');
                setDefaultFormation('4-2-3-1');
                setPreprocessUefa(false);
                setPreprocessStatus('');
                localStorage.setItem('teamsUpdated', String(Date.now()));
                return;
              }
            } catch {}
          }
        }
      }
      setIsPreprocessing(false);
    }

    await loadMeta();
    setHtmlInput('');
    setParsedPlayers([]);
    setNewTeamName('');
    setDefaultBackground('');
    setGlowColor('');
    setDefaultFormation('4-2-3-1');
    setPreprocessUefa(false);
    setPreprocessStatus('');
    localStorage.setItem('teamsUpdated', String(Date.now()));
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        <h1 className="text-2xl font-bold">{config.title} Admin</h1>

        <section className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Add New Team</h2>
            <button
              className="px-3 py-1 rounded bg-indigo-600 text-white text-sm"
              onClick={handleSaveNewTeam}
              disabled={!newTeamName || parsedPlayers.length === 0 || parseErrors.length > 0 || isPreprocessing}
            >
              Save Team
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Team Name</label>
              <input
                type="text"
                className="w-full p-2 border border-slate-300 rounded-lg"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Default Formation</label>
              <select
                className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50"
                value={defaultFormation}
                onChange={(e) => setDefaultFormation(e.target.value as Formation)}
              >
                {FORMATIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">{config.importLabel}</label>
            <textarea
              className="w-full h-32 p-3 border border-slate-300 rounded-lg font-mono text-xs bg-slate-50"
              value={htmlInput}
              onChange={(e) => setHtmlInput(e.target.value)}
            />
            <button className="mt-2 px-4 py-2 bg-slate-800 text-white rounded-lg" onClick={handleParse}>
              Parse Players
            </button>
            {mode === 'world-cup' ? (
              <div className="mt-3 text-sm text-slate-600">
                Portraits will be downloaded automatically to <span className="font-mono">/public/img/{config.preprocessFolder}/&lt;TEAM&gt;</span>, with FIFA quality forced to 100 and the lower 40% cropped off.
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2">
                <input
                  id="admin-preprocess-uefa"
                  type="checkbox"
                  checked={preprocessUefa}
                  onChange={(e) => setPreprocessUefa(e.target.checked)}
                />
                <label htmlFor="admin-preprocess-uefa" className="text-sm text-slate-600">
                  Run AI background removal and save to <span className="font-mono">/public/img/{config.preprocessFolder}/&lt;TEAM&gt;</span>
                </label>
              </div>
            )}
            {preprocessStatus && (
              <div className="mt-2 text-sm text-slate-500">Processing: {preprocessStatus}</div>
            )}
          </div>
          {parseErrors.length > 0 && (
            <div className="mb-4 text-sm text-red-600">
              {parseErrors.map((err, i) => <div key={i}>{err}</div>)}
            </div>
          )}
          {parsedPlayers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {parsedPlayers.map((player, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <img src={player.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-white" />
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      className="w-full bg-transparent text-sm font-medium focus:bg-white px-1 rounded"
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
          )}
        </section>

        <section className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Teams Meta</h2>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded bg-slate-800 text-white text-sm" onClick={addTeamRow}>Add Row</button>
              <button className="px-3 py-1 rounded bg-indigo-600 text-white text-sm" onClick={saveMeta} disabled={metaLoading}>Save</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="p-2 border-b">Team</th>
                  <th className="p-2 border-b">Background</th>
                  <th className="p-2 border-b">Glow</th>
                  <th className="p-2 border-b">Default Formation</th>
                  <th className="p-2 border-b">Linked Team</th>
                  <th className="p-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {metaRows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="p-2 border-b">
                      <input className="w-full border p-1" value={row.team} onChange={e => {
                        const v = e.target.value;
                        setMetaRows(prev => prev.map((r, i) => i === idx ? { ...r, team: v } : r));
                      }} />
                    </td>
                    <td className="p-2 border-b">
                      <input className="w-full border p-1" value={row.background} onChange={e => {
                        const v = e.target.value;
                        setMetaRows(prev => prev.map((r, i) => i === idx ? { ...r, background: v } : r));
                      }} />
                    </td>
                    <td className="p-2 border-b">
                      <input className="w-full border p-1" value={row.glowColor} onChange={e => {
                        const v = e.target.value;
                        setMetaRows(prev => prev.map((r, i) => i === idx ? { ...r, glowColor: v } : r));
                      }} />
                    </td>
                    <td className="p-2 border-b">
                      <select className="w-full border p-1" value={row.defaultFormation} onChange={e => {
                        const v = e.target.value;
                        setMetaRows(prev => prev.map((r, i) => i === idx ? { ...r, defaultFormation: v } : r));
                      }}>
                        <option value="">-</option>
                        {FORMATIONS.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 border-b">
                      <select
                        className="w-full border p-1 bg-white"
                        value={row.linkedTeam}
                        onChange={e => {
                          const v = e.target.value;
                          setMetaRows(prev => prev.map((r, i) => i === idx ? { ...r, linkedTeam: v } : r));
                        }}
                      >
                        <option value="">-</option>
                        {teams
                          .filter(team => team !== row.team)
                          .map(team => (
                            <option key={team} value={team}>{team}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 border-b align-top">
                      <button
                        className="px-2 py-1 rounded bg-red-50 text-red-700 text-xs border border-red-200 disabled:opacity-50"
                        disabled={!row.team.trim()}
                        onClick={() => deleteTeam(row.team)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Team Players</h2>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded bg-slate-800 text-white text-sm" onClick={addPlayerRow} disabled={!teamName}>Add Row</button>
              <button className="px-3 py-1 rounded bg-indigo-600 text-white text-sm" onClick={savePlayers} disabled={!teamName || playersLoading}>Save</button>
            </div>
          </div>
          <div className="mb-3 flex gap-3 items-center">
            <select className="border p-2" value={teamName} onChange={e => setTeamName(e.target.value)}>
              <option value="">Select team...</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.length > 0 && (
              <div className="text-sm text-red-600">
                {errors.map((err, i) => <div key={i}>{err}</div>)}
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="p-2 border-b">Name</th>
                  <th className="p-2 border-b">Display Name</th>
                  <th className="p-2 border-b">Image URL</th>
                  <th className="p-2 border-b">Role</th>
                </tr>
              </thead>
              <tbody>
                {teamPlayers.map((row, idx) => (
                  <tr key={idx}>
                    <td className="p-2 border-b">
                      <input className="w-full border p-1" value={row.name} onChange={e => {
                        const v = e.target.value;
                        setTeamPlayers(prev => prev.map((r, i) => i === idx ? { ...r, name: v } : r));
                      }} />
                    </td>
                    <td className="p-2 border-b">
                      <input className="w-full border p-1" value={row['display-name']} onChange={e => {
                        const v = e.target.value;
                        setTeamPlayers(prev => prev.map((r, i) => i === idx ? { ...r, 'display-name': v } : r));
                      }} />
                    </td>
                    <td className="p-2 border-b">
                      <input className="w-full border p-1" value={row['image-url']} onChange={e => {
                        const v = e.target.value;
                        setTeamPlayers(prev => prev.map((r, i) => i === idx ? { ...r, 'image-url': v } : r));
                      }} />
                    </td>
                    <td className="p-2 border-b">
                      <select className="w-full border p-1" value={row.role} onChange={e => {
                        const v = e.target.value;
                        setTeamPlayers(prev => prev.map((r, i) => i === idx ? { ...r, role: v } : r));
                      }}>
                        <option value="goalkeeper">goalkeeper</option>
                        <option value="outfield">outfield</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Image Files</h2>
            <button className="px-3 py-1 rounded bg-indigo-600 text-white text-sm" onClick={() => loadFiles(filePath)} disabled={fileLoading}>Refresh</button>
          </div>
          <div className="flex gap-3 items-center mb-3">
            <input className="border p-2 flex-1" placeholder={`Path inside /public/img (e.g. ${config.preprocessFolder}/Italy)`} value={filePath} onChange={e => setFilePath(e.target.value)} />
            <button className="px-3 py-2 rounded bg-slate-800 text-white text-sm" onClick={() => loadFiles(filePath)}>Open</button>
          </div>
          <div className="border rounded p-2 mb-3 text-sm bg-slate-50">
            {fileEntries.map((entry, idx) => (
              <div key={`${entry.name}-${idx}`} className="flex items-center justify-between py-1 border-b last:border-0">
                <span>{entry.type === 'dir' ? '[dir]' : '[file]'} {entry.name}</span>
                <div className="flex gap-2">
                  <button
                    className="text-xs text-red-600"
                    onClick={async () => {
                      await fetch('/api/admin/files/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: `${filePath ? `${filePath}/` : ''}${entry.name}` })
                      });
                      await loadFiles(filePath);
                    }}
                  >
                    Delete
                  </button>
                  <button
                    className="text-xs text-slate-600"
                    onClick={async () => {
                      const to = prompt('Rename to:', entry.name);
                      if (!to) return;
                      await fetch('/api/admin/files/rename', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          from: `${filePath ? `${filePath}/` : ''}${entry.name}`,
                          to: `${filePath ? `${filePath}/` : ''}${to}`
                        })
                      });
                      await loadFiles(filePath);
                    }}
                  >
                    Rename
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 items-center">
            <input className="border p-2" placeholder={`Target path (e.g. ${config.preprocessFolder}/Italy)`} value={uploadTarget} onChange={e => setUploadTarget(e.target.value)} />
            <input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
            <button className="px-3 py-2 rounded bg-indigo-600 text-white text-sm" onClick={handleUpload} disabled={!uploadFile}>Upload</button>
          </div>
        </section>
      </div>
    </div>
  );
}
