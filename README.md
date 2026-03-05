# NEO — Meter Defect Analysis Agent

A terminal-based AI agent for analysing electricity meter images for defects. Built with [OpenTUI](https://github.com/mariozechner/opentui) and powered by either AWS Bedrock or Azure OpenAI.

## Features

- **Conversational chat** — ask Neo questions, request image analysis, or use CLI tools
- **Live streaming** — see Neo's thinking in real time via the working box
- **Skill system** — modular defect detection skills loaded from markdown files
- **Multi-provider** — switch between AWS Bedrock and Azure OpenAI at runtime with `/connect`
- **Session persistence** — conversations are saved and resumable across restarts
- **Context compaction** — `/compact` summarises the conversation to reduce token cost

## Requirements

- [Bun](https://bun.sh) runtime (required by OpenTUI)
- AWS credentials (for Bedrock) **or** Azure OpenAI credentials

## Installation

```bash
# 1. Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# 2. Clone the repository
git clone https://github.com/khizarimran/neo.git
cd neo

# 3. Install dependencies
bun install

# 4. Configure credentials
cp .env.example .env
# Edit .env with your AWS or Azure credentials
```

On first run, NEO automatically creates `.neo/sessions/` and `.neo/workspace/` in the project directory. No manual setup is needed.

### Optional: global `neo` command

To run `neo` from anywhere in your terminal:

```bash
bun run build
bun link
```

After linking, you can run `neo` from any directory.

## Usage

```bash
# Start the agent
bun dev

# Custom input/skills directories
bun dev --input ./my-images --skills ./my-skills

# If globally linked
neo
neo --input ./my-images
```

Place your meter images in an `input/` directory at the project root (or pass `--input <dir>`). The agent will discover them automatically.

## Chat Commands

| Command | Description |
|---|---|
| `/skills` | List all loaded defect skills |
| `/connect` | Switch AI provider (AWS Bedrock ↔ Azure OpenAI) at runtime |
| `/sessions` | Browse, resume, or delete past conversations |
| `/compact` | Summarise conversation to reduce token cost |
| `↑ / ↓` | Scroll conversation history |
| `Ctrl+C` | Quit |

Typing `/` in the input box shows an autocomplete popup for all available commands.

## Configuration

Copy `.env.example` to `.env` and fill in credentials for your chosen provider.

### AWS Bedrock (default)

```env
AI_PROVIDER=bedrock
AWS_PROFILE=your-profile
# or use access keys directly
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0
```

### Azure OpenAI

```env
AI_PROVIDER=azure
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_BASE_URL=https://<your-resource>.cognitiveservices.azure.com/openai
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_MODEL_ID=<your-deployment-name>
```

> **Finding your Azure values:** In the Azure portal, open your AI Services resource. The `AZURE_OPENAI_BASE_URL` is your endpoint URL with `/openai` appended (e.g. `https://my-resource.cognitiveservices.azure.com/openai`). The `AZURE_MODEL_ID` is the deployment name shown in Azure AI Foundry.

You can also switch provider at any time without restarting by typing `/connect` in the chat.

## Skills

Skills are markdown files that define what defects to look for. Each skill lives in its own subdirectory under `src/skills/`:

```
src/skills/
├── asbestos/
│   └── SKILL.md
├── black-plastic-cutout/
│   └── SKILL.md
└── fused-neutral/
    └── SKILL.md
```

Each `SKILL.md` requires frontmatter with `name` and `description`:

```markdown
---
name: My Skill
description: Detects XYZ defects in meter images
---

## What to look for
...
```

New skills are picked up automatically — no code changes needed, just add a new subdirectory with a `SKILL.md`.

## Sessions

NEO automatically saves every conversation to `.neo/sessions/` in your working directory. Sessions are stored as JSON files, one per conversation.

- `/sessions` — open the sessions browser to resume or delete a past conversation
- Resuming a session restores the last 10 messages into the model's context for memory continuity
- `/compact` — if a conversation grows long, this summarises it into a single context entry to reduce token usage and cost

### Session browser keybindings

| Key | Action |
|---|---|
| `↑ / ↓` | Navigate sessions |
| `Enter` | Open / resume selected session |
| `D` | Delete selected session (prompts for confirmation) |
| `Y` | Confirm deletion |
| `Esc` | Close browser |

## Project Structure

```
src/
├── index.tsx              # Entry point + CLI argument parsing
├── types.ts               # Shared types (DefectFinding, ImageAnalysisResult, etc.)
├── agent/
│   ├── chat.ts            # ChatAgent — streaming, tool loop, compact, session restore
│   ├── analyser.ts        # Vision model calls for image analysis
│   ├── session.ts         # SessionStore — save/load/list/delete sessions to disk
│   ├── skills.ts          # Skill discovery and loading
│   ├── loader.ts          # Image loading and base64 encoding
│   └── tools.ts           # Tool definitions (analyse_image, read_file, run_command, etc.)
├── skills/                # Defect skill definitions (SKILL.md files)
└── tui/
    ├── ChatApp.tsx        # Root — state, slash commands, streaming
    └── components/
        ├── ChatMessages.tsx    # Scrollable conversation view
        ├── WorkingBox.tsx      # Live streaming / spinner
        ├── InputBox.tsx        # Input + slash command autocomplete
        ├── SkillsModal.tsx     # /skills modal
        ├── ConnectModal.tsx    # /connect modal
        └── SessionsModal.tsx   # /sessions modal
```
