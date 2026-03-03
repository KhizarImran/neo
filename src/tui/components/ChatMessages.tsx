/**
 * ChatMessages — scrollable message list using OpenTUI's native <scrollbox>.
 *
 * Uses stickyScroll + stickyStart="bottom" for auto-scroll to latest message.
 * Manual scroll via scrollBy on the ScrollBoxRenderable ref.
 */
import { useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import type { ScrollBoxRenderable } from '@opentui/core';
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

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderSegments(line: RenderedLine, key: number) {
  if (line.isBlank || !line.segments.length) {
    return <text key={key}> </text>;
  }
  return (
    <text key={key}>
      {line.segments.map((s, j) =>
        s.bold
          ? <strong key={j}><span fg={s.color ?? '#CCCCCC'}>{s.text}</span></strong>
          : <span key={j} fg={s.color ?? '#CCCCCC'}>{s.text}</span>
      )}
    </text>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ChatMessages = forwardRef<ChatMessagesHandle, ChatMessagesProps>(
  ({ messages, isStreaming }, ref) => {
    const { width: termColumns, height: termRows } = useTerminalDimensions();
    const scrollRef = useRef<ScrollBoxRenderable | null>(null);
    const contentWidth = Math.max(20, termColumns - 6);

    // Calculate exact height available for the scrollbox.
    // Overhead: header(3) + conversation border+title+gap(4) + input(3) + margin(2) = 12
    // When streaming, WorkingBox takes ~7 more rows.
    const scrollHeight = Math.max(4, termRows - 12 - (isStreaming ? 7 : 0));

    useImperativeHandle(ref, () => ({
      scrollUp(lines = 3) {
        scrollRef.current?.scrollBy(-lines, 'step');
      },
      scrollDown(lines = 3) {
        scrollRef.current?.scrollBy(lines, 'step');
      },
    }));

    const messageNodes = useMemo(() => {
      return messages
        .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } =>
          m.role === 'user' || m.role === 'assistant'
        )
        .map((msg, bi) => {
          const isUser      = msg.role === 'user';
          const headerColor = isUser ? '#00CCFF' : '#00FF88';
          const roleLabel   = isUser ? ' You ' : ' Neo ';
          const time        = msg.timestamp.toLocaleTimeString();

          let lines: RenderedLine[];
          if (isUser) {
            lines = wrapWords(msg.content, contentWidth - 2).map(chunk => ({
              segments: [{ text: '  ' + chunk, color: '#FFFFFF' }],
            }));
          } else {
            lines = markdownToLines(msg.content, contentWidth);
          }

          return (
            <box key={bi} flexDirection="column" marginBottom={1}>
              <text>
                <span fg={headerColor}><strong>{roleLabel}</strong></span>
                <span fg="#555555">{time}</span>
              </text>
              {lines.map((line, li) => renderSegments(line, li))}
            </box>
          );
        });
    }, [messages, contentWidth]);

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
        <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <text><strong> Conversation</strong></text>
          <text fg="#555555"> ↑↓ scroll </text>
        </box>

        {/* native scrollbox — hard height so it never overflows the terminal */}
        <scrollbox
          ref={scrollRef as any}
          height={scrollHeight}
          stickyScroll={true}
          stickyStart="bottom"
          scrollY={true}
          scrollX={false}
          viewportCulling={true}
          focused={false}
        >
          {messages.length === 0 && !isStreaming ? (
            <box flexDirection="column">
              <text fg="#555555">Ask Neo to analyse an image. Try:</text>
              <text fg="#555555">  analyse a meter for fused neutral</text>
              <text fg="#555555">  check this image for black plastic cutouts</text>
              <text fg="#555555">  /skills — list available skills</text>
            </box>
          ) : messageNodes}
        </scrollbox>
      </box>
    );
  },
);

ChatMessages.displayName = 'ChatMessages';
