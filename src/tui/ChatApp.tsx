import { useState, useRef, useCallback } from 'react';
import { useKeyboard, useRenderer } from '@opentui/react';
import { ChatMessages, type ChatMessagesHandle } from './components/ChatMessages.js';
import { InputBox } from './components/InputBox.js';
import { WorkingBox } from './components/WorkingBox.js';
import { SkillsModal } from './components/SkillsModal.js';
import { ChatAgent, type ChatMessage } from '../agent/chat.js';
import { loadSkills } from '../agent/loader.js';

interface ChatAppProps {
  inputDir:     string;
  skillsDir:    string;
  workspaceDir: string;
}

export function ChatApp({ inputDir, skillsDir, workspaceDir }: ChatAppProps) {
  const renderer = useRenderer();

  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming]  = useState(false);
  const [streamText, setStreamText]   = useState('');
  const [error, setError]             = useState<string | null>(null);
  const [showSkills, setShowSkills]   = useState(false);

  const agentRef        = useRef<ChatAgent | null>(null);
  const messagesRef     = useRef<ChatMessagesHandle | null>(null);
  const skillsRef       = useRef(loadSkills(skillsDir));
  const isStreamingRef  = useRef(false);
  const streamTextRef   = useRef('');
  const lastPaintRef    = useRef(0);

  // One-time agent init
  if (!agentRef.current) {
    try { agentRef.current = new ChatAgent(inputDir, skillsDir, workspaceDir); } catch (_) {}
  }

  // ── global keyboard handler (scroll, quit)
  useKeyboard((key) => {
    // Exit
    if (key.ctrl && key.name === 'c') {
      renderer.destroy();
      process.exit(0);
    }
    if (key.ctrl && key.name === 'q') {
      renderer.destroy();
      process.exit(0);
    }

    // Scroll (only when not streaming and skills modal is not open)
    if (!isStreamingRef.current && !showSkills) {
      if (key.name === 'up')   { messagesRef.current?.scrollUp(3);   return; }
      if (key.name === 'down') { messagesRef.current?.scrollDown(3); return; }
    }

    // Mouse wheel (OpenTUI fires these as key events with scroll name or via mousewheel)
    if (key.name === 'scrollup')   { messagesRef.current?.scrollUp(3);   return; }
    if (key.name === 'scrolldown') { messagesRef.current?.scrollDown(3); return; }
  });

  // ── submit
  const handleSubmit = useCallback(async (text: string) => {
    if (isStreamingRef.current || !agentRef.current) return;

    if (text.trim() === '/skills') {
      setShowSkills(true);
      return;
    }

    isStreamingRef.current = true;
    setIsStreaming(true);
    streamTextRef.current = '';
    lastPaintRef.current  = 0;
    setStreamText('');
    setError(null);

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };

    try {
      for await (const delta of agentRef.current.sendMessage(text)) {
        streamTextRef.current += delta;
        // Throttle repaints to ~20fps (50ms) to prevent flicker
        const now = Date.now();
        if (now - lastPaintRef.current >= 50) {
          lastPaintRef.current = now;
          setStreamText(streamTextRef.current);
        }
      }
      // Always flush the final text
      setStreamText(streamTextRef.current);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: streamTextRef.current,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMsg, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, userMsg]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      isStreamingRef.current = false;
      setIsStreaming(false);
      streamTextRef.current = '';
      setStreamText('');
    }
  }, []);

  return (
    <box flexDirection="column" flexGrow={1} height="100%">
      {/* header — single text row so all spans render inline */}
      <box border borderStyle="double" borderColor="#00CCFF" paddingLeft={2} paddingRight={2}
           flexDirection="row" justifyContent="space-between">
        <text>
          <span fg="#00CCFF"><strong>NEO</strong></span>
          <span fg="#444444">  ·  </span>
          <span fg="#888888">Meter Defect Analysis Agent</span>
        </text>
        <text fg="#555555">chat mode</text>
      </box>

      {/* conversation */}
      <box flexGrow={1} flexDirection="column" overflow="hidden">
        <ChatMessages
          ref={messagesRef}
          messages={messages}
          isStreaming={isStreaming}
        />
      </box>

      {/* working box — visible only while streaming */}
      {isStreaming && <WorkingBox streamText={streamText} />}

      {/* error */}
      {error && (
        <box border borderColor="#FF2222" paddingLeft={1} paddingRight={1}>
          <text fg="#FF2222"><strong>Error: </strong>{error}</text>
        </box>
      )}

      {/* input */}
      <InputBox
        onSubmit={handleSubmit}
        disabled={isStreaming}
        placeholder="Ask Neo anything... (/skills to list skills)"
      />

      {/* skills modal overlay */}
      {showSkills && (
        <SkillsModal
          skills={skillsRef.current}
          onClose={() => setShowSkills(false)}
        />
      )}
    </box>
  );
}
