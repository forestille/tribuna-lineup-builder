import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Team, LineupState, Formation, Player, AppMode } from './types';
import TeamManager from './components/TeamManager';
import LineupPreview from './components/LineupPreview';
import PlayerPhotoEditor, { type PlayerPhotoCrop, type PlayerPhotoEditorResult } from './components/PlayerPhotoEditor';
import LogoSelectField, { type LogoOption } from './components/LogoSelectField';
import { FORMATIONS, FORMATION_POSITIONS } from './constants';
import { ClipboardPaste, Layout, Image as ImageIcon, Users, Settings, Download, Pencil, Search, Upload } from 'lucide-react';
import { COMPETITION_CONFIG } from './competitionConfig';

const placeholderAvatar =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>` +
      `<rect width='64' height='64' rx='32' fill='%23e2e8f0'/>` +
      `<circle cx='32' cy='26' r='12' fill='%23cbd5e1'/>` +
      `<rect x='14' y='40' width='36' height='14' rx='7' fill='%23cbd5e1'/>` +
    `</svg>`
  );

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u02BC']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const isRemoteUrl = (value: string) => /^https?:\/\//i.test(value);
const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'ʼ]/g, '')
    .toLowerCase();

const makeTemporaryPlayer = (value: string, role: Player['role']): Player => ({
  name: value.trim(),
  displayName: value.trim(),
  imageUrl: '/img/placeholder-player.webp',
  role,
  isTemporary: true,
});

const getLocalCandidates = (teamName: string, displayName: string, folders: string[]) => {
  const teamFolder = teamName ? encodeURIComponent(teamName) : '';
  const slug = slugify(displayName || '');
  if (!slug) return [];
  const extensions = ['png', 'webp', 'jpg', 'jpeg'];
  const bases = folders.flatMap(folder =>
    extensions.map(ext =>
      teamFolder
        ? `${folder}/${teamFolder}/${encodeURIComponent(slug)}.${ext}`
        : `${folder}/${encodeURIComponent(slug)}.${ext}`
    )
  );
  return bases;
};

const getImageUrlLocalCandidate = (teamName: string, imageUrl: string) => {
  const raw = String(imageUrl || '').trim();
  if (!raw || isRemoteUrl(raw) || raw.startsWith('/') || raw.startsWith('blob:')) return raw;
  const teamFolder = teamName ? encodeURIComponent(teamName) : '';
  return teamFolder ? `/img/players/${teamFolder}/${encodeURIComponent(raw)}` : `/img/players/${encodeURIComponent(raw)}`;
};

const getPlayerImageTeam = (fallbackTeamName: string, player?: Player | null) =>
  player?.teamName || fallbackTeamName;

const Thumb = ({
  sources,
  className,
}: {
  sources: string[];
  className?: string;
}) => {
  const [idx, setIdx] = useState(0);
  const src = sources[idx] || placeholderAvatar;
  return (
    <img
      src={src}
      onError={() => {
        if (idx < sources.length - 1) {
          setIdx(idx + 1);
        } else if (src !== placeholderAvatar) {
          setIdx(sources.length);
        }
      }}
      alt=""
      className={className}
    />
  );
};

type Props = {
  mode: AppMode;
};

export default function App({ mode }: Props) {
  const config = COMPETITION_CONFIG[mode];
  const initialState: LineupState = {
    teamName: '',
    formation: '4-2-3-1',
    players: {},
    subs: '',
    tournamentLogo: '',
    tournamentLogoMonochrome: true,
    matchday: '',
    homeLogo: '',
    awayLogo: '',
    background: '',
    glowColor: '',
    possibleLineup: false,
    possibleLineupText: 'Possible\nline-up',
  };
  const [state, setState] = useState<LineupState>(initialState);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [includeLinkedTeam, setIncludeLinkedTeam] = useState(false);
  const [backgrounds, setBackgrounds] = useState<string[]>([]);
  const [tournamentLogoOptions, setTournamentLogoOptions] = useState<LogoOption[]>([]);
  const [teamLogoOptions, setTeamLogoOptions] = useState<LogoOption[]>([]);
  const [searchTerm, setSearchTerm] = useState<Record<string, string>>({});
  const [openDropdown, setOpenDropdown] = useState<Record<string, boolean>>({});
  const [photoTarget, setPhotoTarget] = useState<string | null>(null);
  const [photoPasteError, setPhotoPasteError] = useState<Record<string, string>>({});
  const [photoEditor, setPhotoEditor] = useState<{ posId: string; sourceUrl: string; revokeSourceOnClose: boolean } | null>(null);
  const latestPlayersRef = useRef(state.players);
  const latestSearchTermRef = useRef(searchTerm);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoSourceUrlsRef = useRef<Record<string, string>>({});
  const photoCropSettingsRef = useRef<Record<string, PlayerPhotoCrop>>({});

  useEffect(() => {
    fetch(config.backgroundsApiPath).then(res => res.json()).then(setBackgrounds);
    fetch(`${config.apiBase}/logo-options/tournament`)
      .then(res => res.json())
      .then(data => setTournamentLogoOptions(Array.isArray(data.options) ? data.options : []))
      .catch(() => setTournamentLogoOptions([]));
    fetch(`${config.apiBase}/logo-options/team`)
      .then(res => res.json())
      .then(data => setTeamLogoOptions(Array.isArray(data.options) ? data.options : []))
      .catch(() => setTeamLogoOptions([]));
  }, [config.apiBase, config.backgroundsApiPath]);

  useEffect(() => {
    latestPlayersRef.current = state.players;
  }, [state.players]);

  useEffect(() => {
    latestSearchTermRef.current = searchTerm;
  }, [searchTerm]);

const handleTeamSelect = (team: Team) => {
    const fallbackBg = backgrounds.find(b => b.toLowerCase() === `${team.name.toLowerCase()}.png`)
      || backgrounds.find(b => b.toLowerCase() === `${team.name.toLowerCase()}.jpg`)
      || backgrounds.find(b => b.toLowerCase() === `${team.name.toLowerCase()}.jpeg`)
      || backgrounds.find(b => b.toLowerCase() === `${team.name.toLowerCase()}.webp`)
      || '';
    setCurrentTeam(team);
    setState(prev => {
      const sameTeam = prev.teamName === team.name;
      return {
        ...prev,
        teamName: team.name,
        players: sameTeam ? prev.players : {},
        subs: sameTeam ? prev.subs : '',
        formation: sameTeam ? prev.formation : (team.defaultFormation || prev.formation),
        background: team.defaultBackground ?? fallbackBg ?? prev.background,
        glowColor: team.glowColor ?? ''
      };
    });
    setSearchTerm({});
  };

  const updatePlayer = (posId: string, player: Player | null) => {
    const editableSourceUrl = photoSourceUrlsRef.current[posId];
    if (editableSourceUrl) {
      URL.revokeObjectURL(editableSourceUrl);
      delete photoSourceUrlsRef.current[posId];
    }
    delete photoCropSettingsRef.current[posId];
    setPhotoPasteError(prev => ({ ...prev, [posId]: '' }));
    setState(prev => {
      const previous = prev.players[posId];
      if (previous?.imageUrl.startsWith('blob:') && previous.imageUrl !== player?.imageUrl) {
        URL.revokeObjectURL(previous.imageUrl);
      }
      return {
        ...prev,
        players: { ...prev.players, [posId]: player }
      };
    });
    if (!player) {
      setSearchTerm(prev => ({ ...prev, [posId]: '' }));
    }
  };

  const handlePhotoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const posId = photoTarget;
    event.target.value = '';
    setPhotoTarget(null);
    if (!file || !posId || !file.type.startsWith('image/')) return;

    const current = state.players[posId];
    if (!current?.isTemporary) return;
    setPhotoPasteError(prev => ({ ...prev, [posId]: '' }));
    setPhotoEditor({ posId, sourceUrl: URL.createObjectURL(file), revokeSourceOnClose: true });
  };

  const openPlayerPhotoUpload = (posId: string) => {
    const current = state.players[posId];
    if (!current?.isTemporary) return;
    setPhotoPasteError(prev => ({ ...prev, [posId]: '' }));
    setPhotoTarget(posId);
    photoInputRef.current?.click();
  };

  const pastePlayerPhoto = async (posId: string) => {
    const current = state.players[posId];
    if (!current?.isTemporary) return;

    if (!navigator.clipboard?.read) {
      setPhotoPasteError(prev => ({
        ...prev,
        [posId]: 'Clipboard image paste is not supported by this browser.',
      }));
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (!imageType) continue;
        const imageBlob = await item.getType(imageType);
        setPhotoPasteError(prev => ({ ...prev, [posId]: '' }));
        setPhotoEditor({
          posId,
          sourceUrl: URL.createObjectURL(imageBlob),
          revokeSourceOnClose: true,
        });
        return;
      }
      setPhotoPasteError(prev => ({
        ...prev,
        [posId]: 'Copy an image first, then click Paste.',
      }));
    } catch (error) {
      const permissionBlocked = error instanceof DOMException && error.name === 'NotAllowedError';
      setPhotoPasteError(prev => ({
        ...prev,
        [posId]: permissionBlocked
          ? 'Clipboard access was blocked. Allow clipboard permission and try again.'
          : 'The copied image could not be read.',
      }));
    }
  };

  const openPlayerPhotoEditor = (posId: string) => {
    const current = state.players[posId];
    if (!current?.isTemporary) return;
    if (current.imageUrl.startsWith('blob:')) {
      setPhotoEditor({
        posId,
        sourceUrl: photoSourceUrlsRef.current[posId] || current.imageUrl,
        revokeSourceOnClose: false,
      });
      return;
    }
    openPlayerPhotoUpload(posId);
  };

  const closePhotoEditor = () => {
    if (photoEditor?.revokeSourceOnClose) URL.revokeObjectURL(photoEditor.sourceUrl);
    setPhotoEditor(null);
  };

  const applyEditedPhoto = ({ blob, sourceBlob, crop }: PlayerPhotoEditorResult) => {
    if (!photoEditor) return;
    const { posId, sourceUrl, revokeSourceOnClose } = photoEditor;
    const objectUrl = URL.createObjectURL(blob);
    const editableSourceUrl = URL.createObjectURL(sourceBlob);
    const currentPlayer = state.players[posId];
    if (!currentPlayer?.isTemporary) {
      URL.revokeObjectURL(objectUrl);
      URL.revokeObjectURL(editableSourceUrl);
      if (revokeSourceOnClose) URL.revokeObjectURL(sourceUrl);
      setPhotoEditor(null);
      return;
    }
    if (currentPlayer.imageUrl.startsWith('blob:')) URL.revokeObjectURL(currentPlayer.imageUrl);
    const previousEditableSourceUrl = photoSourceUrlsRef.current[posId];
    if (previousEditableSourceUrl) URL.revokeObjectURL(previousEditableSourceUrl);
    photoSourceUrlsRef.current[posId] = editableSourceUrl;
    photoCropSettingsRef.current[posId] = crop;
    setState(prev => {
      const current = prev.players[posId];
      if (!current?.isTemporary) return prev;
      return {
        ...prev,
        players: {
          ...prev.players,
          [posId]: { ...current, imageUrl: objectUrl },
        },
      };
    });
    if (revokeSourceOnClose) URL.revokeObjectURL(sourceUrl);
    setPhotoEditor(null);
  };

  const positions = FORMATION_POSITIONS[state.formation];
  const getFilteredPlayers = (role: Player['role'], term: string) => {
    const players = currentTeam?.players || [];
    const filtered = players.filter(p => p.role === role);
    const normalizedTerm = normalizeSearch(term || '').trim();
    if (!normalizedTerm) return filtered;
    return filtered.filter(p => {
      const name = normalizeSearch(p.name || '');
      const display = normalizeSearch(p.displayName || '');
      return name.includes(normalizedTerm) || display.includes(normalizedTerm);
    });
  };

  const syncPlayerFromInput = (posId: string, role: Player['role']) => {
    const rawValue = (latestSearchTermRef.current[posId] || '').trim();
    if (!rawValue) {
      updatePlayer(posId, null);
      return;
    }

    const selectedPlayer = latestPlayersRef.current[posId];
    const normalizedRaw = normalizeSearch(rawValue);
    const selectedMatches =
      selectedPlayer &&
      (normalizeSearch(selectedPlayer.name) === normalizedRaw ||
        normalizeSearch(selectedPlayer.displayName) === normalizedRaw);

    if (selectedMatches) {
      return;
    }

    updatePlayer(posId, makeTemporaryPlayer(rawValue, role));
  };

  return (
    <>
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar Controls */}
      <div className="w-full lg:w-1/2 p-4 lg:p-8 overflow-y-auto lg:h-screen border-r border-slate-200">
        <div className="max-w-2xl mx-auto">
          <TeamManager
            mode={mode}
            onTeamSelect={handleTeamSelect}
            includeLinkedTeam={includeLinkedTeam}
            onIncludeLinkedTeamChange={setIncludeLinkedTeam}
          />

          {currentTeam && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handlePhotoSelected}
              />
              {/* Formation & Background */}
              <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Layout className="w-5 h-5 text-indigo-600" />
                  Layout & Style
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Formation</label>
                    <select 
                      className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50"
                      value={state.formation}
                      onChange={(e) => setState(prev => ({ ...prev, formation: e.target.value as Formation }))}
                    >
                      {FORMATIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Background</label>
                    <select 
                      className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50"
                      value={state.background}
                      onChange={(e) => setState(prev => ({ ...prev, background: e.target.value }))}
                    >
                      <option value="">Select Background...</option>
                      {backgrounds.map(bg => <option key={bg} value={bg}>{bg}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Match Info */}
              <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-600" />
                  Match Information
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="possible-lineup"
                      type="checkbox"
                      checked={state.possibleLineup}
                      onChange={(e) => setState(prev => ({ ...prev, possibleLineup: e.target.checked }))}
                    />
                    <label htmlFor="possible-lineup" className="text-sm font-medium text-slate-700">
                      Possible lineup
                    </label>
                  </div>
                  {!state.possibleLineup && (
                    <>
                      <div>
                        <LogoSelectField
                          label="Tournament Logo"
                          options={tournamentLogoOptions}
                          value={state.tournamentLogo}
                          onChange={(value) => setState(prev => ({ ...prev, tournamentLogo: value }))}
                          placeholder="Search tournament logos..."
                        />
                        <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={state.tournamentLogoMonochrome}
                            onChange={(e) => setState(prev => ({ ...prev, tournamentLogoMonochrome: e.target.checked }))}
                          />
                          Monochrome (force white)
                        </label>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Matchday / Stage Name</label>
                        <textarea
                          rows={3}
                          className="h-20 w-full resize-y rounded-lg border border-slate-300 p-2"
                          value={state.matchday}
                          onChange={(e) => setState(prev => ({ ...prev, matchday: e.target.value }))}
                          placeholder="e.g. Matchday 1"
                        />
                      </div>
                    </>
                  )}
                  {state.possibleLineup && (
                    <textarea
                      className="w-full h-24 p-3 border border-slate-300 rounded-lg bg-slate-50 text-sm"
                      value={state.possibleLineupText}
                      onChange={(e) => setState(prev => ({ ...prev, possibleLineupText: e.target.value }))}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <LogoSelectField
                        label="Home Team Logo"
                        options={teamLogoOptions}
                        value={state.homeLogo}
                        onChange={(value) => setState(prev => ({ ...prev, homeLogo: value }))}
                        placeholder="Search team logos..."
                      />
                    </div>
                    <div>
                      <LogoSelectField
                        label="Away Team Logo"
                        options={teamLogoOptions}
                        value={state.awayLogo}
                        onChange={(value) => setState(prev => ({ ...prev, awayLogo: value }))}
                        placeholder="Search team logos..."
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Lineup Selection */}
              <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  Starting Lineup
                </h2>
                {currentTeam?.linkedTeam && (
                  <label className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={includeLinkedTeam}
                      onChange={(e) => setIncludeLinkedTeam(e.target.checked)}
                    />
                    View all players
                  </label>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {positions.map(pos => (
                    <div key={pos.id} className="relative">
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">{pos.label}</label>
                      <div className="relative">
                        <input 
                          type="text"
                          className="w-full p-2 pl-8 border border-slate-300 rounded-lg bg-slate-50 text-sm"
                          placeholder={`Search ${pos.role}...`}
                          value={searchTerm[pos.id] || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSearchTerm(prev => ({ ...prev, [pos.id]: value }));
                            if (value.trim() === '') {
                              updatePlayer(pos.id, null);
                              return;
                            }
                            setOpenDropdown(prev => ({ ...prev, [pos.id]: true }));
                          }}
                          onFocus={() => setOpenDropdown(prev => ({ ...prev, [pos.id]: true }))}
                          onBlur={() => {
                            window.setTimeout(() => {
                              syncPlayerFromInput(pos.id, pos.role);
                              setOpenDropdown(prev => ({ ...prev, [pos.id]: false }));
                            }, 150);
                          }}
                        />
                        <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                      </div>

                      {openDropdown[pos.id] && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {getFilteredPlayers(pos.role, searchTerm[pos.id] || '').map(p => {
                            const imageTeamName = getPlayerImageTeam(state.teamName, p);
                            const localCandidates = getLocalCandidates(imageTeamName, p.displayName || p.name, config.playerImageFolders);
                            const imageUrlLocal = getImageUrlLocalCandidate(imageTeamName, p.imageUrl || '');
                            const sources = [
                              ...localCandidates,
                              ...(imageUrlLocal ? [imageUrlLocal] : []),
                              ...(isRemoteUrl(p.imageUrl) ? [p.imageUrl] : []),
                            ].filter(Boolean) as string[];
                            return (
                            <button
                              key={`${pos.id}-${p.name}`}
                              className="w-full text-left p-2 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-50 last:border-0"
                              onClick={() => {
                                updatePlayer(pos.id, p);
                                setSearchTerm(prev => ({ ...prev, [pos.id]: p.name }));
                                setOpenDropdown(prev => ({ ...prev, [pos.id]: false }));
                              }}
                            >
                              <Thumb sources={sources} className="w-8 h-8 rounded-full object-cover bg-slate-100" />
                              <span className="text-sm font-medium">{p.name}</span>
                            </button>
                          )})}
                          {getFilteredPlayers(pos.role, searchTerm[pos.id] || '').length === 0 && (
                            <div className="p-2 text-sm text-slate-500">No matches</div>
                          )}
                        </div>
                      )}

                      {state.players[pos.id] && (
                        <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                              <Thumb
                                sources={[
                                  ...getLocalCandidates(
                                    getPlayerImageTeam(state.teamName, state.players[pos.id]),
                                    state.players[pos.id]?.displayName || state.players[pos.id]?.name || '',
                                    config.playerImageFolders
                                  ),
                                  ...(getImageUrlLocalCandidate(getPlayerImageTeam(state.teamName, state.players[pos.id]), state.players[pos.id]?.imageUrl || '') ? [getImageUrlLocalCandidate(getPlayerImageTeam(state.teamName, state.players[pos.id]), state.players[pos.id]?.imageUrl || '')] : []),
                                  ...(isRemoteUrl(state.players[pos.id]?.imageUrl || '') ? [state.players[pos.id]?.imageUrl] : []),
                                ].filter(Boolean) as string[]}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                              <span className="truncate text-sm font-semibold text-indigo-900">{state.players[pos.id]?.displayName}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {state.players[pos.id]?.isTemporary && (
                                state.players[pos.id]?.imageUrl.startsWith('blob:') ? (
                                  <button
                                    type="button"
                                    onClick={() => openPlayerPhotoEditor(pos.id)}
                                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                    title="Adjust the current crop"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit image
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void pastePlayerPhoto(pos.id)}
                                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                      title="Paste a copied image"
                                    >
                                      <ClipboardPaste className="h-3.5 w-3.5" />
                                      Paste
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openPlayerPhotoUpload(pos.id)}
                                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                      title="Upload an image"
                                    >
                                      <Upload className="h-3.5 w-3.5" />
                                      Upload
                                    </button>
                                  </>
                                )
                              )}
                              <button
                                type="button"
                                onClick={() => updatePlayer(pos.id, null)}
                                className="p-1 text-indigo-400 hover:text-indigo-600"
                                aria-label={`Remove ${state.players[pos.id]?.displayName}`}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          {photoPasteError[pos.id] && (
                            <p className="mt-1 text-right text-xs text-red-600">{photoPasteError[pos.id]}</p>
                          )}
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              </section>

              {/* Substitutes */}
              {!state.possibleLineup && (
                <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="text-lg font-semibold mb-4">Substitutes</h2>
                  <textarea 
                    className="w-full h-32 p-3 border border-slate-300 rounded-lg bg-slate-50 text-sm"
                    placeholder="Enter substitute names, one per line..."
                    value={state.subs}
                    onChange={(e) => setState(prev => ({ ...prev, subs: e.target.value }))}
                  />
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview Window */}
      <div className="w-full lg:w-1/2 p-4 lg:p-8 bg-slate-900 flex items-center justify-center lg:h-screen sticky top-0">
        <div className="w-full max-w-[540px]">
          <div className="flex justify-between items-center mb-4 text-white">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Live Preview
            </h2>
            <button 
              onClick={() => {
                const canvas = document.querySelector('canvas');
                if (canvas) {
                  const link = document.createElement('a');
                  link.download = `${state.teamName || 'lineup'}.png`;
                  link.href = canvas.toDataURL();
                  link.click();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" /> Download PNG
            </button>
          </div>
          <LineupPreview state={state} mode={mode} />
          <p className="text-slate-500 text-xs mt-4 text-center">
            The graphic is rendered at 1080x1350px. Changes are reflected in real-time.
          </p>
        </div>
      </div>
    </div>
    {photoEditor && state.players[photoEditor.posId]?.isTemporary && (
      <PlayerPhotoEditor
        playerName={state.players[photoEditor.posId]?.displayName || 'Player'}
        sourceUrl={photoEditor.sourceUrl}
        initialCrop={photoCropSettingsRef.current[photoEditor.posId]}
        onCancel={closePhotoEditor}
        onApply={applyEditedPhoto}
      />
    )}
    </>
  );
}
