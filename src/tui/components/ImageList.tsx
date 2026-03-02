import type { ImageAnalysisResult } from '../../types.js';
import { severityColor, severityLabel } from './Shared.js';
import type { DefectSeverity } from '../../types.js';

interface ImageListProps {
  results:      ImageAnalysisResult[];
  currentImage: string | null;
  total:        number;
  scanned:      number;
}

function SeverityInline({ severity }: { severity: DefectSeverity }) {
  return <span fg={severityColor(severity)}><strong>[{severityLabel(severity)}]</strong></span>;
}

export function ImageList({ results, currentImage, total, scanned }: ImageListProps) {
  return (
    <box
      border
      borderColor="#555555"
      paddingLeft={1}
      paddingRight={1}
      width="35%"
      flexDirection="column"
    >
      <text><strong> Images ({scanned}/{total})</strong></text>

      <box marginTop={1} flexDirection="column">
        {results.map((r) => {
          const isActive = r.imageName === currentImage;
          return (
            <text key={r.imagePath}>
              <span fg={isActive ? '#00CCFF' : '#555555'}>{isActive ? '> ' : '  '}</span>
              <SeverityInline severity={r.overallSeverity} />
              <span fg="#555555"> </span>
              {isActive
                ? <span fg="#FFFFFF"><strong>{r.imageName}</strong></span>
                : <span fg="#888888">{r.imageName}</span>}
            </text>
          );
        })}

        {/* Pending images */}
        {Array.from({ length: Math.max(0, total - results.length) }).map((_, i) => (
          <text key={`pending-${i}`} fg="#555555">   {'[        ]'} pending</text>
        ))}
      </box>
    </box>
  );
}
