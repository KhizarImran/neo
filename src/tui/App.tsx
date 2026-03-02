import { useState, useCallback } from 'react';
import { useKeyboard, useRenderer } from '@opentui/react';
import { Header } from './components/Shared.js';
import { ImageList } from './components/ImageList.js';
import { DefectPanel } from './components/DefectPanel.js';
import { ReportView } from './components/ReportView.js';
import { StatusBar } from './components/StatusBar.js';
import { runAnalysis } from '../agent/runner.js';
import type { AnalysisStatus, ImageAnalysisResult, AnalysisReport } from '../types.js';

interface AppProps {
  inputDir:  string;
  skillsDir: string;
}

export function App({ inputDir, skillsDir }: AppProps) {
  const renderer = useRenderer();

  const [status, setStatus]               = useState<AnalysisStatus>({ type: 'idle' });
  const [results, setResults]             = useState<ImageAnalysisResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<ImageAnalysisResult | null>(null);
  const [streamBuffer, setStreamBuffer]   = useState('');
  const [currentImage, setCurrentImage]   = useState<string | null>(null);
  const [totalImages, setTotalImages]     = useState(0);
  const [showReport, setShowReport]       = useState(false);
  const [report, setReport]               = useState<AnalysisReport | null>(null);
  const [running, setRunning]             = useState(false);

  const startAnalysis = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setResults([]);
    setSelectedResult(null);
    setStreamBuffer('');
    setCurrentImage(null);
    setShowReport(false);
    setStatus({ type: 'scanning' });

    try {
      const finalReport = await runAnalysis({
        inputDir,
        skillsDir,
        onProgress: (current, total, imageName) => {
          setTotalImages(total);
          setCurrentImage(imageName);
          setStreamBuffer('');
          setStatus({ type: 'analysing', current, total, imageName });
        },
        onImageComplete: (result) => {
          setResults(prev => [...prev, result]);
          setSelectedResult(result);
        },
        onDelta: (_imageName, text) => {
          setStreamBuffer(prev => prev + text);
        },
      });

      setReport(finalReport);
      setStatus({ type: 'complete', report: finalReport });
      setCurrentImage(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ type: 'error', message });
    } finally {
      setRunning(false);
    }
  }, [running, inputDir, skillsDir]);

  useKeyboard((key) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      renderer.destroy();
      process.exit(0);
    }

    if (key.name === 'return' && status.type === 'idle') {
      startAnalysis();
    }

    if (key.name === 'r' && status.type === 'complete') {
      setShowReport(true);
    }

    if (key.name === 'escape' && showReport) {
      setShowReport(false);
    }

    // Arrow key navigation through results
    if (key.name === 'up' && results.length > 0) {
      setSelectedResult(prev => {
        const idx = results.findIndex(r => r.imageName === prev?.imageName);
        return results[Math.max(0, idx - 1)] ?? null;
      });
    }
    if (key.name === 'down' && results.length > 0) {
      setSelectedResult(prev => {
        const idx = results.findIndex(r => r.imageName === prev?.imageName);
        return results[Math.min(results.length - 1, idx + 1)] ?? null;
      });
    }
  });

  if (showReport && report) {
    return (
      <box flexDirection="column" padding={1}>
        <Header />
        <ReportView report={report} />
      </box>
    );
  }

  const isAnalysing = status.type === 'analysing';

  return (
    <box flexDirection="column" padding={1}>
      <Header />

      <box flexDirection="row" gap={1} flexGrow={1}>
        <ImageList
          results={results}
          currentImage={isAnalysing ? currentImage : selectedResult?.imageName ?? null}
          total={totalImages}
          scanned={results.length}
        />
        <DefectPanel
          result={selectedResult}
          currentImage={isAnalysing ? currentImage : null}
          streamBuffer={streamBuffer}
          isAnalysing={isAnalysing && selectedResult?.imageName !== currentImage}
        />
      </box>

      <StatusBar status={status} />
    </box>
  );
}
