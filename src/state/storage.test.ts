import {
  DEFAULT_FAVORITES,
  DEFAULT_SETTINGS,
  loadDraft,
  loadFavorites,
  loadSettings,
  saveDraft,
  saveFavorites,
  saveSettings,
  STORAGE_KEYS,
} from './storage';

beforeEach(() => localStorage.clear());

describe('端末内保存', () => {
  it('入力中の文章・カーソル・ページを保存して復元する', () => {
    saveDraft({ text: 'きょうは', cursor: 2, page: 1 });
    expect(loadDraft()).toEqual({ text: 'きょうは', cursor: 2, page: 1 });
  });

  it('保存がない・壊れているときは空の状態で始める', () => {
    expect(loadDraft()).toEqual({ text: '', cursor: 0, page: 0 });
    localStorage.setItem(STORAGE_KEYS.draft, '{壊れたデータ');
    expect(loadDraft()).toEqual({ text: '', cursor: 0, page: 0 });
    localStorage.setItem(STORAGE_KEYS.settings, '"abc"');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('保存に失敗しても例外で止まらない', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveDraft({ text: 'あ', cursor: 1, page: 0 })).toBe(false);
    spy.mockRestore();
  });

  it('設定を保存して復元する', () => {
    saveSettings({ ...DEFAULT_SETTINGS, rate: 'slow', voiceURI: 'uri:Kyoko' });
    expect(loadSettings()).toMatchObject({ rate: 'slow', voiceURI: 'uri:Kyoko', allowOnlineVoices: false });
  });

  it('よく使う言葉は初回だけ初期例が入り、全部消した状態も保持される', () => {
    expect(loadFavorites().map((f) => f.text)).toEqual(DEFAULT_FAVORITES);
    saveFavorites([]);
    expect(loadFavorites()).toEqual([]);
  });

  it('voiceMode がない以前の設定は「声を指定する」として読み、選んだ声を残す', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ voiceURI: 'uri:Otoya', rate: 'slow' }));
    expect(loadSettings()).toMatchObject({ voiceMode: 'specific', voiceURI: 'uri:Otoya', rate: 'slow' });
  });

  it('端末の標準音声モードを保存して復元し、選んでいた声も残す', () => {
    saveSettings({ ...DEFAULT_SETTINGS, voiceMode: 'system', voiceURI: 'uri:Kyoko' });
    expect(loadSettings()).toMatchObject({ voiceMode: 'system', voiceURI: 'uri:Kyoko' });
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ voiceMode: 'robot' }));
    expect(loadSettings().voiceMode).toBe('specific');
  });
});

