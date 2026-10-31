import { isKyokoVoice, type ClipPlayer } from './clips';

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
 * 読み上げ方式。
 * - 'plain'：従来の方式（既定）
 * - 'adjusted'：句読点と間を調整する試験的な方式。実機で聞き比べて、よいほうを選んでもらう
 */
export type SpeechStyle = 'plain' | 'adjusted';

/** 文の終わりとみなす記号（閉じかっこで終わる文も、それ以上は補わない） */
const FINAL_MARK = /[。．.！!？?」』）)]$/;

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \u3000]+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/**
 * 句読点と間を調整する（'adjusted' のときだけ使う。いずれも読み上げ用の文字列の中だけの変更）
 * - 語と語のあいだの空白 → 「、」（利用者が空白で区切った位置に短い間を入れる）
 * - 同じ句読点の連続（「。。」「、、」）→ 1つ
 * - 行末の「、」→「。」、句読点のない行末 →「。」（文の終わりとして読ませる）
 * 文字の追加はこの3つだけで、かなを漢字にしたり、読みを変えたりはしない。
 */
function adjustLine(line: string): string {
  let out = line
    .replace(/ *([、。，．,.！!？?」』）)]) */g, '$1') // 記号の前後の空白は取る
    .replace(/ *([「『（(]) */g, '$1')
    .replace(/ +/g, '、')
    .replace(/([、。！？])\1+/g, '$1')
    .replace(/、+([。！？])/g, '$1');
  if (out.endsWith('、')) out = `${out.slice(0, -1)}。`;
  if (!FINAL_MARK.test(out)) out = `${out}。`;
  return out;
}

/**
 * 読み上げ用の文字列を作る。画面に表示している文章は変えない。
 * 改行は文の区切りとして扱い、改行の前に句読点がなければ「。」を補う。
 * 文章全体を1つの文字列にまとめ、1回の発声で読む（文ごとに分けて発声しない）。
 */
export function toSpeechText(text: string, style: SpeechStyle = 'plain'): string {
  const lines = splitLines(text);
  if (style === 'adjusted') return lines.map(adjustLine).join('');
  return lines
    .map((line, i) => (i < lines.length - 1 && !SENTENCE_END.test(line) ? `${line}。` : line))
    .join('');
}

/** 「一音ずつはっきり」の区切り方 */
export type SyllableSeparator = 'comma' | 'space';

/** 前の音とまとめて読む文字（拗音・小さい母音、促音、長音、撥音） */
const ATTACH_TO_PREV = new Set(['ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゎ', 'っ', 'ー', 'ん']);
/** 区切りとして残す記号・空白・改行 */
const DELIMITER = /([ 、。！？!?「」（）・\n]+)/;
const DELIMITER_ONLY = /^[ 、。！？!?「」（）・\n]+$/;
/** 一度に区切って読む音の数の上限（長い文は一音ずつにすると聞き取りにくいため） */
export const SYLLABLE_MAX_UNITS = 24;

/**
 * 「一音ずつはっきり」の読み上げ用文字列を作る（試験的）。
 * ひらがなを音のまとまりに分けて区切る：あ・り・が・と・う／きょ・う／がっ・こ・う／しゃ・しん。
 * 拗音・促音・長音・「ん」は前の音とまとめ、単独では読ませない。
 *
 * 安全に区切れないときは null を返し、呼び出し側は通常の読み上げに戻す。
 * - ひらがな以外（漢字・カタカナ・英数字）を含む
 * - 語の途中に「は」「へ」がある（助詞の「わ」「え」と読むべきかを判断できず、区切ると読みが変わるおそれ）
 * - 小さい文字・長音で始まる
 * - 音の数が多すぎる
 */
export function toSyllableText(text: string, separator: SyllableSeparator): string | null {
  const sep = separator === 'comma' ? '、' : ' ';
  let units = 0;
  const out: string[] = [];
  for (const part of text.split(DELIMITER)) {
    if (part === '') continue;
    if (DELIMITER_ONLY.test(part)) {
      // 空白だけの区切りは指定の区切りに、句読点などはそのまま残す
      const trimmed = part.replace(/ /g, '');
      out.push(trimmed === '' ? sep : trimmed);
      continue;
    }
    if (!/^[\u3041-\u3096ー]+$/.test(part)) return null;
    const chars = Array.from(part);
    if (chars.slice(1).some((c) => c === 'は' || c === 'へ')) return null;
    const morae: string[] = [];
    for (const c of chars) {
      if (ATTACH_TO_PREV.has(c)) {
        if (morae.length === 0) {
          if (c !== 'ん') return null;
          morae.push(c);
        } else morae[morae.length - 1] += c;
      } else morae.push(c);
    }
    units += morae.length;
    out.push(morae.join(sep));
  }
  if (units === 0 || units > SYLLABLE_MAX_UNITS) return null;
  return out.join('');
}

/** 文字ごとの読み上げで、同時に持つ発声の数（話している1つ＋次の1つ） */
export const CHAR_QUEUE_MAX = 2;

/**
 * 文字ごとの読み上げの対象か。清音・濁音・半濁音・小文字（ひらがな1文字）だけ。
 * 記号（、。！？ー など）・空白・改行は読まない。
 */
