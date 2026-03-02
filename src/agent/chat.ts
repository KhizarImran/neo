import { getModel, stream, complete, type Context } from '@mariozechner/pi-ai';
import { readdirSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { loadSkills, imageToBase64 } from './loader.js';
import { TOOLS, executeTool } from './tools.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff']);

type MimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// ── Intent classification ─────────────────────────────────────────────────────

type Intent =
  | { type: 'conversation' }
  | { type: 'analyse_one';  imagePath: string }
  | { type: 'analyse_many'; imagePaths: string[] };

/**
 * Ask the model to classify what the user wants.
 * Returns structured JSON — no streaming, fast single call.
 */
async function classifyIntent(
  model: NonNullable<ReturnType<typeof getModel>>,
  userText: string,
  availableImages: string[],
  conversationHistory: string,
): Promise<Intent> {
  const imageList = availableImages.map(p => basename(p)).join('\n');

  const classifierContext: Context = {
    systemPrompt: `You are an intent classifier for a meter image defect analysis tool.
Classify the user's message into one of three intents and respond with ONLY valid JSON, no markdown.

Available images:
${imageList}

Intent types:
- "conversation": user is asking a question, chatting, or requesting information — NOT asking to visually analyse an image
- "analyse_one": user wants ONE specific image analysed (include the exact filename)
- "analyse_many": user wants MULTIPLE or ALL images analysed (include all filenames they want)

Examples of "conversation": "how many images are there?", "what skills do you have?", "what did you find earlier?", "explain asbestos", "list the images"
Examples of "analyse_one": "check 1c68dfae.jpg for asbestos", "look at meter a640ec70 for defects"
Examples of "analyse_many": "analyse all images for asbestos", "scan every meter for corrosion", "check the input folder"

Respond with exactly one of:
{"intent":"conversation"}
{"intent":"analyse_one","image":"<exact filename>"}
{"intent":"analyse_many","images":["<filename>","<filename>",...]}`,
    messages: [
      {
        role: 'user',
        content: `Recent conversation:\n${conversationHistory}\n\nNew message: "${userText}"`,
        timestamp: Date.now(),
      },
    ],
  };

  try {
    const response = await complete(model, classifierContext);
    let raw = '';
    for (const block of response.content) {
      if (block.type === 'text') raw += block.text;
    }
    const parsed = JSON.parse(raw.trim().replace(/^```json?\n?/m, '').replace(/\n?```$/m, ''));

    if (parsed.intent === 'conversation') {
      return { type: 'conversation' };
    }
    if (parsed.intent === 'analyse_one' && parsed.image) {
      const match = availableImages.find(p => basename(p) === parsed.image);
      if (match) return { type: 'analyse_one', imagePath: match };
      // fuzzy fallback — partial match
      const fuzzy = availableImages.find(p =>
        basename(p).toLowerCase().includes(parsed.image.toLowerCase()) ||
        parsed.image.toLowerCase().includes(basename(p, extname(p)).toLowerCase())
      );
      return fuzzy
        ? { type: 'analyse_one', imagePath: fuzzy }
        : { type: 'conversation' };
    }
    if (parsed.intent === 'analyse_many' && Array.isArray(parsed.images)) {
      const paths = parsed.images
        .map((name: string) => availableImages.find(p => basename(p) === name))
        .filter(Boolean) as string[];
      return paths.length > 0
        ? { type: 'analyse_many', imagePaths: paths }
        : { type: 'conversation' };
    }
  } catch {
    // If classification fails for any reason, fall back to conversation
  }

  return { type: 'conversation' };
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(skillsDir: string, inputDir: string, workspaceDir: string): string {
  const skills = loadSkills(skillsDir);
  const skillList = skills.map(s => `- **${s.name}**: ${s.description}`).join('\n');

  let imageList = 'No images found.';
  if (existsSync(inputDir)) {
    const images = readdirSync(inputDir)
      .filter(f => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()));
    imageList = images.length > 0
      ? images.map(f => `- ${f}`).join('\n')
      : 'No images found.';
  }

  return `You are Neo, an expert meter image defect analysis agent.

You help users with anything related to meter image defect analysis. You can:
- Answer questions about the available images, skills, and findings
- Discuss defect types and what they mean
- Recall and discuss previous analysis results from this conversation
- Analyse images visually when asked to do so
- Use CLI tools to work with files, directories, and run scripts

## Available Images (in input directory)
${imageList}

## Available Defect Skills
${skillList}

## Workspace Sandbox
You have a dedicated sandbox directory at: ${workspaceDir}

Use this as your working directory when creating files, writing scripts, or running commands.
For example, if you want to write and run a Python script, write it to the workspace and run it there.
The workspace persists between sessions — files you create there will still be there next time.

## Tools
You have access to the following tools for working with the local filesystem and network:

- **list_directory** — browse a directory
- **read_file** — read a file's contents (with optional offset/limit for large files)
- **write_file** — write content to a file (default to workspace for new files)
- **copy_file** — copy a file
- **move_file** — move or rename a file
- **delete_file** — delete a file
- **run_command** — run any shell command (python, grep, find, curl, ping, dir, ls, cat, etc.) — defaults to workspace directory
- **http_request** — make an HTTP GET/POST request

Use these proactively when the user asks to work with files, run scripts, or make network requests.
## When Analysing Images
- You will receive ONE image at a time embedded directly in the message
- Analyse ONLY what you can actually see — never fabricate findings
- Be specific about what you observe visually

## Analysis Response Format
**Image:** <filename>
**Skill(s) applied:** <skill names>

<detailed findings — describe exactly what you see>

**Overall severity:** <none/low/medium/high/critical>
**Summary:** <one sentence>

For all other messages, respond conversationally and helpfully.`;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageName?: string;
  timestamp: Date;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export class ChatAgent {
  private context: Context;
  private model: NonNullable<ReturnType<typeof getModel>>;
  private inputDir: string;
  private skillsDir: string;
  private workspaceDir: string;

  constructor(inputDir: string, skillsDir: string, workspaceDir: string) {
    this.inputDir     = inputDir;
    this.skillsDir    = skillsDir;
    this.workspaceDir = workspaceDir;

    const modelId = (process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-sonnet-4-20250514-v1:0') as Parameters<typeof getModel>[1];
    const model = getModel('amazon-bedrock', modelId);
    if (!model) throw new Error('Could not load Bedrock model. Check BEDROCK_MODEL_ID and AWS credentials.');
    this.model = model;

    this.context = {
      systemPrompt: buildSystemPrompt(skillsDir, inputDir, workspaceDir),
      messages: [],
      tools: TOOLS,
    };
  }

  private getAllImages(): string[] {
    if (!existsSync(this.inputDir)) return [];
    return readdirSync(this.inputDir)
      .filter(f => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
      .map(f => join(this.inputDir, f));
  }

  private buildImageContent(imagePath: string, userText: string) {
    const { data, mimeType } = imageToBase64(imagePath);
    return [
      { type: 'text' as const, text: userText },
      { type: 'image' as const, data, mimeType: mimeType as MimeType },
    ];
  }

  /** Summarise recent conversation turns for the classifier (no images, text only) */
  private recentHistory(): string {
    const recent = this.context.messages.slice(-6);
    return recent.map(m => {
      const role = m.role === 'user' ? 'User' : 'Neo';
      const content = typeof m.content === 'string'
        ? m.content
        : (m.content as any[]).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ');
      return `${role}: ${content.slice(0, 200)}`;
    }).join('\n');
  }

  async *sendMessage(userText: string): AsyncGenerator<string, void, unknown> {
    const allImages = this.getAllImages();

    // ── Step 1: classify intent (fast, no streaming) ──
    yield ''; // yield nothing yet — caller sees working box start
    const intent = await classifyIntent(this.model, userText, allImages, this.recentHistory());

    // ── Step 2: act on intent ──

    if (intent.type === 'conversation') {
      // Plain conversational turn — full history context, with tool support
      this.context.messages.push({
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      });
      yield* this.streamWithTools(this.context);
      return;
    }

    if (intent.type === 'analyse_one') {
      const imageName = basename(intent.imagePath);
      yield `Analysing ${imageName}...\n\n`;
      this.context.messages.push({
        role: 'user',
        content: this.buildImageContent(intent.imagePath, userText),
        timestamp: Date.now(),
      });
      yield* this.streamWithTools(this.context);
      return;
    }

    if (intent.type === 'analyse_many') {
      const { imagePaths } = intent;
      yield `Analysing ${imagePaths.length} images...\n\n`;
      const allResults: string[] = [];

      for (let i = 0; i < imagePaths.length; i++) {
        const imagePath = imagePaths[i]!;
        const imageName = basename(imagePath);
        yield `[${i + 1}/${imagePaths.length}] ${imageName}\n`;

        const perImageContext: Context = {
          systemPrompt: this.context.systemPrompt,
          messages: [{
            role: 'user',
            content: this.buildImageContent(imagePath, `Analyse this image (${imageName}) for: ${userText}`),
            timestamp: Date.now(),
          }],
          tools: TOOLS,
        };

        let imageResult = '';
        for await (const delta of this.streamWithTools(perImageContext)) {
          imageResult += delta;
          yield delta;
        }
        allResults.push(`### ${imageName}\n${imageResult}`);
        yield '\n---\n';
      }

      // Add summary to conversation history as a text-only message
      const summaryText = `I analysed ${imagePaths.length} images for: "${userText}"\n\n${allResults.join('\n\n')}`;
      this.context.messages.push({ role: 'user', content: userText, timestamp: Date.now() });
      this.context.messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: summaryText }],
        api: 'bedrock-converse-stream',
        provider: 'amazon-bedrock',
        model: this.model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: Date.now(),
      } as any);
    }
  }

  /**
   * Stream one turn against a context, automatically handling tool calls.
   * Pushes the final assistant message (and any tool results) into context.messages.
   * Yields text deltas to the caller.
   */
  private async *streamWithTools(ctx: Context): AsyncGenerator<string, void, unknown> {
    // Tool-call loop: keep going until the model stops calling tools
    while (true) {
      const s = stream(this.model, ctx);
      let toolCalls: import('@mariozechner/pi-ai').ToolCall[] = [];

      for await (const event of s) {
        if (event.type === 'text_delta') yield event.delta;
        if (event.type === 'toolcall_end') toolCalls.push(event.toolCall);
      }

      const final = await s.result();
      ctx.messages.push(final);

      if (final.stopReason !== 'toolUse' || toolCalls.length === 0) break;

      // Execute each tool call and push results back into context
      yield '\n';
      for (const tc of toolCalls) {
        yield `\`${tc.name}(${JSON.stringify(tc.arguments)})\`\n`;
        const result = executeTool(tc.id, tc.name, tc.arguments, this.workspaceDir);
        ctx.messages.push(result);
        // Show tool output inline
        for (const block of result.content) {
          if (block.type === 'text') yield `\`\`\`\n${block.text}\n\`\`\`\n`;
        }
      }
    }
  }

  clearHistory() {
    this.context.messages = [];
  }
}
