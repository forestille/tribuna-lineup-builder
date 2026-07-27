import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleOff, Copy, Download, Flag, RotateCcw } from 'lucide-react';
import LogoSelectField, { type LogoOption } from './LogoSelectField';

const ARTBOARD_WIDTH = 1728;
const ARTBOARD_HEIGHT = 2160;
const FLAG_SIZE = 214;

type BracketSlot = {
  id: string;
  label: string;
  row: number;
  side: 'left' | 'right';
  x: number;
  y: number;
};

type BracketSlotState = {
  flag: string;
  official: boolean;
};

const LEFT_ROW_X = [88, 390] as const;
const RIGHT_ROW_X = [1124, 1426] as const;
const ROW_YS = [230, 470, 710, 950, 1190, 1430, 1670, 1910] as const;

const createSlots = () => {
  const slots: BracketSlot[] = [];

  ROW_YS.forEach((y, rowIndex) => {
    LEFT_ROW_X.forEach((x, columnIndex) => {
      slots.push({
        id: `left-${rowIndex + 1}-${columnIndex + 1}`,
        label: `Left ${rowIndex + 1}${columnIndex === 0 ? 'A' : 'B'}`,
        row: rowIndex,
        side: 'left',
        x,
        y,
      });
    });

    RIGHT_ROW_X.forEach((x, columnIndex) => {
      slots.push({
        id: `right-${rowIndex + 1}-${columnIndex + 1}`,
        label: `Right ${rowIndex + 1}${columnIndex === 0 ? 'A' : 'B'}`,
        row: rowIndex,
        side: 'right',
        x,
        y,
      });
    });
  });

  return slots;
};

const BRACKET_SLOTS = createSlots();
const GROUPED_SLOTS: Array<{ label: string; slots: BracketSlot[] }> = [
  { label: 'Left 1-4', slots: BRACKET_SLOTS.filter(slot => slot.side === 'left' && slot.row < 4) },
  { label: 'Left 5-8', slots: BRACKET_SLOTS.filter(slot => slot.side === 'left' && slot.row >= 4) },
  { label: 'Right 1-4', slots: BRACKET_SLOTS.filter(slot => slot.side === 'right' && slot.row < 4) },
  { label: 'Right 5-8', slots: BRACKET_SLOTS.filter(slot => slot.side === 'right' && slot.row >= 4) },
];
const GROUPED_SLOT_ROWS = [
  [GROUPED_SLOTS[0], GROUPED_SLOTS[2]],
  [GROUPED_SLOTS[1], GROUPED_SLOTS[3]],
];
const VS_LABELS = [
  ...ROW_YS.map((y, rowIndex) => ({
    id: `left-vs-${rowIndex}`,
    x: (LEFT_ROW_X[0] + FLAG_SIZE + LEFT_ROW_X[1]) / 2,
    y: y + FLAG_SIZE / 2,
  })),
  ...ROW_YS.map((y, rowIndex) => ({
    id: `right-vs-${rowIndex}`,
    x: (RIGHT_ROW_X[0] + FLAG_SIZE + RIGHT_ROW_X[1]) / 2,
    y: y + FLAG_SIZE / 2,
  })),
];

const DEFAULT_SLOT_VALUES: Record<string, BracketSlotState> = {
  'left-1-1': { flag: 'local:Germany', official: true },
  'left-1-2': { flag: 'local:Paraguay', official: false },
  'left-2-1': { flag: 'local:France', official: false },
  'left-2-2': { flag: 'local:Sweden', official: false },
  'left-3-1': { flag: 'local:South Africa', official: true },
  'left-3-2': { flag: 'local:Canada', official: true },
  'left-4-1': { flag: 'local:Netherlands', official: false },
  'left-4-2': { flag: 'local:Morocco', official: true },
  'left-5-1': { flag: 'local:Portugal', official: false },
  'left-5-2': { flag: 'local:Ghana', official: false },
  'left-6-1': { flag: 'local:Spain', official: false },
  'left-6-2': { flag: 'local:Austria', official: false },
  'left-7-1': { flag: 'local:United States', official: true },
  'left-7-2': { flag: 'local:Bosnia and Herzegovina', official: false },
  'left-8-1': { flag: 'local:Egypt', official: false },
  'left-8-2': { flag: 'local:South Korea', official: false },
  'right-1-1': { flag: 'local:Brazil', official: true },
  'right-1-2': { flag: 'local:Japan', official: false },
  'right-2-1': { flag: 'local:Ivory Coast', official: false },
  'right-2-2': { flag: 'local:Norway', official: false },
  'right-3-1': { flag: 'local:Mexico', official: true },
  'right-3-2': { flag: 'local:Scotland', official: false },
  'right-4-1': { flag: 'local:England', official: false },
  'right-4-2': { flag: 'local:Cape Verde', official: false },
  'right-5-1': { flag: 'local:Argentina', official: true },
  'right-5-2': { flag: 'local:Uruguay', official: false },
  'right-6-1': { flag: 'local:Australia', official: false },
  'right-6-2': { flag: 'local:Iran', official: false },
  'right-7-1': { flag: 'local:Switzerland', official: true },
  'right-7-2': { flag: 'local:Algeria', official: false },
  'right-8-1': { flag: 'local:Colombia', official: false },
  'right-8-2': { flag: 'local:Croatia', official: false },
};

