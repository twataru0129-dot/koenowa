import { createEditorState, editorReducer, graphemes, type EditorAction, type EditorState } from './editor';

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);
const type = (s: string): EditorAction[] => Array.from(s).map((ch) => ({ type: 'insert', text: ch }));

describe('文章の編集', () => {
  it('カーソル位置に文字を追加する', () => {
    const s = run(createEditorState(), ...type('きょう'));
    expect(s.text).toBe('きょう');
    expect(s.cursor).toBe(3);
  });

  it('文の途中に挿入できる（きょうはたのしかた → たのしかった）', () => {
    let s = run(createEditorState(), ...type('きょうはたのしかた'));
    s = run(s, { type: 'setCursor', cursor: 8 }, { type: 'insert', text: 'っ' });
    expect(s.text).toBe('きょうはたのしかった');
    expect(s.cursor).toBe(9);
  });

  it('1文字削除はカーソル直前の1文字だけを消す', () => {
    let s = run(createEditorState('あいう', 2), { type: 'backspace' });
    expect(s).toMatchObject({ text: 'あう', cursor: 1 });
    s = run(createEditorState('', 0), { type: 'backspace' });
    expect(s.text).toBe('');
  });

  it('結合文字（濁点の結合文字・絵文字）を分断しない', () => {
    const decomposed = 'が'; // か + 結合用濁点
    const s = run(createEditorState(`あ${decomposed}`), { type: 'backspace' });
    expect(s.text).toBe('あ');
    const emoji = run(createEditorState('あ👍🏽'), { type: 'backspace' });
    expect(emoji.text).toBe('あ');
    expect(graphemes(`あ${decomposed}`)).toHaveLength(2);
  });

  it('カーソル位置は書記素の境界に丸める', () => {
    const s = run(createEditorState('が', 0), { type: 'setCursor', cursor: 1 });
    expect(s.cursor).toBe(0);
    const s2 = run(createEditorState('あい'), { type: 'setCursor', cursor: 99 });
    expect(s2.cursor).toBe(2);
  });

  it('全文削除のあと、元に戻すで復元できる', () => {
    let s = run(createEditorState(), ...type('はなしたい'));
    s = run(s, { type: 'clear' });
    expect(s.text).toBe('');
    s = run(s, { type: 'undo' });
    expect(s).toMatchObject({ text: 'はなしたい', cursor: 5 });
    s = run(s, { type: 'redo' });
    expect(s.text).toBe('');
  });

  it('元に戻すは1操作ずつ戻る', () => {
    let s = run(createEditorState(), ...type('あい'), { type: 'backspace' });
    s = run(s, { type: 'undo' });
    expect(s.text).toBe('あい');
    s = run(s, { type: 'undo' });
    expect(s.text).toBe('あ');
    s = run(s, { type: 'undo' }, { type: 'undo' });
    expect(s.text).toBe('');
  });

  it('カーソル移動は元に戻すの対象にしない', () => {
    const s = run(createEditorState('あい'), { type: 'moveCursor', delta: -1 });
    expect(s.cursor).toBe(1);
    expect(s.undo).toHaveLength(0);
  });
});
