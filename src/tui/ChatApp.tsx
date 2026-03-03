import { useState, useRef, useCallback } from 'react';
import { useKeyboard, useRenderer } from '@opentui/react';
import { ChatMessages, type ChatMessagesHandle } from './components/ChatMessages.js';
import { InputBox } from './components/InputBox.js';
import { WorkingBox } from './components/WorkingBox.js';
import { SkillsModal } from './components/SkillsModal.js';
import { ConnectModal } from './components/ConnectModal.js';
import { ChatAgent, type ChatMessage, type AiProvider } from '../agent/chat.js';
import { loadSkills } from '../agent/loader.js';

interface ChatAppProps {
  inputDir:     string;
  skillsDir:    string;
  workspaceDir: string;
}

function initialProvider(): AiProvider {
  return process.env['AI_PROVIDER'] === 'azure' ? 'azure' : 'bedrock';
}

const PROVIDER_LABEL: Record<AiProvider, string> = {
  bedrock: 'AWS Bedrock',
  azure:   'Azure OpenAI',
};

export function ChatApp({ inputDir, skillsDir, workspaceDir }: ChatAppProps) {
  const renderer = useRenderer();

  const [messages, setMessages]           = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming]      = useState(false);
  const [streamText, setStreamText]       = useState('');
  const [error, setError]                 = useState<string | null>(null);
  const [showSkills, setShowSkills]       = useState(false);
  const [showConnect, setShowConnect]     = useState(false);
  const [activeProvider, setActiveProvider] = useState<AiProvider>(initialProvider);

  const agentRef        = useRef<ChatAgent | null>(null);
  const messagesRef     = useRef<ChatMessagesHandle | null>(null);
  const skillsRef       = useRef(loadSkills(skillsDir));
  const isStreamingRef  = useRef(false);
  const streamTextRef   = useRef('');
  const lastPaintRef    = useRef(0);

  // One-time agent init (or after provider switch)
  if (!agentRef.current) {
    try { agentRef.current = new ChatAgent(inputDir, skillsDir, workspaceDir, activeProvider); } catch (_) {}
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

    // Scroll (only when not streaming and no modal is open)
    if (!isStreamingRef.current && !showSkills && !showConnect) {
      if (key.name === 'up')   { messagesRef.current?.scrollUp(3);   return; }
      if (key.name === 'down') { messagesRef.current?.scrollDown(3); return; }
    }

    // Mouse wheel
    if (key.name === 'scrollup')   { messagesRef.current?.scrollUp(3);   return; }
    if (key.name === 'scrolldown') { messagesRef.current?.scrollDown(3); return; }
  });

  // ── provider switch callback
  const handleProviderSelect = useCallback((provider: AiProvider) => {
    setActiveProvider(provider);
    setShowConnect(false);
    try {
      agentRef.current = new ChatAgent(inputDir, skillsDir, workspaceDir, provider);
    } catch (_) {
      agentRef.current = null;
    }
  }, [inputDir, skillsDir, workspaceDir]);

  // ── submit
  const handleSubmit = useCallback(async (text: string) => {
    if (isStreamingRef.current || !agentRef.current) return;

    if (text.trim() === '/skills') {
      setShowSkills(true);
      return;
    }

    if (text.trim() === '/connect') {
      setShowConnect(true);
      return;
    }

    isStreamingRef.current = true;
    setIsStreaming(true);
    streamTextRef.current = '';
    lastPaintRef.current  = 0;
    setStreamText('');
    setError(null);

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

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
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
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
      {/* header */}
      <box border borderStyle="double" borderColor="#00CCFF" paddingLeft={2} paddingRight={2}
           flexDirection="row" justifyContent="space-between">
        <text>
          <span fg="#00CCFF"><strong>NEO</strong></span>
          <span fg="#444444">  ·  </span>
          <span fg="#888888">Meter Defect Analysis Agent</span>
        </text>
        <text>
          <span fg="#555555">chat mode  ·  </span>
          <span fg={activeProvider === 'azure' ? '#FFCC00' : '#00FF88'}>{PROVIDER_LABEL[activeProvider]}</span>
        </text>
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
        placeholder="Ask Neo anything... (/skills · /connect)"
      />

      {/* skills modal overlay */}
      {showSkills && (
        <SkillsModal
          skills={skillsRef.current}
          onClose={() => setShowSkills(false)}
        />
      )}

      {/* connect modal overlay */}
      {showConnect && (
        <ConnectModal
          current={activeProvider}
          onSelect={handleProviderSelect}
          onClose={() => setShowConnect(false)}
        />
      )}
    </box>
  );
}

