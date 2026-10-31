/**
 * 1文字を押したときに再生する録音（Flash TTS で作った「あ・い・う・え・お」）。
 *
 * - Kyoko を選んでいるときの「あ・い・う・え・お」だけで使う（判断は Speaker.speakChar）
 * - ファイルは public/flash-tts-aiueo/ にあり、Service Worker が事前に保存するのでオフラインでも使える
 * - iOS Safari の <audio> は、Service Worker のキャッシュから部分的な読み込み（Range）ができず
 *   再生に失敗することがあるため、fetch で丸ごと読み込んでから blob の URL で再生する
 * - 読み込みが終わっていない・読み込みや再生に失敗したときは、呼び出し側が既存の Kyoko で読む
 */

/** 文字 → ファイル（アプリの公開フォルダからの相対パス） */
export const FLASH_TTS_CLIPS: Record<string, string> = {
  あ: 'flash-tts-aiueo/a.m4a',
  い: 'flash-tts-aiueo/i.m4a',
  う: 'flash-tts-aiueo/u.m4a',
  え: 'flash-tts-aiueo/e.m4a',
  お: 'flash-tts-aiueo/o.m4a',
};

/** 再生が始まらないときに、既存の声へ切り替えるまでの時間 */
export const CLIP_START_TIMEOUT_MS = 1500;

export interface ClipPlayer {
  /** その文字の録音を、いますぐ再生できるか（読み込み済みで、失敗していない） */
  has(char: string): boolean;
  /**
   * 前の再生を止めてから再生する。再生できなかったときは onFail を1回だけ呼ぶ
   * （その後に新しい再生や stop があった場合は呼ばない）
   */
  play(char: string, onFail: () => void): void;
  /** 再生中・再生待ちの録音を止める */
  stop(): void;
  /** 録音を読み込んでおく（何度呼んでもよい） */
  preload(): void;
}

interface AudioLike {
  play(): Promise<void> | void;
  pause(): void;
  currentTime: number;
  onplaying: ((ev: Event) => unknown) | null;
  onerror: ((ev: Event | string) => unknown) | null;
}

export interface AudioClipPlayerDeps {
  /** ファイルを読み込んで再生用の URL を返す */
  load: (path: string) => Promise<string>;
  createAudio: (url: string) => AudioLike;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
}

function defaultDeps(): AudioClipPlayerDeps {
  const base = import.meta.env.BASE_URL ?? './';
  return {
    load: async (path) => {
      const res = await fetch(`${base}${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 公開先によっては .m4a の種類（Content-Type）が正しく付かず、iOS Safari が再生できないため、
      // 受け取った中身に audio/mp4 の種類を付け直してから再生用の URL にする
      return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'audio/mp4' }));
    },
    createAudio: (url) => {
      const a = new Audio(url);
      a.preload = 'auto';
      return a;
    },
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id as number),
  };
}

export class AudioClipPlayer implements ClipPlayer {
  private audios = new Map<string, AudioLike>();
  private broken = new Set<string>();
  private loading = false;
  /** 再生のたびに増やし、古い再生の通知を無視する */
  private seq = 0;
  private current: AudioLike | null = null;
  private timer: unknown = null;
  private deps: AudioClipPlayerDeps;

  constructor(
    private clips: Record<string, string> = FLASH_TTS_CLIPS,
    deps?: Partial<AudioClipPlayerDeps>,
  ) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  preload() {
    if (this.loading) return;
    this.loading = true;
    for (const [char, path] of Object.entries(this.clips)) {
      this.deps
        .load(path)
        .then((url) => this.audios.set(char, this.deps.createAudio(url)))
        .catch(() => this.broken.add(char));
    }
  }

  has(char: string): boolean {
    return this.audios.has(char) && !this.broken.has(char);
  }

  play(char: string, onFail: () => void) {
    this.stop();
    const audio = this.audios.get(char);
    const token = ++this.seq;
    let settled = false;
    const fail = (markBroken: boolean) => {
      if (markBroken) this.broken.add(char);
      if (settled || token !== this.seq) return;
      settled = true;
      // この再生を無効にして、あとから遅れて始まっても止まるようにする（代わりの読み上げと重ならない）
      this.seq++;
      this.clearTimer();
      this.halt(audio);
      this.current = null;
      onFail();
    };
    if (!audio || this.broken.has(char)) {
      fail(false);
      return;
    }
    this.current = audio;
    audio.onplaying = () => {
      if (token !== this.seq) {
        // 新しい再生や停止のあとで遅れて始まった音は止める
        this.halt(audio);
        return;
      }
      settled = true;
      this.clearTimer();
    };
    audio.onerror = () => fail(true);
    this.timer = this.deps.setTimer(() => fail(false), CLIP_START_TIMEOUT_MS);
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => fail(false));
    } catch {
      fail(true);
    }
  }

  stop() {
    this.seq++;
    this.clearTimer();
    if (this.current) this.halt(this.current);
    this.current = null;
  }

  private halt(audio: AudioLike | undefined) {
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // 止められなくても続ける
    }
  }

  private clearTimer() {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
  }
}

/** 「Kyoko」の声か（標準版・拡張版のどちらも。名前で判断する） */
export function isKyokoVoice(name: string): boolean {
  return name
    .toLowerCase()
    .split(/[^a-z-]+/)
    .includes('kyoko');
}
