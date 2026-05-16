import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";
import os from "os";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

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
    return result;
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

  const getPythonBin = () => {
    if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
    return "python3";
  };

  // Ensure directories exist
  const dataDir = path.join(__dirname, "data");
  const imgDir = path.join(__dirname, "public", "img");
  const bgDir = path.join(imgDir, "backgrounds");
  const playersUefaDir = path.join(imgDir, "players-uefa");
  const teamsDir = path.join(dataDir, "teams");
  const metaCsvPath = path.join(dataDir, "teams.csv");
  
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(bgDir)) fs.mkdirSync(bgDir, { recursive: true });
  if (!fs.existsSync(playersUefaDir)) fs.mkdirSync(playersUefaDir, { recursive: true });
  if (!fs.existsSync(teamsDir)) fs.mkdirSync(teamsDir, { recursive: true });

  if (!fs.existsSync(metaCsvPath)) {
    fs.writeFileSync(metaCsvPath, "team,background,glowColor,defaultFormation,linkedTeam\n");
  }

  const legacyPlayersCsvPath = path.join(dataDir, "teams-legacy.csv");
  const legacyMetaJsonPath = path.join(dataDir, "teams-meta.json");
  const migrationMarker = path.join(dataDir, ".migrated-v2");

  const isLegacyPlayersCsv = (filePath: string) => {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, "utf-8");
    const firstLine = (content.split("\n")[0] || "").trim();
    return firstLine === "team,name,display-name,image-url,role";
  };

  const migrateLegacyIfNeeded = () => {
    if (fs.existsSync(migrationMarker)) return;
    const hasTeamFiles = fs.readdirSync(teamsDir).some(f => f.toLowerCase().endsWith('.csv'));
    const metaFirstLine = (fs.readFileSync(metaCsvPath, "utf-8").split("\n")[0] || "").trim();
    const metaIsNew =
      metaFirstLine === "team,background,glowColor,defaultFormation" ||
      metaFirstLine === "team,background,glowColor,defaultFormation,linkedTeam";
    if (hasTeamFiles && metaIsNew) {
      fs.writeFileSync(migrationMarker, new Date().toISOString() + "\n");
      return;
    }
    const legacySourcePath = isLegacyPlayersCsv(metaCsvPath) ? metaCsvPath : (isLegacyPlayersCsv(legacyPlayersCsvPath) ? legacyPlayersCsvPath : "");
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
      const teamCsvPath = path.join(teamsDir, `${team}.csv`);
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
    fs.writeFileSync(metaCsvPath, outLines.join("\n") + "\n");

    if (legacySourcePath === metaCsvPath) {
      fs.writeFileSync(legacyPlayersCsvPath, content);
    }

    fs.writeFileSync(migrationMarker, new Date().toISOString() + "\n");
  };

  migrateLegacyIfNeeded();

  // API Routes
  const readMetaCsv = () => {
    const content = fs.readFileSync(metaCsvPath, "utf-8");
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

  const readTeamPlayersCsv = (teamName: string) => {
    const filePath = path.join(teamsDir, `${teamName}.csv`);
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

  app.get("/api/teams", (req, res) => {
    try {
      const { rows } = readMetaCsv();
      const teams = rows.map(r => String(r.team || '').trim()).filter(Boolean);
      const players: any[] = [];
      for (const team of teams) {
        const teamPlayers = readTeamPlayersCsv(team).map(p => ({
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

  app.post("/api/save-team", async (req, res) => {
    const { teamName, players, background, glowColor, defaultFormation, preprocessUefa } = req.body;
    try {
      console.log('save-team preprocessUefa:', preprocessUefa);
      const preprocessFlag =
        preprocessUefa === true ||
        preprocessUefa === 'true' ||
        preprocessUefa === 1 ||
        preprocessUefa === '1';
      const normalizedTeamName = String(teamName || '').trim();
      if (!normalizedTeamName || !Array.isArray(players) || players.length === 0) {
        return res.status(400).json({ error: "Invalid team data" });
      }
      const teamCsvPath = path.join(teamsDir, `${normalizedTeamName}.csv`);
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
      const { headers: metaHeaders, rows } = readMetaCsv();
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
      fs.writeFileSync(metaCsvPath, outLines.join("\n") + "\n");

      if (preprocessFlag) {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');
        // flush headers so the client can start reading
        // @ts-ignore
        res.flushHeaders?.();
        res.write(JSON.stringify({ type: 'debug', preprocessUefa: preprocessFlag }) + "\n");
        const teamOutDir = path.join(playersUefaDir, normalizedTeamName);
        if (!fs.existsSync(teamOutDir)) fs.mkdirSync(teamOutDir, { recursive: true });
        const rembgScript = path.join(__dirname, "scripts", "rembg_remove.py");
        if (!existsSync(rembgScript)) {
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
        for (const p of players) {
          const imageUrl = String(p.imageUrl || '').trim();
          const displayName = String(p.displayName || '').trim();
          if (!imageUrl || !displayName) {
            current += 1;
            res.write(JSON.stringify({ type: 'progress', current, total }) + "\n");
            continue;
          }
          const slug = slugify(displayName);
          if (!slug) continue;
          const outPath = path.join(teamOutDir, `${slug}.png`);
          const tmpIn = path.join(os.tmpdir(), `uefa_${Date.now()}_${Math.random().toString(36).slice(2)}.img`);
          const tmpOut = path.join(os.tmpdir(), `uefa_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
          try {
            await downloadToFile(imageUrl, tmpIn);
            const pythonBin = getPythonBin();
            await execFileAsync(pythonBin, [rembgScript, tmpIn, tmpOut]);
            if (fs.existsSync(tmpOut)) {
              fs.copyFileSync(tmpOut, outPath);
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

  app.get("/api/admin/meta", (req, res) => {
    try {
      const { headers, rows } = readMetaCsv();
      res.json({ headers, rows });
    } catch (e) {
      res.status(500).json({ error: 'Failed to read teams meta' });
    }
  });

  app.post("/api/admin/meta", (req, res) => {
    try {
      const { headers, rows } = req.body || {};
      const safeHeaders = Array.isArray(headers) && headers.length
        ? headers
        : ['team', 'background', 'glowColor', 'defaultFormation', 'linkedTeam'];
      const safeRows = Array.isArray(rows) ? rows : [];
      const outLines = [safeHeaders.join(',')].concat(safeRows.map((r: any) =>
        safeHeaders.map(h => csvEscape(String(r?.[h] ?? ''))).join(',')
      ));
      fs.writeFileSync(metaCsvPath, outLines.join("\n") + "\n");
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to write teams meta' });
    }
  });

  app.get("/api/admin/teams/:team/players", (req, res) => {
    try {
      const team = String(req.params.team || '');
      const rows = readTeamPlayersCsv(team);
      res.json({ headers: ['name', 'display-name', 'image-url', 'role'], rows });
    } catch (e) {
      res.status(500).json({ error: 'Failed to read team players' });
    }
  });

  app.post("/api/admin/teams/:team/players", (req, res) => {
    try {
      const team = String(req.params.team || '');
      const { rows } = req.body || {};
      const safeRows = Array.isArray(rows) ? rows : [];
      const headers = ['name', 'display-name', 'image-url', 'role'];
      const outLines = [headers.join(',')].concat(safeRows.map((r: any) =>
        headers.map(h => csvEscape(String(r?.[h] ?? ''))).join(',')
      ));
      const teamCsvPath = path.join(teamsDir, `${team}.csv`);
      fs.writeFileSync(teamCsvPath, outLines.join("\n") + "\n");
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to write team players' });
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
