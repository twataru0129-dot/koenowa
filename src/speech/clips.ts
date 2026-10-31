/**
 * 1文字を押したときに再生する録音（Flash TTS で作った清音・濁音・半濁音の71音）。
 *
 * - Kyoko を選んでいるときの1文字タップだけで使う（判断は Speaker.speakChar）
 * - 録音のない文字（小さい文字・記号など）は、これまでどおり Kyoko で読む
 * - ファイルは public/flash-tts-aiueo/（あいうえお）と public/flash-tts-kana/（残り66音）にあり、
 *   Service Worker が事前に保存するのでオフラインでも使える
 * - 文字とファイルの対応は docs/flash-tts/kana_audio_manifest.csv による
 * - 同時に鳴らすのは1つだけなので、<audio> は1つを使い回す（文字ごとに作ると、ブラウザーによっては数の上限に近づく）
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
  か: 'flash-tts-kana/ka.m4a',
  き: 'flash-tts-kana/ki.m4a',
  く: 'flash-tts-kana/ku.m4a',
  け: 'flash-tts-kana/ke.m4a',
  こ: 'flash-tts-kana/ko.m4a',
  さ: 'flash-tts-kana/sa.m4a',
  し: 'flash-tts-kana/shi.m4a',
  す: 'flash-tts-kana/su.m4a',
  せ: 'flash-tts-kana/se.m4a',
  そ: 'flash-tts-kana/so.m4a',
  た: 'flash-tts-kana/ta.m4a',
  ち: 'flash-tts-kana/chi.m4a',
  つ: 'flash-tts-kana/tsu.m4a',
  て: 'flash-tts-kana/te.m4a',
  と: 'flash-tts-kana/to.m4a',
  な: 'flash-tts-kana/na.m4a',
  に: 'flash-tts-kana/ni.m4a',
  ぬ: 'flash-tts-kana/nu.m4a',
  ね: 'flash-tts-kana/ne.m4a',
  の: 'flash-tts-kana/no.m4a',
  は: 'flash-tts-kana/ha.m4a',
  ひ: 'flash-tts-kana/hi.m4a',
  ふ: 'flash-tts-kana/fu.m4a',
  へ: 'flash-tts-kana/he.m4a',
  ほ: 'flash-tts-kana/ho.m4a',
  ま: 'flash-tts-kana/ma.m4a',
  み: 'flash-tts-kana/mi.m4a',
  む: 'flash-tts-kana/mu.m4a',
  め: 'flash-tts-kana/me.m4a',
  も: 'flash-tts-kana/mo.m4a',
  や: 'flash-tts-kana/ya.m4a',
  ゆ: 'flash-tts-kana/yu.m4a',
  よ: 'flash-tts-kana/yo.m4a',
  ら: 'flash-tts-kana/ra.m4a',
  り: 'flash-tts-kana/ri.m4a',
  る: 'flash-tts-kana/ru.m4a',
  れ: 'flash-tts-kana/re.m4a',
  ろ: 'flash-tts-kana/ro.m4a',
  わ: 'flash-tts-kana/wa.m4a',
  を: 'flash-tts-kana/wo.m4a',
  ん: 'flash-tts-kana/n.m4a',
  が: 'flash-tts-kana/ga.m4a',
  ぎ: 'flash-tts-kana/gi.m4a',
  ぐ: 'flash-tts-kana/gu.m4a',
  げ: 'flash-tts-kana/ge.m4a',
  ご: 'flash-tts-kana/go.m4a',
  ざ: 'flash-tts-kana/za.m4a',
  じ: 'flash-tts-kana/ji.m4a',
  ず: 'flash-tts-kana/zu.m4a',
  ぜ: 'flash-tts-kana/ze.m4a',
  ぞ: 'flash-tts-kana/zo.m4a',
  だ: 'flash-tts-kana/da.m4a',
  ぢ: 'flash-tts-kana/di.m4a',
  づ: 'flash-tts-kana/du.m4a',
  で: 'flash-tts-kana/de.m4a',
  ど: 'flash-tts-kana/do.m4a',
  ば: 'flash-tts-kana/ba.m4a',
  び: 'flash-tts-kana/bi.m4a',
  ぶ: 'flash-tts-kana/bu.m4a',
  べ: 'flash-tts-kana/be.m4a',
  ぼ: 'flash-tts-kana/bo.m4a',
  ぱ: 'flash-tts-kana/pa.m4a',
  ぴ: 'flash-tts-kana/pi.m4a',
  ぷ: 'flash-tts-kana/pu.m4a',
  ぺ: 'flash-tts-kana/pe.m4a',
  ぽ: 'flash-tts-kana/po.m4a',
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
  src: string;
  play(): Promise<void> | void;
  pause(): void;
  currentTime: number;
  onplaying: ((ev: Event) => unknown) | null;
  onerror: ((ev: Event | string) => unknown) | null;
}

export interface AudioClipPlayerDeps {
  /** ファイルを読み込んで再生用の URL を返す */
  load: (path: string) => Promise<string>;
  /** 再生に使う <audio>（1つだけ作って使い回す） */
  createAudio: () => AudioLike;
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
    createAudio: () => {
      const a = new Audio();
      a.preload = 'auto';
      return a;
    },
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id as number),
  };
}

export class AudioClipPlayer implements ClipPlayer {
  /** 文字 → 読み込んだ録音の URL（blob） */
  private urls = new Map<string, string>();
  private broken = new Set<string>();
  private loading = false;
  /** 再生のたびに増やし、古い再生の通知を無視する */
  private seq = 0;
  private audio: AudioLike | null = null;
  private playing = false;
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
        .then((url) => this.urls.set(char, url))
        .catch(() => this.broken.add(char));
    }
  }

  has(char: string): boolean {
    return this.urls.has(char) && !this.broken.has(char);
  }

  play(char: string, onFail: () => void) {
    this.stop();
    const url = this.urls.get(char);
    const token = ++this.seq;
    let settled = false;
    const fail = (markBroken: boolean) => {
      if (markBroken) this.broken.add(char);
      if (settled || token !== this.seq) return;
      settled = true;
      // この再生を無効にして、あとから遅れて始まっても止まるようにする（代わりの読み上げと重ならない）
      this.seq++;
      this.clearTimer();
      this.halt();
      onFail();
    };
    if (!url || this.broken.has(char)) {
      fail(false);
      return;
    }
    if (!this.audio) this.audio = this.deps.createAudio();
    const audio = this.audio;
    audio.onplaying = () => {
      if (token !== this.seq) {
        // 新しい再生や停止のあとで遅れて始まった音は止める
        this.halt();
        return;
      }
      settled = true;
      this.clearTimer();
    };
    audio.onerror = () => fail(true);
    this.timer = this.deps.setTimer(() => fail(false), CLIP_START_TIMEOUT_MS);
    this.playing = true;
    try {
      if (audio.src !== url) audio.src = url;
      try {
        audio.currentTime = 0;
      } catch {
        // 読み込み直後は位置を変えられないことがある（最初から再生されるので問題ない）
      }
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => fail(false));
    } catch {
      fail(true);
    }
  }

  stop() {
    this.seq++;
    this.clearTimer();
    if (this.playing) this.halt();
  }

  private halt() {
    this.playing = false;
    if (!this.audio) return;
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
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
