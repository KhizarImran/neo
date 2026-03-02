import type { ImageAnalysisResult } from '../../types.js';
import { Divider, severityColor, severityLabel } from './Shared.js';
import type { DefectSeverity } from '../../types.js';

interface DefectPanelProps {
  result:       ImageAnalysisResult | null;
  currentImage: string | null;
  streamBuffer: string;
  isAnalysing:  boolean;
}

function SeverityInline({ severity }: { severity: DefectSeverity }) {
  return <span fg={severityColor(severity)}><strong>[{severityLabel(severity)}]</strong></span>;
}

export function DefectPanel({ result, currentImage, streamBuffer, isAnalysing }: DefectPanelProps) {
  return (
    <box
      border
      borderColor="#555555"
      paddingLeft={1}
      paddingRight={1}
      flexGrow={1}
      flexDirection="column"
    >
      <text><strong> Analysis</strong></text>

      {!currentImage && !result && (
        <box marginTop={2} justifyContent="center">
          <text fg="#555555">No image selected</text>
        </box>
      )}

      {isAnalysing && currentImage && (
        <box flexDirection="column" marginTop={1}>
          <text fg="#00CCFF">Analysing: <span fg="#FFFFFF"><strong>{currentImage}</strong></span></text>
          {streamBuffer && (
            <box marginTop={1} flexDirection="column">
              <text fg="#888888">{streamBuffer}</text>
            </box>
          )}
        </box>
      )}

      {result && !isAnalysing && (
        <box flexDirection="column" marginTop={1} gap={1}>
          <text>
            <strong>{result.imageName}</strong>
            <span fg="#555555"> </span>
            <SeverityInline severity={result.overallSeverity} />
          </text>

          <text fg="#888888">{result.summary}</text>

          <Divider label="Findings" />

          {result.findings.map((f) => (
            <box key={f.skillName} flexDirection="column" marginBottom={1}>
              <text>
                <SeverityInline severity={f.severity} />
                <span fg="#555555"> </span>
                <strong>{f.skillName}</strong>
                <span fg="#888888"> ({f.confidence}% confidence)</span>
              </text>
              <box paddingLeft={2}>
                <text fg="#888888">{f.description}</text>
              </box>
            </box>
          ))}
        </box>
      )}
    </box>
  );
}
