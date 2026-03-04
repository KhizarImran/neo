import { getModel, complete, type Model } from '@mariozechner/pi-ai';
import { basename } from 'path';
import { imageToBase64 } from './loader.js';
import type { Skill } from './loader.js';
import type { DefectFinding, ImageAnalysisResult, DefectSeverity } from '../types.js';
import type { AiProvider } from './chat.js';

function resolveModel(provider: AiProvider): Model<any> {
  if (provider === 'azure') {
    const modelId = process.env['AZURE_MODEL_ID'] ?? 'gpt-4o';
    const baseUrl = process.env['AZURE_OPENAI_BASE_URL'];
    if (!baseUrl) throw new Error('AZURE_OPENAI_BASE_URL is required for Azure provider.');
    const customModel: Model<'openai-completions'> = {
      id:            modelId,
      name:          modelId,
      api:           'openai-completions',
      provider:      'azure-openai-responses',
      baseUrl:       `${baseUrl.replace(/\/+$/, '')}/deployments/${modelId}`,
      reasoning:     false,
      input:         ['text', 'image'],
      cost:          { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens:     16384,
      compat: {
        maxTokensField:        'max_completion_tokens',
        supportsDeveloperRole: false,
      },
    };
    return customModel;
  }
  const modelId = (process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-sonnet-4-20250514-v1:0') as Parameters<typeof getModel>[1];
  const model = getModel('amazon-bedrock', modelId);
  if (!model) throw new Error('Could not load Bedrock model. Check BEDROCK_MODEL_ID and AWS credentials.');
  return model;
}

function buildSystemPrompt(skills: Skill[]): string {
  const skillList = skills
    .map(s => `- **${s.name}**: ${s.description}`)
    .join('\n');

  return `You are Neo, an expert meter image defect analysis agent.

Your job is to analyse meter images for defects. These can be in the input folder or the user may give you the target folder which contains the images. Always check the input direcotry. For each image you will be given:
1. The image itself
2. A set of defect skill definitions describing what to look for

You must respond with a valid JSON object ONLY — no markdown, no explanation, just raw JSON.

Available defect skills:
${skillList}

Response format (strict JSON):
{
  "findings": [
    {
      "skillName": "<skill name>",
      "detected": <true|false>,
      "severity": "<none|low|medium|high|critical>",
      "description": "<what you observed>",
      "confidence": <0-100>
    }
  ],
  "summary": "<one sentence overall summary>",
  "overallSeverity": "<none|low|medium|high|critical>"
}`;
}

function buildSkillContext(skills: Skill[]): string {
  return skills
    .map(s => `## Skill: ${s.name}\n\n${s.content}`)
    .join('\n\n---\n\n');
}

export async function analyseImage(
  imagePath: string,
  skills: Skill[],
  onDelta?: (text: string) => void,
  provider?: AiProvider,
): Promise<ImageAnalysisResult> {
  const resolvedProvider: AiProvider = provider ?? (process.env['AI_PROVIDER'] === 'azure' ? 'azure' : 'bedrock');
  const model = resolveModel(resolvedProvider);

  const { data, mimeType } = imageToBase64(imagePath);
  const skillContext = buildSkillContext(skills);

  const response = await complete(model, {
    systemPrompt: buildSystemPrompt(skills),
    messages: [
      {
        role: 'user',
        timestamp: Date.now(),
        content: [
          {
            type: 'text',
            text: `Please analyse this meter image for all defects described in the skill definitions below.\n\n${skillContext}`,
          },
          {
            type: 'image',
            data,
            mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          },
        ],
      },
    ],
  });

  // Extract text from response
  let rawText = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      rawText += block.text;
      onDelta?.(block.text);
    }
  }

  // Parse JSON response
  let parsed: { findings: DefectFinding[]; summary: string; overallSeverity: DefectSeverity };
  try {
    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback if model doesn't return clean JSON
    parsed = {
      findings: skills.map(s => ({
        skillName: s.name,
        detected: false,
        severity: 'none' as DefectSeverity,
        description: 'Analysis failed — could not parse model response.',
        confidence: 0,
      })),
      summary: 'Analysis failed — model returned unparseable response.',
      overallSeverity: 'none' as DefectSeverity,
    };
  }

  return {
    imagePath,
    imageName: basename(imagePath),
    findings: parsed.findings,
    summary: parsed.summary,
    overallSeverity: parsed.overallSeverity,
    analysedAt: new Date().toISOString(),
  };
}
