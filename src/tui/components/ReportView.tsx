import type { AnalysisReport } from '../../types.js';
import { Divider, severityColor, severityLabel } from './Shared.js';
import type { DefectSeverity } from '../../types.js';

interface ReportViewProps {
  report: AnalysisReport;
}

function SeverityInline({ severity }: { severity: DefectSeverity }) {
  return <span fg={severityColor(severity)}><strong>[{severityLabel(severity)}]</strong></span>;
}

export function ReportView({ report }: ReportViewProps) {
  const { summary, results, generatedAt, inputDirectory, totalImages } = report;

  return (
    <box
      border
      borderStyle="double"
      borderColor="#00CCFF"
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      flexDirection="column"
    >
      <text fg="#00CCFF"><strong> Analysis Report</strong></text>
      <text fg="#888888">Generated: {new Date(generatedAt).toLocaleString()}</text>
      <text fg="#888888">Input:     {inputDirectory}</text>

      <Divider label="Summary" />

      <text>
        <span fg="#888888">Total: </span><span fg="#FFFFFF"><strong>{totalImages}</strong></span>
        <span fg="#888888">   Clean: </span><span fg="#00FF88"><strong>{summary.clean}</strong></span>
        <span fg="#888888">   Defective: </span><span fg="#FF2222"><strong>{summary.defective}</strong></span>
      </text>

      <text>
        {(Object.entries(summary.bySeverity) as [string, number][])
          .filter(([, count]) => count > 0)
          .map(([severity, count], i) => (
            <span key={severity}>
              {i > 0 ? <span fg="#444444">  </span> : null}
              <span fg={severityColor(severity as DefectSeverity)}>{severity}</span>
              <span fg="#888888">: {count}</span>
            </span>
          ))}
      </text>

      <Divider label="Per-Image Results" />

      {results.map((r) => (
        <box key={r.imagePath} flexDirection="column" marginBottom={1}>
          <text>
            <SeverityInline severity={r.overallSeverity} />
            <span fg="#555555"> </span>
            <strong>{r.imageName}</strong>
          </text>
          <box paddingLeft={2} flexDirection="column">
            <text fg="#888888">{r.summary}</text>
            {r.findings.filter(f => f.detected).map(f => (
              <text key={f.skillName}>
                <span fg="#888888">  • </span>
                <span fg={severityColor(f.severity as DefectSeverity)}>{f.skillName}</span>
                <span fg="#888888"> — {f.description}</span>
              </text>
            ))}
          </box>
        </box>
      ))}

      <Divider />
      <text fg="#555555">Press Q to exit</text>
    </box>
  );
}
