import { updatePrimaryPalette } from '@primeng/themes';

export const BRAND_COLORS = [
  'emerald', 'green', 'lime', 'red', 'orange', 'amber', 'yellow', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
  'slate', 'gray', 'zinc', 'neutral', 'stone'
] as const;

export type BrandColor = typeof BRAND_COLORS[number];

export function applyBrandColor(color: string | null | undefined): void {
  const chosen = BRAND_COLORS.find(item => item === color) ?? 'blue';
  updatePrimaryPalette(Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
      .map(shade => [shade, `{${chosen}.${shade}}`])
  ));
}
