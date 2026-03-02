import { useState } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import type { AiProvider } from '../../agent/chat.js';

interface ConnectModalProps {
  current:  AiProvider;
  onSelect: (provider: AiProvider) => void;
  onClose:  () => void;
}

const OPTIONS: { id: AiProvider; label: string; detail: string }[] = [
  {
    id:     'bedrock',
    label:  'AWS Bedrock',
    detail: 'AWS_PROFILE / AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY',
  },
  {
    id:     'azure',
    label:  'Azure OpenAI',
    detail: 'AZURE_OPENAI_API_KEY + AZURE_OPENAI_BASE_URL',
  },
];

const MODAL_WIDTH  = 58;
const MODAL_HEIGHT = 14;

export function ConnectModal({ current, onSelect, onClose }: ConnectModalProps) {
  const { width, height } = useTerminalDimensions();
  const [cursor, setCursor] = useState<number>(() =>
    Math.max(0, OPTIONS.findIndex(o => o.id === current))
  );

  useKeyboard((key) => {
    if (key.name === 'escape' || key.name === 'q') {
      onClose();
      return;
    }
    if (key.name === 'up') {
      setCursor(c => (c - 1 + OPTIONS.length) % OPTIONS.length);
      return;
    }
    if (key.name === 'down') {
      setCursor(c => (c + 1) % OPTIONS.length);
      return;
    }
    if (key.name === 'return') {
      const chosen = OPTIONS[cursor];
      if (chosen) onSelect(chosen.id);
      return;
    }
  });

  const left = Math.max(0, Math.floor((width  - MODAL_WIDTH)  / 2));
  const top  = Math.max(0, Math.floor((height - MODAL_HEIGHT) / 2));

  return (
    <>
      {/* Backdrop */}
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        backgroundColor="#000000"
        opacity={0.75}
      />

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
        {/* title row */}
        <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <text fg="#00CCFF"><strong> Connect to AI Provider</strong></text>
          <text fg="#555555">↑↓ select · Enter confirm · Esc cancel </text>
        </box>

        {/* option rows */}
        {OPTIONS.map((opt, i) => {
          const isSelected = i === cursor;
          const isCurrent  = opt.id === current;
          const rowBg      = isSelected ? '#0d2a3a' : undefined;
          const labelColor = isSelected ? '#00CCFF' : '#CCCCCC';

          return (
            <box key={opt.id} flexDirection="column" marginBottom={1} backgroundColor={rowBg}>
              <text>
                <span fg={isSelected ? '#00CCFF' : '#444444'}>
                  {isSelected ? ' ❯ ' : '   '}
                </span>
                <span fg={labelColor}><strong>{opt.label}</strong></span>
                {isCurrent && <span fg="#FFCC00">  ← active</span>}
              </text>
              <text fg="#666666">     {opt.detail}</text>
            </box>
          );
        })}
      </box>
    </>
  );
}
