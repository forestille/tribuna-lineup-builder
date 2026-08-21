import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser, LoaderCircle, Move, RotateCcw, X, ZoomIn } from 'lucide-react';
import {
  drawPlayerTag,
  PLAYER_TAG_BOTTOM_OFFSET,
  PLAYER_TARGET_HEIGHT,
  PLAYER_Y_OFFSET,
} from '../playerBox';

const OUTPUT_WIDTH = 250;
const OUTPUT_HEIGHT = PLAYER_TARGET_HEIGHT;
const PREVIEW_HEIGHT = 200;
const CHECKER_SIZE = 12;
const PLAYER_X = OUTPUT_WIDTH / 2;
const PLAYER_Y = OUTPUT_HEIGHT - PLAYER_TAG_BOTTOM_OFFSET - PLAYER_Y_OFFSET;

type VisibleBounds = { sx: number; sy: number; sw: number; sh: number };
type CropOffset = { x: number; y: number };

export type PlayerPhotoCrop = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type PlayerPhotoEditorResult = {
  blob: Blob;
  sourceBlob: Blob;
  crop: PlayerPhotoCrop;
};

type Props = {
  playerName: string;
  sourceUrl: string;
  initialCrop?: PlayerPhotoCrop;
  onCancel: () => void;
  onApply: (result: PlayerPhotoEditorResult) => void;
};