const createInitialState = () =>
  BRACKET_SLOTS.reduce<Record<string, BracketSlotState>>((acc, slot) => {
    acc[slot.id] = DEFAULT_SLOT_VALUES[slot.id] ?? { flag: '', official: false };
    return acc;
  }, {});

const getOptionValue = (option: LogoOption) => option.url.trim() || `local:${option.name}`;

const getLogoSources = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return [];
  if (!raw.startsWith('local:')) return [raw];

  const name = raw.slice('local:'.length).trim();
  if (!name) return [];

  const encodedName = encodeURIComponent(name);
  const extensions = ['png', 'webp', 'jpg', 'jpeg'];
  return extensions.map(ext => `/img/world-cup/team-logos/${encodedName}.${ext}`);
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  const cache = (window as any).__bracketImageCache || ((window as any).__bracketImageCache = new Map());
  if (cache.has(src)) return cache.get(src);
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  cache.set(src, promise);
  promise.catch(() => cache.delete(src));
  return promise;
};

const ensureBracketFontsLoaded = (() => {
  let cached: Promise<void> | null = null;
  return () => {
    if (cached) return cached;
    if (!document?.fonts?.load) {
      cached = Promise.resolve();
      return cached;
    }
    cached = Promise.all([
      document.fonts.load('900 148px "HeadingNowTrial 57 ExtraBold"'),
      document.fonts.load('900 64px "HeadingNowTrial 57 ExtraBold"'),
      document.fonts.load('900 44px "HeadingNowTrial 57 ExtraBold"'),
    ]).then(() => undefined);
    return cached;
  };
})();

function WorldCupBracketPreview({
  slots,
  onToggleSlot,
  canvasId,
  titleText,
  subtitleText,
}: {
  slots: Record<string, BracketSlotState>;
  onToggleSlot: (slotId: string) => void;
  canvasId: string;
  titleText: string;
  subtitleText: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let cancelled = false;

    const draw = async () => {
      await ensureBracketFontsLoaded();
      if (cancelled) return;
      canvas.width = ARTBOARD_WIDTH;
      canvas.height = ARTBOARD_HEIGHT;

      try {
        const bracketBackground = await loadImage('/img/backgrounds/bracket.webp');
        if (cancelled) return;
        ctx.drawImage(bracketBackground, 0, 0, ARTBOARD_WIDTH, ARTBOARD_HEIGHT);
      } catch {
        ctx.fillStyle = '#0a257f';
        ctx.fillRect(0, 0, ARTBOARD_WIDTH, ARTBOARD_HEIGHT);
      }

      ctx.font = '900 130px "HeadingNowTrial 57 ExtraBold", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(titleText || '', ARTBOARD_WIDTH / 2, 64);

      ctx.font = '900 64px "HeadingNowTrial 57 ExtraBold", sans-serif';
      ctx.fillStyle = '#efff2d';
      ctx.fillText(subtitleText || '', ARTBOARD_WIDTH / 2, 214);

      for (const slot of BRACKET_SLOTS) {
        const slotState = slots[slot.id];
        const x = slot.x;
        const y = slot.y;
        const radius = FLAG_SIZE / 2;
        const centerX = x + radius;
        const centerY = y + radius;

        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        const sources = getLogoSources(slotState?.flag || '');
        let drawn = false;
        for (const source of sources) {
          if (cancelled) return;
          try {
            const img = await loadImage(source);
            if (cancelled) return;
            const scale = Math.max(FLAG_SIZE / img.width, FLAG_SIZE / img.height);
            const drawWidth = img.width * scale;
            const drawHeight = img.height * scale;
            const drawX = x + (FLAG_SIZE - drawWidth) / 2;
            const drawY = y + (FLAG_SIZE - drawHeight) / 2;
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            drawn = true;
            break;
          } catch {
            // try next candidate
          }
        }
        if (!drawn) {
          ctx.fillStyle = 'rgba(51,65,85,0.75)';
          ctx.fillRect(x, y, FLAG_SIZE, FLAG_SIZE);
        }
        if (!slotState?.official) {
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect(x, y, FLAG_SIZE, FLAG_SIZE);
        }

        const shine = ctx.createLinearGradient(0, y, 0, y + FLAG_SIZE * 0.42);
        shine.addColorStop(0, 'rgba(255,255,255,0.3)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.fillRect(x, y, FLAG_SIZE, FLAG_SIZE * 0.42);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.stroke();
      }

      ctx.font = '900 44px "HeadingNowTrial 57 ExtraBold", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      VS_LABELS.forEach(label => {
        ctx.fillText('vs', label.x, label.y);
      });
    };

    void draw();
    return () => {
      cancelled = true;
    };
  }, [slots, subtitleText, titleText]);

  return (
    <canvas
      id={canvasId}
      ref={canvasRef}
      className="bracket-canvas-container"
      width={ARTBOARD_WIDTH}
      height={ARTBOARD_HEIGHT}
      onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * ARTBOARD_WIDTH;
        const y = ((event.clientY - rect.top) / rect.height) * ARTBOARD_HEIGHT;
        const hitSlot = BRACKET_SLOTS.find(slot => {
          const centerX = slot.x + FLAG_SIZE / 2;
          const centerY = slot.y + FLAG_SIZE / 2;
          return Math.hypot(x - centerX, y - centerY) <= FLAG_SIZE / 2;
        });
        if (hitSlot) onToggleSlot(hitSlot.id);
      }}
    />
  );
}

