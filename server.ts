import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";
import os from "os";
import { existsSync } from "fs";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { promisify } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

const getPythonBin = () => process.env.PYTHON_BIN || "python3";

type RembgJobOptions = {
  alphaMatting?: boolean;
  maxInputSize?: number;
};

type PendingRembgJob = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

class RembgWorker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  private sequence = 0;
  private pending = new Map<string, PendingRembgJob>();

  constructor(
    private readonly pythonBin: string,
    private readonly scriptPath: string,
  ) {}

  start() {
    if (this.child) return this.child;

    const numbaCacheDir = process.env.NUMBA_CACHE_DIR || path.join(os.tmpdir(), "lineup-numba-cache");
    fs.mkdirSync(numbaCacheDir, { recursive: true });
    const child = spawn(this.pythonBin, [this.scriptPath, "--worker"], {
      env: {
        ...process.env,
        NUMBA_CACHE_DIR: numbaCacheDir,
        OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || "2",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    child.stderr.on("data", (chunk: string) => {
      const message = chunk.trim();
      if (message) console.error(`[rembg] ${message}`);
    });
    child.once("error", error => this.handleExit(child, error));
    child.once("exit", (code, signal) => {
      this.handleExit(
        child,
        new Error(`Background-removal worker exited (${signal || (code ?? "unknown")}).`),
      );
    });
    return child;
  }

  process(inputPath: string, outputPath: string, options: RembgJobOptions = {}) {
    const child = this.start();
    const id = `${Date.now()}-${++this.sequence}`;
    const configuredTimeout = Number(process.env.REMBG_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 180_000;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handleExit(child, new Error(`Background removal timed out after ${timeoutMs}ms.`));
        child.kill();
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });

      const request = JSON.stringify({
        id,
        inputPath,
        outputPath,
        alphaMatting: options.alphaMatting ?? false,
        maxInputSize: options.maxInputSize ?? 0,
      });
      child.stdin.write(`${request}\n`, error => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(error);
      });
    });
  }

  private handleStdout(chunk: string) {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      try {
        const message = JSON.parse(line) as {
          type?: string;
          id?: string;
          ok?: boolean;
          error?: string;
          model?: string;
        };
        if (message.type === "ready") {
          console.log(`Background-removal worker ready (${message.model || "default model"}).`);
          continue;
        }
        if (!message.id) continue;
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.ok) pending.resolve();
        else pending.reject(new Error(message.error || "Background removal failed."));
      } catch {
        console.error(`[rembg] Unexpected worker output: ${line}`);
      }
    }
  }

  private handleExit(child: ChildProcessWithoutNullStreams, error: Error) {
    if (this.child !== child) return;
    this.child = null;
    this.stdoutBuffer = "";
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const rembgScript = path.join(__dirname, "scripts", "rembg_remove.py");
  const rembgWorker = new RembgWorker(getPythonBin(), rembgScript);

  if (existsSync(rembgScript) && process.env.REMBG_PRELOAD !== "0") {
    rembgWorker.start();
  }

  app.use(express.json({ limit: '10mb' }));

  app.post(
    '/api/player-image/remove-background',
    express.raw({ type: ['image/*', 'application/octet-stream'], limit: '15mb' }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'An image file is required.' });
      }

      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lineup-player-'));
      const inputPath = path.join(tempDir, 'input.img');
      const outputPath = path.join(tempDir, 'output.png');
      try {
        if (!existsSync(rembgScript)) {
          return res.status(500).json({ error: 'Background removal is not available.' });
        }
        await fs.promises.writeFile(inputPath, req.body);
        const configuredMaxSize = Number(process.env.REMBG_TEMP_MAX_INPUT_SIZE);
        await rembgWorker.process(inputPath, outputPath, {
          alphaMatting: process.env.REMBG_TEMP_ALPHA_MATTING === "1",
          maxInputSize: Number.isFinite(configuredMaxSize) && configuredMaxSize > 0
            ? configuredMaxSize
            : 1280,
        });
        const output = await fs.promises.readFile(outputPath);
        res.setHeader('Cache-Control', 'no-store');
        res.type('png').send(output);
      } catch (error) {
        console.error('Temporary player background removal failed:', error);
        res.status(500).json({ error: 'Background removal failed.' });
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    },
  );

  const parseCsvLine = (line: string) => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    result.push(current);
    return result.map((value, index) => {
      const withoutLineEnding = value.replace(/\r$/, '');
      return index === 0 ? withoutLineEnding.replace(/^\uFEFF/, '') : withoutLineEnding;
    });
  };

  const csvEscape = (value: string) => {
    const v = value ?? '';
    if (v.includes('"') || v.includes(',') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const slugify = (value: string) => {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’'ʼ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const downloadToFile = (url: string, dest: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return downloadToFile(res.headers.location, dest).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      });
      req.on('error', reject);
    });
  };

  const toFifaQuality100Url = (rawUrl: string) => {
    try {
      const url = new URL(rawUrl);
      const io = url.searchParams.get("io");
      if (io) {
        const cleanedIo = io
          .replace(/,?aspectratio:1x1,?/g, ",")
          .replace(/,{2,}/g, ",")
          .replace(/,$/, "");
        url.searchParams.set("io", cleanedIo);
      }
      url.searchParams.set("quality", "100");
      return url.toString();
    } catch {
      return rawUrl;
    }
  };

  const cropWorldCupPortrait = async (inputPath: string, outputPath: string) => {
    const cropScript = path.join(__dirname, "scripts", "crop_world_cup.py");
    const pythonBin = getPythonBin();
    await execFileAsync(pythonBin, [cropScript, inputPath, outputPath]);
  };

  type Mode = "uefa" | "world-cup";
  type Dataset = {
    mode: Mode;
    dataDir: string;
    teamsDir: string;
    metaCsvPath: string;
    playersImageDir: string;
    tournamentLogosCsvPath: string;
    teamLogosCsvPath: string;
  };

  const rootDataDir = path.join(__dirname, "data");
  const imgDir = path.join(__dirname, "public", "img");
  const bgDir = path.join(imgDir, "backgrounds");

  const datasetByMode: Record<Mode, Dataset> = {
    uefa: {
      mode: "uefa",
      dataDir: rootDataDir,
      teamsDir: path.join(rootDataDir, "teams"),
      metaCsvPath: path.join(rootDataDir, "teams.csv"),
      playersImageDir: path.join(imgDir, "players-uefa"),
      tournamentLogosCsvPath: path.join(rootDataDir, "tournament-logos.csv"),
      teamLogosCsvPath: path.join(rootDataDir, "team-logos.csv"),
    },
    "world-cup": {
      mode: "world-cup",
      dataDir: path.join(rootDataDir, "world-cup"),
      teamsDir: path.join(rootDataDir, "world-cup", "teams"),
      metaCsvPath: path.join(rootDataDir, "world-cup", "teams.csv"),
      playersImageDir: path.join(imgDir, "players-world-cup"),
      tournamentLogosCsvPath: path.join(rootDataDir, "world-cup", "tournament-logos.csv"),
      teamLogosCsvPath: path.join(rootDataDir, "world-cup", "team-logos.csv"),
    },
  };

  const ensureDataset = (dataset: Dataset) => {
    if (!fs.existsSync(dataset.dataDir)) fs.mkdirSync(dataset.dataDir, { recursive: true });
    if (!fs.existsSync(dataset.teamsDir)) fs.mkdirSync(dataset.teamsDir, { recursive: true });
    if (!fs.existsSync(dataset.playersImageDir)) fs.mkdirSync(dataset.playersImageDir, { recursive: true });
    if (!fs.existsSync(dataset.metaCsvPath)) {
      fs.writeFileSync(dataset.metaCsvPath, "team,background,glowColor,defaultFormation,linkedTeam\n");
    }
  };

  const ensureLogoCsv = (filePath: string, seedRows: Array<{ name: string; url: string }>) => {
    if (fs.existsSync(filePath)) return;
    const lines = ["name,url"].concat(
      seedRows.map(row => [csvEscape(row.name), csvEscape(row.url)].join(","))
    );
    fs.writeFileSync(filePath, lines.join("\n") + "\n");
  };

  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
  if (!fs.existsSync(bgDir)) fs.mkdirSync(bgDir, { recursive: true });
  ensureDataset(datasetByMode.uefa);
  ensureDataset(datasetByMode["world-cup"]);
  ensureLogoCsv(datasetByMode.uefa.tournamentLogosCsvPath, []);
  ensureLogoCsv(datasetByMode.uefa.teamLogosCsvPath, []);
  ensureLogoCsv(datasetByMode["world-cup"].tournamentLogosCsvPath, []);
  ensureLogoCsv(datasetByMode["world-cup"].teamLogosCsvPath, []);

  const getModeFromRequest = (req: express.Request): Mode =>
    req.path.startsWith("/api/world-cup/") || req.query.mode === "world-cup" ? "world-cup" : "uefa";
  const getDatasetFromRequest = (req: express.Request) => datasetByMode[getModeFromRequest(req)];

  const legacyPlayersCsvPath = path.join(rootDataDir, "teams-legacy.csv");
  const legacyMetaJsonPath = path.join(rootDataDir, "teams-meta.json");
  const migrationMarker = path.join(rootDataDir, ".migrated-v2");

  const isLegacyPlayersCsv = (filePath: string) => {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, "utf-8");
    const firstLine = (content.split("\n")[0] || "").trim();
    return firstLine === "team,name,display-name,image-url,role";
  };

  const migrateLegacyIfNeeded = () => {
    const dataset = datasetByMode.uefa;
    if (fs.existsSync(migrationMarker)) return;
    const hasTeamFiles = fs.readdirSync(dataset.teamsDir).some(f => f.toLowerCase().endsWith('.csv'));
    const metaFirstLine = (fs.readFileSync(dataset.metaCsvPath, "utf-8").split("\n")[0] || "").trim();
    const metaIsNew =
      metaFirstLine === "team,background,glowColor,defaultFormation" ||
      metaFirstLine === "team,background,glowColor,defaultFormation,linkedTeam";
    if (hasTeamFiles && metaIsNew) {
      fs.writeFileSync(migrationMarker, new Date().toISOString() + "\n");
      return;
    }
    const legacySourcePath = isLegacyPlayersCsv(dataset.metaCsvPath) ? dataset.metaCsvPath : (isLegacyPlayersCsv(legacyPlayersCsvPath) ? legacyPlayersCsvPath : "");
    if (!legacySourcePath) return;

    const content = fs.readFileSync(legacySourcePath, "utf-8");
    const lines = content.split("\n").filter(line => line.trim() !== "");
    if (lines.length <= 1) return;
    const headers = parseCsvLine(lines[0]);
    const data = lines.slice(1).map(line => {
      const values = parseCsvLine(line);
      return headers.reduce((obj, header, i) => {
        obj[header] = values[i] ?? '';
        return obj;
      }, {} as any);
    });

    const grouped: Record<string, any[]> = {};
    data.forEach(row => {
      const team = String(row.team || '').trim();
      if (!team) return;
      if (!grouped[team]) grouped[team] = [];
      grouped[team].push(row);
    });

    Object.entries(grouped).forEach(([team, players]) => {
      const teamCsvPath = path.join(dataset.teamsDir, `${team}.csv`);
      const teamHeaders = "name,display-name,image-url,role";
      const teamLines = players.map(p => [
        csvEscape(String(p.name || '')),
        csvEscape(String(p['display-name'] || '')),
        csvEscape(String(p['image-url'] || '')),
        csvEscape(String(p.role || ''))
      ].join(","));
      fs.writeFileSync(teamCsvPath, [teamHeaders, ...teamLines].join("\n") + "\n");
    });

    // build meta csv from legacy json if available
    const meta: Record<string, any> = {};
    if (fs.existsSync(legacyMetaJsonPath)) {
      try {
        Object.assign(meta, JSON.parse(fs.readFileSync(legacyMetaJsonPath, "utf-8")));
      } catch {}
    }
    const outLines = ["team,background,glowColor,defaultFormation,linkedTeam"];
    Object.keys(grouped).forEach(team => {
      outLines.push([
        csvEscape(team),
        csvEscape(String(meta[team]?.background || '')),
        csvEscape(String(meta[team]?.glowColor || '')),
        csvEscape(String(meta[team]?.defaultFormation || '')),
        csvEscape(String(meta[team]?.linkedTeam || '')),
      ].join(","));
    });
    fs.writeFileSync(dataset.metaCsvPath, outLines.join("\n") + "\n");

    if (legacySourcePath === dataset.metaCsvPath) {
      fs.writeFileSync(legacyPlayersCsvPath, content);
    }

    fs.writeFileSync(migrationMarker, new Date().toISOString() + "\n");
  };

  migrateLegacyIfNeeded();

  // API Routes
  const readMetaCsv = (metaPath: string) => {
    const content = fs.readFileSync(metaPath, "utf-8");
    const lines = content.split("\n").filter(line => line.trim() !== "");
    if (!lines.length) return { headers: [], rows: [] as any[] };
    const headers = parseCsvLine(lines[0]);
    const normalizedHeaders = headers.includes('linkedTeam') ? headers : [...headers, 'linkedTeam'];
    const rows = lines.slice(1).map(line => {
      const values = parseCsvLine(line);
      return normalizedHeaders.reduce((obj, header, i) => {
        if (header === 'linkedTeam' && !headers.includes('linkedTeam')) {
          obj[header] = '';
          return obj;
        }
        obj[header] = values[i] ?? '';
        return obj;
      }, {} as any);
    });
    return { headers: normalizedHeaders, rows };
  };

  const readTeamPlayersCsv = (teamsPath: string, teamName: string) => {
    const filePath = path.join(teamsPath, `${teamName}.csv`);
    if (!fs.existsSync(filePath)) return [] as any[];
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter(line => line.trim() !== "");
    if (!lines.length) return [];
    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map(line => {
      const values = parseCsvLine(line);
      return headers.reduce((obj, header, i) => {
        obj[header] = values[i] ?? '';
        return obj;
      }, {} as any);
    });
  };

  const readSimpleNameUrlCsv = (filePath: string) => {
    if (!fs.existsSync(filePath)) return [] as Array<{ name: string; url: string }>;
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter(line => line.trim() !== "");
    if (!lines.length) return [];
    const headers = parseCsvLine(lines[0]);
    return lines
      .slice(1)
      .map(line => {
        const values = parseCsvLine(line);
        const row = headers.reduce((obj, header, i) => {
          obj[header] = values[i] ?? '';
          return obj;
        }, {} as Record<string, string>);
        return {
          name: String(row.name || '').trim(),
          url: String(row.url || '').trim(),
        };
      })
      .filter(row => row.name);
  };

  app.get(["/api/teams", "/api/world-cup/teams"], (req, res) => {
    try {
      const dataset = getDatasetFromRequest(req);
      const { rows } = readMetaCsv(dataset.metaCsvPath);
      const teams = rows.map(r => String(r.team || '').trim()).filter(Boolean);
      const players: any[] = [];
      for (const team of teams) {
        const teamPlayers = readTeamPlayersCsv(dataset.teamsDir, team).map(p => ({
          team,
          name: p.name ?? '',
          'display-name': p['display-name'] ?? p.displayName ?? '',
          'image-url': p['image-url'] ?? p.imageUrl ?? '',
          role: p.role ?? ''
        }));
        players.push(...teamPlayers);
      }
      const meta = rows.reduce((acc: any, row: any) => {
        const t = String(row.team || '').trim();
        if (!t) return acc;
        acc[t] = {
          background: String(row.background || ''),
          glowColor: String(row.glowColor || ''),
          defaultFormation: String(row.defaultFormation || ''),
          linkedTeam: String(row.linkedTeam || ''),
        };
        return acc;
      }, {});
      res.json({ teams, players, meta });
    } catch (error) {
      console.error("Failed to read teams:", error);
      res.status(500).json({ error: "Failed to read teams" });
    }
  });

  app.post(["/api/save-team", "/api/world-cup/save-team"], async (req, res) => {
    const { teamName, players, background, glowColor, defaultFormation, preprocessUefa } = req.body;
    try {
      const dataset = getDatasetFromRequest(req);
      console.log('save-team preprocessUefa:', preprocessUefa);
      const preprocessFlag =
        preprocessUefa === true ||
        preprocessUefa === 'true' ||
        preprocessUefa === 1 ||
        preprocessUefa === '1';
      const shouldProcessImages = dataset.mode === "world-cup" || preprocessFlag;
      const normalizedTeamName = String(teamName || '').trim();
      if (!normalizedTeamName || !Array.isArray(players) || players.length === 0) {
        return res.status(400).json({ error: "Invalid team data" });
      }
      const teamCsvPath = path.join(dataset.teamsDir, `${normalizedTeamName}.csv`);
      const teamHeaders = "name,display-name,image-url,role";
      const teamLines = players.map((p: any) =>
        [
          csvEscape(String(p.name || '')),
          csvEscape(String(p.displayName || '')),
          csvEscape(String(p.imageUrl || '')),
          csvEscape(String(p.role || ''))
        ].join(",")
      );
      fs.writeFileSync(teamCsvPath, [teamHeaders, ...teamLines].join("\n") + "\n");

      // Update meta CSV
      const { headers: metaHeaders, rows } = readMetaCsv(dataset.metaCsvPath);
      const headers = metaHeaders.length ? metaHeaders : parseCsvLine("team,background,glowColor,defaultFormation,linkedTeam");
      const updatedRows = rows.filter((r: any) => String(r.team || '').trim() !== normalizedTeamName);
      updatedRows.push({
        team: normalizedTeamName,
        background: String(background || '').trim(),
        glowColor: String(glowColor || '').trim(),
        defaultFormation: String(defaultFormation || '').trim(),
        linkedTeam: '',
      });
      const outLines = [headers.join(',')].concat(updatedRows.map(r =>
        headers.map(h => csvEscape(String(r[h] ?? ''))).join(',')
      ));
      fs.writeFileSync(dataset.metaCsvPath, outLines.join("\n") + "\n");

      if (shouldProcessImages) {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');
        // flush headers so the client can start reading
        // @ts-ignore
        res.flushHeaders?.();
        res.write(JSON.stringify({ type: 'debug', preprocessUefa: preprocessFlag, mode: dataset.mode }) + "\n");
        const teamOutDir = path.join(dataset.playersImageDir, normalizedTeamName);
        if (!fs.existsSync(teamOutDir)) fs.mkdirSync(teamOutDir, { recursive: true });
        const processedPlayers = players.map((p: any) => ({
          name: String(p.name || '').trim(),
          displayName: String(p.displayName || '').trim(),
          imageUrl: String(p.imageUrl || '').trim(),
          role: String(p.role || '').trim(),
        }));
        if (dataset.mode !== "world-cup" && !existsSync(rembgScript)) {
          res.write(JSON.stringify({
            type: 'error',
            current: 0,
            total: players.length,
            player: '',
            message: `Missing rembg script at ${rembgScript}`
          }) + "\n");
          res.write(JSON.stringify({ type: 'done' }) + "\n");
          return res.end();
        }
        let current = 0;
        const total = players.length;
        res.write(JSON.stringify({ type: 'progress', current, total }) + "\n");
        await new Promise(r => setTimeout(r, 0));
        for (let index = 0; index < players.length; index += 1) {
          const p = players[index];
          const imageUrl = String(p.imageUrl || '').trim();
          const displayName = String(p.displayName || '').trim();
          if (!imageUrl || !displayName) {
            current += 1;
            res.write(JSON.stringify({ type: 'progress', current, total }) + "\n");
            continue;
          }
          const slug = slugify(displayName);
          if (!slug) continue;
          const outExt = dataset.mode === "world-cup" ? "webp" : "png";
          const outPath = path.join(teamOutDir, `${slug}.${outExt}`);
          const tmpIn = path.join(os.tmpdir(), `team_${Date.now()}_${Math.random().toString(36).slice(2)}.img`);
          const tmpOut = path.join(os.tmpdir(), `team_${Date.now()}_${Math.random().toString(36).slice(2)}.${outExt}`);
          try {
            await downloadToFile(dataset.mode === "world-cup" ? toFifaQuality100Url(imageUrl) : imageUrl, tmpIn);
            if (dataset.mode === "world-cup") {
              await cropWorldCupPortrait(tmpIn, tmpOut);
            } else {
              const configuredMaxSize = Number(process.env.REMBG_IMPORT_MAX_INPUT_SIZE);
              await rembgWorker.process(tmpIn, tmpOut, {
                alphaMatting: process.env.REMBG_ALPHA_MATTING !== "0",
                maxInputSize: Number.isFinite(configuredMaxSize) && configuredMaxSize > 0
                  ? configuredMaxSize
                  : 1920,
              });
            }
            if (fs.existsSync(tmpOut)) {
              fs.copyFileSync(tmpOut, outPath);
              if (dataset.mode === "world-cup") {
                processedPlayers[index].imageUrl =
                  `/img/players-world-cup/${encodeURIComponent(normalizedTeamName)}/${encodeURIComponent(slug)}.webp`;
              }
            } else {
              throw new Error('rembg did not produce output');
            }
            current += 1;
            res.write(JSON.stringify({ type: 'progress', current, total }) + "\n");
          } catch (e: any) {
            console.error(`Preprocess failed for ${displayName}:`, e);
            current += 1;
            res.write(JSON.stringify({
              type: 'error',
              current,
              total,
              player: displayName,
              message: e?.message || String(e)
            }) + "\n");
          } finally {
            try { fs.unlinkSync(tmpIn); } catch {}
            try { fs.unlinkSync(tmpOut); } catch {}
          }
        }
        if (dataset.mode === "world-cup") {
          const processedTeamLines = processedPlayers.map((p: any) =>
            [
              csvEscape(String(p.name || '')),
              csvEscape(String(p.displayName || '')),
              csvEscape(String(p.imageUrl || '')),
              csvEscape(String(p.role || ''))
            ].join(",")
          );
          fs.writeFileSync(teamCsvPath, [teamHeaders, ...processedTeamLines].join("\n") + "\n");
        }
        res.write(JSON.stringify({ type: 'done' }) + "\n");
        return res.end();
      }
      res.json({ success: true, preprocessUefa: preprocessFlag });
    } catch (error) {
      res.status(500).json({ error: "Failed to save team" });
    }
  });

  app.get("/api/backgrounds", (req, res) => {
    try {
      const files = fs.readdirSync(bgDir);
      res.json(files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)));
    } catch (error) {
      res.json([]);
    }
  });

  const handleGetLogoOptions = (req: express.Request, res: express.Response) => {
    const dataset = getDatasetFromRequest(req);
    const kind = req.params.kind === "team" ? "team" : req.params.kind === "tournament" ? "tournament" : "";
    if (!kind) return res.status(400).json({ error: "Invalid logo kind" });
    try {
      const filePath = kind === "team" ? dataset.teamLogosCsvPath : dataset.tournamentLogosCsvPath;
      const options = readSimpleNameUrlCsv(filePath);
      res.json({ options });
    } catch (error) {
      console.error("Failed to read logo options:", error);
      res.status(500).json({ error: "Failed to read logo options" });
    }
  };

  app.get("/api/logo-options/:kind", handleGetLogoOptions);
  app.get("/api/world-cup/logo-options/:kind", handleGetLogoOptions);

  app.get(["/api/admin/meta", "/api/world-cup/admin/meta"], (req, res) => {
    try {
      const dataset = getDatasetFromRequest(req);
      const { headers, rows } = readMetaCsv(dataset.metaCsvPath);
      res.json({ headers, rows });
    } catch (e) {
      res.status(500).json({ error: 'Failed to read teams meta' });
    }
  });

  app.post(["/api/admin/meta", "/api/world-cup/admin/meta"], (req, res) => {
    try {
      const dataset = getDatasetFromRequest(req);
      const { headers, rows } = req.body || {};
      const safeHeaders = Array.isArray(headers) && headers.length
        ? headers
        : ['team', 'background', 'glowColor', 'defaultFormation', 'linkedTeam'];
      const safeRows = Array.isArray(rows) ? rows : [];
      const outLines = [safeHeaders.join(',')].concat(safeRows.map((r: any) =>
        safeHeaders.map(h => csvEscape(String(r?.[h] ?? ''))).join(',')
      ));
      fs.writeFileSync(dataset.metaCsvPath, outLines.join("\n") + "\n");
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to write teams meta' });
    }
  });

  app.get(["/api/admin/teams/:team/players", "/api/world-cup/admin/teams/:team/players"], (req, res) => {
    try {
      const dataset = getDatasetFromRequest(req);
      const team = String(req.params.team || '');
      const rows = readTeamPlayersCsv(dataset.teamsDir, team);
      res.json({ headers: ['name', 'display-name', 'image-url', 'role'], rows });
    } catch (e) {
      res.status(500).json({ error: 'Failed to read team players' });
    }
  });

  app.post(["/api/admin/teams/:team/players", "/api/world-cup/admin/teams/:team/players"], (req, res) => {
    try {
      const dataset = getDatasetFromRequest(req);
      const team = String(req.params.team || '');
      const { rows } = req.body || {};
      const safeRows = Array.isArray(rows) ? rows : [];
      const headers = ['name', 'display-name', 'image-url', 'role'];
      const outLines = [headers.join(',')].concat(safeRows.map((r: any) =>
        headers.map(h => csvEscape(String(r?.[h] ?? ''))).join(',')
      ));
      const teamCsvPath = path.join(dataset.teamsDir, `${team}.csv`);
      fs.writeFileSync(teamCsvPath, outLines.join("\n") + "\n");
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to write team players' });
    }
  });

  app.post(["/api/admin/teams/:team/player-rename", "/api/world-cup/admin/teams/:team/player-rename"], (req, res) => {
    try {
      const dataset = getDatasetFromRequest(req);
      const team = String(req.params.team || '').trim();
      const fromDisplayName = String(req.body?.fromDisplayName || '').trim();
      const toDisplayName = String(req.body?.toDisplayName || '').trim();
      const imageUrl = String(req.body?.imageUrl || '').trim();

      if (!team || !fromDisplayName || !toDisplayName || !imageUrl) {
        return res.status(400).json({ error: 'Missing rename data' });
      }
      if (fromDisplayName === toDisplayName) {
        return res.json({ success: true, imageUrl });
      }
      if (!imageUrl.startsWith('/img/')) {
        return res.json({ success: true, imageUrl });
      }

      const imagePath = path.normalize(path.join(__dirname, 'public', imageUrl.replace(/^\/img\//, 'img/')));
      const allowedRoot = path.normalize(dataset.playersImageDir);
      if (!imagePath.startsWith(allowedRoot) || !fs.existsSync(imagePath)) {
        return res.json({ success: true, imageUrl });
      }

      const ext = path.extname(imagePath);
      const newSlug = slugify(toDisplayName);
      if (!newSlug) {
        return res.status(400).json({ error: 'Invalid target display name' });
      }
      const newPath = path.join(path.dirname(imagePath), `${newSlug}${ext}`);
      if (imagePath !== newPath && !fs.existsSync(newPath)) {
        fs.renameSync(imagePath, newPath);
      }

      const relativeImagePath = '/' + path.relative(path.join(__dirname, 'public'), newPath).replace(/\\/g, '/');
      res.json({ success: true, imageUrl: relativeImagePath });
    } catch (e) {
      console.error('Player rename failed:', e);
      res.status(500).json({ error: 'Failed to rename player image' });
    }
  });

  app.post(["/api/admin/teams/:team/delete", "/api/world-cup/admin/teams/:team/delete"], (req, res) => {
    try {
      const dataset = getDatasetFromRequest(req);
      const team = String(req.params.team || '').trim();
      if (!team) {
        return res.status(400).json({ error: 'Missing team name' });
      }

      const teamCsvPath = path.join(dataset.teamsDir, `${team}.csv`);
      if (fs.existsSync(teamCsvPath)) {
        fs.unlinkSync(teamCsvPath);
      }

      const teamImageDir = path.join(dataset.playersImageDir, team);
      if (fs.existsSync(teamImageDir)) {
        fs.rmSync(teamImageDir, { recursive: true, force: true });
      }

      const { headers, rows } = readMetaCsv(dataset.metaCsvPath);
      const safeHeaders = headers.length
        ? headers
        : ['team', 'background', 'glowColor', 'defaultFormation', 'linkedTeam'];
      const filteredRows = rows.filter((row: any) => String(row.team || '').trim() !== team);
      const outLines = [safeHeaders.join(',')].concat(
        filteredRows.map((row: any) => safeHeaders.map(header => csvEscape(String(row?.[header] ?? ''))).join(','))
      );
      fs.writeFileSync(dataset.metaCsvPath, outLines.join("\n") + "\n");

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete team' });
    }
  });

  app.post(["/api/admin/teams/rename", "/api/world-cup/admin/teams/rename"], (req, res) => {
    try {
      const dataset = getDatasetFromRequest(req);
      const from = String(req.body?.from || '').trim();
      const to = String(req.body?.to || '').trim();

      if (!from || !to) {
        return res.status(400).json({ error: 'Missing team names' });
      }
      if (from === to) {
        return res.json({ success: true });
      }

      const fromCsvPath = path.join(dataset.teamsDir, `${from}.csv`);
      const toCsvPath = path.join(dataset.teamsDir, `${to}.csv`);
      if (fs.existsSync(fromCsvPath) && !fs.existsSync(toCsvPath)) {
        fs.renameSync(fromCsvPath, toCsvPath);
      }

      const fromImageDir = path.join(dataset.playersImageDir, from);
      const toImageDir = path.join(dataset.playersImageDir, to);
      if (fs.existsSync(fromImageDir) && !fs.existsSync(toImageDir)) {
        fs.renameSync(fromImageDir, toImageDir);
      }

      if (fs.existsSync(toCsvPath)) {
        const rows = readTeamPlayersCsv(dataset.teamsDir, to);
        const updatedRows = rows.map((row: any) => {
          const imageUrl = String(row['image-url'] || '');
          if (!imageUrl) return row;
          const encodedFrom = encodeURIComponent(from);
          const encodedTo = encodeURIComponent(to);
          return {
            ...row,
            'image-url': imageUrl.replace(`/img/${path.basename(dataset.playersImageDir)}/${encodedFrom}/`, `/img/${path.basename(dataset.playersImageDir)}/${encodedTo}/`),
          };
        });
        const headers = ['name', 'display-name', 'image-url', 'role'];
        const outLines = [headers.join(',')].concat(
          updatedRows.map((row: any) => headers.map(header => csvEscape(String(row?.[header] ?? ''))).join(','))
        );
        fs.writeFileSync(toCsvPath, outLines.join("\n") + "\n");
      }

      res.json({ success: true });
    } catch (e) {
      console.error('Team rename failed:', e);
      res.status(500).json({ error: 'Failed to rename team' });
    }
  });

  app.get('/api/admin/files', (req, res) => {
    const root = imgDir;
    const rel = String(req.query.path || '').replace(/\\/g, '/').replace(/^\//, '');
    const target = path.normalize(path.join(root, rel));
    if (!target.startsWith(root)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    try {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(target, { withFileTypes: true }).map(d => ({
          name: d.name,
          type: d.isDirectory() ? 'dir' : 'file'
        }));
        return res.json({ path: rel, entries });
      }
      return res.json({ path: rel, entries: [] });
    } catch (e) {
      return res.status(404).json({ error: 'Not found' });
    }
  });

  app.post('/api/admin/files/upload', (req, res) => {
    const { path: rel, name, contentBase64 } = req.body || {};
    if (!name || !contentBase64) return res.status(400).json({ error: 'Missing file' });
    const root = imgDir;
    const safeRel = String(rel || '').replace(/\\/g, '/').replace(/^\//, '');
    const targetDir = path.normalize(path.join(root, safeRel));
    if (!targetDir.startsWith(root)) return res.status(400).json({ error: 'Invalid path' });
    try {
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const filePath = path.join(targetDir, name);
      const buf = Buffer.from(String(contentBase64), 'base64');
      fs.writeFileSync(filePath, buf);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  app.post('/api/admin/files/delete', (req, res) => {
    const { path: rel } = req.body || {};
    const root = imgDir;
    const safeRel = String(rel || '').replace(/\\/g, '/').replace(/^\//, '');
    const target = path.normalize(path.join(root, safeRel));
    if (!target.startsWith(root)) return res.status(400).json({ error: 'Invalid path' });
    try {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Delete failed' });
    }
  });

  app.post('/api/admin/files/rename', (req, res) => {
    const { from, to } = req.body || {};
    const root = imgDir;
    const safeFrom = String(from || '').replace(/\\/g, '/').replace(/^\//, '');
    const safeTo = String(to || '').replace(/\\/g, '/').replace(/^\//, '');
    const src = path.normalize(path.join(root, safeFrom));
    const dst = path.normalize(path.join(root, safeTo));
    if (!src.startsWith(root) || !dst.startsWith(root)) return res.status(400).json({ error: 'Invalid path' });
    try {
      fs.renameSync(src, dst);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Rename failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, "dist");
    const assetsDir = path.join(distDir, "assets");
    app.use(
      "/assets",
      express.static(assetsDir, {
        maxAge: "1y",
        immutable: true,
      })
    );
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-store");
          }
        },
      })
    );
    app.get("/", (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(path.join(distDir, "index.html"));
    });
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
