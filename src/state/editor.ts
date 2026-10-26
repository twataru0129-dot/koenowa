/**
 * 文章編集の状態（文章・カーソル位置・元に戻す／やり直す）。
 * カーソル位置は文字列の UTF-16 オフセットで持つが、
 * 移動と削除は必ず「見た目の1文字」（書記素）の境界で行う。
 */

export interface EditorSnapshot {
  text: string;
  cursor: number;
}

export interface EditorState extends EditorSnapshot {
  undo: EditorSnapshot[];
  redo: EditorSnapshot[];
}

export type EditorAction =
  | { type: 'insert'; text: string }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'setCursor'; cursor: number }
  | { type: 'moveCursor'; delta: -1 | 1 }
  | { type: 'undo' }
  | { type: 'redo' };

const UNDO_LIMIT = 200;

type Segmenter = { segment(input: string): Iterable<{ segment: string; index: number }> };

let segmenter: Segmenter | null | undefined;
function getSegmenter(): Segmenter | null {
  if (segmenter === undefined) {
    const Ctor = (Intl as unknown as { Segmenter?: new (l: string, o: object) => Segmenter }).Segmenter;
    segmenter = Ctor ? new Ctor('ja', { granularity: 'grapheme' }) : null;
  }
  return segmenter;
}

export interface Grapheme {
  text: string;
  start: number;
  end: number;
}

/** 文字列を見た目の1文字ずつに分ける */
export function graphemes(text: string): Grapheme[] {
  const seg = getSegmenter();
  const out: Grapheme[] = [];
  if (seg) {
    for (const s of seg.segment(text)) {
      out.push({ text: s.segment, start: s.index, end: s.index + s.segment.length });
    }
  } else {
    let i = 0;
    for (const ch of Array.from(text)) {
      out.push({ text: ch, start: i, end: i + ch.length });
      i += ch.length;
    }
  }
  return out;
}

/** 書記素の境界に丸める（範囲外も補正） */
export function clampCursor(text: string, cursor: number): number {
  if (!Number.isFinite(cursor) || cursor <= 0) return 0;
  if (cursor >= text.length) return text.length;
  for (const g of graphemes(text)) {
    if (cursor <= g.start) return g.start;
    if (cursor < g.end) return g.start;
  }
  return text.length;
}

function prevBoundary(text: string, cursor: number): number {
  let prev = 0;
  for (const g of graphemes(text)) {
    if (g.end >= cursor) return g.end === cursor ? g.start : prev;
    prev = g.end;
  }
  return prev;
}

function nextBoundary(text: string, cursor: number): number {
  for (const g of graphemes(text)) {
    if (g.start >= cursor) return g.end;
  }
  return text.length;
}

function pushUndo(state: EditorState): EditorSnapshot[] {
  const undo = [...state.undo, { text: state.text, cursor: state.cursor }];
  return undo.length > UNDO_LIMIT ? undo.slice(undo.length - UNDO_LIMIT) : undo;
}

export function createEditorState(text = '', cursor = text.length): EditorState {
  return { text, cursor: clampCursor(text, cursor), undo: [], redo: [] };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'insert': {
      if (!action.text) return state;
      const text = state.text.slice(0, state.cursor) + action.text + state.text.slice(state.cursor);
      return { text, cursor: state.cursor + action.text.length, undo: pushUndo(state), redo: [] };
    }
    case 'backspace': {
      if (state.cursor === 0) return state;
      const start = prevBoundary(state.text, state.cursor);
      const text = state.text.slice(0, start) + state.text.slice(state.cursor);
      return { text, cursor: start, undo: pushUndo(state), redo: [] };
    }
    case 'clear': {
      if (state.text === '') return state;
      return { text: '', cursor: 0, undo: pushUndo(state), redo: [] };
    }
    case 'setCursor': {
      const cursor = clampCursor(state.text, action.cursor);
      return cursor === state.cursor ? state : { ...state, cursor };
    }
    case 'moveCursor': {
      const cursor =
        action.delta < 0 ? prevBoundary(state.text, state.cursor) : nextBoundary(state.text, state.cursor);
      return cursor === state.cursor ? state : { ...state, cursor };
    }
    case 'undo': {
      const last = state.undo[state.undo.length - 1];
      if (!last) return state;
      return {
        ...last,
        undo: state.undo.slice(0, -1),
        redo: [...state.redo, { text: state.text, cursor: state.cursor }],
      };
    }
    case 'redo': {
      const next = state.redo[state.redo.length - 1];
      if (!next) return state;
      return {
        ...next,
        undo: [...state.undo, { text: state.text, cursor: state.cursor }],
        redo: state.redo.slice(0, -1),
      };
    }
  }
}
