/** Soft, Notion-like tints for categories. Used only for tags and charts. */
export const TAG_COLORS = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export const TAG_COLOR_LABELS: Record<TagColor, string> = {
  gray: 'Grigio',
  brown: 'Marrone',
  orange: 'Arancione',
  yellow: 'Giallo',
  green: 'Verde',
  blue: 'Blu',
  purple: 'Viola',
  pink: 'Rosa',
  red: 'Rosso',
};

export function isTagColor(value: string): value is TagColor {
  return (TAG_COLORS as readonly string[]).includes(value);
}
