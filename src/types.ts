export type DefectSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface DefectFinding {
  skillName: string;
  detected: boolean;
  severity: DefectSeverity;
  description: string;
  confidence: number; // 0-100
}

export interface ImageAnalysisResult {
  imagePath: string;
  imageName: string;
  findings: DefectFinding[];
  summary: string;
  overallSeverity: DefectSeverity;
  analysedAt: string;
}
