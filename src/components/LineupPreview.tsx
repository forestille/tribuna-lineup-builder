import { useEffect, useRef } from 'react';
import { LineupState, Player } from '../types';
import { FORMATION_POSITIONS } from '../constants';

interface Props {
  state: LineupState;
}

export default function LineupPreview({ state }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = async () => {
      // Ensure custom fonts are loaded before drawing text
      if (document?.fonts?.load) {
        await Promise.all([
          document.fonts.load('900 93px "HeadingNowTrial 57 ExtraBold"'),
          document.fonts.load('bold 30px "Kelson Sans"'),
          document.fonts.load('bold 29.25px "Kelson Sans"'),
        ]);
      }
      // 1. Background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      if (state.background) {
        const bgImg = await loadImage(`/img/backgrounds/${state.background}`);
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      }

      if (!state.possibleLineup) {
        // 2. Tournament Logo (top-left)
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
              // White-ify logo
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
                ctx.drawImage(off, logoX, logoY, off.width, off.height);
              } else {
                ctx.drawImage(tLogo, logoX, logoY, width, logoH);
              }
            } else {
              ctx.drawImage(tLogo, logoX, logoY, width, logoH);
            }
            logoCenterX = logoX + width / 2;
          } catch (e) { console.error("Logo error", e); }
        }

        // 3. Matchday/Stage (centered under tournament logo) with text background
        if (state.matchday) {
          const text = state.matchday;
          const centerX = (logoCenterX ?? 70);
          const maxWidth = 380;
          ctx.font = 'bold 30px "Kelson Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lines = wrapText(ctx, text, maxWidth);
          const lineHeight = 34;
        const widest = Math.max(
          ...lines.map(l => ctx.measureText(l).width),
          220
        );
        const textStartY = 225;
        const startY = textStartY - (lines.length - 1) * (lineHeight / 2);
        ctx.fillStyle = 'white';
        lines.forEach((line, i) => {
          const y = startY + i * lineHeight;
          ctx.fillText(line, centerX, y);
        });
      }
      } else {
        // Possible lineup text (left aligned)
        const text = (state.possibleLineupText || '').trim();
        if (text) {
          ctx.fillStyle = 'white';
          ctx.font = '900 93px "HeadingNowTrial 57 ExtraBold", sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          const lines = text.toUpperCase().split('\n');
          const startX = 50;
          const startY = 81;
          const lineHeight = 93;
          lines.forEach((line, i) => {
            drawTextWithTracking(ctx, line, startX, startY + i * lineHeight, 20);
          });
        }
      }

      // 4. Team Logos + VS (top center)
      const vsX = canvas.width / 2 + 247;
      const vsY = 155;
      if (state.homeLogo) {
        try {
          const hLogo = await loadImage(state.homeLogo);
          const scale = 180 / hLogo.height;
          const width = hLogo.width * scale;
          ctx.drawImage(hLogo, vsX - 150 - width / 2, 55, width, 180);
        } catch (e) {}
      }
      if (state.awayLogo) {
        try {
          const aLogo = await loadImage(state.awayLogo);
          const scale = 180 / aLogo.height;
          const width = aLogo.width * scale;
          ctx.drawImage(aLogo, vsX + 150 - width / 2, 55, width, 180);
        } catch (e) {}
      }
      if (state.homeLogo || state.awayLogo) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 38px "Kelson Sans Bold", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VS', vsX, vsY);
      }

      // 5. Players (glow pass first, then images/tags)
      const positions = FORMATION_POSITIONS[state.formation];
      for (const pos of positions) {
        const player = state.players[pos.id];
        await drawPlayerGlow(ctx, pos.x, pos.y, player);
      }
      for (const pos of positions) {
        const player = state.players[pos.id];
        await drawPlayerImageAndTag(ctx, pos.x, pos.y, player);
      }

      // 6. Subs label (bottom-left)
      if (!state.possibleLineup && state.subs) {
        try {
          const subsImg = await loadImage('/img/subs.png');
          ctx.drawImage(subsImg, 115, 1248);
        } catch (e) {}
        ctx.fillStyle = 'white';
        ctx.font = '28px "Kelson Sans", sans-serif';
        ctx.textAlign = 'left';
        const subsList = state.subs.split('\n');
        ctx.font = '28px "Kelson Sans", sans-serif';
        subsList.forEach((sub, i) => {
          if (i < 10) { // Limit subs display
            drawSubsLine(ctx, sub.trim(), 180, 1245 + 35 + (i * 40), 30);
          }
        });
      }
    };

    draw();
  }, [state]);

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
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
