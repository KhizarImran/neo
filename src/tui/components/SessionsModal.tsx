import { useState } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import type { SessionRecord } from '../../agent/session.js';

interface SessionsModalProps {
  sessions:  SessionRecord[];
  currentId: string;
  onResume:  (session: SessionRecord) => void;
  onNew:     () => void;
  onClose:   () => void;
}

const MODAL_WIDTH  = 68;
const MODAL_HEIGHT = 22;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SessionsModal({ sessions, currentId, onResume, onNew, onClose }: SessionsModalProps) {
  const { width, height } = useTerminalDimensions();

  // 0 = "New session" option, 1..n = existing sessions
  const total = sessions.length + 1;
  const [cursor, setCursor] = useState(0);

  useKeyboard((key) => {
    if (key.name === 'escape' || key.name === 'q') { onClose(); return; }
    if (key.name === 'up')   { setCursor(c => (c - 1 + total) % total); return; }
    if (key.name === 'down') { setCursor(c => (c + 1) % total); return; }
    if (key.name === 'return') {
      if (cursor === 0) { onNew(); return; }
      const s = sessions[cursor - 1];
      if (s) onResume(s);
    }
  });

  const left = Math.max(0, Math.floor((width  - MODAL_WIDTH)  / 2));
  const top  = Math.max(0, Math.floor((height - MODAL_HEIGHT) / 2));

  return (
    <>
      {/* Backdrop */}
      <box position="absolute" top={0} left={0} width="100%" height="100%"
           backgroundColor="#000000" opacity={0.75} />

      {/* Modal */}
      <box
        position="absolute"
        top={top}
        left={left}
        width={MODAL_WIDTH}
        flexDirection="column"
        border
        borderStyle="double"
        borderColor="#00CCFF"
        backgroundColor="#0a0a0a"
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        {/* header */}
        <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <text fg="#00CCFF"><strong> Sessions</strong></text>
          <text fg="#555555">↑↓ select · Enter open · Esc cancel </text>
        </box>

        {/* new session row */}
        <box flexDirection="column" marginBottom={1}
             backgroundColor={cursor === 0 ? '#0d2a3a' : undefined}>
          <text>
            <span fg={cursor === 0 ? '#00CCFF' : '#444444'}>{cursor === 0 ? ' ❯ ' : '   '}</span>
            <span fg={cursor === 0 ? '#00CCFF' : '#CCCCCC'}><strong>+ New session</strong></span>
          </text>
        </box>

        {/* existing sessions */}
        {sessions.length === 0 ? (
          <text fg="#555555">   No saved sessions yet.</text>
        ) : (
          sessions.map((s, i) => {
            const idx      = i + 1;
            const selected = cursor === idx;
            const isCurrent = s.id === currentId;
            const msgCount = s.messages.length;

            return (
              <box key={s.id} flexDirection="column" marginBottom={1}
                   backgroundColor={selected ? '#0d2a3a' : undefined}>
                <text>
                  <span fg={selected ? '#00CCFF' : '#444444'}>{selected ? ' ❯ ' : '   '}</span>
                  <span fg={selected ? '#00CCFF' : '#CCCCCC'}><strong>{s.title}</strong></span>
                  {isCurrent && <span fg="#FFCC00">  ← active</span>}
                </text>
                <text fg="#555555">
                  {'     '}{formatDate(s.updatedAt)}
                  {'  ·  '}{msgCount} message{msgCount !== 1 ? 's' : ''}
                </text>
              </box>
            );
          })
        )}
      </box>
    </>
  );
}
