import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

export interface Skill {
  name: string;
  description: string;
  content: string;
  filePath: string;
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff']);

export function loadSkills(skillsDir: string): Skill[] {
  if (!existsSync(skillsDir)) return [];

  const skills: Skill[] = [];

  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const skillMdPath = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    const content = readFileSync(skillMdPath, 'utf-8');

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let name = entry.name;
    let description = '';

    if (frontmatterMatch) {
      const fm = frontmatterMatch[1];
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const descMatch = fm.match(/^description:\s*(.+)$/m);
      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim();
    }

    skills.push({ name, description, content, filePath: skillMdPath });
  }

  return skills;
}

export function loadImages(inputDir: string): string[] {
  if (!existsSync(inputDir)) return [];

  return readdirSync(inputDir)
    .filter(f => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
    .map(f => join(inputDir, f));
}

export function imageToBase64(imagePath: string): { data: string; mimeType: string } {
  const ext = extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
  };

  const buffer = readFileSync(imagePath);
  return {
    data: buffer.toString('base64'),
    mimeType: mimeMap[ext] ?? 'image/jpeg',
  };
}

export function getImageName(imagePath: string): string {
  return basename(imagePath);
}
