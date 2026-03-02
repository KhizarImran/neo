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

export interface AnalysisReport {
  generatedAt: string;
  inputDirectory: string;
  totalImages: number;
  results: ImageAnalysisResult[];
  summary: {
    clean: number;
    defective: number;
    bySeverity: Record<DefectSeverity, number>;
  };
}

export type AnalysisStatus =
  | { type: 'idle' }
  | { type: 'scanning' }
  | { type: 'analysing'; current: number; total: number; imageName: string }
  | { type: 'complete'; report: AnalysisReport }
  | { type: 'error'; message: string };
