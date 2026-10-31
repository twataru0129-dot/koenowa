import manifestCsv from '../../docs/flash-tts/kana_audio_manifest.csv?raw';
import { PAGES } from '../data/boards';
import { AudioClipPlayer, CLIP_START_TIMEOUT_MS, FLASH_TTS_CLIPS, isKyokoVoice } from './clips';

class FakeAudio {
  src = '';
  sources: string[] = [];
  playCount = 0;
  pauseCount = 0;
  currentTime = 5;
  onplaying: ((ev: Event) => unknown) | null = null;
  onerror: ((ev: Event | string) => unknown) | null = null;
  /** 次の play() の結果 */
  next: 'ok' | 'reject' | 'throw' = 'ok';
  play() {
    this.playCount++;
    this.sources.push(this.src);
    const r = this.next;
    this.next = 'ok';
    if (r === 'throw') throw new Error('boom');
    return r === 'reject' ? Promise.reject(new Error('NotAllowed')) : Promise.resolve();
  }
  pause() {
    this.pauseCount++;
  }
  started() {
    this.onplaying?.(new Event('playing'));
  }
}

function setup(failLoad: string[] = []) {
  const created: FakeAudio[] = [];
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const player = new AudioClipPlayer(FLASH_TTS_CLIPS, {
    load: (path) => (failLoad.includes(path) ? Promise.reject(new Error('404')) : Promise.resolve(`blob:${path}`)),
    createAudio: () => {
      const a = new FakeAudio();
      created.push(a);
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
  const audio = () => created[0];
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { player, audio, created, timers, flush };
}

describe('1文字タップ用の録音（71音）の対応表', () => {
  const manifest = manifestCsv
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(','))
    .map(([char, file]) => [char, file] as const);

  it('「あ・い・う・え・お」の5音は以前と同じファイルのまま', () => {
    expect(FLASH_TTS_CLIPS).toMatchObject({
      あ: 'flash-tts-aiueo/a.m4a',
      い: 'flash-tts-aiueo/i.m4a',
      う: 'flash-tts-aiueo/u.m4a',
      え: 'flash-tts-aiueo/e.m4a',
      お: 'flash-tts-aiueo/o.m4a',
    });
  });

  it('追加の66音は、添付の対応表（kana_audio_manifest.csv）と1文字ずつ一致する', () => {
    expect(manifest).toHaveLength(66);
    for (const [char, file] of manifest) {
      expect([char, FLASH_TTS_CLIPS[char]]).toEqual([char, file.replace('audio/', 'flash-tts-kana/')]);
    }
    expect(Object.keys(FLASH_TTS_CLIPS)).toHaveLength(71);
  });

  it('ぢ・づ・を・ど は、それぞれ専用のファイルに対応している（じ・ず・お・と と取り違えない）', () => {
    expect(FLASH_TTS_CLIPS['ぢ']).toBe('flash-tts-kana/di.m4a');
    expect(FLASH_TTS_CLIPS['づ']).toBe('flash-tts-kana/du.m4a');
    expect(FLASH_TTS_CLIPS['を']).toBe('flash-tts-kana/wo.m4a');
    expect(FLASH_TTS_CLIPS['ど']).toBe('flash-tts-kana/do.m4a');
    expect(new Set(Object.values(FLASH_TTS_CLIPS)).size).toBe(71);
  });

  it('文字盤の清音・濁音・半濁音のかなをちょうどすべて含み、小さい文字や記号は含まない', () => {
    const boardKana = PAGES.slice(0, 2)
      .flatMap((p) => p.rows.flat())
      .flatMap((k) => (k.kind === 'char' && /^[ぁ-ゖ]$/.test(k.value) ? [k.value] : []));
    expect(new Set(Object.keys(FLASH_TTS_CLIPS))).toEqual(new Set(boardKana));
    for (const c of ['ぁ', 'ゃ', 'っ', 'ゎ', 'ー', '、', '。']) expect(FLASH_TTS_CLIPS[c]).toBeUndefined();
  });

  it('対応表のファイルが public にすべてある', () => {
    const files = Object.keys(import.meta.glob('../../public/flash-tts-*/*.m4a')).map((f) =>
      f.replace('../../public/', ''),
    );
    expect(new Set(files)).toEqual(new Set(Object.values(FLASH_TTS_CLIPS)));
  });
});

describe('録音の再生', () => {
  it('読み込みが終わるまでは使わない。読み込めた文字だけ使える', async () => {
    const { player, flush } = setup(['flash-tts-kana/su.m4a']);
    expect(player.has('あ')).toBe(false);
    player.preload();
    player.preload(); // 何度呼んでも1回だけ読み込む
    await flush();
    expect(Object.keys(FLASH_TTS_CLIPS).filter((c) => !player.has(c))).toEqual(['す']);
    expect(player.has('ぁ')).toBe(false);
  });

  it('<audio> は1つだけを使い回し、続けて押すと前の音を止めてから次の音にする（重ならない）', async () => {
    const { player, audio, created, flush } = setup();
    player.preload();
    await flush();
    const onFail = vi.fn();
    player.play('あ', onFail);
    expect(audio()).toMatchObject({ src: 'blob:flash-tts-aiueo/a.m4a', playCount: 1, currentTime: 0 });
    audio().started();
    player.play('か', onFail);
    expect(audio().pauseCount).toBeGreaterThan(0);
    expect(audio().src).toBe('blob:flash-tts-kana/ka.m4a');
    audio().started();
    player.play('ど', onFail);
    expect(audio().sources).toEqual([
      'blob:flash-tts-aiueo/a.m4a',
      'blob:flash-tts-kana/ka.m4a',
      'blob:flash-tts-kana/do.m4a',
    ]);
    expect(created).toHaveLength(1);
    await flush();
    expect(onFail).not.toHaveBeenCalled();
  });

  it('再生を拒否されたら、1回だけ代わりの読み上げに切り替える（次はまた録音を試す）', async () => {
    const { player, audio, flush } = setup();
    player.preload();
    await flush();
    player.play('い', () => undefined);
    audio().next = 'reject';
    const onFail = vi.fn();
    player.play('き', onFail);
    await flush();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(player.has('き')).toBe(true);
  });

  it('ファイルが壊れていたら切り替え、その文字だけ以後ずっと代わりの読み上げにする', async () => {
    const { player, audio, flush } = setup();
    player.preload();
    await flush();
    const onFail = vi.fn();
    player.play('ぢ', onFail);
    audio().onerror?.('error');
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(player.has('ぢ')).toBe(false);
    expect(player.has('じ')).toBe(true);
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
    const pauses = audio().pauseCount;
    audio().started();
    expect(audio().pauseCount).toBeGreaterThan(pauses);
  });

  it('止めたあと（新しい入力や「はっせい」のあと）に失敗が届いても、切り替えない', async () => {
    const { player, audio, flush } = setup();
    player.preload();
    await flush();
    player.play('あ', () => undefined);
    audio().next = 'reject';
    const onFail = vi.fn();
    player.play('ん', onFail);
    player.stop();
    await flush();
    expect(onFail).not.toHaveBeenCalled();
    expect(audio().pauseCount).toBeGreaterThan(0);
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
