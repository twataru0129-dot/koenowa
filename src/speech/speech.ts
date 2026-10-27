/**
 * Web Speech API（SpeechSynthesis）による日本語の読み上げ。
 *
 * - 文章全体を1回の発声として渡す（1文字ずつは読まない）
 * - 新しく発声するときは前の読み上げを止めてから話す（重なり防止）
 * - 端末内の声（localService）を優先し、オンラインの声は設定で許可されたときだけ使う
 * - 表示している文章は書き換えない。改行は読み上げ用の文字列の中だけで区切りに置き換える
 */

/** 声の性別。Web Speech API には性別の情報がないため、名前が既知の声だけ分類し、それ以外は unknown */
export type VoiceGender = 'male' | 'female' | 'unknown';
/** 声の品質。名前や voiceURI に含まれる表記から判断する */
export type VoiceQuality = 'premium' | 'enhanced' | 'standard' | 'retro';

export interface VoiceInfo {
  voice: SpeechSynthesisVoice;
  uri: string;
  name: string;
  lang: string;
  local: boolean;
  gender: VoiceGender;
  quality: VoiceQuality;
}

export type SpeakResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'unsupported' | 'no-local-voice' | 'system-voice-may-be-online' };

const SENTENCE_END = /[。．.！!？?、，,]$/;

/**
 * 読み上げ用の文字列を作る。
 * 改行は文の区切りとして扱い、改行の前に句読点がなければ「。」を補う（読み上げ用のみ）。
 */
export function toSpeechText(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \u3000]+/g, ' ').trim())
    .filter((line) => line.length > 0);
  return lines
    .map((line, i) => (i < lines.length - 1 && !SENTENCE_END.test(line) ? `${line}。` : line))
    .join('');
}

/** 文字（かな・漢字・英字）または数字を1つ以上含むか */
export function hasSpeakableText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

export function isJapaneseVoice(v: Pick<SpeechSynthesisVoice, 'lang'>): boolean {
  return /^ja([-_]|$)/i.test(v.lang);
}

/**
 * 性別が公表されている日本語の声の名前。
 * Apple（iOS / macOS）：Kyoko・O-ren は女性、Otoya・Hattori は男性。
 * Apple の Eloquence 系の声、Windows / Edge の Microsoft の声も名前で判断する。
 * ここにない名前（例：Google 日本語、Android の声）は性別を推測しない。
 */
const KNOWN_GENDERS: Record<string, Exclude<VoiceGender, 'unknown'>> = {
  kyoko: 'female',
  'o-ren': 'female',
  otoya: 'male',
  hattori: 'male',
  // Apple Eloquence
  flo: 'female',
  grandma: 'female',
  sandy: 'female',
  shelley: 'female',
  eddy: 'male',
  grandpa: 'male',
  reed: 'male',
  rocko: 'male',
  // Microsoft（Windows / Edge）
  ayumi: 'female',
  haruka: 'female',
  sayaka: 'female',
  nanami: 'female',
  aoi: 'female',
  mayu: 'female',
  shiori: 'female',
  ichiro: 'male',
  keita: 'male',
  daichi: 'male',
  naoki: 'male',
};

export function voiceGender(name: string): VoiceGender {
  const words = name.toLowerCase().split(/[^a-z-]+/).filter(Boolean);
  for (const w of words) {
    const g = KNOWN_GENDERS[w];
    if (g) return g;
  }
  return 'unknown';
}

export function voiceQuality(v: Pick<SpeechSynthesisVoice, 'name' | 'voiceURI'>): VoiceQuality {
  const text = `${v.name} ${v.voiceURI}`;
  if (/premium|プレミアム/i.test(text)) return 'premium';
  if (/enhanced|拡張|高品質|natural/i.test(text)) return 'enhanced';
  if (/eloquence/i.test(v.voiceURI)) return 'retro';
  return 'standard';
}

const QUALITY_SCORE: Record<VoiceQuality, number> = { premium: 30, enhanced: 20, standard: 10, retro: 0 };

/** 自然に聞こえやすい声を上に並べる（端末内 → プレミアム → 拡張 → 標準 → 旧式の合成音） */
function voiceScore(v: VoiceInfo): number {
  let s = 0;
  if (v.local) s += 100;
  s += QUALITY_SCORE[v.quality];
  if (/ja-JP/i.test(v.lang)) s += 5;
  return s;
}

