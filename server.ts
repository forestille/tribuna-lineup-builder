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
  const metaPath = path.join(dataDir, "teams-meta.json");
  
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(bgDir)) fs.mkdirSync(bgDir, { recursive: true });
  if (!fs.existsSync(playersUefaDir)) fs.mkdirSync(playersUefaDir, { recursive: true });

  const csvPath = path.join(dataDir, "teams.csv");
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, "team,name,display-name,image-url,role\n");
  }
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, "{}\n");
  }

  // API Routes
  app.get("/api/teams", (req, res) => {
    try {
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n").filter(line => line.trim() !== "");
      if (lines.length === 0) {
        return res.json({ teams: [], players: [], meta: {} });
      }

      const headers = parseCsvLine(lines[0]);
      const data = lines.slice(1).map(line => {
        const values = parseCsvLine(line);
        return headers.reduce((obj, header, i) => {
          obj[header] = values[i] ?? '';
          return obj;
        }, {} as any);
      });
      
      const teams = Array.from(new Set(data.map(p => p.team)));
      let meta = {};
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      } catch {}
      res.json({ teams, players: data, meta });
    } catch (error) {
      console.error("Failed to read teams:", error);
      res.status(500).json({ error: "Failed to read teams" });
    }
  });

  app.post("/api/save-team", async (req, res) => {
    const { teamName, players, background, glowColor, preprocessUefa } = req.body;
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
      // Remove existing players for this team
      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n");
      const headers = lines[0] || "team,name,display-name,image-url,role";
      const otherTeamsPlayers = lines.slice(1).filter(line => {
        if (!line.trim()) return false;
        const values = parseCsvLine(line);
        return (values[0] || '') !== normalizedTeamName;
      });

      const newLines = players.map((p: any) => 
        [
          csvEscape(normalizedTeamName),
          csvEscape(String(p.name || '')),
          csvEscape(String(p.displayName || '')),
          csvEscape(String(p.imageUrl || '')),
          csvEscape(String(p.role || ''))
        ].join(",")
      );

      const finalContent = [headers, ...otherTeamsPlayers, ...newLines].join("\n") + "\n";
      fs.writeFileSync(csvPath, finalContent);

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        meta[normalizedTeamName] = {
          background: String(background || '').trim(),
          glowColor: String(glowColor || '').trim(),
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
      } catch (e) {
        fs.writeFileSync(metaPath, JSON.stringify({
          [normalizedTeamName]: {
            background: String(background || '').trim(),
            glowColor: String(glowColor || '').trim(),
          }
        }, null, 2) + "\n");
      }

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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
