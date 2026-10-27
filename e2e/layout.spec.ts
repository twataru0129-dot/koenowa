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
  for (const name of ['はっせい', '1文字けす', 'ぜんぶけす', 'もどす', 'とめる', 'よくつかう']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
  }
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
