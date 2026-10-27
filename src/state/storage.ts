/**
 * 端末内保存（localStorage）。
 * 保存するのは「いま入力中の文章とカーソル」「よく使う言葉」「設定」だけ。
 * 過去に話した文章の履歴は作らない。サーバーへは何も送らない。
 */

import type { SpeechStyle } from '../speech/speech';

export const STORAGE_KEYS = {
  draft: 'koenowa.v1.draft',
  favorites: 'koenowa.v1.favorites',
  settings: 'koenowa.v1.settings',
} as const;

export type RateId = 'slow' | 'normal' | 'fast';

/** こまかく調整できる速さの範囲 */
export const RATE_MIN = 0.6;
export const RATE_MAX = 1.2;

export const RATE_OPTIONS: { id: RateId; label: string; rate: number }[] = [
  // 0.75 では「ふつう」との差が感じにくかったため、iPhone での確認用に 0.6 へ下げた
  { id: 'slow', label: 'ゆっくり', rate: 0.6 },
  { id: 'normal', label: 'ふつう', rate: 0.95 },
  { id: 'fast', label: 'はやめ', rate: 1.15 },
];

/**
 * 声の選び方。
 * - 'specific'：Web Speech API から取得できた声を指定する（voiceURI。null なら端末内の声から自動で選ぶ）
 * - 'system'：声を指定せず lang = ja-JP だけで話す（端末の標準音声）
 */
export type VoiceMode = 'specific' | 'system';

export interface Settings {
  voiceMode: VoiceMode;
  /** 選んだ声の voiceURI（未選択なら自動）。'system' に切り替えても残し、戻したときに使う */
  voiceURI: string | null;
  rate: RateId;
  /**
   * こまかく調整した速さ（0.6〜1.2）。null のときは rate（ゆっくり／ふつう／はやめ）を使う。
   * 自然に聞こえる速さは声によって違うため、実機で聞きながら決めてもらう。
   */
  rateValue: number | null;
  /** 読み上げ方式。'plain' は従来の方式（既定）、'adjusted' は句読点と間を調整する試験的な方式 */
  speechStyle: SpeechStyle;
  /** 端末内ではない（オンラインの）声の使用を許可するか。初期値は許可しない。 */
  allowOnlineVoices: boolean;
  /** 同じキーの連続入力を無視する時間（ミリ秒）。0 で無効。 */
  repeatGuardMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  voiceMode: 'specific',
  voiceURI: null,
  rate: 'normal',
  rateValue: null,
  speechStyle: 'plain',
  allowOnlineVoices: false,
  repeatGuardMs: 0,
};

export interface Draft {
  text: string;
  cursor: number;
  page: number;
}

export interface Favorite {
  id: string;
  /** 一覧に表示する文章 */
  text: string;
  /**
   * 読み上げ用テキスト（任意）。利用者・支援者が明示的に設定したときだけ使う。
   * 例：表示「きょうはいいてんきです」→ 読み上げ「今日はいい天気です。」
   * 未設定なら text をそのまま読む。
   */
  speechText?: string;
}

export const DEFAULT_FAVORITES: string[] = [
  'はい',
  'いいえ',
  'ありがとうございます',
  'もういちどおねがいします',
  'すこしまってください',
  'てつだってください',
  'ちがいます',
  'わかりません',
];

let lastError: unknown = null;

export function storageError(): unknown {
  return lastError;
}

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch (e) {
    lastError = e;
    return undefined;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    lastError = e;
    return false;
  }
}

export function isStorageAvailable(): boolean {
  try {
    const k = 'koenowa.v1.probe';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(): Draft {
  const v = read(STORAGE_KEYS.draft) as Partial<Draft> | undefined;
  const text = typeof v?.text === 'string' ? v.text : '';
  const cursor = typeof v?.cursor === 'number' ? v.cursor : text.length;
  const page = typeof v?.page === 'number' && v.page >= 0 && v.page <= 2 ? Math.floor(v.page) : 0;
  return { text, cursor, page };
}

export function saveDraft(draft: Draft): boolean {
  return write(STORAGE_KEYS.draft, draft);
}

export function loadSettings(): Settings {
  const v = read(STORAGE_KEYS.settings) as Partial<Settings> | undefined;
  const s = { ...DEFAULT_SETTINGS };
  if (v && typeof v === 'object') {
    // voiceMode がない以前の設定は、これまでどおり声を指定するモードとして読む
    if (v.voiceMode === 'system' || v.voiceMode === 'specific') s.voiceMode = v.voiceMode;
    if (typeof v.voiceURI === 'string' || v.voiceURI === null) s.voiceURI = v.voiceURI ?? null;
    if (RATE_OPTIONS.some((r) => r.id === v.rate)) s.rate = v.rate as RateId;
    if (typeof v.rateValue === 'number' && v.rateValue >= RATE_MIN && v.rateValue <= RATE_MAX) {
      s.rateValue = Math.round(v.rateValue * 100) / 100;
    }
    if (v.speechStyle === 'plain' || v.speechStyle === 'adjusted') s.speechStyle = v.speechStyle;
    if (typeof v.allowOnlineVoices === 'boolean') s.allowOnlineVoices = v.allowOnlineVoices;
    if (typeof v.repeatGuardMs === 'number' && v.repeatGuardMs >= 0 && v.repeatGuardMs <= 2000) {
      s.repeatGuardMs = v.repeatGuardMs;
    }
  }
  return s;
}

export function saveSettings(settings: Settings): boolean {
  return write(STORAGE_KEYS.settings, settings);
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function loadFavorites(): Favorite[] {
  const v = read(STORAGE_KEYS.favorites);
  if (Array.isArray(v)) {
    return v
      .filter((f): f is Favorite => !!f && typeof f.id === 'string' && typeof f.text === 'string')
      .map((f) =>
        typeof f.speechText === 'string' && f.speechText.trim()
          ? { id: f.id, text: f.text, speechText: f.speechText }
          : { id: f.id, text: f.text },
      );
  }
  // 初回だけ初期例を入れる（一度でも保存されていれば、空でもそのまま使う）
  return DEFAULT_FAVORITES.map((text) => ({ id: newId(), text }));
}

export function saveFavorites(list: Favorite[]): boolean {
  return write(STORAGE_KEYS.favorites, list);
}
