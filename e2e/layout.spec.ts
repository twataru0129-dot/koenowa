import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SEION = [
  ['わ', 'ら', 'や', 'ま', 'は', 'な', 'た', 'さ', 'か', 'あ'],
  ['を', 'り', null, 'み', 'ひ', 'に', 'ち', 'し', 'き', 'い'],
  ['ん', 'る', 'ゆ', 'む', 'ふ', 'ぬ', 'つ', 'す', 'く', 'う'],
  ['、', 'れ', null, 'め', 'へ', 'ね', 'て', 'せ', 'け', 'え'],
  ['。', 'ろ', 'よ', 'も', 'ほ', 'の', 'と', 'そ', 'こ', 'お'],
];
const DAKUON = [
  ['ぱ', 'ば', 'だ', 'ざ', 'が'],
  ['ぴ', 'び', 'ぢ', 'じ', 'ぎ'],
  ['ぷ', 'ぶ', 'づ', 'ず', 'ぐ'],
  ['ぺ', 'べ', 'で', 'ぜ', 'げ'],
  ['ぽ', 'ぼ', 'ど', 'ぞ', 'ご'],
];

/** 端末の画面サイズ（Safari のツールバーを除いた表示領域の目安を含む） */
const VIEWPORTS = [
  { name: 'iPhone 14 横（Safari）', width: 844, height: 340, touch: true },
  { name: 'iPhone 14 横（ホーム画面から起動）', width: 844, height: 390, touch: true },
  { name: 'iPhone SE 横（Safari）', width: 667, height: 320, touch: true },
  { name: 'iPhone 14 縦（Safari）', width: 390, height: 664, touch: true },
  { name: 'iPhone SE 縦（Safari）', width: 375, height: 548, touch: true },
  { name: 'iPhone 15 Pro Max 縦（ホーム画面）', width: 430, height: 932, touch: true },
  { name: 'iPad 横', width: 1180, height: 820, touch: true },
  { name: 'iPad 縦', width: 820, height: 1180, touch: true },
  { name: 'PC', width: 1280, height: 800, touch: false },
];

interface Box {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

async function keyBoxes(page: Page): Promise<Box[]> {
  return page.$$eval('[data-testid=board] .key', (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { label: el.getAttribute('data-key') ?? '', x: r.left, y: r.top, w: r.width, h: r.height };
    }),
  );
}

/** キーの位置から行・列を組み立て直し、画面上の並びが仕様どおりか確かめる */
async function expectGrid(page: Page, expected: (string | null)[][]) {
  const boxes = await keyBoxes(page);
  const rows = new Map<number, Box[]>();
  for (const b of boxes) {
    const key = Math.round(b.y);
    rows.set(key, [...(rows.get(key) ?? []), b]);
  }
  const grid = [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, r]) => r.sort((a, b) => a.x - b.x).map((b) => b.label || null));
  expect(grid).toEqual(expected);
}

