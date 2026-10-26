import { DAKUON_ROWS, keyText, PAGES, SEION_ROWS, SMALL_CHARS, SYMBOL_CHARS } from './boards';

describe('清音ページの配列', () => {
  it('10列×5段で、左から右の順が仕様どおり', () => {
    expect(SEION_ROWS).toEqual([
      ['わ', 'ら', 'や', 'ま', 'は', 'な', 'た', 'さ', 'か', 'あ'],
      ['を', 'り', null, 'み', 'ひ', 'に', 'ち', 'し', 'き', 'い'],
      ['ん', 'る', 'ゆ', 'む', 'ふ', 'ぬ', 'つ', 'す', 'く', 'う'],
      ['、', 'れ', null, 'め', 'へ', 'ね', 'て', 'せ', 'け', 'え'],
      ['。', 'ろ', 'よ', 'も', 'ほ', 'の', 'と', 'そ', 'こ', 'お'],
    ]);
  });

  it('50マスのうち空欄は2か所（や行の2段目・4段目）', () => {
    const page = PAGES[0];
    expect(page.columns).toBe(10);
    const cells = page.rows.flat();
    expect(cells).toHaveLength(50);
    const empties = page.rows.flatMap((row, r) => row.map((k, c) => (k.kind === 'empty' ? [r, c] : null))).filter(Boolean);
    expect(empties).toEqual([
      [1, 2],
      [3, 2],
    ]);
  });

  it('右端はあ行、左端はわ行と「、」「。」', () => {
    expect(SEION_ROWS.map((r) => r[9])).toEqual(['あ', 'い', 'う', 'え', 'お']);
    expect(SEION_ROWS.map((r) => r[0])).toEqual(['わ', 'を', 'ん', '、', '。']);
  });

  it('濁音・半濁音が混ざっていない', () => {
    const all = SEION_ROWS.flat().join('');
    expect(all).not.toMatch(/[がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ]/);
  });
});

describe('濁音・半濁音ページの配列', () => {
  it('5列×5段で、左から ぱ・ば・だ・ざ・が', () => {
    expect(DAKUON_ROWS).toEqual([
      ['ぱ', 'ば', 'だ', 'ざ', 'が'],
      ['ぴ', 'び', 'ぢ', 'じ', 'ぎ'],
      ['ぷ', 'ぶ', 'づ', 'ず', 'ぐ'],
      ['ぺ', 'べ', 'で', 'ぜ', 'げ'],
      ['ぽ', 'ぼ', 'ど', 'ぞ', 'ご'],
    ]);
    expect(PAGES[1].columns).toBe(5);
  });

  it('25文字すべてが1文字のまま直接入力される（濁点の後付けではない）', () => {
    const keys = PAGES[1].rows.flat();
    expect(keys).toHaveLength(25);
    for (const k of keys) {
      const t = keyText(k)!;
      expect(t.normalize('NFC')).toBe(t);
      expect(Array.from(t)).toHaveLength(1);
    }
  });
});

describe('小文字・記号ページ', () => {
  it('小文字・記号・空白・改行がすべて同じページにある', () => {
    const texts = PAGES[2].rows.flat().map(keyText).filter((t) => t !== null);
    expect(SMALL_CHARS).toEqual(['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'っ', 'ゎ']);
    expect(SYMBOL_CHARS).toEqual(['ー', '、', '。', '？', '！', '「', '」', '（', '）', '・']);
    expect(texts).toEqual([...SMALL_CHARS, ...SYMBOL_CHARS, ' ', '\n']);
  });

  it('ページは3つだけ', () => {
    expect(PAGES.map((p) => p.id)).toEqual(['seion', 'dakuon', 'small']);
  });
});
