import pkg from '../../package.json';
import { CHANGELOG } from './changelog';
import { FEEDBACK_FORM_URL } from './links';

const parse = (v: string) => v.split('.').map(Number);
const compare = (a: string, b: string) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

describe('アップデート情報のデータ', () => {
  it('いちばん上（最新）のバージョンは package.json の version と同じ', () => {
    expect(CHANGELOG[0].version).toBe(pkg.version);
    expect(pkg.version).toBe('1.1.1');
  });

  it('新しいバージョンから順に並び、同じ番号はない', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compare(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    }
    expect(new Set(CHANGELOG.map((e) => e.version)).size).toBe(CHANGELOG.length);
  });

  it('すべての版に見出しと内容があり、番号は x.y.z の形。日付は書く場合だけ YYYY-MM-DD', () => {
    for (const e of CHANGELOG) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(e.title.trim()).not.toBe('');
      expect(e.items.length).toBeGreaterThan(0);
      e.items.forEach((item) => expect(item.trim()).not.toBe(''));
      if (e.date !== undefined) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('v1.1.1 の内容', () => {
    expect(CHANGELOG[0]).toEqual({
      version: '1.1.1',
      title: '女性の声の1文字読み上げを調整',
      items: ['女性音声の1文字読み上げを、よりゆっくり聞き取れるように調整しました。'],
    });
  });

  it('v1.1.0 と v1.0.0 の内容は残っている（公開日は決まっていないので書かない）', () => {
    expect(CHANGELOG.map((e) => e.version)).toEqual(['1.1.1', '1.1.0', '1.0.0']);
    expect(CHANGELOG[1]).toEqual({
      version: '1.1.0',
      title: 'ご意見・ご要望とアップデート情報を追加',
      items: ['ご意見・ご要望を送れるようになりました。', '新しい機能や改善内容を確認できるようになりました。'],
    });
    expect(CHANGELOG[2].title).toBe('こえのわの基本機能');
    expect(CHANGELOG[2].items).toHaveLength(6);
    expect(CHANGELOG.every((e) => e.date === undefined)).toBe(true);
  });

  it('ご意見・ご要望のフォームは指定の URL（何も付け足さない）', () => {
    expect(FEEDBACK_FORM_URL).toBe('https://forms.gle/3S63VY9CuCcA5hzNA');
  });
});
