import type { DefectSeverity } from '../../types.js';

export function severityColor(severity: DefectSeverity): string {
  switch (severity) {
    case 'none':     return '#00FF88';
    case 'low':      return '#00CCFF';
    case 'medium':   return '#FFCC00';
    case 'high':     return '#FF6600';
    case 'critical': return '#FF2222';
    default:         return '#FFFFFF';
  }
}

export function severityLabel(severity: DefectSeverity): string {
  return severity.toUpperCase().padEnd(8);
}

interface SeverityBadgeProps {
  severity: DefectSeverity;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span fg={severityColor(severity)}><strong>[{severityLabel(severity)}]</strong></span>
  );
}

interface HeaderProps {
  title?: string;
}

export function Header({ title = 'NEO — Meter Defect Analysis Agent' }: HeaderProps) {
  return (
    <box border borderStyle="double" borderColor="#00CCFF" paddingLeft={2} paddingRight={2} marginBottom={1}>
      <text><span fg="#00CCFF"><strong>{title}</strong></span></text>
    </box>
  );
}

interface DividerProps {
  label?: string;
}

export function Divider({ label }: DividerProps) {
  return (
    <box>
      <text fg="#555555">{label ? `── ${label} ` : ''}{'─'.repeat(40)}</text>
    </box>
  );
}
