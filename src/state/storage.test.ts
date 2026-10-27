import {
  DEFAULT_FAVORITES,
  DEFAULT_SETTINGS,
  RATE_OPTIONS,
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

  it('速さのこまかい調整と読み上げ方式は、未設定なら従来どおり（プリセット・従来方式）', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ voiceMode: 'system', rate: 'slow' }));
    expect(loadSettings()).toMatchObject({ voiceMode: 'system', rate: 'slow', rateValue: null, speechStyle: 'plain' });
    saveSettings({ ...DEFAULT_SETTINGS, rateValue: 0.9, speechStyle: 'adjusted' });
    expect(loadSettings()).toMatchObject({ rateValue: 0.9, speechStyle: 'adjusted' });
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ rateValue: 3, speechStyle: 'magic' }));
    expect(loadSettings()).toMatchObject({ rateValue: null, speechStyle: 'plain' });
  });

  it('よく使う言葉の読み上げ用テキストを保存・復元し、以前のデータもそのまま読める', () => {
    localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([{ id: 'a', text: 'はい' }]));
    expect(loadFavorites()).toEqual([{ id: 'a', text: 'はい' }]);
    saveFavorites([
      { id: 'a', text: 'きょうはいいてんきです', speechText: '今日はいい天気です。' },
      { id: 'b', text: 'あめ', speechText: '  ' },
    ]);
    expect(loadFavorites()).toEqual([
      { id: 'a', text: 'きょうはいいてんきです', speechText: '今日はいい天気です。' },
      { id: 'b', text: 'あめ' },
    ]);
  });

  it('ゆっくり 0.6・ふつう 0.95・はやめ 1.15。以前「ゆっくり」を選んでいた人も 0.6 になる', () => {
    expect(RATE_OPTIONS.map((r) => [r.id, r.rate])).toEqual([
      ['slow', 0.6],
      ['normal', 0.95],
      ['fast', 1.15],
    ]);
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ rate: 'slow' }));
    expect(loadSettings().rate).toBe('slow');
    // こまかい調整の範囲は「ゆっくり」をふくむ
    saveSettings({ ...DEFAULT_SETTINGS, rateValue: 0.6 });
    expect(loadSettings().rateValue).toBe(0.6);
  });
});

