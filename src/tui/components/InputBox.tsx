/**
 * InputBox — chat input field with / command autocomplete popup.
 */
import { useState, useRef, useCallback } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';

interface InputBoxProps {
  onSubmit:     (value: string) => void;
  disabled?:    boolean;
  placeholder?: string;
}

const COMMANDS = [
  { cmd: '/skills',   desc: 'List loaded defect skills' },
  { cmd: '/connect',  desc: 'Switch AI provider' },
  { cmd: '/sessions', desc: 'Browse and resume past sessions' },
  { cmd: '/compact',  desc: 'Summarise conversation to reduce token cost' },
];

export function InputBox({ onSubmit, disabled = false, placeholder = 'Type a message...' }: InputBoxProps) {
  const [value, setValue]       = useState('');
  const [cursor, setCursor]     = useState(0);
  const valueRef                = useRef('');
  const { height }              = useTerminalDimensions();

  const handleInput = useCallback((val: string) => {
    valueRef.current = val;
    setValue(val);
    setCursor(0); // reset selection when input changes
  }, []);

  // Filter commands that match what's been typed
  const trimmed = value.trimStart();
  const suggestions = trimmed.startsWith('/')
    ? COMMANDS.filter(c => c.cmd.startsWith(trimmed))
    : [];
  const showPopup = suggestions.length > 0;

  useKeyboard((key) => {
    if (disabled) return;

    // Navigate autocomplete with Tab / arrow up-down when popup is open
    if (showPopup) {
      if (key.name === 'tab' || key.name === 'down') {
        setCursor(c => (c + 1) % suggestions.length);
        return;
      }
      if (key.name === 'up') {
        setCursor(c => (c - 1 + suggestions.length) % suggestions.length);
        return;
      }
      // Accept suggestion with Tab when it's the only navigation key pressed
      // OR with Enter when the typed text exactly matches one command
    }

    if (key.name === 'return') {
      // If popup open and user hasn't typed a full command, complete the selected suggestion
      if (showPopup && suggestions.length > 0) {
        const selected = suggestions[cursor]!;
        // If typed text doesn't exactly match a command, complete it
        if (trimmed !== selected.cmd) {
          valueRef.current = selected.cmd;
          setValue(selected.cmd);
          setCursor(0);
          return;
        }
      }
      const v = valueRef.current.trim();
      if (v) {
        valueRef.current = '';
        setValue('');
        setCursor(0);
        onSubmit(v);
      }
    }
  });

  const bc = disabled ? '#555555' : '#00CCFF';

  // Popup renders as absolute box just above the input row.
  // Input is always the last row(s), so popup sits at height - (input rows) - (popup rows).
  const inputRows  = 3; // border + content + border
  const popupRows  = suggestions.length + 2; // border + items + border
  const popupTop   = height - inputRows - popupRows;

  if (disabled) {
    return (
      <box border borderStyle="rounded" borderColor={bc} paddingLeft={1} paddingRight={1}>
        <text fg={bc}><strong>{'> '}</strong></text>
        <text fg="#555555">thinking…</text>
      </box>
    );
  }

  return (
    <>
      {/* Autocomplete popup — rendered above the input */}
      {showPopup && (
        <box
          position="absolute"
          top={popupTop}
          left={2}
          width={44}
          flexDirection="column"
          border
          borderStyle="single"
          borderColor="#444444"
          backgroundColor="#0d0d0d"
          paddingLeft={1}
          paddingRight={1}
        >
          {suggestions.map((s, i) => {
            const selected = i === cursor;
            return (
              <box key={s.cmd} flexDirection="row">
                <text>
                  <span fg={selected ? '#00CCFF' : '#888888'}>
                    <strong>{s.cmd}</strong>
                  </span>
                  <span fg="#555555">  {s.desc}</span>
                </text>
              </box>
            );
          })}
        </box>
      )}

      {/* Input row */}
      <box border borderStyle="rounded" borderColor={bc} paddingLeft={1} paddingRight={1} flexDirection="row">
        <text fg={bc}><strong>{'> '}</strong></text>
        <input
          flexGrow={1}
          placeholder={placeholder}
          value={value}
          onInput={handleInput}
          focused
        />
      </box>
    </>
  );
}
