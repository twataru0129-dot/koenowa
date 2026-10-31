import { AudioClipPlayer, CLIP_START_TIMEOUT_MS, FLASH_TTS_CLIPS, isKyokoVoice } from './clips';

class FakeAudio {
  url: string;
  playCount = 0;
  pauseCount = 0;
  currentTime = 5;
  onplaying: ((ev: Event) => unknown) | null = null;
  onerror: ((ev: Event | string) => unknown) | null = null;
  result: 'ok' | 'reject' | 'throw' = 'ok';
  constructor(url: string) {
    this.url = url;
  }
  play() {
    this.playCount++;
    if (this.result === 'throw') throw new Error('boom');
    return this.result === 'reject' ? Promise.reject(new Error('NotAllowed')) : Promise.resolve();
  }
  pause() {
    this.pauseCount++;
  }
  started() {
    this.onplaying?.(new Event('playing'));
  }
}

function setup(failLoad: string[] = []) {
  const audios = new Map<string, FakeAudio>();
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const player = new AudioClipPlayer(FLASH_TTS_CLIPS, {
    load: (path) => (failLoad.includes(path) ? Promise.reject(new Error('404')) : Promise.resolve(`blob:${path}`)),
    createAudio: (url) => {
      const a = new FakeAudio(url);
      audios.set(url.replace('blob:', ''), a);
      return a;
    },
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      (t as { cleared: boolean }).cleared = true;
    },
  });
  const audio = (char: string) => audios.get(FLASH_TTS_CLIPS[char])!;
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { player, audio, timers, flush };
}

describe('「あ・い・う・え・お」の録音', () => {
  it('5つの文字と、指定のファイルが対応している', () => {
    expect(FLASH_TTS_CLIPS).toEqual({
      あ: 'flash-tts-aiueo/a.m4a',
      い: 'flash-tts-aiueo/i.m4a',
      う: 'flash-tts-aiueo/u.m4a',
      え: 'flash-tts-aiueo/e.m4a',
      お: 'flash-tts-aiueo/o.m4a',
    });
  });

  it('読み込みが終わるまでは使わない。読み込めた文字だけ使える', async () => {
    const { player, flush } = setup(['flash-tts-aiueo/u.m4a']);
    expect(player.has('あ')).toBe(false);
    player.preload();
    player.preload(); // 何度呼んでも1回だけ読み込む
    await flush();
    expect(['あ', 'い', 'え', 'お'].every((c) => player.has(c))).toBe(true);
    expect(player.has('う')).toBe(false);
    expect(player.has('か')).toBe(false);
  });

  it('再生は最初から。続けて押すと前の録音を止めてから次を再生する（重ならない）', async () => {
    const { player, audio, flush } = setup();
    player.preload();
    await flush();
    const onFail = vi.fn();
    player.play('あ', onFail);
    expect(audio('あ')).toMatchObject({ playCount: 1, currentTime: 0 });
    audio('あ').started();
    player.play('い', onFail);
    expect(audio('あ').pauseCount).toBeGreaterThan(0);
    expect(audio('い').playCount).toBe(1);
    audio('い').started();
    await flush();
    expect(onFail).not.toHaveBeenCalled();
  });

  it('再生を拒否されたら、1回だけ代わりの読み上げに切り替える', async () => {
    const { player, audio, flush } = setup();
    player.preload();
    await flush();
    audio('あ').result = 'reject';
    const onFail = vi.fn();
    player.play('あ', onFail);
    await flush();
    expect(onFail).toHaveBeenCalledTimes(1);
    // 一時的な失敗なので、次はまた録音を試す
    expect(player.has('あ')).toBe(true);
  });

  it('ファイルが壊れていたら切り替え、その文字は以後ずっと代わりの読み上げにする', async () => {
    const { player, audio, flush } = setup();
    player.preload();
    await flush();
    const onFail = vi.fn();
    player.play('え', onFail);
    audio('え').onerror?.('error');
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(player.has('え')).toBe(false);
  });

  it('再生が始まらないまま時間がたったら切り替え、遅れて始まった音は止める', async () => {
    const { player, audio, timers, flush } = setup();
    player.preload();
    await flush();
    const onFail = vi.fn();
    player.play('お', onFail);
    expect(timers.at(-1)?.ms).toBe(CLIP_START_TIMEOUT_MS);
    timers.at(-1)!.fn();
    expect(onFail).toHaveBeenCalledTimes(1);
    const pauses = audio('お').pauseCount;
    audio('お').started();
    expect(audio('お').pauseCount).toBeGreaterThan(pauses);
  });

  it('止めたあと（新しい入力や「はっせい」のあと）に失敗しても、切り替えない', async () => {
    const { player, audio, flush } = setup();
    player.preload();
    await flush();
    audio('あ').result = 'reject';
    const onFail = vi.fn();
    player.play('あ', onFail);
    player.stop();
    await flush();
    expect(onFail).not.toHaveBeenCalled();
    expect(audio('あ').pauseCount).toBeGreaterThan(0);
  });

  it('Kyoko（標準・拡張）だけを Kyoko と判断する', () => {
    expect(isKyokoVoice('Kyoko')).toBe(true);
    expect(isKyokoVoice('Kyoko（拡張）')).toBe(true);
    expect(isKyokoVoice('Kyoko (Enhanced)')).toBe(true);
    expect(isKyokoVoice('O-ren')).toBe(false);
    expect(isKyokoVoice('Otoya')).toBe(false);
    expect(isKyokoVoice('Kyokoko')).toBe(false);
  });
});
