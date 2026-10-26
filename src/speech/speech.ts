/**
 * Web Speech API（SpeechSynthesis）による日本語の読み上げ。
 *
 * - 文章全体を1回の発声として渡す（1文字ずつは読まない）
 * - 新しく発声するときは前の読み上げを止めてから話す（重なり防止）
 * - 端末内の声（localService）を優先し、オンラインの声は設定で許可されたときだけ使う
 * - 表示している文章は書き換えない。改行は読み上げ用の文字列の中だけで区切りに置き換える
 */

export interface VoiceInfo {
  voice: SpeechSynthesisVoice;
  uri: string;
  name: string;
  lang: string;
  local: boolean;
}

export type SpeakResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'unsupported' | 'no-local-voice' };

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

export function isJapaneseVoice(v: Pick<SpeechSynthesisVoice, 'lang'>): boolean {
  return /^ja([-_]|$)/i.test(v.lang);
}

/** 自然に聞こえやすい声を上に並べる（端末内 → 高品質版 → その他） */
function voiceScore(v: VoiceInfo): number {
  let s = 0;
  if (v.local) s += 100;
  if (/premium|enhanced|拡張|高品質|プレミアム|natural/i.test(v.name)) s += 20;
  if (/ja-JP/i.test(v.lang)) s += 5;
  return s;
}

export function listJapaneseVoices(all: SpeechSynthesisVoice[]): VoiceInfo[] {
  return all
    .filter(isJapaneseVoice)
    .map((voice) => ({
      voice,
      uri: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
      local: voice.localService,
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

export interface SpeakOptions {
  rate: number;
  voiceURI: string | null;
  allowOnlineVoices: boolean;
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

  speak(text: string, options: SpeakOptions): SpeakResult {
    const spoken = toSpeechText(text);
    if (!spoken.trim()) return { ok: false, reason: 'empty' };
    if (!this.synth || !this.Utterance) return { ok: false, reason: 'unsupported' };

    const voice = pickVoice(this.voices(), options.voiceURI, options.allowOnlineVoices);
    if (voice === null) return { ok: false, reason: 'no-local-voice' };

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
