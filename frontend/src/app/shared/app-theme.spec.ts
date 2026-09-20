import { theme } from './app-theme';

describe('app-theme', () => {
  it('exports a non-null preset object', () => {
    expect(theme).toBeDefined();
    expect(typeof theme).toBe('object');
  });

  it('keeps the blue-based primary palette', () => {
    const semantic = (theme as { semantic?: { primary?: Record<string, string> } }).semantic;
    const primary = semantic?.primary ?? {};
    expect(primary[500]).toBe('{blue.500}');
    expect(primary[900]).toBe('{blue.900}');
  });
});
