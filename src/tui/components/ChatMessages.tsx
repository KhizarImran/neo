/**
 * ChatMessages — block-based scrollable message list.
 *
 * Messages are grouped into MessageBlocks. The viewport scroll operates on
 * rendered lines (each block contributes N lines). Assistant blocks are
 * wrapped in a backgroundColor box so the background fills the full width.
 */
import { useState, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import type { ChatMessage } from '../../agent/chat.js';

export interface ChatMessagesHandle {
  scrollUp:   (lines?: number) => void;
  scrollDown: (lines?: number) => void;
}

interface ChatMessagesProps {
  messages:    ChatMessage[];
  isStreaming: boolean;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Segment = { text: string; bold?: boolean; color?: string };

type RenderedLine = {
  segments: Segment[];
  isBlank?: boolean;
};

type MessageBlock = {
  role:      'user' | 'assistant';
  time:      string;
  lines:     RenderedLine[];
  /** Total rendered row count including header + body + trailing blank */
  lineCount: number;
};

// ─── Inline markdown parser ───────────────────────────────────────────────────

function parseInline(raw: string): Segment[] {
  const segs: Segment[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if      (m[2]) segs.push({ text: m[2], bold: true, color: '#DDDDDD' });
    else if (m[3]) segs.push({ text: m[3], color: '#FFCC00' });
    else if (m[4]) segs.push({ text: m[4], color: '#00CCFF' });
    else if (m[5]) segs.push({ text: m[5], color: '#CCCCCC' });
  }
  return segs.length ? segs : [{ text: raw, color: '#CCCCCC' }];
}

function wrapWords(text: string, width: number): string[] {
  if (!text.trim()) return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    if (cur.length + word.length + (cur ? 1 : 0) > width) {
      if (cur) lines.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function markdownToLines(content: string, width: number): RenderedLine[] {
  const out: RenderedLine[] = [];
  for (const raw of content.replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) {
      out.push({ segments: [{ text: '' }], isBlank: true });
      continue;
    }
    const hm = raw.match(/^#{1,3}\s+(.+)$/);
    if (hm) {
      out.push({ segments: [{ text: hm[1]!, bold: true, color: '#FFFFFF' }] });
      continue;
    }
    if (/^[-=]{3,}$/.test(raw.trim())) {
      out.push({ segments: [{ text: '─'.repeat(Math.min(width - 4, 60)), color: '#444444' }] });
      continue;
    }
    const bm = raw.match(/^(\s*)[*-]\s+(.+)$/);
    if (bm) {
      wrapWords(bm[2]!, width - 6).forEach((chunk, ci) => {
        out.push({ segments: ci === 0
          ? [{ text: '  • ', color: '#666666' }, ...parseInline(chunk)]
          : [{ text: '    ', color: '#666666' }, ...parseInline(chunk)] });
      });
      continue;
    }
    const nm = raw.match(/^(\d+)\.\s+(.+)$/);
    if (nm) {
      wrapWords(nm[2]!, width - 7).forEach((chunk, ci) => {
        out.push({ segments: ci === 0
          ? [{ text: `  ${nm[1]}. `, color: '#666666' }, ...parseInline(chunk)]
          : [{ text: '       ', color: '#666666' }, ...parseInline(chunk)] });
      });
      continue;
    }
    for (const chunk of wrapWords(raw, width - 4)) {
      out.push({ segments: parseInline(chunk) });
    }
  }
  return out;
}

// ─── Block builder ────────────────────────────────────────────────────────────

function buildBlocks(messages: ChatMessage[], width: number): MessageBlock[] {
  return messages
    .filter((msg): msg is ChatMessage & { role: 'user' | 'assistant' } =>
      msg.role === 'user' || msg.role === 'assistant'
    )
    .map(msg => {
    const time = msg.timestamp.toLocaleTimeString();
    let lines: RenderedLine[];
    if (msg.role === 'user') {
      lines = wrapWords(msg.content, width - 4).map(chunk => ({
        segments: [{ text: '  ' + chunk, color: '#FFFFFF' }],
      }));
    } else {
      lines = markdownToLines(msg.content, width);
    }
    return {
      role: msg.role,
      time,
      lines,
      lineCount: 1 + lines.length + 1, // header + body + trailing gap
    };
  });
}

// ─── Overhead rows ────────────────────────────────────────────────────────────
// header (double border):   3
// messages border + title:  3
// working box (when shown): 0 (not counted here — parent handles height)
// input box:                3
// total:                    9
const OVERHEAD = 9;

// ─── Component ────────────────────────────────────────────────────────────────

function renderSegments(line: RenderedLine, key: number, bg?: string) {
  if (line.isBlank || !line.segments.length) {
    return <text key={key} bg={bg}> </text>;
  }
  return (
    <text key={key} bg={bg}>
      {line.segments.map((s, j) =>
        s.bold
          ? <strong key={j}><span fg={s.color ?? '#CCCCCC'}>{s.text}</span></strong>
          : <span key={j} fg={s.color ?? '#CCCCCC'}>{s.text}</span>
      )}
    </text>
  );
}

export const ChatMessages = forwardRef<ChatMessagesHandle, ChatMessagesProps>(
  ({ messages, isStreaming }, ref) => {
    const { width: termColumns, height: termRows } = useTerminalDimensions();

    const [scrollOffset, setScrollOffset] = useState(0);
    const [manualScroll, setManualScroll]  = useState(false);

    const contentWidth   = Math.max(20, termColumns - 4);
    const availableLines = Math.max(4, termRows - OVERHEAD);

    const blocks = useMemo(
      () => buildBlocks(messages, contentWidth),
      [messages, contentWidth],
    );

    // Total rendered line count across all blocks
    const totalLines = useMemo(
      () => blocks.reduce((s, b) => s + b.lineCount, 0),
      [blocks],
    );

    const maxOffset = Math.max(0, totalLines - availableLines);

    // Auto-scroll to bottom
    useEffect(() => {
      if (!manualScroll) setScrollOffset(maxOffset);
    }, [totalLines, manualScroll, maxOffset]);

    useEffect(() => {
      if (scrollOffset >= maxOffset) setManualScroll(false);
    }, [scrollOffset, maxOffset]);

    useImperativeHandle(ref, () => ({
      scrollUp(lines = 3) {
        setManualScroll(true);
        setScrollOffset(o => Math.max(0, o - lines));
      },
      scrollDown(lines = 3) {
        setScrollOffset(o => Math.min(maxOffset, o + lines));
      },
    }), [maxOffset]);

    const atBottom  = scrollOffset >= maxOffset;
    const canScroll = totalLines > availableLines;

    // ── Build the visible JSX rows ──────────────────────────────────────────
    // Walk blocks, track a global line cursor, emit only rows within the
    // [scrollOffset, scrollOffset + availableLines) window.

    const rows: React.ReactNode[] = [];
    let cursor = 0;          // current global line index
    let rowKey = 0;          // unique key counter

    const emit = (node: React.ReactNode) => { rows.push(node); rowKey++; };
    const inView = () => cursor >= scrollOffset && cursor < scrollOffset + availableLines;

    if (blocks.length === 0 && !isStreaming) {
      // Empty state hint
      const hints = [
        'Ask Neo to analyse an image. Try:',
        '  analyse a meter for fused neutral',
        '  check this image for black plastic cutouts',
        '  /skills — list available skills',
      ];
      for (const hint of hints) {
        if (inView()) emit(<text key={rowKey} fg="#555555">{hint}</text>);
        cursor++;
      }
    }

    for (const block of blocks) {

      // Header row
      if (inView()) {
        if (block.role === 'assistant') {
          emit(
            <text key={rowKey}>
              <span fg="#00FF88"><strong> Neo </strong></span>
              <span fg="#555555">{block.time}</span>
            </text>
          );
        } else {
          emit(
            <text key={rowKey}>
              <span fg="#00CCFF"><strong> You </strong></span>
              <span fg="#555555">{block.time}</span>
            </text>
          );
        }
      }
      cursor++;

      // Body lines
      for (const line of block.lines) {
        if (inView()) emit(renderSegments(line, rowKey, undefined));
        cursor++;
      }

      // Trailing gap
      if (inView()) emit(<text key={rowKey}> </text>);
      cursor++;

      if (cursor >= scrollOffset + availableLines) break;
    }

    // Pad remaining space so the box holds its height
    while (rows.length < availableLines) {
      emit(<text key={rowKey}> </text>);
    }

    return (
      <box
        flexDirection="column"
        border
        borderColor="#555555"
        paddingLeft={1}
        paddingRight={1}
        flexGrow={1}
        overflow="hidden"
      >
        {/* title row */}
        <box flexDirection="row" justifyContent="space-between">
          <text><strong> Conversation</strong></text>
          <text fg="#555555">
            {canScroll ? (atBottom ? ' ↑ scroll ' : ' ↑↓ scroll ') : ' '}
          </text>
        </box>

        {rows}
      </box>
    );
  },
);

ChatMessages.displayName = 'ChatMessages';