const FlagCircle = ({
  slot,
  state,
  onToggleOfficial,
  key: _key,
}: {
  key?: string;
  slot: BracketSlot;
  state: BracketSlotState;
  onToggleOfficial: () => void;
}) => {
  const [srcIndex, setSrcIndex] = useState(0);
  const sources = useMemo(() => getLogoSources(state.flag), [state.flag]);
  const src = sources[srcIndex] || '';

  useEffect(() => {
    setSrcIndex(0);
  }, [state.flag]);

  const hasFlag = Boolean(state.flag);

  return (
    <button
      type="button"
      className="absolute cursor-pointer rounded-full border-[5px] border-white bg-slate-900/45 shadow-[0_20px_45px_rgba(2,6,23,0.35)] transition hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-sky-300/45"
      style={{
        left: `${(slot.x / ARTBOARD_WIDTH) * 100}%`,
        top: `${(slot.y / ARTBOARD_HEIGHT) * 100}%`,
        width: `${(FLAG_SIZE / ARTBOARD_WIDTH) * 100}%`,
        height: `${(FLAG_SIZE / ARTBOARD_HEIGHT) * 100}%`,
      }}
      onClick={onToggleOfficial}
      title={hasFlag ? `${slot.label}: ${state.official ? 'official' : 'unofficial'}` : `${slot.label}: empty`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-full">
        {src ? (
          <img
            key={src}
            src={src}
            alt={slot.label}
            className="h-full w-full object-cover transition"
            style={{ objectPosition: 'center', objectFit: 'cover' }}
            onError={() => {
              if (srcIndex < sources.length - 1) {
                setSrcIndex(srcIndex + 1);
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-700/70 text-slate-300">
            <Flag className="h-12 w-12 opacity-70" />
          </div>
        )}
        {!state.official && (
          <div className="absolute inset-0 bg-black/65" />
        )}
        <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-white/30 to-transparent" />
        <div className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-slate-950/60 text-white">
          {state.official ? <Check className="h-4 w-4" /> : <CircleOff className="h-4 w-4" />}
        </div>
      </div>
    </button>
  );
};

const buildBracketSegments = () => {
  const segments: Array<[number, number, number, number]> = [];

  const addSide = (side: 'left' | 'right') => {
    const matchYs = ROW_YS.map(y => y + FLAG_SIZE / 2);
    const startX = side === 'left' ? LEFT_ROW_X[1] + FLAG_SIZE - 8 : RIGHT_ROW_X[0] + 8;
    const columns = side === 'left' ? [634, 696, 772, 864] : [1094, 1032, 956, 864];

    matchYs.forEach(y => {
      segments.push([startX, y, columns[0], y]);
    });

    let currentYs = matchYs.slice();
    for (let i = 0; i < columns.length - 1; i += 1) {
      const x = columns[i];
      const nextX = columns[i + 1];
      const nextYs: number[] = [];

      for (let pairIndex = 0; pairIndex < currentYs.length; pairIndex += 2) {
        const topY = currentYs[pairIndex];
        const bottomY = currentYs[pairIndex + 1];
        const midY = (topY + bottomY) / 2;

        segments.push([x, topY, x, bottomY]);
        segments.push([x, midY, nextX, midY]);
        nextYs.push(midY);
      }

      currentYs = nextYs;
    }
  };

  addSide('left');
  addSide('right');

  segments.push([ARTBOARD_WIDTH / 2, 1006, ARTBOARD_WIDTH / 2, 1154]);

  return segments;
};

const BRACKET_SEGMENTS = buildBracketSegments();

export default function WorldCupBracketPage() {
  const [teamLogoOptions, setTeamLogoOptions] = useState<LogoOption[]>([]);
  const [slots, setSlots] = useState<Record<string, BracketSlotState>>(() => createInitialState());
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [titleText, setTitleText] = useState('World Cup knockout stage');
  const [subtitleText, setSubtitleText] = useState('as it stands');

  useEffect(() => {
    fetch('/api/world-cup/logo-options/team')
      .then(res => res.json())
      .then(data => {
        const options = Array.isArray(data.options) ? (data.options as LogoOption[]) : [];
        setTeamLogoOptions(
          options
            .map(option => ({
              name: option.name,
              url: option.url,
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => setTeamLogoOptions([]));
  }, []);

  const updateSlot = (slotId: string, nextValue: Partial<BracketSlotState>) => {
    setSlots(prev => ({
      ...prev,
      [slotId]: {
        ...prev[slotId],
        ...nextValue,
      },
    }));
  };

  const handleDownload = () => {
    const canvas = document.getElementById('world-cup-bracket-preview') as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'world-cup-bracket.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleCopy = async () => {
    const canvas = document.getElementById('world-cup-bracket-preview') as HTMLCanvasElement | null;
    if (!canvas || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      setCopyStatus('error');
      return;
    }
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      setCopyStatus('error');
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 1600);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 1600);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-950 text-white">
      <div className="mx-auto flex h-full max-w-[1800px] flex-col gap-6 px-4 py-4 xl:flex-row xl:px-6">
        <aside className="w-full min-w-0 xl:flex-1 xl:overflow-y-auto xl:pr-2">
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-2xl backdrop-blur">
            <div className="mb-5 flex items-start justify-between gap-4">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/14"
                onClick={() => {
                  setSlots(createInitialState());
                  setTitleText('World Cup knockout stage');
                  setSubtitleText('as it stands');
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
            </div>

            <section className="mb-5 rounded-[24px] border border-white/10 bg-slate-900/45 p-4">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-sky-200/75">Text</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Main Title</label>
                  <input
                    type="text"
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 text-sm text-slate-900"
                    value={titleText}
                    onChange={e => setTitleText(e.target.value)}
                    placeholder="World Cup knockout stage"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Subtitle</label>
                  <input
                    type="text"
                    className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 text-sm text-slate-900"
                    value={subtitleText}
                    onChange={e => setSubtitleText(e.target.value)}
                    placeholder="as it stands"
                  />
                </div>
              </div>
            </section>

            <div className="grid gap-4">
              {GROUPED_SLOT_ROWS.map((groupRow, rowIndex) => (
                <div key={`group-row-${rowIndex}`} className="grid gap-4 xl:grid-cols-2">
                  {groupRow.map(group => (
                    <section key={group.label} className="rounded-[24px] border border-white/10 bg-slate-900/45 p-4">
                      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-sky-200/75">{group.label}</h2>
                      <div className="grid gap-4 md:grid-cols-2">
                        {group.slots.map(slot => (
                          <div key={slot.id} className="rounded-2xl border border-white/8 bg-white/5 p-3">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold text-slate-100">{slot.label}</span>
                              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-300">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                                  checked={slots[slot.id].official}
                                  onChange={e => updateSlot(slot.id, { official: e.target.checked })}
                                />
                                Official
                              </label>
                            </div>
                            <LogoSelectField
                              label="Country"
                              options={teamLogoOptions}
                              value={slots[slot.id].flag}
                              onChange={value => updateSlot(slot.id, { flag: value, official: Boolean(value) && slots[slot.id].official })}
                              placeholder="Search country flags..."
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="w-full xl:w-[540px] xl:h-full xl:flex-none xl:overflow-hidden">
          <div className="flex h-full items-center justify-center">
            <div className="w-full rounded-[28px] border border-white/10 bg-[#06113a] p-4 shadow-[0_25px_80px_rgba(2,6,23,0.55)]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm font-medium"
                >
                  <Copy className="w-4 h-4" />
                  {copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy'}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download PNG
                </button>
              </div>
            </div>

              <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#102a9f]">
                <WorldCupBracketPreview
                  canvasId="world-cup-bracket-preview"
                  slots={slots}
                  onToggleSlot={slotId => updateSlot(slotId, { official: !slots[slotId].official })}
                  titleText={titleText}
                  subtitleText={subtitleText}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