export function listJapaneseVoices(all: SpeechSynthesisVoice[]): VoiceInfo[] {
  const seen = new Set<string>();
  return all
    .filter(isJapaneseVoice)
    .filter((voice) => {
      // 同じ声がまったく同じ内容で重複して返る環境があるため、1つにまとめる
      // （voiceURI だけで比べると、別の声を取りこぼすおそれがあるので名前と言語も比べる）
      const key = `${voice.voiceURI}\u0000${voice.name}\u0000${voice.lang}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((voice) => ({
      voice,
      uri: voice.voiceURI || voice.name,
      name: voice.name,
      lang: voice.lang,
      local: voice.localService,
      gender: voiceGender(voice.name),
      quality: voiceQuality(voice),
    }))
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name, 'ja'));
}

/** 使う声を決める。null は「使える声がない」。undefined は「声の一覧が取れないので言語指定のみで話す」 */
export function pickVoice(
  voices: VoiceInfo[],
  preferredUri: string | null,
  allowOnline: boolean,
): VoiceInfo | null | undefined {
  if (voices.length === 0) return undefined;
  const usable = voices.filter((v) => v.local || allowOnline);
  if (usable.length === 0) return null;
  return usable.find((v) => v.uri === preferredUri) ?? usable[0];
}

/**
 * 「端末の標準音声（自動）」が使えるか。
 * 声を指定しないとブラウザーが声を選ぶため、日本語のオンラインの声が一覧にある環境
 * （例：PC 版 Chrome の「Google 日本語」）では、オンラインの声が選ばれて文章が外部へ送られるおそれがある。
 * そのような環境では、オンラインの声を許可していない限り使わない。
 */
export function systemVoiceAllowed(voices: VoiceInfo[], allowOnline: boolean): boolean {
  return allowOnline || voices.every((v) => v.local);
}

export interface SpeakOptions {
  rate: number;
  voiceURI: string | null;
  allowOnlineVoices: boolean;
  /** true のときは声を指定せず、lang = ja-JP だけで話す（端末の標準音声） */
  useSystemVoice?: boolean;
}

/** 音声診断（入力した文章や個人情報は含めない） */
export interface VoiceDiagnostics {
  supported: boolean;
  total: number;
  japanese: number;
  voices: { name: string; lang: string; voiceURI: string; localService: boolean; default: boolean }[];
}

export interface SpeakerEvents {
  onStateChange?: (speaking: boolean) => void;
}

export class Speaker {
  private synth: SpeechSynthesis | null;
  private Utterance: typeof SpeechSynthesisUtterance | null;
  private current: SpeechSynthesisUtterance | null = null;
  private events: SpeakerEvents;

  constructor(
    synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null,
    Utterance: typeof SpeechSynthesisUtterance | null = typeof window !== 'undefined' &&
    'SpeechSynthesisUtterance' in window
      ? window.SpeechSynthesisUtterance
      : null,
    events: SpeakerEvents = {},
  ) {
    this.synth = synth;
    this.Utterance = Utterance;
    this.events = events;
  }

  get supported(): boolean {
    return !!this.synth && !!this.Utterance;
  }

  setEvents(events: SpeakerEvents) {
    this.events = events;
  }

  voices(): VoiceInfo[] {
    if (!this.synth) return [];
    try {
      return listJapaneseVoices(this.synth.getVoices());
    } catch {
      return [];
    }
  }

  /** getVoices() が返した声をそのまま一覧にする（日本語の声を先に並べる。並べ替え以外の加工はしない） */
  diagnostics(): VoiceDiagnostics {
    let all: SpeechSynthesisVoice[];
    try {
      all = this.synth ? this.synth.getVoices() : [];
    } catch {
      all = [];
    }
    const voices = all.map((v) => ({
      name: v.name,
      lang: v.lang,
      voiceURI: v.voiceURI,
      localService: v.localService,
      default: v.default,
    }));
    const ja = voices.filter(isJapaneseVoice);
    const others = voices.filter((v) => !isJapaneseVoice(v));
    return { supported: this.supported, total: voices.length, japanese: ja.length, voices: [...ja, ...others] };
  }

  speak(text: string, options: SpeakOptions): SpeakResult {
    const spoken = toSpeechText(text);
    // 記号だけ（例：「。」「、、」）の文章は読み上げても無音か記号名になるので話さない
    if (!hasSpeakableText(spoken)) return { ok: false, reason: 'empty' };
    if (!this.synth || !this.Utterance) return { ok: false, reason: 'unsupported' };

    const voices = this.voices();
    let voice: VoiceInfo | null | undefined;
    if (options.useSystemVoice) {
      // 端末の標準音声：声は指定せず、言語だけを指定する。どの声になるかはブラウザー（OS）が決める
      if (!systemVoiceAllowed(voices, options.allowOnlineVoices)) {
        return { ok: false, reason: 'system-voice-may-be-online' };
      }
      voice = undefined;
    } else {
      voice = pickVoice(voices, options.voiceURI, options.allowOnlineVoices);
      if (voice === null) return { ok: false, reason: 'no-local-voice' };
    }

    // 前の読み上げが残っていれば止めてから話す（重複再生を防ぐ）
    this.stop();

    const u = new this.Utterance(spoken);
    u.lang = voice?.lang ?? 'ja-JP';
    if (voice) u.voice = voice.voice;
    u.rate = options.rate;
    u.pitch = 1;
    u.volume = 1;
    u.onstart = () => {
      if (this.current === u) this.events.onStateChange?.(true);
    };
    const finish = () => {
      if (this.current === u) {
        this.current = null;
        this.events.onStateChange?.(false);
      }
    };
    u.onend = finish;
    u.onerror = finish;
    this.current = u;
    // iOS Safari では一時停止状態のまま残ることがあるため念のため再開してから話す
    if (this.synth.paused) this.synth.resume();
    this.synth.speak(u);
    this.events.onStateChange?.(true);
    return { ok: true };
  }

  stop() {
    if (!this.synth) return;
    const had = this.current !== null;
    this.current = null;
    if (this.synth.speaking || this.synth.pending || had) this.synth.cancel();
    if (had) this.events.onStateChange?.(false);
  }
}
