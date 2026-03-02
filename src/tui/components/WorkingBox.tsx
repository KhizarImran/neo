/**
 * WorkingBox — shown above the input while Neo is streaming a response.
 * Displays an animated spinner, "Neo working..." label, and the last few
 * lines of live stream text so the user can see real-time output.
 */
import { useState, useEffect, useMemo } from 'react';

interface WorkingBoxProps {
  streamText: string;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Split stream text into the last N visible lines (word-wrapped at width). */
function lastLines(text: string, maxLines: number, width: number): string[] {
  const raw = text.replace(/\r/g, '').split('\n');
  const wrapped: string[] = [];

  for (const line of raw) {
    if (!line.trim()) {
      wrapped.push('');
      continue;
    }
    // Simple word-wrap
    const words = line.split(' ');
    let cur = '';
    for (const word of words) {
      if (cur.length + word.length + (cur ? 1 : 0) > width) {
        if (cur) wrapped.push(cur);
        cur = word;
      } else {
        cur = cur ? `${cur} ${word}` : word;
      }
    }
    if (cur) wrapped.push(cur);
  }

  return wrapped.slice(-maxLines);
}

export function WorkingBox({ streamText }: WorkingBoxProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 100);
    return () => clearInterval(id);
  }, []);

  const spinner = SPINNER_FRAMES[frame]!;

  // Show last 4 lines of stream content at ~80 chars wide
  const lines = useMemo(() => lastLines(streamText, 4, 78), [streamText]);

  return (
    <box
      border
      borderStyle="single"
      borderColor="#FFCC00"
      paddingLeft={1}
      paddingRight={1}
      flexDirection="column"
    >
      {/* title row */}
      <box flexDirection="row" justifyContent="space-between">
        <text>
          <span fg="#FFCC00"><strong>{spinner} Neo working…</strong></span>
        </text>
        <text fg="#555555">↑↓ scroll history</text>
      </box>

      {/* live stream content — marginTop pushes below the title row */}
      <box flexDirection="column" marginTop={1}>
        {lines.length > 0
          ? lines.map((line, i) => (
              <text key={i} fg={i === lines.length - 1 ? '#CCCCCC' : '#888888'}>
                {line || ' '}
              </text>
            ))
          : <text fg="#555555">  …</text>
        }
      </box>
    </box>
  );
}
