import { Gift, NotebookPen } from "lucide-react";

const marks = {
  "birthday-topper": Gift,
  "note-card": NotebookPen,
} as const;

export function hasAddonMark(id: string) {
  return id in marks;
}

export function AddonMark({ id, size = 18 }: { id: string; size?: number }) {
  const Icon = marks[id as keyof typeof marks];
  if (!Icon) return null;
  return <Icon size={size} aria-hidden />;
}
