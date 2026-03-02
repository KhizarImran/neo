import { useState, useEffect } from 'react';
import type { AnalysisStatus } from '../../types.js';

interface StatusBarProps {
  status: AnalysisStatus;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function StatusBar({ status }: StatusBarProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (status.type === 'analysing' || status.type === 'scanning') {
      const interval = setInterval(() => {
        setFrame(f => (f + 1) % SPINNER_FRAMES.length);
      }, 80);
      return () => clearInterval(interval);
    }
  }, [status.type]);

  const spinner = SPINNER_FRAMES[frame];

  return (
    <box border borderColor="#555555" paddingLeft={1} paddingRight={1} marginTop={1}>
      {status.type === 'idle' && (
        <text fg="#888888">Ready — press <span fg="#00CCFF"><strong>Enter</strong></span> to start analysis</text>
      )}
      {status.type === 'scanning' && (
        <text fg="#00CCFF">{spinner} Scanning input directory...</text>
      )}
      {status.type === 'analysing' && (
        <text>
          <span fg="#00CCFF">{spinner} Analysing {status.imageName} </span>
          <span fg="#888888">({status.current}/{status.total})</span>
        </text>
      )}
      {status.type === 'complete' && (
        <text fg="#00FF88">
          Analysis complete — {status.report.totalImages} images processed. Press <strong>R</strong> to view report, <strong>Q</strong> to quit.
        </text>
      )}
      {status.type === 'error' && (
        <text fg="#FF2222">Error: {status.message}</text>
      )}
    </box>
  );
}
