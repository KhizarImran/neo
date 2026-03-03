import { useState, useRef, useCallback, useMemo } from 'react';
import { useKeyboard, useRenderer } from '@opentui/react';
import { join } from 'path';
import { ChatMessages, type ChatMessagesHandle } from './components/ChatMessages.js';
import { InputBox } from './components/InputBox.js';
import { WorkingBox } from './components/WorkingBox.js';
import { SkillsModal } from './components/SkillsModal.js';
import { ConnectModal } from './components/ConnectModal.js';
import { SessionsModal } from './components/SessionsModal.js';
import { ChatAgent, type ChatMessage, type AiProvider, SessionStore } from '../agent/chat.js';
import type { SessionRecord, StoredMessage } from '../agent/session.js';
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

function storedToChat(m: StoredMessage): ChatMessage {
  return { role: m.role, content: m.content, timestamp: new Date(m.timestamp) };
}

export function ChatApp({ inputDir, skillsDir, workspaceDir }: ChatAppProps) {
  const renderer = useRenderer();

  // Session store — lives for the lifetime of the app
  const storeRef = useRef<SessionStore>(
    new SessionStore(join(workspaceDir, '..', 'sessions'))
  );

  const [messages, setMessages]             = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming]        = useState(false);
  const [streamText, setStreamText]         = useState('');
  const [error, setError]                   = useState<string | null>(null);
  const [showSkills, setShowSkills]         = useState(false);
  const [showConnect, setShowConnect]       = useState(false);
  const [showSessions, setShowSessions]     = useState(false);
  const [activeProvider, setActiveProvider] = useState<AiProvider>(initialProvider);
  const [sessionTitle, setSessionTitle]     = useState<string>('new session');

  const agentRef        = useRef<ChatAgent | null>(null);
  const messagesRef     = useRef<ChatMessagesHandle | null>(null);
  const skillsRef       = useRef(loadSkills(skillsDir));
  const isStreamingRef  = useRef(false);
  const streamTextRef   = useRef('');
  const lastPaintRef    = useRef(0);

  // One-time agent init
  if (!agentRef.current) {
    try {
      agentRef.current = new ChatAgent(inputDir, skillsDir, workspaceDir, activeProvider, storeRef.current);
    } catch (_) {}
  }

  // ── global keyboard handler
  useKeyboard((key) => {
    if (key.ctrl && key.name === 'c') { renderer.destroy(); process.exit(0); }
    if (key.ctrl && key.name === 'q') { renderer.destroy(); process.exit(0); }

    if (!isStreamingRef.current && !showSkills && !showConnect && !showSessions) {
      if (key.name === 'up')   { messagesRef.current?.scrollUp(3);   return; }
      if (key.name === 'down') { messagesRef.current?.scrollDown(3); return; }
    }
    if (key.name === 'scrollup')   { messagesRef.current?.scrollUp(3);   return; }
    if (key.name === 'scrolldown') { messagesRef.current?.scrollDown(3); return; }
  });

  // ── provider switch
  const handleProviderSelect = useCallback((provider: AiProvider) => {
    setActiveProvider(provider);
    setShowConnect(false);
    try {
      agentRef.current = new ChatAgent(inputDir, skillsDir, workspaceDir, provider, storeRef.current, agentRef.current?.currentSessionId);
    } catch (_) { agentRef.current = null; }
  }, [inputDir, skillsDir, workspaceDir]);

  // ── resume a past session
  const handleSessionResume = useCallback((session: SessionRecord) => {
    setShowSessions(false);
    const restored = session.messages.map(storedToChat);
    setMessages(restored);
    setSessionTitle(session.title);
    try {
      agentRef.current = new ChatAgent(inputDir, skillsDir, workspaceDir, activeProvider, storeRef.current, session.id);
    } catch (_) { agentRef.current = null; }
  }, [inputDir, skillsDir, workspaceDir, activeProvider]);

  // ── start a new session
  const handleNewSession = useCallback(() => {
    setShowSessions(false);
    setMessages([]);
    setSessionTitle('new session');
    setError(null);
    try {
      agentRef.current = new ChatAgent(inputDir, skillsDir, workspaceDir, activeProvider, storeRef.current);
    } catch (_) { agentRef.current = null; }
  }, [inputDir, skillsDir, workspaceDir, activeProvider]);

  // ── sessions list (refreshed each time modal opens)
  const sessionsList = useMemo(() => {
    if (!showSessions) return [];
    return storeRef.current.list();
  }, [showSessions]);

  // ── submit
  const handleSubmit = useCallback(async (text: string) => {
    if (isStreamingRef.current || !agentRef.current) return;

    if (text.trim() === '/skills')   { setShowSkills(true);   return; }
    if (text.trim() === '/connect')  { setShowConnect(true);  return; }
    if (text.trim() === '/sessions') { setShowSessions(true); return; }

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
        const now = Date.now();
        if (now - lastPaintRef.current >= 50) {
          lastPaintRef.current = now;
          setStreamText(streamTextRef.current);
        }
      }
      setStreamText(streamTextRef.current);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: streamTextRef.current,
        timestamp: new Date(),
      };
      setMessages(prev => {
        const next = [...prev, assistantMsg];
        // Persist after every completed turn
        agentRef.current?.persistMessages(next);
        // Update session title in header from first user message
        const firstUser = next.find(m => m.role === 'user');
        if (firstUser) {
          const t = firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '…' : '');
          setSessionTitle(t);
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      isStreamingRef.current = false;
      setIsStreaming(false);
      streamTextRef.current = '';
      setStreamText('');
    }
  }, []);

  const currentSessionId = agentRef.current?.currentSessionId ?? '';

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
          <span fg="#555555">{sessionTitle}  ·  </span>
          <span fg={activeProvider === 'azure' ? '#FFCC00' : '#00FF88'}>{PROVIDER_LABEL[activeProvider]}</span>
        </text>
      </box>

      {/* conversation */}
      <box flexGrow={1} flexDirection="column" overflow="hidden">
        <ChatMessages ref={messagesRef} messages={messages} isStreaming={isStreaming} />
      </box>

      {/* working box */}
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
        placeholder="Ask Neo anything... (/skills · /connect · /sessions)"
      />

      {/* modals */}
      {showSkills && (
        <SkillsModal skills={skillsRef.current} onClose={() => setShowSkills(false)} />
      )}
      {showConnect && (
        <ConnectModal current={activeProvider} onSelect={handleProviderSelect} onClose={() => setShowConnect(false)} />
      )}
      {showSessions && (
        <SessionsModal
          sessions={sessionsList}
          currentId={currentSessionId}
          onResume={handleSessionResume}
          onNew={handleNewSession}
          onClose={() => setShowSessions(false)}
        />
      )}
    </box>
  );
}
