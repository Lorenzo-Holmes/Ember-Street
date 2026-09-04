import { describe, expect, it } from 'vitest';
// @ts-expect-error Build-time JavaScript helper is deliberately separate from browser code.
import { compileMinitoolCss } from '../scripts/minitool-css.mjs';

describe('mini-tool release CSS', () => {
  it('lowers relational state and selector alternatives', () => {
    const css = compileMinitoolCss('body:has(.notebook-page) :is(h1,h2){color:#0008}.x:where(p,small){margin:0}');
    expect(css).toContain('body.mt-notebook h1');
    expect(css).toContain('body.mt-notebook h2');
    expect(css).not.toContain(':has(');
    expect(css).not.toContain(':where(');
  });
  it('preserves negated selector semantics', () => {
    const css = compileMinitoolCss('.x:not(:is(.one,.two)){display:none}');
    expect(css).toContain(':not(.one):not(.two)');
  });
  it('emits baseline declarations before enhancements and grid gap aliases', () => {
    const css = compileMinitoolCss('.x{font-size:clamp(16px,4cqw,24px);gap:12px;min-height:100svh}');
    expect(css).toContain('font-size: 16px');
    expect(css).toContain('grid-gap: 12px');
    expect(css).toContain('min-height: 100vh');
  });
  it('rejects new unmapped has selectors instead of silently dropping layout', () => {
    expect(() => compileMinitoolCss('body:has(.unknown){margin:0}')).toThrow('Unmapped relational selector');
  });
  it('keeps edge controls on screen when max() is unsupported', () => {
    const css = compileMinitoolCss('.menu{right:max(12px,calc((100vw - 580px) / 2))}');
    expect(css).toContain('right: 12px');
  });
});