export function isEchoChar(char: string): boolean {
  return /^[\u3041-\u3096]$/.test(char);
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
  /** 読み上げ方式（省略時は従来の方式） */
  style?: SpeechStyle;
  /** 「一音ずつはっきり」（とてもゆっくりのときだけ）。安全に区切れない文章は通常どおり読む */
  syllable?: SyllableSeparator | null;
}

/** 実際に音声エンジンへ渡す文字列（比較画面の表示にも使う） */
export function buildSpeechText(text: string, style: SpeechStyle = 'plain', syllable?: SyllableSeparator | null): string {
  const spoken = toSpeechText(text, style);
  if (!syllable) return spoken;
  return toSyllableText(spoken, syllable) ?? spoken;
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
  private clips: ClipPlayer | null;
  private synth: SpeechSynthesis | null;
  private Utterance: typeof SpeechSynthesisUtterance | null;
  private current: SpeechSynthesisUtterance | null = null;
  /** 文字ごとの読み上げ（話している1つ＋待っている1つまで） */
  private chars: SpeechSynthesisUtterance[] = [];
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
    /** 「あ・い・う・え・お」の録音（なければ常に音声合成で読む） */
    clips: ClipPlayer | null = null,
  ) {
    this.synth = synth;
    this.Utterance = Utterance;
    this.events = events;
    this.clips = clips;
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
    const spoken = buildSpeechText(text, options.style, options.syllable);
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

  /**
   * 文字盤で押した1文字だけを読む（「文字を押したときに声を出す」）。
   * 文章の読み上げとは別に、ひらがな1文字だけを、加工せずにそのまま渡す。
   * 待ち行列は「話している1つ＋次の1つ」までにし、それより速く押されたときは
   * たまった分を捨てて最新の文字から読み直す（古い文字が延々と続かないように）。
   */
  speakChar(
    char: string,
    options: Omit<SpeakOptions, 'style' | 'syllable'> & {
      /**
       * 女性の声と確認できる声（voiceGender が 'female'）で読むときだけ使う速さ。
       * 端末の標準音声（声を指定しない）・男性・性別不明の声には使わない
       */
      femaleRate?: number;
    },
  ): SpeakResult {
    if (!isEchoChar(char)) return { ok: false, reason: 'empty' };
    if (!this.synth || !this.Utterance) return { ok: false, reason: 'unsupported' };
    let voice: VoiceInfo | null | undefined;
    const voices = this.voices();
    if (options.useSystemVoice) {
      if (!systemVoiceAllowed(voices, options.allowOnlineVoices)) {
        return { ok: false, reason: 'system-voice-may-be-online' };
      }
    } else {
      voice = pickVoice(voices, options.voiceURI, options.allowOnlineVoices);
      if (voice === null) return { ok: false, reason: 'no-local-voice' };
    }
    // 文章を読んでいる途中なら止める（新しく入力を始めたため）
    if (this.current) this.stop();
    const rate = voice?.gender === 'female' && options.femaleRate !== undefined ? options.femaleRate : options.rate;
    const chosen = voice ?? undefined;

    // Kyoko を選んでいるときの「あ・い・う・え・お」だけ、録音（Flash TTS）を再生する。
    // 録音を読み込めていない・再生できなかったときは、これまでどおり Kyoko で読む
    const clips = this.clips;
    if (chosen && clips && isKyokoVoice(chosen.name) && clips.has(char)) {
      if (this.chars.length > 0) {
        this.chars = [];
        this.synth.cancel();
      }
      clips.play(char, () => this.synthChar(char, chosen, rate));
      return { ok: true };
    }
    this.clips?.stop();
    return this.synthChar(char, chosen, rate);
  }

  /** 1文字を音声合成で読む（文字ごとの待ち行列は「話している1つ＋次の1つ」まで） */
  private synthChar(char: string, voice: VoiceInfo | undefined, rate: number): SpeakResult {
    if (!this.synth || !this.Utterance) return { ok: false, reason: 'unsupported' };
    if (this.chars.length >= CHAR_QUEUE_MAX) {
      this.chars = [];
      this.synth.cancel();
    }
    const u = new this.Utterance(char);
    try {
      u.lang = voice?.lang ?? 'ja-JP';
      if (voice) u.voice = voice.voice;
      u.rate = rate;
      u.pitch = 1;
      u.volume = 1;
    } catch {
      return { ok: false, reason: 'unsupported' };
    }
    const done = () => {
      this.chars = this.chars.filter((c) => c !== u);
    };
    u.onend = done;
    u.onerror = done;
    try {
      if (this.synth.paused) this.synth.resume();
      this.synth.speak(u);
    } catch {
      // 文字の読み上げに失敗しても、文字の入力は続けられるようにする
      done();
      return { ok: false, reason: 'unsupported' };
    }
    this.chars.push(u);
    return { ok: true };
  }

  /** 「あ・い・う・え・お」の録音を読み込んでおく（オフラインでも Service Worker の保存から読む） */
  preloadClips() {
    this.clips?.preload();
  }

  /** 文字ごとの読み上げだけを止める（文章の読み上げ中なら何もしない） */
  stopChars() {
    this.clips?.stop();
    if (!this.synth || this.chars.length === 0 || this.current) return;
    this.chars = [];
    this.synth.cancel();
  }

  stop() {
    this.clips?.stop();
    if (!this.synth) return;
    const had = this.current !== null;
    this.current = null;
    this.chars = [];
    if (this.synth.speaking || this.synth.pending || had) this.synth.cancel();
    if (had) this.events.onStateChange?.(false);
  }
}
