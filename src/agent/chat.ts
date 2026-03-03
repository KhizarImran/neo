import { getModel, stream, type Context } from '@mariozechner/pi-ai';
import { readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { loadSkills } from './loader.js';
import { TOOLS, executeTool } from './tools.js';
import { SessionStore, type StoredMessage } from './session.js';

export { SessionStore };
export type { StoredMessage };

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff']);

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
- Analyse images using the analyse_image_with_skill tool
- Use CLI tools to work with files, directories, and run scripts

## Available Images (in input directory)
${imageList}

## Available Defect Skills
${skillList}

## Workspace Sandbox
You have a dedicated sandbox directory at: ${workspaceDir}

Use this as your working directory when creating files, writing scripts, or running commands.
The workspace persists between sessions — files you create there will still be there next time.

## Tools

### Image Analysis (PRIMARY — use this for all image analysis requests)
- **analyse_image_with_skill** — analyse a meter image for defects using a specific skill.
  Provide the image filename and the skill name. Both are fuzzy-matched so partial names work.
  ALWAYS use this tool when the user asks to analyse, check, scan, or inspect an image.
  DO NOT attempt to read image files directly — use this tool instead.

### Filesystem & Network
- **list_directory** — browse a directory
- **read_file** — read a text file's contents (NOT for images — use analyse_image_with_skill)
- **write_file** — write content to a file (default to workspace for new files)
- **copy_file** — copy a file
- **move_file** — move or rename a file
- **delete_file** — delete a file
- **run_command** — run any shell command — defaults to workspace directory
- **http_request** — make an HTTP GET/POST request

For all other messages, respond conversationally and helpfully.`;
}

// ── Provider helpers ──────────────────────────────────────────────────────────

export type AiProvider = 'bedrock' | 'azure';

function resolveModel(provider: AiProvider): NonNullable<ReturnType<typeof getModel>> {
  if (provider === 'azure') {
    const modelId = (process.env['AZURE_MODEL_ID'] ?? 'gpt-4o') as Parameters<typeof getModel>[1];
    const model = getModel('azure-openai-responses', modelId);
    if (!model) throw new Error('Could not load Azure OpenAI model. Check AZURE_MODEL_ID, AZURE_OPENAI_API_KEY and AZURE_OPENAI_BASE_URL.');
    return model;
  }
  const modelId = (process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-sonnet-4-20250514-v1:0') as Parameters<typeof getModel>[1];
  const model = getModel('amazon-bedrock', modelId);
  if (!model) throw new Error('Could not load Bedrock model. Check BEDROCK_MODEL_ID and AWS credentials.');
  return model;
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
  readonly provider: AiProvider;

  // Session persistence
  private store:     SessionStore;
  private sessionId: string;

  constructor(
    inputDir:     string,
    skillsDir:    string,
    workspaceDir: string,
    provider?:    AiProvider,
    store?:       SessionStore,
    sessionId?:   string,
  ) {
    this.inputDir     = inputDir;
    this.skillsDir    = skillsDir;
    this.workspaceDir = workspaceDir;
    this.provider     = provider ?? ((process.env['AI_PROVIDER'] === 'azure' ? 'azure' : 'bedrock') as AiProvider);
    this.model        = resolveModel(this.provider);
    this.store        = store ?? new SessionStore(join(workspaceDir, '..', 'sessions'));
    this.sessionId    = sessionId ?? this.store.create();

    // Restore TUI messages from session — context starts fresh (no binary data stored)
    this.context = {
      systemPrompt: buildSystemPrompt(skillsDir, inputDir, workspaceDir),
      messages: [],
      tools: TOOLS,
    };
  }

  get currentSessionId(): string { return this.sessionId; }

  private getAllImages(): string[] {
    if (!existsSync(this.inputDir)) return [];
    return readdirSync(this.inputDir)
      .filter(f => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
      .map(f => join(this.inputDir, f));
  }

  /** Persist the current TUI messages to disk. Called by ChatApp after each turn. */
  persistMessages(messages: ChatMessage[]): void {
    const stored: StoredMessage[] = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role:      m.role as 'user' | 'assistant',
        content:   m.content,
        timestamp: m.timestamp.toISOString(),
      }));
    if (stored.length === 0) return; // nothing to save yet
    this.store.save(this.sessionId, stored);
  }

  async *sendMessage(userText: string): AsyncGenerator<string, void, unknown> {
    yield ''; // signal start so WorkingBox appears immediately
    this.context.messages.push({
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    });
    yield* this.streamWithTools(this.context);
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
      for (const tc of toolCalls) {
        const result = await executeTool(tc.id, tc.name, tc.arguments, this.workspaceDir, this.inputDir, this.skillsDir, this.provider);
        ctx.messages.push(result);
        // Show a compact one-line status in the working box only — no raw output dumped to conversation
        const status = result.isError ? '✗' : '✓';
        yield `${status} ${tc.name}\n`;
      }
    }
  }

  clearHistory() {
    this.context.messages = [];
  }
}
