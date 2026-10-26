/**
 * 文字盤の確定配列。
 * 仕様書の配列をそのままデータとして持つ（画像からの抽出はしない）。
 * 各行は画面上の「左から右」の順。null は空欄（ボタンなし）。
 * この配列は端末の向き・画面サイズによって並べ替えない。
 */

export type KeyDef =
  | { kind: 'char'; value: string; ariaLabel?: string; span?: number }
  | { kind: 'space'; label: string; span?: number }
  | { kind: 'newline'; label: string; span?: number }
  | { kind: 'empty'; span?: number };

export interface BoardPage {
  id: 'seion' | 'dakuon' | 'small';
  number: number;
  title: string;
  shortTitle: string;
  columns: number;
  rows: KeyDef[][];
}

const c = (value: string, ariaLabel?: string): KeyDef => ({ kind: 'char', value, ariaLabel });
const _ = (): KeyDef => ({ kind: 'empty' });

/** 清音 10列×5段（右端があ行、左端がわ行） */
export const SEION_ROWS: (string | null)[][] = [
  ['わ', 'ら', 'や', 'ま', 'は', 'な', 'た', 'さ', 'か', 'あ'],
  ['を', 'り', null, 'み', 'ひ', 'に', 'ち', 'し', 'き', 'い'],
  ['ん', 'る', 'ゆ', 'む', 'ふ', 'ぬ', 'つ', 'す', 'く', 'う'],
  ['、', 'れ', null, 'め', 'へ', 'ね', 'て', 'せ', 'け', 'え'],
  ['。', 'ろ', 'よ', 'も', 'ほ', 'の', 'と', 'そ', 'こ', 'お'],
];

/** 濁音・半濁音 5列×5段（左から ぱ・ば・だ・ざ・が） */
export const DAKUON_ROWS: string[][] = [
  ['ぱ', 'ば', 'だ', 'ざ', 'が'],
  ['ぴ', 'び', 'ぢ', 'じ', 'ぎ'],
  ['ぷ', 'ぶ', 'づ', 'ず', 'ぐ'],
  ['ぺ', 'べ', 'で', 'ぜ', 'げ'],
  ['ぽ', 'ぼ', 'ど', 'ぞ', 'ご'],
];

/** 小文字（左から） */
export const SMALL_CHARS = ['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'っ', 'ゎ'];
/** 記号（左から） */
export const SYMBOL_CHARS = ['ー', '、', '。', '？', '！', '「', '」', '（', '）', '・'];

/** 空白キーで入力する文字（半角スペースで統一） */
export const SPACE_CHAR = ' ';
export const NEWLINE_CHAR = '\n';

const PUNCT_LABELS: Record<string, string> = {
  '、': 'てん（読点）',
  '。': 'まる（句点）',
  'ー': 'のばす（長音）',
  '？': 'はてな',
  '！': 'びっくり',
  '「': 'かぎかっこ はじめ',
  '」': 'かぎかっこ おわり',
  '（': 'かっこ はじめ',
  '）': 'かっこ おわり',
  '・': 'なかてん',
};

const SMALL_LABELS: Record<string, string> = {
  'ぁ': 'ちいさい あ',
  'ぃ': 'ちいさい い',
  'ぅ': 'ちいさい う',
  'ぇ': 'ちいさい え',
  'ぉ': 'ちいさい お',
  'ゃ': 'ちいさい や',
  'ゅ': 'ちいさい ゆ',
  'ょ': 'ちいさい よ',
  'っ': 'ちいさい つ',
  'ゎ': 'ちいさい わ',
};

const charKey = (v: string | null): KeyDef =>
  v === null ? _() : c(v, PUNCT_LABELS[v] ?? SMALL_LABELS[v]);

export const PAGES: BoardPage[] = [
  {
    id: 'seion',
    number: 1,
    title: 'せいおん（きほんの文字）',
    shortTitle: 'せいおん',
    columns: 10,
    rows: SEION_ROWS.map((row) => row.map(charKey)),
  },
  {
    id: 'dakuon',
    number: 2,
    title: 'だくおん・はんだくおん',
    shortTitle: 'だくおん',
    columns: 5,
    rows: DAKUON_ROWS.map((row) => row.map(charKey)),
  },
  {
    id: 'small',
    number: 3,
    title: 'ちいさい文字・きごう',
    shortTitle: 'ちいさい文字',
    columns: 10,
    rows: [
      SMALL_CHARS.map(charKey),
      SYMBOL_CHARS.map(charKey),
      [
        { kind: 'space', label: '空白', span: 3 },
        { kind: 'newline', label: '改行', span: 3 },
        { kind: 'empty', span: 4 },
      ],
    ],
  },
];

export function keyText(key: KeyDef): string | null {
  switch (key.kind) {
    case 'char':
      return key.value;
    case 'space':
      return SPACE_CHAR;
    case 'newline':
      return NEWLINE_CHAR;
    default:
      return null;
  }
}
