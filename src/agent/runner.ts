import { join } from 'path';
import { loadSkills, loadImages, getImageName } from './loader.js';
import { analyseImage } from './analyser.js';
import type { AnalysisReport, ImageAnalysisResult, DefectSeverity } from '../types.js';

export interface RunOptions {
  inputDir: string;
  skillsDir: string;
  onProgress?: (current: number, total: number, imageName: string) => void;
  onImageComplete?: (result: ImageAnalysisResult) => void;
  onDelta?: (imageName: string, text: string) => void;
}

function computeOverallSeverity(results: ImageAnalysisResult[]): Record<DefectSeverity, number> {
  const counts: Record<DefectSeverity, number> = {
    none: 0, low: 0, medium: 0, high: 0, critical: 0,
  };
  for (const r of results) {
    counts[r.overallSeverity]++;
  }
  return counts;
}

export async function runAnalysis(opts: RunOptions): Promise<AnalysisReport> {
  const { inputDir, skillsDir, onProgress, onImageComplete, onDelta } = opts;

  const skills = loadSkills(skillsDir);
  if (skills.length === 0) {
    throw new Error(`No skills found in ${skillsDir}. Add SKILL.md files to subdirectories.`);
  }

  const images = loadImages(inputDir);
  if (images.length === 0) {
    throw new Error(`No images found in ${inputDir}.`);
  }

  const results: ImageAnalysisResult[] = [];

  for (let i = 0; i < images.length; i++) {
    const imagePath = images[i]!;
    const imageName = getImageName(imagePath);

    onProgress?.(i + 1, images.length, imageName);

    const result = await analyseImage(
      imagePath,
      skills,
      (text) => onDelta?.(imageName, text)
    );

    results.push(result);
    onImageComplete?.(result);
  }

  const bySeverity = computeOverallSeverity(results);
  const defective = results.filter(r => r.overallSeverity !== 'none').length;

  return {
    generatedAt: new Date().toISOString(),
    inputDirectory: inputDir,
    totalImages: images.length,
    results,
    summary: {
      clean: results.length - defective,
      defective,
      bySeverity,
    },
  };
}
