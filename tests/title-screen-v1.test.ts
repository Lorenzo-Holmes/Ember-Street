import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import V1Entry from '../src/V1Entry';
import TitleScreen from '../src/ui/v1/TitleScreen';
import { DevSceneNav, createPreviewState } from '../src/ui/v1/DevScenePreview';
import { inspectGameSave } from '../src/game/storage';
import { continueSavedSession, savedDayLabel, startNewSession } from '../src/game/sessionEntry';
import { createV060InitialState } from '../src/game/v060/campaign';
import type { GameState } from '../src/game/types';

const key = 'ember-street-save-v3';
const activeKey = 'ember-street-last-active-v1';
let values: Map<string, string>;
let write: ReturnType<typeof vi.fn>;
let remove: ReturnType<typeof vi.fn>;
const base = () => ({ ...createV060InitialState(123456), day: 9 });

beforeEach(() => {
  values = new Map();
  write = vi.fn((name: string, value: string) => values.set(name, value));
  remove = vi.fn((name: string) => values.delete(name));
  vi.stubGlobal('localStorage', { getItem: (name: string) => values.get(name) ?? null, setItem: write, removeItem: remove });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('read-only title screen', () => {
  it('does not create a save simply by opening the application', () => {
    const html = renderToStaticMarkup(createElement(V1Entry));
    expect(html).toContain('游戏开始界面');
    expect(html).toContain('开始游戏');
    expect(html).not.toContain('继续游戏');
    expect(html).not.toContain('场景预览');
    expect(html).not.toContain('v1-bottom-nav');
    expect(values.size).toBe(0);
    expect(write).not.toHaveBeenCalled();
  });

  it('shows the saved day and phase without writing or applying offline progress', () => {
    const state = { ...base(), phase: 'night' as const };
    const raw = JSON.stringify(state);
    values.set(key, raw);
    const html = renderToStaticMarkup(createElement(TitleScreen, { onEnter: vi.fn() }));
    expect(html).toContain('继续游戏');
    expect(html).toContain('第 9 天 · 夜里');
    expect(html).toContain('重新开始');
    expect(values.get(key)).toBe(raw);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([1, 2])('inspects version %i without upgrading it on disk', (version) => {
    values.set(`ember-street-save-v${version}`, JSON.stringify({ ...base(), version }));
    const result = inspectGameSave();
    expect(result.kind).toBe('saved');
    expect(values.has(key)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('does not show developer scene controls in a normal session', () => {
    expect(renderToStaticMarkup(createElement(DevSceneNav, { active: null }))).toBe('');
  });
});

describe('explicit session entry', () => {
  it('creates day one only after an explicit start', () => {
    const result = startNewSession();
    expect(result.kind).toBe('ready');
    expect(JSON.parse(values.get(key)!).day).toBe(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it('requires confirmation before replacing an existing save, including a newly appeared save', () => {
    values.set(key, JSON.stringify(base()));
    const original = values.get(key);
    expect(startNewSession().kind).toBe('confirm-restart');
    expect(values.get(key)).toBe(original);
    expect(write).not.toHaveBeenCalled();
  });

  it('preserves unreadable data until the player confirms replacement', () => {
    values.set(key, '{broken save');
    expect(inspectGameSave().kind).toBe('unreadable');
    expect(startNewSession().kind).toBe('confirm-restart');
    expect(continueSavedSession().kind).toBe('error');
    expect(values.get(key)).toBe('{broken save');
    expect(write).not.toHaveBeenCalled();
  });

  it('restarts only after confirmation and leaves other stored records untouched', () => {
    values.set(key, JSON.stringify(base()));
    values.set('ending-collection', 'keep');
    expect(startNewSession(true).kind).toBe('ready');
    expect(JSON.parse(values.get(key)!).day).toBe(1);
    expect(values.get('ending-collection')).toBe('keep');
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['street', 'assignment', 'expedition', 'dusk', 'night', 'night-summary', 'summary', 'dawn', 'ending'] as GameState['phase'][])
    ('continues the saved %s phase instead of resetting to day one', (phase) => {
      values.set(key, JSON.stringify({ ...base(), phase }));
      const result = continueSavedSession();
      expect(result.kind).toBe('ready');
      if (result.kind !== 'ready') throw new Error('missing session');
      expect(result.state.day).toBe(9);
      expect(result.state.phase).toBe(phase);
      expect(savedDayLabel(result.state)).toMatch(/^第 9 天 · /);
    });

  it('retains the current night decision when continuing', () => {
    const state = createPreviewState('dice');
    values.set(key, JSON.stringify(state));
    const result = continueSavedSession();
    if (result.kind !== 'ready') throw new Error('missing session');
    expect(result.state.pendingCheck).toEqual(state.pendingCheck);
    expect(result.state.nightState.currentEventId).toBe(state.nightState.currentEventId);
  });

  it('only applies existing offline recovery once across consecutive menu visits', () => {
    const state = base();
    state.survivors = state.survivors.map((survivor) => ({ ...survivor, energy: 20 }));
    state.dayAssignments = Object.fromEntries(state.survivors.map((survivor) => [survivor.id, 'rest']));
    values.set(key, JSON.stringify(state));
    values.set(activeKey, String(Date.now() - 3_600_000));
    const preview = inspectGameSave();
    if (preview.kind !== 'saved') throw new Error('missing preview');
    expect(preview.state.survivors[0].energy).toBe(20);
    const first = continueSavedSession();
    const second = continueSavedSession();
    if (first.kind !== 'ready' || second.kind !== 'ready') throw new Error('missing session');
    expect(first.state.survivors[0].energy).toBe(24);
    expect(second.state.survivors[0].energy).toBe(24);
  });

  it('does not delete a save if writing the replacement fails', () => {
    values.set(key, JSON.stringify(base()));
    const original = values.get(key);
    write.mockImplementation(() => { throw new Error('quota'); });
    expect(startNewSession(true).kind).toBe('error');
    expect(values.get(key)).toBe(original);
    expect(remove).not.toHaveBeenCalled();
  });
});
