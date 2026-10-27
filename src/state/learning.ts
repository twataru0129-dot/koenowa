/**
 * よくつかう言葉の自動登録（学習記録）。
 *
 * 「文字盤で入力して、メイン画面の『はっせい』を押した」回数を文章ごとに数え、
 * AUTO_REGISTER_COUNT 回に達したら「よくつかう」に追加する。
 * 発声ボタンを押した回数ではなく、入力し直した回数を数える（判定は App 側で行う）。
 *
 * 保存するのは、判定に必要な「文章」と「回数」と並び順の番号だけ。日時は保存しない。
 * 会話の履歴一覧は作らない。端末内（localStorage）にだけ保存する。
 */
import { hasSpeakableText } from '../speech/speech';

export const LEARNING_KEY = 'koenowa.v1.learning';
/** この回数に達したら自動登録する */
export const AUTO_REGISTER_COUNT = 10;
/** 自動登録の対象にする文章の最大文字数 */
export const LEARN_MAX_LENGTH = 40;
/** 回数を記録しておく文章の最大件数（超えたら、いちばん長く使っていないものから消す） */
export const LEARN_MAX_ENTRIES = 200;
/** 再登録しない言葉（自動登録後に利用者が消した言葉）の最大件数 */
export const DISMISSED_MAX = 200;

export interface LearningData {
  version: 1;
  /** 文章 → 回数と、最後に数えた順番（日時ではなく通し番号） */
  counts: Record<string, { count: number; seq: number }>;
  /** 次の通し番号 */
  nextSeq: number;
  /** 「よくつかう」から消された言葉。学習記録を消去するか、手動で登録し直すまで自動登録しない */
  dismissed: string[];
}

export function emptyLearning(): LearningData {
  return { version: 1, counts: {}, nextSeq: 1, dismissed: [] };
}

/** 比べるための形にそろえる：改行コードを \n に、前後の空白を除く（文中の空白は残す） */
export function normalizeLearnText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

/** 自動登録の対象になる文章か（空白・記号だけ、長すぎる文章は対象外） */
export function isLearnable(normalized: string): boolean {
  return (
    normalized.length > 0 &&
    hasSpeakableText(normalized) &&
    Array.from(normalized).length <= LEARN_MAX_LENGTH
  );
}

export function loadLearning(): LearningData {
  try {
    const raw = window.localStorage.getItem(LEARNING_KEY);
    if (!raw) return emptyLearning();
    const v = JSON.parse(raw) as Partial<LearningData>;
    const data = emptyLearning();
    if (v && typeof v === 'object') {
      if (v.counts && typeof v.counts === 'object') {
        for (const [text, e] of Object.entries(v.counts)) {
          if (e && typeof e.count === 'number' && typeof e.seq === 'number' && e.count > 0) {
            data.counts[text] = { count: Math.floor(e.count), seq: e.seq };
          }
        }
      }
      if (typeof v.nextSeq === 'number' && v.nextSeq > 0) data.nextSeq = v.nextSeq;
      if (Array.isArray(v.dismissed)) data.dismissed = v.dismissed.filter((t) => typeof t === 'string');
    }
    return data;
  } catch {
    return emptyLearning();
  }
}

export function saveLearning(data: LearningData): boolean {
  try {
    window.localStorage.setItem(LEARNING_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearLearning(): boolean {
  try {
    window.localStorage.removeItem(LEARNING_KEY);
    return true;
  } catch {
    return false;
  }
}

export interface CountResult {
  data: LearningData;
  /** 自動登録すべき文章（なければ null） */
  register: string | null;
}

/**
 * 1回分を数える。
 * @param alreadyFavorite すでに「よくつかう」にある文章か（あれば登録しない）
 */
export function countSpoken(data: LearningData, text: string, alreadyFavorite: boolean): CountResult {
  const key = normalizeLearnText(text);
  if (!isLearnable(key) || alreadyFavorite || data.dismissed.includes(key)) {
    return { data, register: null };
  }
  const counts = { ...data.counts };
  const count = (counts[key]?.count ?? 0) + 1;
  if (count >= AUTO_REGISTER_COUNT) {
    // 登録したら回数は消す（登録後に消された場合は dismissed で再登録を防ぐ）
    delete counts[key];
    return { data: { ...data, counts }, register: key };
  }
  counts[key] = { count, seq: data.nextSeq };
  // 件数の上限を超えたら、いちばん長く数えていない文章から消す
  const keys = Object.keys(counts);
  if (keys.length > LEARN_MAX_ENTRIES) {
    keys
      .sort((a, b) => counts[a].seq - counts[b].seq)
      .slice(0, keys.length - LEARN_MAX_ENTRIES)
      .forEach((k) => delete counts[k]);
  }
  return { data: { ...data, counts, nextSeq: data.nextSeq + 1 }, register: null };
}

/** 「よくつかう」から消された言葉を、再登録しない言葉として記録する（回数も消す） */
export function dismiss(data: LearningData, text: string): LearningData {
  const key = normalizeLearnText(text);
  if (!key) return data;
  const counts = { ...data.counts };
  delete counts[key];
  const dismissed = [...data.dismissed.filter((t) => t !== key), key].slice(-DISMISSED_MAX);
  return { ...data, counts, dismissed };
}

/** 手動で登録し直したら、再登録しない言葉から外す */
export function undismiss(data: LearningData, text: string): LearningData {
  const key = normalizeLearnText(text);
  if (!data.dismissed.includes(key)) return data;
  return { ...data, dismissed: data.dismissed.filter((t) => t !== key) };
}
