import {
  AUTO_REGISTER_COUNT,
  countSpoken,
  dismiss,
  emptyLearning,
  isLearnable,
  LEARN_MAX_ENTRIES,
  LEARN_MAX_LENGTH,
  LEARNING_KEY,
  loadLearning,
  normalizeLearnText,
  saveLearning,
  undismiss,
  type LearningData,
} from './learning';

const countN = (data: LearningData, text: string, n: number, fav = false) => {
  let d = data;
  let register: string | null = null;
  for (let i = 0; i < n; i++) {
    const r = countSpoken(d, text, fav);
    d = r.data;
    register = r.register ?? register;
  }
  return { data: d, register };
};

beforeEach(() => localStorage.clear());

describe('自動登録の学習記録', () => {
  it('前後の空白と改行コードだけをそろえ、文中の空白は残す', () => {
    expect(normalizeLearnText('  きょうは いい\r\nてんき  ')).toBe('きょうは いい\nてんき');
  });

  it('空白だけ・記号だけ・長すぎる文章は対象外', () => {
    expect(isLearnable('')).toBe(false);
    expect(isLearnable('。、？')).toBe(false);
    expect(isLearnable('あ'.repeat(LEARN_MAX_LENGTH))).toBe(true);
    expect(isLearnable('あ'.repeat(LEARN_MAX_LENGTH + 1))).toBe(false);
    expect(LEARN_MAX_LENGTH).toBe(40);
  });

  it(`${AUTO_REGISTER_COUNT}回目で登録し、登録した言葉の回数は消す`, () => {
    const nine = countN(emptyLearning(), 'ねむい', 9);
    expect(nine.register).toBeNull();
    expect(nine.data.counts['ねむい'].count).toBe(9);
    const ten = countSpoken(nine.data, 'ねむい', false);
    expect(ten.register).toBe('ねむい');
    expect(ten.data.counts['ねむい']).toBeUndefined();
  });

  it('すでに「よくつかう」にある言葉・消された言葉は数えない', () => {
    expect(countN(emptyLearning(), 'はい', 12, true)).toEqual({ data: emptyLearning(), register: null });
    const d = dismiss(countN(emptyLearning(), 'ねむい', 5).data, 'ねむい');
    expect(d.counts['ねむい']).toBeUndefined();
    expect(countN(d, 'ねむい', 12).register).toBeNull();
    // 手動で登録し直すと、また対象になる
    expect(undismiss(d, 'ねむい').dismissed).toEqual([]);
  });

  it(`記録する文章は${LEARN_MAX_ENTRIES}件までで、いちばん長く数えていないものから消す`, () => {
    let d = emptyLearning();
    for (let i = 0; i <= LEARN_MAX_ENTRIES; i++) d = countSpoken(d, `ことば${i}`, false).data;
    expect(Object.keys(d.counts)).toHaveLength(LEARN_MAX_ENTRIES);
    expect(d.counts['ことば0']).toBeUndefined();
    expect(d.counts[`ことば${LEARN_MAX_ENTRIES}`]).toBeDefined();
  });

  it('保存と復元。壊れたデータは空として読む。日時は保存しない', () => {
    const d = countN(emptyLearning(), 'ねむい', 3).data;
    saveLearning(d);
    expect(loadLearning()).toEqual(d);
    expect(localStorage.getItem(LEARNING_KEY)).not.toMatch(/time|date|at"/i);
    localStorage.setItem(LEARNING_KEY, '{壊れた');
    expect(loadLearning()).toEqual(emptyLearning());
  });
});