async function expectAllVisible(page: Page) {
  const vp = page.viewportSize()!;
  const boxes = await keyBoxes(page);
  for (const b of boxes) {
    expect(b.x, `${b.label} left`).toBeGreaterThanOrEqual(0);
    expect(b.y, `${b.label} top`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w, `${b.label} right`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.y + b.h, `${b.label} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
  }
  const scroll = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    sw: document.documentElement.scrollWidth,
  }));
  expect(scroll.sh, 'ページ全体が縦にスクロールしない').toBeLessThanOrEqual(vp.height);
  expect(scroll.sw, 'ページ全体が横にスクロールしない').toBeLessThanOrEqual(vp.width);
  for (const name of ['はっせい', '1文字けす', 'ぜんぶけす', 'もどす', 'よくつかう']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
  }
  await expect(page.getByRole('button', { name: 'とめる', exact: true })).toHaveCount(0);
  // 左右のページ切り替えボタン：同じ大きさで、画面内にあり、ページ名・点と重ならない
  const pager = await page.evaluate(() => {
    const r = (el: Element | null) => el!.getBoundingClientRect();
    const [prev, next] = [...document.querySelectorAll('.pager-btn')].map((e) => e.getBoundingClientRect());
    return { prev, next, center: r(document.querySelector('.pager-center')) };
  });
  expect(pager.prev.width).toBeCloseTo(pager.next.width, 0);
  expect(pager.prev.height).toBeCloseTo(pager.next.height, 0);
  expect(pager.prev.height, 'ページ切り替えボタンの高さ').toBeGreaterThanOrEqual(vp.height <= 560 && vp.width > vp.height ? 40 : 52);
  expect(pager.prev.width).toBeGreaterThanOrEqual(52);
  expect(pager.prev.right).toBeLessThanOrEqual(pager.center.left);
  expect(pager.next.left).toBeGreaterThanOrEqual(pager.center.right);
  expect(pager.next.right).toBeLessThanOrEqual(vp.width);
  expect(pager.next.bottom).toBeLessThanOrEqual(vp.height);
  await expect(page.getByTestId('text-display')).toBeInViewport({ ratio: 1 });
}

async function gotoPage(page: Page, n: number) {
  await page.getByRole('button', { name: new RegExp(`^${n}ページ目`) }).click();
  // ページ切り替えの短いスライドが終わってから測る
  await page
    .locator('.board-grid')
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });

    test('3ページとも全キーが1画面に収まり、配列が仕様どおり', async ({ page }, info) => {
      await page.goto('./');
      await expectGrid(page, SEION);
      await expectAllVisible(page);
      await page.screenshot({ path: info.outputPath('seion.png') });

      await gotoPage(page, 2);
      await expectGrid(page, DAKUON);
      await expectAllVisible(page);
      await page.screenshot({ path: info.outputPath('dakuon.png') });

      await gotoPage(page, 3);
      await expect(page.locator('[data-testid=board] button.key')).toHaveCount(22);
      await expectAllVisible(page);
      await page.screenshot({ path: info.outputPath('small.png') });

      await gotoPage(page, 1);
      const boxes = await keyBoxes(page);
      const min = boxes.reduce((m, b) => ({ w: Math.min(m.w, b.w), h: Math.min(m.h, b.h) }), { w: 999, h: 999 });
      info.annotations.push({ type: 'key-size', description: `清音キー最小 ${min.w.toFixed(0)}×${min.h.toFixed(0)}px` });
    });
  });
}

test.describe('回転', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

  test('縦横を切り替えても文章・カーソル・ページ・配列が保たれる', async ({ page }) => {
    await page.goto('./');
    for (const ch of ['き', 'ょ', 'う']) {
      if (ch === 'ょ') await gotoPage(page, 3);
      await page.getByRole('button', { name: ch === 'ょ' ? 'ちいさい よ' : ch, exact: true }).tap();
      if (ch === 'ょ') await gotoPage(page, 1);
    }
    await gotoPage(page, 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('group', { name: /2ページ目/ })).toBeVisible();
    await expectGrid(page, DAKUON);
    await gotoPage(page, 1);
    await expectGrid(page, SEION);
    await page.setViewportSize({ width: 844, height: 390 });
    await expectGrid(page, SEION);
    await expect(page.getByTestId('text-display')).toContainText('きょう');
    await page.getByRole('button', { name: 'は', exact: true }).tap();
    await expect(page.getByTestId('text-display')).toHaveText(/きょうは/);
  });
});

test.describe('操作', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('文字盤をなぞるとページが変わり、文字は入力されない', async ({ page }) => {
    await page.goto('./');
    const box = (await page.getByRole('button', { name: 'な', exact: true }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 60, box.y + box.height / 2, { steps: 5 });
    await page.mouse.move(box.x - 200, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole('group', { name: /2ページ目/ })).toBeVisible();
    await expect(page.locator('[data-testid=text-display] .ch')).toHaveCount(0);
  });

  test('なぞる方向に合わせてページが循環し、文字は入力されない', async ({ page }) => {
    await page.goto('./');
    const drag = async (dx: number) => {
      const box = (await page.getByTestId('board').boundingBox())!;
      const y = box.y + box.height / 2;
      const x = box.x + box.width / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y, { steps: 5 });
      await page.mouse.move(x + dx, y, { steps: 5 });
      await page.mouse.up();
      await page.locator('.board-grid').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      return (await page.getByRole('group', { name: /ページ目/ }).getAttribute('aria-label'))![0];
    };
    const left = [await drag(-200), await drag(-200), await drag(-200)];
    expect(left).toEqual(['2', '3', '1']);
    const right = [await drag(200), await drag(200), await drag(200)];
    expect(right).toEqual(['3', '2', '1']);
    await expect(page.locator('[data-testid=text-display] .ch')).toHaveCount(0);
    await expectGrid(page, SEION);
  });

  test('文章エリアをタップしてもキーボード入力欄が出ない（カーソルだけ動く）', async ({ page }) => {
    await page.goto('./');
    for (const ch of ['あ', 'い', 'う']) await page.getByRole('button', { name: ch, exact: true }).click();
    const first = page.locator('[data-testid=text-display] .ch').first();
    const b = (await first.boundingBox())!;
    await page.mouse.click(b.x + b.width * 0.8, b.y + b.height / 2);
    await page.getByRole('button', { name: 'か', exact: true }).click();
    await expect(page.getByTestId('text-display')).toHaveText(/あかいう/);
    const editable = await page.evaluate(() => document.querySelectorAll('[contenteditable=true], input, textarea').length);
    expect(editable).toBe(0);
  });

  test('改行しても画面が崩れない', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 340 });
    await page.goto('./');
    await gotoPage(page, 3);
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: 'ちいさい あ' }).click();
      await page.getByRole('button', { name: '改行' }).click();
    }
    await expectAllVisible(page);
  });
});

test.describe('PWA・オフライン', () => {
  test('manifest とアイコンが設定されている', async ({ page, request }) => {
    await page.goto('./');
    const href = await page.getAttribute('link[rel=manifest]', 'href');
    const manifest = await (await request.get(href!)).json();
    expect(manifest.name).toBe('こえのわ');
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    const apple = await page.getAttribute('link[rel=apple-touch-icon]', 'href');
    expect((await request.get(apple!)).ok()).toBe(true);
  });

  test('一度開いたあとは通信なしでも起動・入力・保存の復元ができる', async ({ page, context }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.getByRole('button', { name: 'は', exact: true }).click();
    await page.getByRole('button', { name: 'い', exact: true }).click();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('text-display')).toHaveText(/はい/);
    await page.getByRole('button', { name: 'よくつかう' }).click();
    await expect(page.getByRole('button', { name: 'ありがとうございます' })).toBeVisible();
    await page.getByRole('button', { name: 'とじる' }).click();
    await page.getByRole('button', { name: 'う', exact: true }).click();
    await expect(page.getByTestId('text-display')).toHaveText(/はいう/);
    await context.setOffline(false);
  });

  test('外部へのリクエストを送らない', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://localhost:4174/')) external.push(r.url());
    });
    await page.goto('./');
    await page.getByRole('button', { name: 'は', exact: true }).click();
    await page.getByRole('button', { name: 'はっせい' }).click();
    await page.waitForTimeout(300);
    expect(external).toEqual([]);
  });
});

test.describe('声の設定画面', () => {
  // iPhone で「Kyoko（標準）しか取得できない」状態を再現する（Web Speech API が返す一覧を差し替える）
  const onlyKyoko = () => {
    const voices = [
      { name: 'Kyoko', lang: 'ja-JP', voiceURI: 'com.apple.voice.compact.ja-JP.Kyoko', localService: true, default: true },
      { name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.compact.en-US.Samantha', localService: true, default: false },
    ];
    Object.defineProperty(window.speechSynthesis, 'getVoices', { value: () => voices });
  };

  for (const vp of [
    { name: 'iPhone 14 縦', width: 390, height: 664 },
    { name: 'iPhone 14 横', width: 844, height: 340 },
  ]) {
    test(`${vp.name}：標準音声・Kyoko・診断が表示され、横にはみ出さない`, async ({ browser }, info) => {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: true,
        isMobile: true,
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      await ctx.addInitScript(onlyKyoko);
      const page = await ctx.newPage();
      await page.goto('./');
      await page.getByRole('button', { name: 'せってい' }).filter({ visible: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'せってい' });
      await expect(dialog.getByRole('radio', { name: /端末の標準音声（自動）/ })).toBeEnabled();
      await expect(dialog.getByRole('button', { name: '端末の標準音声（自動）を試聴' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Kyokoを試聴' })).toBeVisible();
      await expect(dialog.getByText('男性の日本語の声が見つかりません。')).toBeVisible();
      await page.screenshot({ path: info.outputPath('voices.png') });

      await dialog.getByRole('radio', { name: /端末の標準音声（自動）/ }).check();
      await dialog.getByText('音声の診断（確認用）').click();
      const out = dialog.getByTestId('voice-diagnostics');
      await expect(out).toContainText('取得した音声の総数: 2');
      await expect(out).toContainText('日本語音声の件数: 1');
      await expect(out).toContainText('voiceURI=com.apple.voice.compact.ja-JP.Kyoko');
      await out.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('diagnostics.png') });
      await dialog.getByRole('button', { name: 'コピー' }).click();
      await expect(dialog.getByText('コピーしました')).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('日本語音声の件数: 1');

      const overflow = await page.evaluate(() => {
        const m = document.querySelector('.modal')!;
        return { sw: document.documentElement.scrollWidth, mw: m.scrollWidth, cw: m.clientWidth };
      });
      expect(overflow.sw).toBeLessThanOrEqual(vp.width);
      expect(overflow.mw).toBeLessThanOrEqual(overflow.cw);

      // 設定を閉じて再読み込みしても標準音声のまま
      await dialog.getByRole('button', { name: 'とじる' }).click();
      await page.reload();
      await page.getByRole('button', { name: 'せってい' }).filter({ visible: true }).first().click();
      await expect(page.getByRole('radio', { name: /端末の標準音声（自動）/ })).toBeChecked();
      await ctx.close();
    });
  }
});

test.describe('読み上げの調整の画面', () => {
  for (const vp of [
    { name: 'iPhone 14 縦', width: 390, height: 664 },
    { name: 'iPhone 14 横', width: 844, height: 340 },
  ]) {
    test(`${vp.name}：速さの調整・比較・読み方の設定がはみ出さずに使える`, async ({ browser }, info) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      await page.goto('./');
      const noOverflow = async () => {
        const o = await page.evaluate(() => {
          const m = document.querySelector('.modal')!;
          return { sw: document.documentElement.scrollWidth, mw: m.scrollWidth, cw: m.clientWidth };
        });
        expect(o.sw).toBeLessThanOrEqual(vp.width);
        expect(o.mw).toBeLessThanOrEqual(o.cw);
      };

      await page.getByRole('button', { name: 'せってい' }).filter({ visible: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'せってい' });
      await dialog.getByText('こまかく調整（試験的）').click();
      await expect(dialog.getByRole('slider', { name: 'はやさをこまかく調整' })).toBeVisible();
      await dialog.getByRole('slider', { name: 'はやさをこまかく調整' }).fill('0.9');
      await dialog.getByText('こまかく調整（試験的）').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('fine-rate.png') });
      await noOverflow();

      await dialog.getByText('読み上げの比較（試験的）').click();
      await dialog.getByRole('combobox', { name: '比べる文章' }).selectOption({ label: '例文：きょうは いい てんき です' });
      await expect(dialog.getByTestId('compare-adjusted')).toHaveText('きょうは、いい、てんき、です。');
      await dialog.getByRole('radio', { name: '調整あり（試験的）' }).check();
      await dialog.getByTestId('compare-adjusted').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('compare.png') });
      await noOverflow();
      await dialog.getByRole('button', { name: 'とじる' }).click();

      // 再読み込みしても速さと読み上げ方式が残る
      await page.reload();
      const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('koenowa.v1.settings')!));
      expect(settings).toMatchObject({ rateValue: 0.9, speechStyle: 'adjusted' });

      await page.getByRole('button', { name: 'よくつかう' }).click();
      const fav = page.getByRole('dialog', { name: 'よくつかう言葉' });
      await fav.getByRole('button', { name: 'へんしゅう' }).click();
      await fav.getByRole('button', { name: '「はい」の読み方' }).click();
      await fav.getByLabel(/読み上げ用テキスト（任意）/).fill('はい。');
      await page.screenshot({ path: info.outputPath('reading.png') });
      await noOverflow();
      await fav.getByRole('button', { name: 'ほぞん' }).click();
      await expect(fav.getByText('読み上げ：はい。')).toBeVisible();
      await ctx.close();
    });
  }
});

test.describe('ページ切り替えボタン', () => {
  for (const vp of [
    { name: 'iPhone 14 縦', width: 390, height: 664 },
    { name: 'iPhone 14 横', width: 844, height: 340 },
    { name: 'iPad 横', width: 1180, height: 820 },
  ]) {
    test(`${vp.name}：左右のボタンで循環し、文字は入らず、文字盤の配列は変わらない`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      await page.goto('./');
      const current = async () => {
        await page.locator('.board-grid').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        return (await page.getByRole('group', { name: /ページ目/ }).getAttribute('aria-label'))![0];
      };
      const next = page.getByRole('button', { name: 'つぎの文字盤' });
      const prev = page.getByRole('button', { name: 'まえの文字盤' });
      const forward = [];
      for (let i = 0; i < 3; i++) {
        await next.tap();
        forward.push(await current());
      }
      expect(forward).toEqual(['2', '3', '1']);
      const backward = [];
      for (let i = 0; i < 3; i++) {
        await prev.tap();
        backward.push(await current());
      }
      expect(backward).toEqual(['3', '2', '1']);
      await expect(page.locator('[data-testid=text-display] .ch')).toHaveCount(0);
      await expectGrid(page, SEION);
      await ctx.close();
    });
  }
});

test.describe('自動登録ととてもゆっくり', () => {
  for (const vp of [
    { name: 'iPhone 14 縦', width: 390, height: 664 },
    { name: 'iPhone 14 横', width: 844, height: 340 },
  ]) {
    test(`${vp.name}：はやさは2列×2段、一音ずつの設定がはみ出さない`, async ({ browser }, info) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      await page.goto('./');
      await page.getByRole('button', { name: 'せってい' }).filter({ visible: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'せってい' });
      await dialog.getByRole('radio', { name: 'とてもゆっくり' }).check();
      const boxes = await dialog.locator('.rate-grid label').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: r.width, text: e.textContent };
        }),
      );
      expect(boxes.map((b) => b.text)).toEqual(['とてもゆっくり', 'ゆっくり', 'ふつう', 'はやめ']);
      expect(new Set(boxes.map((b) => b.y)).size).toBe(2);
      expect(new Set(boxes.map((b) => b.x)).size).toBe(2);
      await dialog.getByText('一音ずつはっきり（試験的）').click();
      await dialog.getByRole('radio', { name: '「、」で区切る' }).check();
      await expect(dialog.getByTestId('syllable-comma')).toHaveText('あ、り、が、と、う');
      await dialog.getByTestId('syllable-comma').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('syllable.png') });
      const o = await page.evaluate(() => {
        const m = document.querySelector('.modal')!;
        return { sw: document.documentElement.scrollWidth, mw: m.scrollWidth, cw: m.clientWidth };
      });
      expect(o.sw).toBeLessThanOrEqual(vp.width);
      expect(o.mw).toBeLessThanOrEqual(o.cw);
      await ctx.close();
    });
  }

  test('iPhone 14 縦：10回入力して発声すると登録され、お知らせが出ても文字盤を押せる', async ({ browser }, info) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto('./');
    const speak = page.getByRole('button', { name: 'はっせい' });
    for (let i = 0; i < 10; i++) {
      const clear = page.getByRole('button', { name: 'ぜんぶけす' });
      if (await clear.isEnabled()) {
        await clear.tap();
        await page.getByRole('alertdialog').getByRole('button', { name: 'ぜんぶけす' }).tap();
      }
      for (const ch of ['ね', 'む', 'い']) await page.getByRole('button', { name: ch, exact: true }).tap();
      await speak.tap();
      await speak.tap(); // 連打しても数えない
    }
    const toast = page.getByText('『ねむい』を よくつかう に とうろくしました');
    await expect(toast).toBeVisible();
    await page.screenshot({ path: info.outputPath('toast.png') });
    // お知らせの上からでも、その下の文字盤や文章エリアを押せる（タップを下へ通す）
    expect(await toast.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    await page.getByRole('button', { name: 'あ', exact: true }).tap();
    await expect(page.getByTestId('text-display')).toHaveText(/ねむいあ/);
    const favs = await page.evaluate(() => JSON.parse(localStorage.getItem('koenowa.v1.favorites')!));
    expect(favs.filter((f: { text: string }) => f.text === 'ねむい')).toHaveLength(1);
    await ctx.close();
  });
});

test.describe('文字を押したときに声を出す', () => {
  // ブラウザーの音声合成に渡された文字列を記録する（実際の音は出さない）
  const recordSpeech = () => {
    const w = window as unknown as { __spoken: string[] };
    w.__spoken = [];
    const voices = [{ name: 'Kyoko', lang: 'ja-JP', voiceURI: 'k', localService: true, default: true }];
    Object.defineProperty(window.speechSynthesis, 'getVoices', { value: () => voices });
    Object.defineProperty(window.speechSynthesis, 'speak', {
      value: (u: SpeechSynthesisUtterance) => {
        w.__spoken.push(u.text);
        setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 30);
      },
    });
    Object.defineProperty(window.speechSynthesis, 'cancel', { value: () => undefined });
  };

  for (const vp of [
    { name: 'iPhone 14 縦', width: 390, height: 664 },
    { name: 'iPhone 14 横', width: 844, height: 340 },
    { name: 'iPad 横', width: 1180, height: 820 },
  ]) {
    test(`${vp.name}：オンにすると押した文字を読み、なぞりでは読まず、はっせいで文章を読む`, async ({ browser }, info) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
      await ctx.addInitScript(recordSpeech);
      // 利用者の iPhone と同じ「端末の標準音声（自動）」で確かめる
      await ctx.addInitScript(() => {
        if (!localStorage.getItem('koenowa.v1.settings')) {
          localStorage.setItem('koenowa.v1.settings', JSON.stringify({ voiceMode: 'system' }));
        }
      });
      const page = await ctx.newPage();
      await page.goto('./');
      await page.getByRole('button', { name: 'せってい' }).filter({ visible: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'せってい' });
      const box = dialog.getByRole('checkbox', { name: /文字を押したときに声を出す/ });
      await expect(box).not.toBeChecked();
      await box.check();
      await box.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('settings.png') });
      const o = await page.evaluate(() => {
        const m = document.querySelector('.modal')!;
        return { sw: document.documentElement.scrollWidth, mw: m.scrollWidth, cw: m.clientWidth };
      });
      expect(o.sw).toBeLessThanOrEqual(vp.width);
      expect(o.mw).toBeLessThanOrEqual(o.cw);
      await dialog.getByRole('button', { name: 'とじる' }).click();

      for (const ch of ['あ', 'い', 'す']) await page.getByRole('button', { name: ch, exact: true }).tap();
      await expect(page.getByTestId('text-display')).toHaveText(/あいす/);
      // 文字盤をなぞってページを変えても、文字は入らず声も出ない
      const b = (await page.getByTestId('board').boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      const dx = Math.min(200, b.width * 0.4); // 画面の外に出ない長さでなぞる
      await page.mouse.move(b.x + b.width / 2 - dx / 2, b.y + b.height / 2, { steps: 5 });
      await page.mouse.move(b.x + b.width / 2 - dx, b.y + b.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect(page.getByRole('group', { name: /2ページ目/ })).toBeVisible();
      await page.getByRole('button', { name: 'はっせい' }).tap();
      const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
      expect(spoken).toEqual(['あ', 'い', 'す', 'あいす']);
      await expect(page.getByTestId('text-display')).toHaveText(/^あいす/);
      await ctx.close();
    });
  }
});

test.describe('バージョン番号', () => {
  const version = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;

  for (const vp of [
    { name: 'iPhone SE 1世代 縦', width: 320, height: 548 },
    { name: 'iPhone SE 縦', width: 375, height: 548 },
    { name: 'iPhone 14 縦', width: 390, height: 664 },
    { name: 'iPhone 15 Pro Max 縦', width: 430, height: 839 },
    { name: 'iPad 縦', width: 820, height: 1180 },
    { name: 'iPad 横', width: 1180, height: 820 },
  ]) {
    test(`${vp.name}：「こえのわ」の右に v${version} を1行で表示し、せってい と重ならない`, async ({ browser }, info) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      await page.goto('./');
      const ver = page.locator('.app-version');
      await expect(ver).toHaveText(`v${version}`);
      await expect(ver).toBeInViewport({ ratio: 1 });
      const r = await page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const v = document.querySelector('.app-version')!;
        return {
          title: box('.brand h1'),
          ver: box('.app-version'),
          settings: box('.btn-settings'),
          fontSize: parseFloat(getComputedStyle(v).fontSize),
          titleSize: parseFloat(getComputedStyle(document.querySelector('.brand h1')!).fontSize),
          lineHeight: v.getBoundingClientRect().height,
        };
      });
      expect(r.ver.left).toBeGreaterThanOrEqual(r.title.right);
      expect(r.ver.left - r.title.right).toBeLessThanOrEqual(12);
      expect(r.ver.right).toBeLessThan(r.settings.left);
      expect(r.fontSize).toBeGreaterThanOrEqual(11);
      expect(r.fontSize).toBeLessThanOrEqual(13);
      expect(r.fontSize).toBeLessThan(r.titleSize);
      expect(r.lineHeight).toBeLessThan(r.fontSize * 1.6); // 1行
      await page.screenshot({ path: info.outputPath('header.png'), clip: { x: 0, y: 0, width: vp.width, height: 60 } });
      await ctx.close();
    });
  }

  test('iPhone 横：ヘッダーは今までどおり表示しない', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 340 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto('./');
    await expect(page.locator('.app-header')).toBeHidden();
    await expect(page.locator('.app-version')).toBeHidden();
    await ctx.close();
  });
});

test.describe('ご意見・ご要望とアップデート情報', () => {
  const FORM_URL = 'https://forms.gle/3S63VY9CuCcA5hzNA';
  const openSettings = async (page: Page) => {
    await page.getByRole('button', { name: 'せってい' }).filter({ visible: true }).first().click();
    return page.getByRole('dialog');
  };
  const noOverflow = async (page: Page, width: number) => {
    const o = await page.evaluate(() => {
      const m = document.querySelector('.modal')!;
      return { sw: document.documentElement.scrollWidth, mw: m.scrollWidth, cw: m.clientWidth };
    });
    expect(o.sw).toBeLessThanOrEqual(width);
    expect(o.mw).toBeLessThanOrEqual(o.cw);
  };

  for (const vp of [
    { name: 'iPhone SE 縦', width: 375, height: 548 },
    { name: 'iPhone 14 縦', width: 390, height: 664 },
    { name: 'iPhone 14 横', width: 844, height: 340 },
    { name: 'iPad 縦', width: 820, height: 1180 },
    { name: 'iPad 横', width: 1180, height: 820 },
  ]) {
    test(`${vp.name}：設定の上に2つの項目が並び、アップデート情報がはみ出さずに読める`, async ({ browser }, info) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      await page.goto('./');
      const dialog = await openSettings(page);
      const headings = await dialog.locator('h3').evaluateAll((els) =>
        els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.textContent),
      );
      expect(headings.slice(0, 3)).toEqual(['ご意見・ご要望', 'アップデート情報', '声']);
      const link = dialog.getByRole('link', { name: 'ご意見・ご要望を送る' });
      await expect(link).toBeInViewport();
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(48);
      await page.screenshot({ path: info.outputPath('settings-top.png') });
      await noOverflow(page, vp.width);

      await dialog.getByRole('button', { name: 'アップデート情報を見る' }).click();
      await expect(page.getByRole('dialog', { name: 'アップデート情報' })).toBeVisible();
      await expect(page.getByTestId('changelog-1.1.0')).toBeVisible();
      await expect(page.getByTestId('changelog-1.0.0')).toContainText('こえのわの基本機能');
      await page.screenshot({ path: info.outputPath('changelog.png') });
      await noOverflow(page, vp.width);
      await page.getByRole('button', { name: 'せっていにもどる' }).click();
      await expect(page.getByRole('dialog', { name: 'せってい' })).toBeVisible();
      await ctx.close();
    });
  }

  test('フォームは新しいタブで指定の URL のまま開き、こえのわの文章は残る', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });
    // テストでは Google へは接続せず、代わりの画面を返す
    await ctx.route('https://forms.gle/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>form</p>' }));
    const page = await ctx.newPage();
    await page.goto('./');
    for (const ch of ['あ', 'い', 'う']) await page.getByRole('button', { name: ch, exact: true }).tap();
    const dialog = await openSettings(page);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), dialog.getByRole('link', { name: 'ご意見・ご要望を送る' }).click()]);
    await popup.waitForLoadState();
    expect(popup.url()).toBe(FORM_URL);
    // noopener のため、開いたページから元のページを操作できない
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    await page.reload();
    await expect(page.getByTestId('text-display')).toHaveText(/あいう/);
    await ctx.close();
  });

  test('通信がなくてもアップデート情報を見られる', async ({ page, context }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await context.setOffline(true);
    await page.reload();
    const { version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
    await expect(page.locator('.app-version')).toHaveText(`v${version}`);
    const dialog = await openSettings(page);
    await expect(dialog.getByText('いまはインターネットにつながっていないため、フォームを開けません。')).toBeVisible();
    await dialog.getByRole('button', { name: 'アップデート情報を見る' }).click();
    await expect(page.getByTestId('changelog-1.1.0')).toContainText('ご意見・ご要望とアップデート情報を追加');
    await context.setOffline(false);
  });
});
