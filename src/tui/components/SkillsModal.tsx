import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import type { Skill } from '../../agent/loader.js';

interface SkillsModalProps {
  skills:  Skill[];
  onClose: () => void;
}

const MODAL_WIDTH  = 62;
const MODAL_HEIGHT = (skills: Skill[]) => Math.min(6 + skills.length * 3, 30);

export function SkillsModal({ skills, onClose }: SkillsModalProps) {
  const { width, height } = useTerminalDimensions();

  useKeyboard((key) => {
    if (key.name === 'escape' || key.name === 'return' || key.name === 'q') {
      onClose();
    }
  });

  const modalH = MODAL_HEIGHT(skills);
  const left   = Math.max(0, Math.floor((width  - MODAL_WIDTH)  / 2));
  const top    = Math.max(0, Math.floor((height - modalH)       / 2));

  return (
    <>
      {/* Backdrop — full screen dark overlay */}
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        backgroundColor="#000000"
        opacity={0.75}
      />

      {/* Modal — centered */}
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
          <text fg="#00CCFF"><strong> Available Skills</strong></text>
          <text fg="#555555">Esc / Enter to close </text>
        </box>

        {/* skill list */}
        {skills.length === 0 ? (
          <text fg="#555555">  No skills loaded.</text>
        ) : (
          skills.map((skill, i) => (
            <box key={i} flexDirection="column" marginBottom={i < skills.length - 1 ? 1 : 0}>
              <text>
                <span fg="#00CCFF"><strong>  • </strong></span>
                <strong>{skill.name}</strong>
              </text>
              {skill.description ? (
                <text fg="#888888">      {skill.description}</text>
              ) : null}
            </box>
          ))
        )}
      </box>
    </>
  );
}
