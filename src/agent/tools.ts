import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, copyFileSync, renameSync, unlinkSync } from 'fs';
import { resolve, join, dirname, extname, basename } from 'path';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { Type } from '@mariozechner/pi-ai';
import type { Tool, ToolResultMessage } from '@mariozechner/pi-ai';
import { loadSkills, imageToBase64 } from './loader.js';
import { analyseImage } from './analyser.js';
import type { AiProvider } from './chat.js';

// ── Binary file detection ─────────────────────────────────────────────────────

const BINARY_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.ico',
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z', '.exe', '.dll', '.bin',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.woff', '.woff2', '.ttf',
]);

function isBinaryPath(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(filePath).toLowerCase());
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const listDirectoryTool: Tool = {
  name: 'list_directory',
  description: 'List the files and subdirectories inside a directory on the local filesystem.',
  parameters: Type.Object({
    path: Type.String({ description: 'Absolute or relative path to the directory.' }),
  }),
};

const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file. For large files, use offset and limit to read a section.',
  parameters: Type.Object({
    path:   Type.String({ description: 'Path to the file.' }),
    offset: Type.Optional(Type.Number({ description: 'Line number to start from (1-indexed). Default: 1.' })),
    limit:  Type.Optional(Type.Number({ description: 'Maximum number of lines to return. Default: 200.' })),
  }),
};

const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Write (overwrite) content to a file. Creates the file and any missing parent directories.',
  parameters: Type.Object({
    path:    Type.String({ description: 'Path to the file.' }),
    content: Type.String({ description: 'Content to write.' }),
  }),
};

const copyFileTool: Tool = {
  name: 'copy_file',
  description: 'Copy a file from one path to another.',
  parameters: Type.Object({
    src:  Type.String({ description: 'Source file path.' }),
    dest: Type.String({ description: 'Destination file path.' }),
  }),
};

const moveFileTool: Tool = {
  name: 'move_file',
  description: 'Move or rename a file.',
  parameters: Type.Object({
    src:  Type.String({ description: 'Source path.' }),
    dest: Type.String({ description: 'Destination path.' }),
  }),
};

const deleteFileTool: Tool = {
  name: 'delete_file',
  description: 'Delete a file from the filesystem.',
  parameters: Type.Object({
    path: Type.String({ description: 'Path to the file to delete.' }),
  }),
};

const runCommandTool: Tool = {
  name: 'run_command',
  description:
    'Run a shell command and return its stdout/stderr. ' +
    'Use this for grep, find, curl, ping, ipconfig, dir, ls, cat, and any other CLI tool. ' +
    'On Windows, commands run in cmd.exe. Prefer PowerShell syntax for complex operations.',
  parameters: Type.Object({
    command: Type.String({ description: 'The command to execute.' }),
    cwd:     Type.Optional(Type.String({ description: 'Working directory. Defaults to current directory.' })),
    timeout: Type.Optional(Type.Number({ description: 'Timeout in milliseconds. Default: 10000.' })),
  }),
};

const httpRequestTool: Tool = {
  name: 'http_request',
  description: 'Make an HTTP/HTTPS GET or POST request and return the response body.',
  parameters: Type.Object({
    url:     Type.String({ description: 'The URL to request.' }),
    method:  Type.Optional(Type.String({ description: 'HTTP method: GET or POST. Default: GET.' })),
    headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Request headers.' })),
    body:    Type.Optional(Type.String({ description: 'Request body for POST requests.' })),
  }),
};

const analyseImageWithSkillTool: Tool = {
  name: 'analyse_image_with_skill',
  description:
    'Analyse a meter image for defects using a specific skill. ' +
    'Provide the image filename (or partial name) and the skill name. ' +
    'The tool loads the image and skill, runs visual AI analysis, and returns structured findings. ' +
    'Use this whenever the user asks to analyse an image or check for a specific defect type.',
  parameters: Type.Object({
    image: Type.String({
      description: 'Image filename or partial filename (e.g. "1c68dfae.jpg" or "1c68dfae"). Fuzzy-matched against available images.',
    }),
    skill: Type.String({
      description: 'Skill name to apply (e.g. "Asbestos", "Black Plastic Cutout"). Fuzzy-matched against loaded skills.',
    }),
  }),
};

export const TOOLS: Tool[] = [
  analyseImageWithSkillTool,
  listDirectoryTool,
  readFileTool,
  writeFileTool,
  copyFileTool,
  moveFileTool,
  deleteFileTool,
  runCommandTool,
  httpRequestTool,
];

// ── Tool execution ────────────────────────────────────────────────────────────

