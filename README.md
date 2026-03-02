# NEO — Meter Defect Analysis Agent

A terminal-based AI agent for analysing electricity meter images for defects. Built with [OpenTUI](https://github.com/mariozechner/opentui) and powered by either AWS Bedrock or Azure OpenAI.

## Features

- **Conversational chat mode** — ask Neo questions, request image analysis, or use CLI tools
- **Batch mode** — analyse all images at once and browse results
- **Live streaming** — see Neo's thinking in real time via the working box
- **Skill system** — modular defect detection skills loaded from markdown files
- **Multi-provider** — switch between AWS Bedrock and Azure OpenAI at runtime with `/connect`

## Requirements

- [Bun](https://bun.sh) runtime (required by OpenTUI)
- AWS credentials (for Bedrock) **or** Azure OpenAI credentials

## Installation

```bash
bun install
```

## Usage

```bash
# Chat mode (default)
bun dev

# Batch mode — analyse all images in ./input
bun batch

# Custom input/skills directories
bun dev --input ./my-images --skills ./my-skills
```

## Chat Commands

| Command | Description |
|---|---|
| `/skills` | List all loaded defect skills |
| `/connect` | Switch AI provider (AWS Bedrock ↔ Azure OpenAI) |
| `↑ / ↓` | Scroll conversation history |
| `Ctrl+C` | Quit |

## Configuration

Copy `.env.example` to `.env` and fill in credentials for your chosen provider.

### AWS Bedrock (default)

```env
AI_PROVIDER=bedrock
AWS_PROFILE=your-profile
# or
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0
```

### Azure OpenAI

```env
AI_PROVIDER=azure
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_BASE_URL=https://<your-resource>.openai.azure.com/openai/v1
AZURE_MODEL_ID=gpt-4o
```

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

New skills are picked up automatically — no code changes needed.

## Project Structure

```
src/
├── index.tsx              # Entry point
├── agent/
│   ├── chat.ts            # ChatAgent — intent classification, streaming, tool loop
│   ├── analyser.ts        # Batch image analyser
│   ├── loader.ts          # Skill + image loader
│   ├── runner.ts          # Batch mode orchestrator
│   └── tools.ts           # CLI tools (file, shell, HTTP)
├── skills/                # Defect skill definitions
└── tui/
    ├── ChatApp.tsx        # Chat mode root
    ├── App.tsx            # Batch mode root
    └── components/        # UI components
```

## Batch Mode

Batch mode analyses every image in the input directory against all loaded skills and presents results in a navigable TUI.

```bash
bun batch --input ./input
```

Keybindings in batch mode:

| Key | Action |
|---|---|
| `Enter` | Start analysis |
| `↑ / ↓` | Navigate results |
| `R` | View full report |
| `Esc` | Back |
| `Q` | Quit |
