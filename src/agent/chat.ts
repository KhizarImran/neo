import { getModel, stream, complete, type Context } from '@mariozechner/pi-ai';
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

    this.context = {
      systemPrompt: buildSystemPrompt(skillsDir, inputDir, workspaceDir),
      messages: [],
      tools: TOOLS,
    };

    // If resuming a session, restore the last 10 messages into context
    // so the model has memory of the recent conversation.
    if (sessionId) {
      const session = this.store.load(sessionId);
      if (session && session.messages.length > 0) {
        const recent = session.messages.slice(-10);
        for (const m of recent) {
          if (m.role === 'user') {
            this.context.messages.push({
              role:      'user',
              content:   m.content,
              timestamp: new Date(m.timestamp).getTime(),
            });
          } else {
            // Reconstruct a minimal AssistantMessage shape pi-ai will accept
            this.context.messages.push({
              role:      'assistant',
              content:   [{ type: 'text', text: m.content }],
              api:       'bedrock-converse-stream',
              provider:  this.provider === 'azure' ? 'azure-openai-responses' : 'amazon-bedrock',
              model:     this.model.id,
              usage:     { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
              stopReason: 'stop',
              timestamp: new Date(m.timestamp).getTime(),
            } as any);
          }
        }
      }
    }
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
    if (stored.length === 0) return;
    this.store.save(this.sessionId, stored);
  }

  /**
   * Summarise the current conversation context into a single compact message.
   * Replaces context.messages with one synthetic entry containing the summary.
   * Returns the summary text so ChatApp can update the TUI message list.
   */
  async compact(): Promise<string> {
    if (this.context.messages.length === 0) {
      return 'Nothing to compact — conversation is empty.';
    }

    const compactContext: Context = {
      systemPrompt: 'You are a summarisation assistant.',
      messages: [
        {
          role: 'user',
          content: `Summarise the following conversation concisely. Capture:
- Key topics discussed
- Any images analysed and their findings (skill, severity, key observations)
- Any tool actions taken and their outcomes
- Any decisions or conclusions reached

Keep the summary factual and compact. Do not include pleasantries.

Conversation to summarise:
${this.context.messages
  .map(m => {
    if (m.role === 'user') {
      const content = typeof m.content === 'string' ? m.content
        : (m.content as any[]).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ');
      return `User: ${content}`;
    }
    if (m.role === 'assistant') {
      const content = Array.isArray(m.content)
        ? (m.content as any[]).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ')
        : '';
      return `Neo: ${content}`;
    }
    return null;
  })
  .filter(Boolean)
  .join('\n')}`,
          timestamp: Date.now(),
        },
      ],
    };

    const response = await complete(this.model, compactContext);
    let summary = '';
    for (const block of response.content) {
      if (block.type === 'text') summary += block.text;
    }
    summary = summary.trim();

    // Replace context with a single synthetic message containing the summary
    this.context.messages = [
      {
        role:      'user',
        content:   `[Conversation summary — previous context compacted]\n\n${summary}`,
        timestamp: Date.now(),
      },
    ];

    return summary;
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
