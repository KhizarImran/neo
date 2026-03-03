#!/usr/bin/env bun
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { resolve, join } from 'path';
import { mkdirSync } from 'fs';
import { App } from './tui/App.js';
import { ChatApp } from './tui/ChatApp.js';

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
Neo — Meter Defect Analysis Agent

Usage:
  neo [options]

Options:
  --input  <dir>   Directory containing meter images (default: ./input)
  --skills <dir>   Directory containing skill definitions (default: ./src/skills)
  --batch          Batch mode — press Enter to analyse all images, browse results
  --help           Show this help

Modes:
  default          Chat mode — conversational agent (default)
  --batch          Batch mode — analyse all images at once

Environment:
  AI_PROVIDER                   AI provider: bedrock (default) or azure
  AWS_PROFILE                   AWS profile for Bedrock auth
  AWS_ACCESS_KEY_ID             AWS access key (Bedrock)
  AWS_SECRET_ACCESS_KEY         AWS secret key (Bedrock)
  AWS_REGION                    AWS region (default: us-east-1)
  BEDROCK_MODEL_ID              Bedrock model ID (default: us.anthropic.claude-sonnet-4-20250514-v1:0)
  AZURE_OPENAI_API_KEY          Azure OpenAI API key
  AZURE_OPENAI_BASE_URL         Azure endpoint, e.g. https://<resource>.openai.azure.com/openai/v1
  AZURE_MODEL_ID                Azure deployment name (default: gpt-4o)

Keybindings (chat mode):
  Enter      Send message
  ↑/↓        Scroll conversation
  /skills    List loaded skills
  /connect   Switch AI provider (AWS Bedrock ↔ Azure OpenAI)
  /sessions  Browse and resume past sessions
  Ctrl+C     Quit

Keybindings (batch mode):
  Enter   Start analysis
  ↑/↓     Navigate image results
  R       View full report
  Esc     Back from report
  Q       Quit
`);
}

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return resolve(args[idx + 1]!);
  return fallback;
}

const isBatchMode = args.includes('--batch');
const inputDir    = getArg('--input',  resolve(process.cwd(), 'input'));
const skillsDir   = getArg('--skills', resolve(join(
  new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
  '../../src/skills'
)));

const workspaceDir = resolve(process.cwd(), '.neo', 'workspace');
mkdirSync(workspaceDir, { recursive: true });

async function main() {
  const renderer = await createCliRenderer({ exitOnCtrlC: false, targetFps: 30 });

  const root = createRoot(renderer);

  if (isBatchMode) {
    root.render(<App inputDir={inputDir} skillsDir={skillsDir} />);
  } else {
    root.render(
      <ChatApp inputDir={inputDir} skillsDir={skillsDir} workspaceDir={workspaceDir} />,
    );
  }

  // Keep the process alive until the renderer is destroyed
  await new Promise<void>((resolve) => {
    process.on('exit', resolve);
  });
}

main();
