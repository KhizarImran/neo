import { useState, useRef, useMemo, useCallback } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import type { ScrollBoxRenderable } from '@opentui/core';
import type { SessionRecord } from '../../agent/session.js';

interface SessionsModalProps {
  sessions:  SessionRecord[];
  currentId: string;
  onResume:  (session: SessionRecord) => void;
  onDelete:  (session: SessionRecord) => void;
  onNew:     () => void;
  onClose:   () => void;
}

const MODAL_WIDTH = 68;
// Rows consumed by modal chrome: border(2) + paddingY(2) + header(1) + headerMargin(1) + newSessionRow(1) + newSessionMargin(1) = 8
const CHROME_ROWS = 8;
// Each session row: title line + meta line + marginBottom(1) = 3 rows
const ROW_HEIGHT  = 3;
// Confirm-delete bar height when visible
const CONFIRM_ROWS = 2;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SessionsModal({ sessions, currentId, onResume, onDelete, onNew, onClose }: SessionsModalProps) {
  const { width, height } = useTerminalDimensions();

  // 0 = "New session" option, 1..n = existing sessions
  const total = sessions.length + 1;
  const [cursor, setCursor]       = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const scrollRef                 = useRef<ScrollBoxRenderable | null>(null);

  const extraRows    = confirmId ? CONFIRM_ROWS : 0;
  // Leave some breathing room at top and bottom of terminal
  const maxHeight    = height - 4;
  const listRows     = Math.max(ROW_HEIGHT, Math.floor((maxHeight - CHROME_ROWS - extraRows) / ROW_HEIGHT) * ROW_HEIGHT);
  const modalHeight  = CHROME_ROWS + extraRows + listRows;
  const totalContent = sessions.length * ROW_HEIGHT;

  // Keep cursor row visible in the scrollbox viewport
  const ensureVisible = useCallback((idx: number) => {
    const sb = scrollRef.current;
    if (!sb || idx < 1) return;
    const rowTop    = (idx - 1) * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const top       = sb.scrollTop;
    if (rowTop < top) {
      sb.scrollTo(rowTop);
    } else if (rowBottom > top + listRows) {
      sb.scrollTo(rowBottom - listRows);
    }
  }, [listRows]);

  useKeyboard((key) => {
    // ── Confirm-delete mode ──────────────────────────────────────────────────
    if (confirmId !== null) {
      if (key.name === 'y') {
        const s = sessions.find(s => s.id === confirmId);
        if (s) onDelete(s);
        setConfirmId(null);
        setCursor(c => Math.max(0, Math.min(c, sessions.length - 1)));
      } else {
        setConfirmId(null);
      }
      return;
    }

    // ── Normal mode ──────────────────────────────────────────────────────────
    if (key.name === 'escape' || key.name === 'q') { onClose(); return; }

    if (key.name === 'up') {
      setCursor(c => {
        const next = (c - 1 + total) % total;
        ensureVisible(next);
        return next;
      });
      return;
    }
    if (key.name === 'down') {
      setCursor(c => {
        const next = (c + 1) % total;
        ensureVisible(next);
        return next;
      });
      return;
    }
    if (key.name === 'return') {
      if (cursor === 0) { onNew(); return; }
      const s = sessions[cursor - 1];
      if (s) onResume(s);
      return;
    }
    if (key.name === 'd' || key.name === 'delete') {
      if (cursor === 0) return;
      const s = sessions[cursor - 1];
      if (s) setConfirmId(s.id);
      return;
    }
  });

  const left = Math.max(0, Math.floor((width  - MODAL_WIDTH) / 2));
  const top  = Math.max(0, Math.floor((height - modalHeight) / 2));

  const confirmSession = confirmId ? sessions.find(s => s.id === confirmId) : null;

  // Scroll position indicator (shown when list is taller than viewport)
  const needsScroll = totalContent > listRows;
  const scrollPct   = needsScroll && sessions.length > 1
    ? Math.round(Math.max(0, cursor - 1) / (sessions.length - 1) * 100)
    : null;

  const sessionNodes = useMemo(() => sessions.map((s, i) => {
    const idx       = i + 1;
    const selected  = cursor === idx;
    const isCurrent = s.id === currentId;
    const isConfirm = s.id === confirmId;
    const msgCount  = s.messages.length;

    return (
      <box key={s.id} flexDirection="column" marginBottom={1}
           backgroundColor={isConfirm ? '#2a0a0a' : selected ? '#0d2a3a' : undefined}>
        <text>
          <span fg={selected ? '#00CCFF' : '#444444'}>{selected ? ' ❯ ' : '   '}</span>
          <span fg={isConfirm ? '#FF4444' : selected ? '#00CCFF' : '#CCCCCC'}>
            <strong>{s.title}</strong>
          </span>
          {isCurrent && <span fg="#FFCC00">  ← active</span>}
          {isConfirm && <span fg="#FF4444">  ← confirm delete (Y / any key)</span>}
        </text>
        <text fg="#555555">
          {'     '}{formatDate(s.updatedAt)}
          {'  ·  '}{msgCount} message{msgCount !== 1 ? 's' : ''}
        </text>
      </box>
    );
  }), [sessions, cursor, currentId, confirmId]);

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
          <text>
            <span fg="#00CCFF"><strong> Sessions</strong></span>
            {scrollPct !== null && <span fg="#444444">  {scrollPct}%</span>}
          </text>
          <text fg="#555555">↑↓ select · Enter open · D delete · Esc cancel </text>
        </box>

        {/* confirm delete prompt */}
        {confirmSession && (
          <box marginBottom={1} paddingLeft={1} paddingRight={1} backgroundColor="#2a0a0a">
            <text fg="#FF4444">
              <strong>Delete "{confirmSession.title}"? </strong>
              <span fg="#FF8888">Press Y to confirm, any other key to cancel.</span>
            </text>
          </box>
        )}

        {/* new session row */}
        <box flexDirection="column" marginBottom={1}
             backgroundColor={cursor === 0 ? '#0d2a3a' : undefined}>
          <text>
            <span fg={cursor === 0 ? '#00CCFF' : '#444444'}>{cursor === 0 ? ' ❯ ' : '   '}</span>
            <span fg={cursor === 0 ? '#00CCFF' : '#CCCCCC'}><strong>+ New session</strong></span>
          </text>
        </box>

        {/* scrollable session list */}
        {sessions.length === 0 ? (
          <text fg="#555555">   No saved sessions yet.</text>
        ) : (
          <scrollbox
            ref={scrollRef}
            height={listRows}
            width={MODAL_WIDTH - 6}
            stickyScroll={false}
          >
            {sessionNodes}
          </scrollbox>
        )}
      </box>
    </>
  );
}