export async function executeTool(
  toolCallId: string,
  toolName: string,
  args: Record<string, any>,
  workspaceDir: string,
  inputDir?: string,
  skillsDir?: string,
  provider?: AiProvider,
): Promise<ToolResultMessage> {
  const timestamp = Date.now();

  try {
    switch (toolName) {

      case 'list_directory': {
        const resolved = resolve(args['path'] ?? '.');
        if (!existsSync(resolved))       return toolError(toolCallId, toolName, `Not found: ${resolved}`, timestamp);
        if (!statSync(resolved).isDirectory()) return toolError(toolCallId, toolName, `Not a directory: ${resolved}`, timestamp);

        const entries = readdirSync(resolved, { withFileTypes: true });
        const lines: string[] = [`Contents of ${resolved}:`, ''];
        const dirs  = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
        const files = entries.filter(e => !e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
        for (const d of dirs)  lines.push(`  [DIR]  ${d.name}`);
        for (const f of files) {
          try { lines.push(`  [FILE] ${f.name}  (${formatBytes(statSync(join(resolved, f.name)).size)})`); }
          catch { lines.push(`  [FILE] ${f.name}`); }
        }
        if (entries.length === 0) lines.push('  (empty)');
        return toolOk(toolCallId, toolName, lines.join('\n'), timestamp);
      }

      case 'read_file': {
        const resolved = resolve(args['path']);
        if (!existsSync(resolved)) return toolError(toolCallId, toolName, `File not found: ${resolved}`, timestamp);
        if (statSync(resolved).isDirectory()) return toolError(toolCallId, toolName, `Path is a directory: ${resolved}`, timestamp);
        if (isBinaryPath(resolved)) return toolError(toolCallId, toolName, `Cannot read binary file: ${resolved}. Use image analysis tools for images.`, timestamp);

        const raw    = readFileSync(resolved, 'utf-8');
        const lines  = raw.split('\n');
        const offset = Math.max(1, args['offset'] ?? 1);
        const limit  = Math.min(500, args['limit'] ?? 200);
        const slice  = lines.slice(offset - 1, offset - 1 + limit);
        const numbered = slice.map((l, i) => `${String(offset + i).padStart(4)}: ${l}`).join('\n');
        const footer = lines.length > offset - 1 + limit
          ? `\n... (${lines.length - (offset - 1 + limit)} more lines)`
          : '';
        return toolOk(toolCallId, toolName, numbered + footer, timestamp);
      }

      case 'write_file': {
        const resolved = resolve(args['path']);
        mkdirSync(dirname(resolved), { recursive: true });
        writeFileSync(resolved, args['content'] ?? '', 'utf-8');
        return toolOk(toolCallId, toolName, `Written: ${resolved}`, timestamp);
      }

      case 'copy_file': {
        const src  = resolve(args['src']);
        const dest = resolve(args['dest']);
        if (!existsSync(src)) return toolError(toolCallId, toolName, `Source not found: ${src}`, timestamp);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(src, dest);
        return toolOk(toolCallId, toolName, `Copied ${src} → ${dest}`, timestamp);
      }

      case 'move_file': {
        const src  = resolve(args['src']);
        const dest = resolve(args['dest']);
        if (!existsSync(src)) return toolError(toolCallId, toolName, `Source not found: ${src}`, timestamp);
        mkdirSync(dirname(dest), { recursive: true });
        renameSync(src, dest);
        return toolOk(toolCallId, toolName, `Moved ${src} → ${dest}`, timestamp);
      }

      case 'delete_file': {
        const resolved = resolve(args['path']);
        if (!existsSync(resolved)) return toolError(toolCallId, toolName, `File not found: ${resolved}`, timestamp);
        unlinkSync(resolved);
        return toolOk(toolCallId, toolName, `Deleted: ${resolved}`, timestamp);
      }

      case 'run_command': {
        const command = args['command'] as string;
        const cwd     = args['cwd'] ? resolve(args['cwd']) : workspaceDir;
        const timeout = args['timeout'] ?? 10000;
        const MAX_OUTPUT_CHARS = 3000;
        try {
          const output = execSync(command, {
            cwd,
            timeout,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          const trimmed = output.length > MAX_OUTPUT_CHARS
            ? output.slice(0, MAX_OUTPUT_CHARS) + `\n... (truncated — ${output.length - MAX_OUTPUT_CHARS} more chars)`
            : output;
          return toolOk(toolCallId, toolName, trimmed || '(no output)', timestamp);
        } catch (err: any) {
          const stdout = err.stdout ?? '';
          const stderr = err.stderr ?? '';
          const combined = [stdout, stderr].filter(Boolean).join('\n');
          const msg = combined || err.message;
          const trimmed = msg.length > MAX_OUTPUT_CHARS
            ? msg.slice(0, MAX_OUTPUT_CHARS) + `\n... (truncated)`
            : msg;
          return toolError(toolCallId, toolName,
            `Exit code ${err.status ?? '?'}:\n${trimmed}`, timestamp);
        }
      }

      case 'http_request': {
        const url    = args['url'] as string;
        const method = (args['method'] ?? 'GET').toUpperCase();
        const headers: Record<string, string> = args['headers'] ?? {};
        const body   = args['body'] as string | undefined;

        // Use Node's built-in https/http — no extra deps
        const result = httpRequestSync(url, method, headers, body);
        return result.error
          ? toolError(toolCallId, toolName, result.error, timestamp)
          : toolOk(toolCallId, toolName,
              `HTTP ${result.status}\n\n${result.body}`, timestamp);
      }

      case 'analyse_image_with_skill': {
        const imageQuery = (args['image'] as string ?? '').toLowerCase();
        const skillQuery = (args['skill'] as string ?? '').toLowerCase();

        // ── Resolve image path ──────────────────────────────────────────────
        const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff']);

        // Collect all images recursively under inputDir (or cwd as fallback)
        const searchDir = inputDir ?? resolve('input');
        const allImages: string[] = [];
        const collectImages = (dir: string) => {
          if (!existsSync(dir)) return;
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) collectImages(full);
            else if (IMAGE_EXTS.has(extname(entry.name).toLowerCase())) allImages.push(full);
          }
        };
        collectImages(searchDir);

        if (allImages.length === 0) {
          return toolError(toolCallId, toolName, `No images found in ${searchDir}.`, timestamp);
        }

        // Exact then fuzzy match on filename
        const matchedImage =
          allImages.find(p => basename(p).toLowerCase() === imageQuery) ??
          allImages.find(p => basename(p).toLowerCase().includes(imageQuery)) ??
          allImages.find(p => imageQuery.includes(basename(p, extname(p)).toLowerCase()));

        if (!matchedImage) {
          const available = allImages.map(p => basename(p)).join(', ');
          return toolError(toolCallId, toolName,
            `Image not found: "${args['image']}". Available images: ${available}`, timestamp);
        }

        // ── Resolve skill ───────────────────────────────────────────────────
        const skillsSearchDir = skillsDir ?? resolve('src/skills');
        const skills = loadSkills(skillsSearchDir);

        if (skills.length === 0) {
          return toolError(toolCallId, toolName, `No skills found in ${skillsSearchDir}.`, timestamp);
        }

        const matchedSkill =
          skills.find(s => s.name.toLowerCase() === skillQuery) ??
          skills.find(s => s.name.toLowerCase().includes(skillQuery)) ??
          skills.find(s => skillQuery.includes(s.name.toLowerCase()));

        if (!matchedSkill) {
          const available = skills.map(s => s.name).join(', ');
          return toolError(toolCallId, toolName,
            `Skill not found: "${args['skill']}". Available skills: ${available}`, timestamp);
        }

        // ── Run analysis ────────────────────────────────────────────────────
        try {
          const result = await analyseImage(matchedImage, [matchedSkill], undefined, provider);

          // Format findings as readable text for the model
          const lines: string[] = [
            `Analysis: ${basename(matchedImage)} × ${matchedSkill.name}`,
            `Overall severity: ${result.overallSeverity.toUpperCase()}`,
            `Summary: ${result.summary}`,
            '',
          ];
          for (const f of result.findings) {
            lines.push(`Skill: ${f.skillName}`);
            lines.push(`  Detected: ${f.detected ? 'YES' : 'NO'}`);
            lines.push(`  Severity: ${f.severity}`);
            lines.push(`  Confidence: ${f.confidence}%`);
            lines.push(`  Description: ${f.description}`);
            lines.push('');
          }

          return toolOk(toolCallId, toolName, lines.join('\n'), timestamp);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return toolError(toolCallId, toolName, `Analysis failed: ${msg}`, timestamp);
        }
      }

      default:
        return toolError(toolCallId, toolName, `Unknown tool: ${toolName}`, timestamp);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return toolError(toolCallId, toolName, `Tool execution failed: ${msg}`, timestamp);
  }
}

// ── HTTP helper (synchronous via child_process) ───────────────────────────────

function httpRequestSync(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): { status?: number; body: string; error?: string } {
  try {
    // Build a curl command — available on Windows 10+ and all Unix
    const headerFlags = Object.entries(headers)
      .map(([k, v]) => `-H "${k}: ${v}"`)
      .join(' ');
    const bodyFlag = body ? `-d ${JSON.stringify(body)}` : '';
    const cmd = `curl -s -i -X ${method} ${headerFlags} ${bodyFlag} "${url}"`;
    const raw = execSync(cmd, { timeout: 15000, encoding: 'utf-8' });

    // Parse status line
    const statusMatch = raw.match(/^HTTP\/\S+\s+(\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1]!) : undefined;

    // Body is everything after the blank line separating headers
    const bodyStart = raw.indexOf('\r\n\r\n');
    const responseBody = bodyStart >= 0 ? raw.slice(bodyStart + 4) : raw;

    return { status, body: responseBody.slice(0, 4000) };
  } catch (err: any) {
    return { body: '', error: err.message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toolOk(toolCallId: string, toolName: string, text: string, timestamp: number): ToolResultMessage {
  return { role: 'toolResult', toolCallId, toolName, content: [{ type: 'text', text }], isError: false, timestamp };
}

function toolError(toolCallId: string, toolName: string, message: string, timestamp: number): ToolResultMessage {
  return { role: 'toolResult', toolCallId, toolName, content: [{ type: 'text', text: message }], isError: true, timestamp };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
