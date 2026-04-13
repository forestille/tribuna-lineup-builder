import { useEffect, useRef } from 'react';
import { LineupState, Player } from '../types';
import { FORMATION_POSITIONS } from '../constants';

interface Props {
  state: LineupState;
}

export default function LineupPreview({ state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playersCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevBaseKeyRef = useRef<string>('');
  const prevFormationRef = useRef<string>('');
  const prevTeamNameRef = useRef<string>('');
  const prevGlowRef = useRef<string>('');
  const prevPlayerKeysRef = useRef<Record<string, string>>({});

  const ensureFontsLoaded = (() => {
    let cached: Promise<void> | null = null;
    return () => {
      if (cached) return cached;
      if (!document?.fonts?.load) {
        cached = Promise.resolve();
        return cached;
      }
      cached = Promise.all([
        document.fonts.load('900 93px "HeadingNowTrial 57 ExtraBold"'),
        document.fonts.load('bold 30px "Kelson Sans"'),
        document.fonts.load('bold 29.25px "Kelson Sans"'),
      ]).then(() => undefined);
      return cached;
    };
  })();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = async () => {
      const ensureCanvasSize = (target: HTMLCanvasElement, width: number, height: number) => {
        if (target.width !== width || target.height !== height) {
          target.width = width;
          target.height = height;
          return true;
        }
        return false;
      };
      // Ensure custom fonts are loaded before drawing text
      await ensureFontsLoaded();
      const baseCanvas = baseCanvasRef.current || document.createElement('canvas');
      const baseResized = ensureCanvasSize(baseCanvas, canvas.width, canvas.height);
      baseCanvasRef.current = baseCanvas;
      const baseCtx = baseCanvas.getContext('2d');

      const playersCanvas = playersCanvasRef.current || document.createElement('canvas');
      const playersResized = ensureCanvasSize(playersCanvas, canvas.width, canvas.height);
      playersCanvasRef.current = playersCanvas;
      const playersCtx = playersCanvas.getContext('2d');

      if (!baseCtx || !playersCtx) return;

      const baseKey = JSON.stringify({
        background: state.background,
        possibleLineup: state.possibleLineup,
        possibleLineupText: state.possibleLineupText,
        tournamentLogo: state.tournamentLogo,
        tournamentLogoMonochrome: state.tournamentLogoMonochrome,
        matchday: state.matchday,
        homeLogo: state.homeLogo,
        awayLogo: state.awayLogo,
        subs: state.subs,
      });
      const baseDirty = baseKey !== prevBaseKeyRef.current || baseResized;
      if (baseDirty) {
        prevBaseKeyRef.current = baseKey;
        baseCtx.fillStyle = '#000';
        baseCtx.fillRect(0, 0, baseCanvas.width, baseCanvas.height);

        if (state.background) {
          const bgImg = await loadImage(`/img/backgrounds/${state.background}`);
          baseCtx.drawImage(bgImg, 0, 0, baseCanvas.width, baseCanvas.height);
        }

        if (!state.possibleLineup) {
          let logoCenterX: number | null = null;
          if (state.tournamentLogo) {
            try {
              const tLogo = await loadImage(state.tournamentLogo);
              const maxH = 137;
              const maxW = 140;
              const scale = Math.min(maxH / tLogo.height, maxW / tLogo.width);
              const width = tLogo.width * scale;
              const logoH = tLogo.height * scale;
              const logoX = 70;
              const logoY = 55 + (137 - logoH) / 2;
              if (state.tournamentLogoMonochrome) {
                const off = document.createElement('canvas');
                off.width = Math.round(width);
                off.height = logoH;
                const octx = off.getContext('2d');
                if (octx) {
                  octx.clearRect(0, 0, off.width, off.height);
                  octx.drawImage(tLogo, 0, 0, off.width, off.height);
                  octx.globalCompositeOperation = 'source-in';
                  octx.fillStyle = '#ffffff';
                  octx.fillRect(0, 0, off.width, off.height);
                  octx.globalCompositeOperation = 'source-over';
                  baseCtx.drawImage(off, logoX, logoY, off.width, off.height);
                } else {
                  baseCtx.drawImage(tLogo, logoX, logoY, width, logoH);
                }
              } else {
                baseCtx.drawImage(tLogo, logoX, logoY, width, logoH);
              }
              logoCenterX = logoX + width / 2;
            } catch (e) { console.error("Logo error", e); }
          }

          if (state.matchday) {
            const text = state.matchday;
            const centerX = (logoCenterX ?? 70);
            const maxWidth = 380;
            baseCtx.font = 'bold 30px "Kelson Sans", sans-serif';
            baseCtx.textAlign = 'center';
            baseCtx.textBaseline = 'middle';
            const lines = wrapText(baseCtx, text, maxWidth);
            const lineHeight = 34;
            const textStartY = 225;
            const startY = textStartY - (lines.length - 1) * (lineHeight / 2);
            baseCtx.fillStyle = 'white';
            lines.forEach((line, i) => {
              const y = startY + i * lineHeight;
              baseCtx.fillText(line, centerX, y);
            });
          }
        } else {
          const text = (state.possibleLineupText || '').trim();
          if (text) {
            baseCtx.fillStyle = 'white';
            baseCtx.font = '900 93px "HeadingNowTrial 57 ExtraBold", sans-serif';
            baseCtx.textAlign = 'left';
            baseCtx.textBaseline = 'top';
            const lines = text.toUpperCase().split('\n');
            const startX = 50;
            const startY = 81;
            const lineHeight = 93;
            lines.forEach((line, i) => {
              drawTextWithTracking(baseCtx, line, startX, startY + i * lineHeight, 20);
            });
          }
        }

        const vsX = canvas.width / 2 + 247;
        const vsY = 155;
        if (state.homeLogo) {
          try {
            const hLogo = await loadImage(state.homeLogo);
            const scale = 180 / hLogo.height;
            const width = hLogo.width * scale;
            baseCtx.drawImage(hLogo, vsX - 150 - width / 2, 55, width, 180);
          } catch (e) {}
        }
        if (state.awayLogo) {
          try {
            const aLogo = await loadImage(state.awayLogo);
            const scale = 180 / aLogo.height;
            const width = aLogo.width * scale;
            baseCtx.drawImage(aLogo, vsX + 150 - width / 2, 55, width, 180);
          } catch (e) {}
        }
        if (state.homeLogo || state.awayLogo) {
          baseCtx.fillStyle = 'white';
          baseCtx.font = 'bold 38px "Kelson Sans Bold", sans-serif';
          baseCtx.textAlign = 'center';
          baseCtx.fillText('VS', vsX, vsY);
        }

        if (!state.possibleLineup && state.subs) {
          try {
            const subsImg = await loadImage('/img/subs.png');
            baseCtx.drawImage(subsImg, 115, 1248);
          } catch (e) {}
          baseCtx.fillStyle = 'white';
          baseCtx.font = '28px "Kelson Sans", sans-serif';
          baseCtx.textAlign = 'left';
          const subsList = state.subs.split('\n');
          baseCtx.font = '28px "Kelson Sans", sans-serif';
          subsList.forEach((sub, i) => {
            if (i < 10) {
              drawSubsLine(baseCtx, sub.trim(), 180, 1245 + 35 + (i * 40), 30);
            }
          });
        }
      }

      const positions = FORMATION_POSITIONS[state.formation];
      const formationChanged = prevFormationRef.current !== state.formation;
      const teamChanged = prevTeamNameRef.current !== state.teamName;
      const glowChanged = prevGlowRef.current !== (state.glowColor || '');
      const rerenderAllPlayers = formationChanged || teamChanged || glowChanged || !prevFormationRef.current || playersResized;

      prevFormationRef.current = state.formation;
      prevTeamNameRef.current = state.teamName;
      prevGlowRef.current = state.glowColor || '';

      const getPlayerKey = (p: Player | null) =>
        p ? `${p.name}|${p.displayName}|${p.imageUrl}|${p.role}` : '';

      const clearPlayerRegion = (x: number, y: number) => {
        const width = 420;
        const height = 380;
        const left = Math.max(0, Math.round(x - width / 2));
        const top = Math.max(0, Math.round(y - height + 120));
        const right = Math.min(canvas.width, left + width);
        const bottom = Math.min(canvas.height, top + height);
        playersCtx.clearRect(left, top, right - left, bottom - top);
      };

      // Redraw the entire players layer when any player changes to avoid partial clear artifacts.
      // Base layer is still cached, so this remains fast while keeping visuals correct.
      const nextKeys: Record<string, string> = {};
      let playersDirty = rerenderAllPlayers;
      for (const pos of positions) {
        const key = getPlayerKey(state.players[pos.id]);
        nextKeys[pos.id] = key;
        if (prevPlayerKeysRef.current[pos.id] !== key) {
          playersDirty = true;
        }
      }

      if (playersDirty) {
        playersCtx.clearRect(0, 0, playersCanvas.width, playersCanvas.height);
        for (const pos of positions) {
          const player = state.players[pos.id];
          await drawPlayerGlow(playersCtx, pos.x, pos.y, player);
        }
        for (const pos of positions) {
          const player = state.players[pos.id];
          await drawPlayerImageAndTag(playersCtx, pos.x, pos.y, player);
        }
        prevPlayerKeysRef.current = nextKeys;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(baseCanvas, 0, 0);
      ctx.drawImage(playersCanvas, 0, 0);
    };

    draw();
  }, [state]);

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    const cache = (window as any).__lineupImageCache || ((window as any).__lineupImageCache = new Map());
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

  const resolvePlayerImageCandidates = (p: Player | null) => {
    const team = (state.teamName || '').trim();
    const teamFolder = team ? encodeURIComponent(team) : '';
    const candidates: Array<{ url: string; fromDisplay: boolean; circlePos: boolean; circleMask: boolean }> = [];
    const seen = new Set<string>();
    const addCandidate = (url: string, fromDisplay: boolean, circlePos: boolean, circleMask: boolean) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      candidates.push({ url, fromDisplay, circlePos, circleMask });
    };

    const buildNameBases = (name: string) => {
      const slug = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[’'ʼ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const normalized = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[’'ʼ]/g, '')
        .trim()
        .toLowerCase();
      const spaceName = normalized.replace(/[^a-z0-9]+/g, ' ').trim();
      const underscoreName = spaceName.replace(/\s+/g, '_');
      return Array.from(new Set([slug, spaceName, underscoreName].filter(Boolean)));
    };

    const name = (p?.displayName || '').trim();
    if (name) {
      const bases = buildNameBases(name);
      const exts = ['png', 'webp', 'jpg', 'jpeg'];
      bases.forEach(base => {
        exts.forEach(ext => {
          const url = teamFolder
            ? `/img/players/${teamFolder}/${encodeURIComponent(base)}.${ext}`
            : `/img/players/${encodeURIComponent(base)}.${ext}`;
          addCandidate(url, true, false, false);
        });
      });
      // players-uefa (glow like display, position like image-url)
      bases.forEach(base => {
        const url = teamFolder
          ? `/img/players-uefa/${teamFolder}/${encodeURIComponent(base)}.png`
          : `/img/players-uefa/${encodeURIComponent(base)}.png`;
        addCandidate(url, true, true, false);
      });
    }

    const raw = (p?.imageUrl || '').trim();
    if (raw) {
      const isPngWebp = /\.(png|webp)$/i.test(raw);
      if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) {
        addCandidate(raw, isPngWebp, !isPngWebp, !isPngWebp);
        return candidates;
      }
      const hasExt = /\.[a-z0-9]+$/i.test(raw);
      if (hasExt) {
        const url = teamFolder
          ? `/img/players/${teamFolder}/${encodeURIComponent(raw)}`
          : `/img/players/${encodeURIComponent(raw)}`;
        addCandidate(url, isPngWebp, !isPngWebp, !isPngWebp);
        return candidates;
      }
      const exts = ['png', 'webp', 'jpg', 'jpeg'];
      exts.forEach(ext => {
        const url = teamFolder
          ? `/img/players/${teamFolder}/${encodeURIComponent(raw)}.${ext}`
          : `/img/players/${encodeURIComponent(raw)}.${ext}`;
        const fromDisplay = ext === 'png' || ext === 'webp';
        addCandidate(url, fromDisplay, !fromDisplay, !fromDisplay);
      });
    }
    if (p && (window as any).__lineupDebugImages) {
      // eslint-disable-next-line no-console
      console.log('[image-candidates]', {
        team: team,
        displayName: p.displayName,
        imageUrl: p.imageUrl,
        candidates
      });
    }
    return candidates;
  };

  const loadCandidateImage = async (candidates: Array<{ url: string; fromDisplay: boolean; circlePos: boolean; circleMask: boolean }>) => {
    for (const c of candidates) {
      try {
        const img = await loadImage(c.url);
        return { img, fromDisplay: c.fromDisplay, circlePos: c.circlePos, circleMask: c.circleMask };
      } catch {
        // try next
      }
    }
    return null;
  };

  const drawPlayerGlow = async (ctx: CanvasRenderingContext2D, x: number, y: number, player: Player | null) => {
    const candidates = resolvePlayerImageCandidates(player);
    const targetHeight = 180;
    const verticalOffset = 83;
    const glow = (state.glowColor || '').trim();
    if (!glow || candidates.length === 0) return;

    const loaded = await loadCandidateImage(candidates);
    if (!loaded) return;
    const { img, fromDisplay, circlePos } = loaded;

    const scale = targetHeight / img.height;
    const drawW = img.width * scale;
    const drawH = targetHeight;
    const drawX = x - drawW / 2;
    const drawY = y - drawH + verticalOffset;
    const shrink = 12;
    const imgH = Math.max(0, drawH - shrink);
    const imgW = img.width * (imgH / img.height);
    const imgX = x - imgW / 2;
    const imgY = drawY; // align to circle top
    const drawGlow = (source: HTMLCanvasElement | HTMLImageElement) => {
      ctx.shadowColor = glow;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      if (fromDisplay) {
        if (circlePos) {
          ctx.drawImage(source, imgX, imgY, imgW, imgH);
        } else {
          ctx.drawImage(source, drawX, drawY, drawW, drawH);
        }
      } else {
        const radius = drawH / 2;
        ctx.beginPath();
        ctx.arc(x, y - drawH / 2 + verticalOffset, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(source, drawX, drawY, drawW, drawH);
      }
    };
    ctx.save();
    ctx.shadowBlur = 45;
    drawGlow(img);
    ctx.restore();
    ctx.save();
    ctx.shadowBlur = 18;
    drawGlow(img);
    ctx.restore();
  };

  const drawPlayerImageAndTag = async (ctx: CanvasRenderingContext2D, x: number, y: number, player: Player | null) => {
    const candidates = resolvePlayerImageCandidates(player);
    const targetHeight = 180;
    const tagWidth = 223;
    const tagHeight = 37;
    const verticalOffset = 83;
    const loaded = await loadCandidateImage(candidates);
    if (loaded) {
      const { img, fromDisplay, circlePos, circleMask } = loaded;
      const scale = targetHeight / img.height;
      const drawW = img.width * scale;
      const drawH = targetHeight;
      const drawX = x - drawW / 2;
      const drawY = y - drawH + verticalOffset;
      if (fromDisplay && !circlePos) {
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      } else {
        // Circle stays full size; image slightly smaller inside, aligned to top
        const shrink = 12;
        const imgH = Math.max(0, drawH - shrink);
        const imgW = img.width * (imgH / img.height);
        const imgX = x - imgW / 2;
        const imgY = drawY; // align to circle top
        const radius = drawH / 2;
        const centerY = y - drawH / 2 + verticalOffset;
        if (circleMask) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, centerY, radius, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
          ctx.clip();
          ctx.drawImage(img, imgX, imgY, imgW, imgH);
          ctx.restore();
        } else {
          ctx.drawImage(img, imgX, imgY, imgW, imgH);
        }
      }
    }

    // Name tag (text background centered under the circle)
    try {
      let tagImg: HTMLImageElement | null = null;
      try {
        tagImg = await loadImage('/img/textbg.png');
      } catch {
        tagImg = await loadImage('/img/texbg.png');
      }
      const tagX = x - tagWidth / 2;
      const tagY = y - tagHeight + verticalOffset;
      const tagCenterY = tagY + tagHeight / 2;
      ctx.drawImage(tagImg, tagX, tagY, tagWidth, tagHeight);
      
      if (player) {
        ctx.fillStyle = 'black';
        const name = player.displayName.toUpperCase();
        const fontSize = name.length >= 12 ? 24.5 : name.length >= 10 ? 26 : 29.25;
        ctx.font = `bold ${fontSize}px "Kelson Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x - 3, tagCenterY + 5);
      }
    } catch (e) {
      // Fallback if text background is missing
      if (player) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(player.displayName.toUpperCase(), x, y + 120);
      }
    }
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const explicit = text.split('\n').map(t => t.trim()).filter(Boolean);
    const lines: string[] = [];
    for (const block of explicit.length ? explicit : [text]) {
      const words = block.split(/\s+/);
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [''];
  };

  const drawTextWithTracking = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    tracking: number
  ) => {
    const fontSizeMatch = ctx.font.match(/(\d+(\.\d+)?)px/);
    const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 28;
    const letterSpacing = (tracking / 1000) * fontSize;
    if (letterSpacing === 0) {
      ctx.fillText(text, x, y);
      return;
    }
    let cursorX = x;
    for (const ch of text) {
      ctx.fillText(ch, cursorX, y);
      cursorX += ctx.measureText(ch).width + letterSpacing;
    }
  };

  const drawSubsLine = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    tracking: number
  ) => {
    if (!text) return;
    const fontSizeMatch = ctx.font.match(/(\d+(\.\d+)?)px/);
    const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 28;
    const letterSpacing = (tracking / 1000) * fontSize;
    if (letterSpacing === 0) {
      ctx.fillText(text, x, y);
      return;
    }
    let cursorX = x;
    for (const ch of text) {
      ctx.fillText(ch, cursorX, y);
      cursorX += ctx.measureText(ch).width + letterSpacing;
    }
  };


  return (
    <div className="lineup-canvas-container overflow-hidden rounded-lg">
      <canvas
        ref={canvasRef}
        width={1080}
        height={1350}
        className="w-full h-full object-contain"
      />
    </div>
  );
}