const findVisibleBounds = (image: HTMLImageElement): VisibleBounds => {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const sampleScale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * sampleScale));
  canvas.height = Math.max(1, Math.round(height * sampleScale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { sx: 0, sy: 0, sw: width, sh: height };

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = pixels.width;
  let minY = pixels.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < pixels.height; y += 1) {
    for (let x = 0; x < pixels.width; x += 1) {
      if (pixels.data[(y * pixels.width + x) * 4 + 3] <= 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX < minX
    ? { sx: 0, sy: 0, sw: width, sh: height }
    : {
        sx: minX / sampleScale,
        sy: minY / sampleScale,
        sw: (maxX - minX + 1) / sampleScale,
        sh: (maxY - minY + 1) / sampleScale,
      };
};

const getCropMetrics = (bounds: VisibleBounds, zoom: number, offset: CropOffset) => {
  const containScale = Math.min(OUTPUT_WIDTH / bounds.sw, OUTPUT_HEIGHT / bounds.sh);
  const scale = containScale * zoom;
  const drawWidth = bounds.sw * scale;
  const drawHeight = bounds.sh * scale;
  return {
    drawWidth,
    drawHeight,
    drawX: (OUTPUT_WIDTH - drawWidth) / 2 + offset.x,
    drawY: (OUTPUT_HEIGHT - drawHeight) / 2 + offset.y,
  };
};

const clampOffset = (bounds: VisibleBounds, zoom: number, offset: CropOffset): CropOffset => {
  const { drawWidth, drawHeight } = getCropMetrics(bounds, zoom, { x: 0, y: 0 });
  // Wider images can move until their edge reaches the crop edge. Narrower
  // images can move across the otherwise-empty horizontal space.
  const maxX = Math.abs(drawWidth - OUTPUT_WIDTH) / 2;
  const maxY = Math.max(0, (drawHeight - OUTPUT_HEIGHT) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  };
};

const drawCheckerboard = (ctx: CanvasRenderingContext2D) => {
  for (let y = 0; y < PREVIEW_HEIGHT; y += CHECKER_SIZE) {
    for (let x = 0; x < OUTPUT_WIDTH; x += CHECKER_SIZE) {
      ctx.fillStyle = (x / CHECKER_SIZE + y / CHECKER_SIZE) % 2 === 0 ? '#eef2f7' : '#d8e0ea';
      ctx.fillRect(x, y, CHECKER_SIZE, CHECKER_SIZE);
    }
  }
};

const drawCroppedImage = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  bounds: VisibleBounds,
  zoom: number,
  offset: CropOffset,
) => {
  const { drawX, drawY, drawWidth, drawHeight } = getCropMetrics(bounds, zoom, offset);
  ctx.drawImage(
    image,
    bounds.sx,
    bounds.sy,
    bounds.sw,
    bounds.sh,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
};

export default function PlayerPhotoEditor({ playerName, sourceUrl, initialCrop, onCancel, onApply }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const tagRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const generatedUrlsRef = useRef<string[]>([]);
  const [imageUrl, setImageUrl] = useState(sourceUrl);
  const [visibleBounds, setVisibleBounds] = useState<VisibleBounds>({ sx: 0, sy: 0, sw: 1, sh: 1 });
  const [zoom, setZoom] = useState(initialCrop?.zoom ?? 1);
  const [offset, setOffset] = useState<CropOffset>({
    x: initialCrop?.offsetX ?? 0,
    y: initialCrop?.offsetY ?? 0,
  });
  const [imageReady, setImageReady] = useState(false);
  const [tagReady, setTagReady] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setImageReady(false);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const bounds = findVisibleBounds(image);
      setVisibleBounds(bounds);
      setOffset(current => clampOffset(bounds, zoom, current));
      setImageReady(true);
    };
    image.onerror = () => setError('This image could not be opened.');
    image.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const tag = new Image();
    tag.onload = () => {
      tagRef.current = tag;
      setTagReady(true);
    };
    tag.onerror = () => {
      if (!tag.src.endsWith('/img/texbg.png')) {
        tag.src = '/img/texbg.png';
      }
    };
    tag.src = '/img/textbg.png';
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image || !imageReady) return;

    canvas.width = OUTPUT_WIDTH;
    canvas.height = PREVIEW_HEIGHT;
    ctx.clearRect(0, 0, OUTPUT_WIDTH, PREVIEW_HEIGHT);
    drawCheckerboard(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    ctx.clip();
    drawCroppedImage(ctx, image, visibleBounds, zoom, offset);
    ctx.restore();
    if (tagRef.current && tagReady) {
      drawPlayerTag(ctx, tagRef.current, PLAYER_X, PLAYER_Y, playerName);
    }
  }, [imageReady, offset, playerName, tagReady, visibleBounds, zoom]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  useEffect(() => () => generatedUrlsRef.current.forEach(url => URL.revokeObjectURL(url)), []);

  const resetCrop = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const changeZoom = (nextZoom: number) => {
    setZoom(nextZoom);
    setOffset(current => clampOffset(visibleBounds, nextZoom, current));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const previewScale = OUTPUT_WIDTH / rect.width;
    const nextOffset = {
      x: dragRef.current.offsetX + (event.clientX - dragRef.current.x) * previewScale,
      y: dragRef.current.offsetY + (event.clientY - dragRef.current.y) * previewScale,
    };
    setOffset(clampOffset(visibleBounds, zoom, nextOffset));
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  const removeBackground = async () => {
    setIsRemoving(true);
    setError('');
    try {
      const source = await fetch(imageUrl).then(response => response.blob());
      const response = await fetch('/api/player-image/remove-background', {
        method: 'POST',
        headers: { 'Content-Type': source.type || 'application/octet-stream' },
        body: source,
      });
      if (!response.ok) throw new Error('Background removal failed.');
      const result = await response.blob();
      const resultUrl = URL.createObjectURL(result);
      generatedUrlsRef.current.push(resultUrl);
      setImageUrl(resultUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Background removal failed.');
    } finally {
      setIsRemoving(false);
    }
  };

  const applyImage = () => {
    const image = imageRef.current;
    if (!image) return;

    setIsApplying(true);
    setError('');
    const output = document.createElement('canvas');
    output.width = OUTPUT_WIDTH;
    output.height = OUTPUT_HEIGHT;
    const ctx = output.getContext('2d');
    if (!ctx) {
      setError('The edited image could not be prepared.');
      setIsApplying(false);
      return;
    }

    ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    drawCroppedImage(ctx, image, visibleBounds, zoom, offset);
    output.toBlob(async blob => {
      if (!blob) {
        setError('The edited image could not be prepared.');
        setIsApplying(false);
        return;
      }
      try {
        const sourceBlob = await fetch(imageUrl).then(response => response.blob());
        onApply({
          blob,
          sourceBlob,
          crop: { zoom, offsetX: offset.x, offsetY: offset.y },
        });
      } catch {
        setError('The editable source image could not be prepared.');
        setIsApplying(false);
      }
    }, 'image/png');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-label={`Crop photo for ${playerName}`}>
      <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Crop player photo</h2>
            <p className="text-sm text-slate-500">{playerName} · kept only in this browser tab</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close photo editor"><X className="h-5 w-5" /></button>
        </header>
        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-h-0 items-center justify-center rounded-xl bg-slate-900 p-3">
            <div className="relative w-full max-w-[500px] overflow-hidden rounded-lg border border-white/15" style={{ aspectRatio: `${OUTPUT_WIDTH}/${PREVIEW_HEIGHT}` }}>
              <canvas
                ref={canvasRef}
                width={OUTPUT_WIDTH}
                height={PREVIEW_HEIGHT}
                className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
              <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-white">
                <Move className="h-3.5 w-3.5" /> Drag to choose the crop
              </div>
            </div>
          </div>
          <aside className="space-y-5">
            <div>
              <label htmlFor="photo-size" className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                <span className="inline-flex items-center gap-2"><ZoomIn className="h-4 w-4" /> Image size</span>
                <span className="text-slate-500">{Math.round(zoom * 100)}%</span>
              </label>
              <input id="photo-size" type="range" min="1" max="3" step="0.01" value={zoom} onChange={event => changeZoom(Number(event.target.value))} className="w-full accent-indigo-600" />
            </div>
            <button type="button" onClick={resetCrop} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw className="h-4 w-4" /> Reset crop</button>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <h3 className="text-sm font-bold text-indigo-950">Background removal</h3>
              <button type="button" onClick={removeBackground} disabled={isRemoving} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {isRemoving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}
                {isRemoving ? 'Removing background…' : 'Remove background'}
              </button>
            </div>
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
          </aside>
        </div>
        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
          <button type="button" onClick={applyImage} disabled={isApplying || isRemoving || !imageReady} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {isApplying && <LoaderCircle className="h-4 w-4 animate-spin" />} Use image
          </button>
        </footer>
      </div>
    </div>
  );
}
