import { applyBrandColor, BRAND_COLORS } from './brand-colors';

describe('brand-colors', () => {
  describe('BRAND_COLORS', () => {
    it('exposes the supported palette tokens', () => {
      expect(BRAND_COLORS).toContain('emerald');
      expect(BRAND_COLORS).toContain('rose');
      expect(BRAND_COLORS).toContain('stone');
    });

    it('contains only lowercase kebab-style names', () => {
      for (const color of BRAND_COLORS) {
        expect(color).toMatch(/^[a-z]+$/);
      }
    });
  });

  describe('applyBrandColor', () => {
    it('does not throw for valid brand colors', () => {
      expect(() => applyBrandColor('emerald')).not.toThrow();
      expect(() => applyBrandColor('rose')).not.toThrow();
    });

    it('falls back silently for unknown / empty / nullish inputs', () => {
      // The fallback chain must never throw, regardless of input shape.
      expect(() => applyBrandColor('not-a-color')).not.toThrow();
      expect(() => applyBrandColor(undefined)).not.toThrow();
      expect(() => applyBrandColor(null)).not.toThrow();
      expect(() => applyBrandColor('')).not.toThrow();
    });
  });
});
