/**
 * InputBox — chat input field using OpenTUI's native <input> component.
 *
 * Uses onInput to track value and useKeyboard (from parent via prop) to handle
 * Enter submission, since the onSubmit type has an intersection conflict.
 */
import { useState, useRef, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';

interface InputBoxProps {
  onSubmit:     (value: string) => void;
  disabled?:    boolean;
  placeholder?: string;
}

export function InputBox({ onSubmit, disabled = false, placeholder = 'Type a message...' }: InputBoxProps) {
  const [value, setValue] = useState('');
  const valueRef = useRef('');

  const handleInput = useCallback((val: string) => {
    valueRef.current = val;
    setValue(val);
  }, []);

  useKeyboard((key) => {
    if (disabled) return;
    if (key.name === 'return') {
      const trimmed = valueRef.current.trim();
      if (trimmed) {
        valueRef.current = '';
        setValue('');
        onSubmit(trimmed);
      }
    }
  });

  const bc = disabled ? '#555555' : '#00CCFF';

  if (disabled) {
    return (
      <box border borderStyle="rounded" borderColor={bc} paddingLeft={1} paddingRight={1}>
        <text fg={bc}><strong>{'> '}</strong></text>
        <text fg="#555555">thinking…</text>
      </box>
    );
  }

  return (
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
  );
}
