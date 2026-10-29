import { act, fireEvent, render, screen, within } from '@testing-library/react';
import pkg from '../package.json';
import App from './App';
import { Speaker } from './speech/speech';
import { setSpeakerForTesting } from './speech/useSpeech';
import { LEARNING_KEY } from './state/learning';
import { STORAGE_KEYS } from './state/storage';
import { FakeSynth, FakeUtterance, IOS_JA_VOICES } from './test/fakeSpeech';

let synth: FakeSynth;

beforeEach(() => {
  localStorage.clear();
  synth = new FakeSynth();
  setSpeakerForTesting(
    new Speaker(synth as unknown as SpeechSynthesis, FakeUtterance as unknown as typeof SpeechSynthesisUtterance),
  );
});

const board = () => screen.getByTestId('board');
const textOf = () => (JSON.parse(localStorage.getItem(STORAGE_KEYS.draft)!) as { text: string }).text;
const shown = () =>
  Array.from(screen.getByTestId('text-display').querySelectorAll('[data-start]'))
    .map((el) => (el.getAttribute('data-newline') ? '\n' : el.classList.contains('space') ? ' ' : el.textContent))
    .join('');

function key(label: string): HTMLElement {
  return within(board()).getByRole('button', { name: label });
}

/** 指でタップ（押す→離す→click）。ブラウザーと同じ順にイベントを送る */
function tap(el: HTMLElement, x = 10, y = 10) {
  fireEvent.pointerDown(el, { pointerId: 1, isPrimary: true, clientX: x, clientY: y });
  fireEvent.pointerUp(el, { pointerId: 1, isPrimary: true, clientX: x, clientY: y });
  fireEvent.click(el, { detail: 1, clientX: x, clientY: y });
}

/** 文字盤の上を横になぞる。指を離したあとに click が来ても入力されないこと */
function swipe(el: HTMLElement, dx: number) {
  fireEvent.pointerDown(el, { pointerId: 2, isPrimary: true, clientX: 300, clientY: 50 });
  fireEvent.pointerMove(el, { pointerId: 2, isPrimary: true, clientX: 300 + dx / 2, clientY: 52 });
  fireEvent.pointerUp(el, { pointerId: 2, isPrimary: true, clientX: 300 + dx, clientY: 54 });
  fireEvent.click(el, { detail: 1 });
}

function typeSeion(chars: string) {
  for (const ch of chars) tap(key(ch));
}

function pageTo(n: number) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${n}ページ目`) }));
}

describe('こえのわ 画面', () => {
  it('き → ょ → う → は → ぱ をページを行き来して入力できる', () => {
    render(<App />);
    tap(key('き'));
    pageTo(3);
    tap(key('ちいさい よ'));
    pageTo(1);
    tap(key('う'));
    tap(key('は'));
    pageTo(2);
    tap(key('ぱ'));
    expect(shown()).toBe('きょうはぱ');
    expect(textOf()).toBe('きょうはぱ');
  });

  it('ページを切り替えても文章とカーソルが残る', () => {
    render(<App />);
    typeSeion('あいう');
    act(() => {
      fireEvent.keyDown(screen.getByTestId('text-display'), { key: 'ArrowLeft' });
    });
    pageTo(2);
    pageTo(3);
    pageTo(1);
    tap(key('か'));
    expect(shown()).toBe('あいかう');
  });

  it('文の途中にカーソルを置いて「っ」を挿入できる', () => {
    render(<App />);
    typeSeion('きょうはたのしかた'.replace('ょ', ''));
    // きうはたのしかた の 「う」の前に「ょ」を入れ、「た」の前に「っ」を入れる
    const spans = () => Array.from(screen.getByTestId('text-display').querySelectorAll<HTMLElement>('[data-start]'));
    // 文字ごとに横に並んだ矩形を与えて、タップ位置からカーソルを決められるようにする
    const layout = () =>
      spans().forEach((el, i) => {
        el.getBoundingClientRect = () =>
          ({ left: i * 20, right: i * 20 + 20, top: 0, bottom: 30, width: 20, height: 30, x: i * 20, y: 0 }) as DOMRect;
      });
    layout();
    fireEvent.click(screen.getByTestId('text-display'), { clientX: 21, clientY: 10 }); // 2文字目の左側
    pageTo(3);
    tap(key('ちいさい よ'));
    layout();
    fireEvent.click(screen.getByTestId('text-display'), { clientX: 8 * 20 + 2, clientY: 10 }); // 最後の「た」の左側
    tap(key('ちいさい つ'));
    expect(shown()).toBe('きょうはたのしかった');
  });

  it('1文字削除・全文削除（確認あり）・元に戻すが動く', () => {
    render(<App />);
    typeSeion('はなし');
    fireEvent.click(screen.getByRole('button', { name: '1文字けす' }));
    expect(shown()).toBe('はな');
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶけす' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'やめる' }));
    expect(shown()).toBe('はな');
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶけす' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'ぜんぶけす' }));
    expect(shown()).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    expect(shown()).toBe('はな');
  });

  it('文字を押しても音は出ず、発声で文章全体を読み上げ、文章は残る', () => {
    render(<App />);
    typeSeion('はなしたい');
    expect(synth.spoken).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.map((u) => u.text)).toEqual(['はなしたい', 'はなしたい']);
    expect(synth.active).toHaveLength(1);
    expect(shown()).toBe('はなしたい');
    // 2回目の「はっせい」は前の発声を止めてから読み直す
    expect(synth.cancelCount).toBeGreaterThanOrEqual(1);
    // 読み終わったあとも、もう一度発声できる
    synth.finish();
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.active).toHaveLength(1);
    expect(synth.spoken).toHaveLength(3);
  });

  it('メイン画面に「とめる」ボタンはない（停止は「はっせい」の押し直しで内部的に行う）', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: 'とめる' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'はっせい' })).toBeInTheDocument();
    for (const name of ['1文字けす', 'もどす', 'やりなおす', 'ぜんぶけす', 'よくつかう']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('文章が空のときは発声ボタンを押せない', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'はっせい' })).toBeDisabled();
  });

  it('スワイプでページが変わり、なぞったキーは入力されない', () => {
    render(<App />);
    swipe(key('な'), -120); // 左へ → 次
    expect(screen.getByRole('group', { name: /2ページ目/ })).toBeInTheDocument();
    expect(shown()).toBe('');
    swipe(key('だ'), 120); // 右へ → 前
    expect(screen.getByRole('group', { name: /1ページ目/ })).toBeInTheDocument();
    expect(shown()).toBe('');
  });

  const current = () => screen.getByRole('group', { name: /ページ目/ }).getAttribute('aria-label');

  it('左スワイプは ①→②→③→① と循環し、なぞっても文字は入らない', () => {
    render(<App />);
    const seen = [current()];
    for (const k of ['な', 'だ', 'ちいさい あ']) {
      swipe(key(k), -120);
      seen.push(current());
    }
    expect(seen).toEqual([
      '1ページ目 せいおん（きほんの文字）',
      '2ページ目 だくおん・はんだくおん',
      '3ページ目 ちいさい文字・きごう',
      '1ページ目 せいおん（きほんの文字）',
    ]);
    expect(shown()).toBe('');
  });

  it('右スワイプは ①→③→②→① と循環する', () => {
    render(<App />);
    const seen = [current()];
    for (const k of ['な', 'ちいさい あ', 'だ']) {
      swipe(key(k), 120);
      seen.push(current());
    }
    expect(seen.map((s) => s![0])).toEqual(['1', '3', '2', '1']);
    expect(shown()).toBe('');
  });

  it('「まえ」「つぎ」ボタンも循環し、ページ表示・点・文章・カーソルが保たれる', () => {
    render(<App />);
    typeSeion('あい');
    const next = screen.getByRole('button', { name: 'つぎの文字盤' });
    const prev = screen.getByRole('button', { name: 'まえの文字盤' });
    expect(prev).toBeEnabled();
    fireEvent.click(prev);
    expect(current()).toMatch(/^3ページ目/);
    expect(screen.getByRole('button', { name: /^3ページ目/ })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(next);
    expect(current()).toMatch(/^1ページ目/);
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(current()).toMatch(/^1ページ目/);
    expect(screen.getByRole('button', { name: /^1ページ目/ })).toHaveAttribute('aria-current', 'page');
    tap(key('う'));
    expect(shown()).toBe('あいう');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.draft)!)).toMatchObject({ cursor: 3, page: 0 });
  });

  it('押し始めと違うキーで click が起きても入力しない／指が少しぶれても入力する', () => {
    render(<App />);
    fireEvent.pointerDown(key('あ'), { pointerId: 3, isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(key('い'), { pointerId: 3, isPrimary: true, clientX: 12, clientY: 12 });
    fireEvent.click(key('い'), { detail: 1 });
    expect(shown()).toBe('');
    fireEvent.pointerDown(key('あ'), { pointerId: 4, isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(key('あ'), { pointerId: 4, isPrimary: true, clientX: 16, clientY: 14 });
    fireEvent.click(key('あ'), { detail: 1 });
    expect(shown()).toBe('あ');
  });

  it('1回のタップで1文字だけ入る（二重入力しない）。キーボード操作でも入力できる', () => {
    render(<App />);
    tap(key('こ'));
    expect(shown()).toBe('こ');
    fireEvent.click(key('こ'), { detail: 0 }); // Enter / Space による操作
    expect(shown()).toBe('ここ');
  });

  it('空白・改行・小文字・記号を入力できる', () => {
    render(<App />);
    pageTo(3);
    for (const name of ['ちいさい あ', 'ちいさい つ', '空白', 'はてな', '改行', 'のばす（長音）', 'まる（句点）']) tap(key(name));
    expect(textOf()).toBe('ぁっ ？\nー。');
  });

  it('連続入力防止を設定すると、同じキーの素早い2回目を無視する', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ repeatGuardMs: 600 }));
    render(<App />);
    tap(key('あ'));
    tap(key('あ'));
    tap(key('い'));
    expect(shown()).toBe('あい');
  });

  it('再起動しても入力中の文章・カーソル・ページが戻り、会話履歴は作らない', () => {
    const { unmount } = render(<App />);
    typeSeion('はい');
    pageTo(2);
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    unmount();
    render(<App />);
    expect(shown()).toBe('はい');
    expect(screen.getByRole('group', { name: /2ページ目/ })).toBeInTheDocument();
    const keys = Object.keys(localStorage).sort();
    // 自動登録の学習記録は「文章ごとの回数」だけで、日時や発声の一覧は持たない
    expect(keys).toEqual([STORAGE_KEYS.draft, STORAGE_KEYS.favorites, STORAGE_KEYS.settings, LEARNING_KEY].sort());
    // 「はい」は初期の「よくつかう」に入っているので、回数は数えない
    expect(JSON.parse(localStorage.getItem(LEARNING_KEY)!)).toEqual({ version: 1, counts: {}, nextSeq: 1, dismissed: [] });
    expect(JSON.stringify(localStorage)).not.toMatch(/history|log/i);
  });
});

describe('よくつかう言葉', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'よくつかう' }));
  const dialog = () => screen.getByRole('dialog', { name: 'よくつかう言葉' });

  it('タップですぐ発声し、入力中の文章はそのまま', () => {
    render(<App />);
    typeSeion('あ');
    open();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ありがとうございます' }));
    expect(synth.spoken.at(-1)?.text).toBe('ありがとうございます');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'とじる' }));
    expect(shown()).toBe('あ');
  });

  it('いまの文章を登録・なおす・並べかえ・けすができ、保存される', () => {
    render(<App />);
    typeSeion('みす');
    open();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'いまの文章を登録' }));
    expect(within(dialog()).getByRole('button', { name: 'みす' })).toBeInTheDocument();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'へんしゅう' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: '「みす」をなおす' }));
    fireEvent.change(within(dialog()).getByRole('textbox', { name: '言葉をなおす' }), { target: { value: 'お水' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ほぞん' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: '「いいえ」を上へ' }));

    fireEvent.click(within(dialog()).getByRole('button', { name: '「ちがいます」をけす' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'けす' }));

    const saved = (JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites)!) as { text: string }[]).map((f) => f.text);
    expect(saved).toEqual([
      'いいえ',
      'はい',
      'ありがとうございます',
      'もういちどおねがいします',
      'すこしまってください',
      'てつだってください',
      'わかりません',
      'お水',
    ]);
    // 編集中は発声しない
    expect(synth.spoken).toHaveLength(0);
  });

  it('新しい言葉をキーボードで追加できる', () => {
    render(<App />);
    open();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'へんしゅう' }));
    fireEvent.change(within(dialog()).getByLabelText(/新しい言葉/), { target: { value: 'トイレにいきたい' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ついか' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'へんしゅう中' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'トイレにいきたい' }));
    expect(synth.spoken.at(-1)?.text).toBe('トイレにいきたい');
  });
});

describe('音声の設定', () => {
  it('端末内の日本語音声がないときは話さず、理由を表示する', () => {
    synth.voiceList = [];
    synth.voiceList.push({ name: 'Google 日本語', lang: 'ja-JP', localService: false, voiceURI: 'g', default: false } as SpeechSynthesisVoice);
    render(<App />);
    typeSeion('はい');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent('端末内の日本語の声が見つかりません');
  });

  it('速さを変えると保存され、発声に反映される', () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
    fireEvent.click(screen.getByRole('radio', { name: 'ゆっくり' }));
    fireEvent.click(screen.getByRole('button', { name: 'ためしにきく' }));
    expect(synth.spoken.at(-1)?.rate).toBe(0.6);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!).rate).toBe('slow');
  });
});

describe('男性・女性の声の選択', () => {
  const openSettings = () => fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
  const dialog = () => screen.getByRole('dialog', { name: 'せってい' });

  it('男性・女性・性別不明に分けて表示し、試聴・選択・保存ができる', () => {
    synth.voiceList = [...IOS_JA_VOICES, { name: 'Google 日本語', lang: 'ja-JP', localService: false, voiceURI: 'g', default: false } as SpeechSynthesisVoice];
    const { unmount } = render(<App />);
    openSettings();
    const d = within(dialog());
    expect(d.getByRole('heading', { name: '男性の声' })).toBeInTheDocument();
    expect(d.getByRole('heading', { name: '女性の声' })).toBeInTheDocument();
    // 端末内の声だけを表示する（オンラインの声は許可するまで出さない）。英語の声も出さない
    expect(d.queryByText('Google 日本語')).not.toBeInTheDocument();
    expect(d.queryByText('Samantha')).not.toBeInTheDocument();
    expect(d.getByText(/使える日本語の声：7件/)).toBeInTheDocument();
    expect(d.queryByText(/男性の日本語の声が見つかりません/)).not.toBeInTheDocument();

    // 選択を変えずに男女それぞれを試聴できる
    fireEvent.click(d.getByRole('button', { name: 'Otoyaを試聴' }));
    expect(synth.spoken.at(-1)?.voice?.name).toBe('Otoya');
    fireEvent.click(d.getByRole('button', { name: 'Kyokoを試聴' }));
    expect(synth.spoken.at(-1)?.voice?.name).toBe('Kyoko');
    expect(synth.spoken.every((u) => u.pitch === 1)).toBe(true);
    // 既定は高品質の声
    expect(d.getByRole('radio', { name: /Kyoko（拡張）/ })).toBeChecked();

    fireEvent.click(d.getByRole('radio', { name: /^Otoya（拡張）/ }));
    fireEvent.click(d.getByRole('radio', { name: 'ふつう' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!)).toMatchObject({
      voiceURI: 'com.apple.voice.enhanced.ja-JP.Otoya',
      rate: 'normal',
    });
    fireEvent.click(d.getByRole('button', { name: 'とじる' }));

    // 次回起動時にも選んだ声で話す
    unmount();
    render(<App />);
    typeSeion('はい');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'はい', rate: 0.95 });
    expect(synth.spoken.at(-1)?.voice?.name).toBe('Otoya（拡張）');
    openSettings();
    expect(within(dialog()).getByRole('radio', { name: /^Otoya（拡張）/ })).toBeChecked();

    // 女性の声へ戻せる
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^Kyoko（拡張）/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ためしにきく' }));
    expect(synth.spoken.at(-1)?.voice?.name).toBe('Kyoko（拡張）');
  });

  it('男性の声がないときは理由と端末の設定を案内し、名前が不明な声は分類しない', () => {
    synth.voiceList = [
      { name: 'Kyoko', lang: 'ja-JP', localService: true, voiceURI: 'k', default: false } as SpeechSynthesisVoice,
      { name: 'ja-jp-x-htm-local', lang: 'ja-JP', localService: true, voiceURI: 'x', default: false } as SpeechSynthesisVoice,
    ];
    render(<App />);
    openSettings();
    const d = within(dialog());
    expect(d.queryByRole('heading', { name: '男性の声' })).not.toBeInTheDocument();
    expect(d.getByRole('heading', { name: /性別を判断できない声/ })).toBeInTheDocument();
    expect(d.getByText('男性の日本語の声が見つかりません。')).toBeInTheDocument();
    expect(d.getAllByText(/読み上げコンテンツ/).length).toBeGreaterThan(0);
    expect(d.getByText(/性別を判断できない声」の中に男性の声/)).toBeInTheDocument();
  });

  it('前に選んだ声が見つからないときは、その旨を表示して別の端末内の声を使う', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ voiceURI: 'com.apple.voice.compact.ja-JP.Otoya' }));
    synth.voiceList = [{ name: 'Kyoko', lang: 'ja-JP', localService: true, voiceURI: 'k', default: false } as SpeechSynthesisVoice];
    render(<App />);
    openSettings();
    expect(within(dialog()).getByText(/前に選んだ声がこの端末で見つからない/)).toBeInTheDocument();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'ためしにきく' }));
    expect(synth.spoken.at(-1)?.voice?.name).toBe('Kyoko');
  });
});

describe('端末の標準音声（自動）と音声の診断', () => {
  const openSettings = () => fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
  const dialog = () => within(screen.getByRole('dialog', { name: 'せってい' }));
  const settingsSaved = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!);
  // iPhone で「Kyoko（標準）しか表示されない」状態
  const onlyKyoko = () => {
    synth.voiceList = [
      { name: 'Kyoko', lang: 'ja-JP', localService: true, voiceURI: 'com.apple.voice.compact.ja-JP.Kyoko', default: true } as SpeechSynthesisVoice,
      { name: 'Samantha', lang: 'en-US', localService: true, voiceURI: 'com.apple.voice.compact.en-US.Samantha', default: false } as SpeechSynthesisVoice,
    ];
  };

  it('標準音声を選ぶと、声を指定せず ja-JP だけで話し、Kyoko に戻すこともできる', () => {
    onlyKyoko();
    const { unmount } = render(<App />);
    openSettings();
    const system = dialog().getByRole('radio', { name: /端末の標準音声（自動）/ });
    expect(system).not.toBeChecked();
    expect(dialog().getByRole('radio', { name: /^Kyoko/ })).toBeChecked();

    // 選択を変えずに、標準音声と Kyoko を聞き比べる
    fireEvent.click(dialog().getByRole('button', { name: '端末の標準音声（自動）を試聴' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'こんにちは。こえのわです。', lang: 'ja-JP', voice: null, pitch: 1 });
    fireEvent.click(dialog().getByRole('button', { name: 'Kyokoを試聴' }));
    expect(synth.spoken.at(-1)?.voice?.name).toBe('Kyoko');
    expect(synth.active).toHaveLength(1);

    fireEvent.click(system);
    expect(settingsSaved()).toMatchObject({ voiceMode: 'system' });
    expect(dialog().getByText(/いまの声：端末の標準音声（自動）/)).toBeInTheDocument();
    fireEvent.click(dialog().getByRole('button', { name: 'とじる' }));

    // 通常の発声・停止・再発声
    typeSeion('ねる');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'ねる', lang: 'ja-JP', voice: null });
    const cancels = synth.cancelCount;
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.cancelCount).toBe(cancels + 1);
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'ねる', voice: null });
    expect(synth.active).toHaveLength(1);

    // 再起動しても標準音声のまま
    unmount();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'ねる', voice: null });

    // Kyoko に戻すと、Kyoko を指定して話す
    openSettings();
    expect(dialog().getByRole('radio', { name: /端末の標準音声（自動）/ })).toBeChecked();
    fireEvent.click(dialog().getByRole('radio', { name: /^Kyoko/ }));
    expect(settingsSaved()).toMatchObject({ voiceMode: 'specific', voiceURI: 'com.apple.voice.compact.ja-JP.Kyoko' });
    fireEvent.click(dialog().getByRole('button', { name: 'とじる' }));
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)?.voice?.name).toBe('Kyoko');
  });

  it('以前の設定（voiceMode なし）は、これまでどおり選んだ声で話す', () => {
    synth.voiceList = [...IOS_JA_VOICES];
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ voiceURI: 'com.apple.voice.compact.ja-JP.Otoya', rate: 'slow', allowOnlineVoices: false, repeatGuardMs: 0 }),
    );
    render(<App />);
    typeSeion('はい');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)?.voice?.name).toBe('Otoya');
    expect(synth.spoken.at(-1)?.rate).toBe(0.6);
    openSettings();
    expect(dialog().getByRole('radio', { name: /端末の標準音声（自動）/ })).not.toBeChecked();
  });

  it('日本語のオンラインの声がある環境では、標準音声は選べず話さない', () => {
    synth.voiceList = [
      { name: 'Kyoko', lang: 'ja-JP', localService: true, voiceURI: 'k', default: false } as SpeechSynthesisVoice,
      { name: 'Google 日本語', lang: 'ja-JP', localService: false, voiceURI: 'g', default: true } as SpeechSynthesisVoice,
    ];
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ voiceMode: 'system' }));
    render(<App />);
    typeSeion('はい');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent('オンラインの声になるおそれ');
    openSettings();
    expect(dialog().getByRole('radio', { name: /端末の標準音声（自動）/ })).toBeDisabled();
    expect(dialog().getByRole('button', { name: '端末の標準音声（自動）を試聴' })).toBeDisabled();
  });

  it('診断は折りたたまれていて、開くと取得できた声の詳細を表示し、入力した文章は含まない', async () => {
    onlyKyoko();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<App />);
    typeSeion('ひみつ');
    openSettings();
    expect(screen.queryByTestId('voice-diagnostics')).not.toBeInTheDocument();
    const summary = dialog().getByText('音声の診断（確認用）');
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    details.open = true;
    fireEvent(details, new Event('toggle'));
    const out = screen.getByTestId('voice-diagnostics').textContent!;
    expect(out).toContain('取得した音声の総数: 2');
    expect(out).toContain('日本語音声の件数: 1');
    expect(out).toContain(
      '1. name=Kyoko | lang=ja-JP | voiceURI=com.apple.voice.compact.ja-JP.Kyoko | localService=true | default=true',
    );
    expect(out).toContain('name=Samantha | lang=en-US');
    expect(out).not.toContain('ひみつ');

    await act(async () => {
      fireEvent.click(dialog().getByRole('button', { name: 'コピー' }));
    });
    expect(writeText).toHaveBeenCalledWith(out);
    expect(dialog().getByText('コピーしました')).toBeInTheDocument();
  });
});

describe('読み上げの自然さの調整', () => {
  const openSettings = () => fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
  const settingsDialog = () => within(screen.getByRole('dialog', { name: 'せってい' }));
  const favDialog = () => within(screen.getByRole('dialog', { name: 'よくつかう言葉' }));
  const saved = (k: string) => JSON.parse(localStorage.getItem(k)!);
  const openDetails = (summary: string) => {
    const details = settingsDialog().getByText(summary).closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
  };

  it('よくつかう言葉に読み上げ用テキストを設定・試聴・保存でき、表示は変わらず、元の発声に戻せる', () => {
    localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([{ id: 'a', text: 'きょうはいいてんきです' }, { id: 'b', text: 'あめがふっています' }]));
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'よくつかう' }));
    // 以前のデータ（読み上げ用テキストなし）は、そのまま表示の文章を読む
    fireEvent.click(favDialog().getByRole('button', { name: 'あめがふっています' }));
    expect(synth.spoken.at(-1)?.text).toBe('あめがふっています');

    fireEvent.click(favDialog().getByRole('button', { name: 'へんしゅう' }));
    fireEvent.click(favDialog().getByRole('button', { name: '「きょうはいいてんきです」の読み方' }));
    const input = favDialog().getByLabelText(/読み上げ用テキスト（任意）/);
    fireEvent.change(input, { target: { value: '今日はいい天気です。' } });
    fireEvent.click(favDialog().getByRole('button', { name: '読み方で試聴' }));
    expect(synth.spoken.at(-1)?.text).toBe('今日はいい天気です。');
    fireEvent.click(favDialog().getByRole('button', { name: '元の文章で試聴' }));
    expect(synth.spoken.at(-1)?.text).toBe('きょうはいいてんきです');
    fireEvent.click(favDialog().getByRole('button', { name: 'ほぞん' }));
    expect(saved(STORAGE_KEYS.favorites)[0]).toEqual({ id: 'a', text: 'きょうはいいてんきです', speechText: '今日はいい天気です。' });
    expect(favDialog().getByText('読み上げ：今日はいい天気です。')).toBeInTheDocument();

    // 再起動後も残り、タップで読み上げ用テキストを読む。表示は元の文章のまま
    unmount();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'よくつかう' }));
    const btn = favDialog().getByRole('button', { name: /きょうはいいてんきです/ });
    expect(btn).toHaveTextContent('きょうはいいてんきです読み方あり');
    fireEvent.click(btn);
    expect(synth.spoken.at(-1)?.text).toBe('今日はいい天気です。');
    expect(shown()).toBe('');

    // 元の発声に戻す
    fireEvent.click(favDialog().getByRole('button', { name: 'へんしゅう' }));
    fireEvent.click(favDialog().getByRole('button', { name: '「きょうはいいてんきです」の読み方' }));
    fireEvent.click(favDialog().getByRole('button', { name: '元の発声に戻す' }));
    expect(saved(STORAGE_KEYS.favorites)[0]).toEqual({ id: 'a', text: 'きょうはいいてんきです' });
    fireEvent.click(favDialog().getByRole('button', { name: 'へんしゅう中' }));
    fireEvent.click(favDialog().getByRole('button', { name: 'きょうはいいてんきです' }));
    expect(synth.spoken.at(-1)?.text).toBe('きょうはいいてんきです');
  });

  it('読み上げ方式は従来が既定。調整ありに切り替えても標準音声のまま話し、いつでも従来に戻せる', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ voiceMode: 'system' }));
    render(<App />);
    typeSeion('といれにいきたい');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'といれにいきたい', voice: null, lang: 'ja-JP' });

    openSettings();
    openDetails('読み上げの比較（試験的）');
    expect(settingsDialog().getByRole('radio', { name: '従来（標準）' })).toBeChecked();
    // 入力中の文章で比較できる。読み上げに渡す文字列を表示する
    expect(screen.getByTestId('compare-plain')).toHaveTextContent('といれにいきたい');
    expect(screen.getByTestId('compare-adjusted')).toHaveTextContent('といれにいきたい。');
    fireEvent.click(settingsDialog().getByRole('button', { name: '従来で試聴' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'といれにいきたい', voice: null });
    fireEvent.click(settingsDialog().getByRole('button', { name: '調整ありで試聴' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'といれにいきたい。', voice: null });
    expect(synth.active).toHaveLength(1);
    // 比較の画面に「とめる」ボタンはない。別の試聴を押すと前の読み上げを止めてから読む
    expect(settingsDialog().queryByRole('button', { name: 'とめる' })).not.toBeInTheDocument();
    fireEvent.click(settingsDialog().getByRole('button', { name: '従来で試聴' }));
    expect(synth.active).toHaveLength(1);
    expect(synth.active[0].text).toBe('といれにいきたい');
    expect(saved(STORAGE_KEYS.settings).speechStyle).toBe('plain');

    fireEvent.click(settingsDialog().getByRole('radio', { name: '調整あり（試験的）' }));
    expect(saved(STORAGE_KEYS.settings)).toMatchObject({ speechStyle: 'adjusted', voiceMode: 'system' });
    fireEvent.click(settingsDialog().getByRole('button', { name: 'とじる' }));
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'といれにいきたい。', voice: null, lang: 'ja-JP', pitch: 1 });
    expect(shown()).toBe('といれにいきたい');

    openSettings();
    openDetails('読み上げの比較（試験的）');
    fireEvent.click(settingsDialog().getByRole('radio', { name: '従来（標準）' }));
    fireEvent.click(settingsDialog().getByRole('button', { name: 'とじる' }));
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)?.text).toBe('といれにいきたい');
  });

  it('比較では、読み上げ用テキストを設定したよくつかう言葉も聞き比べられる', () => {
    localStorage.setItem(
      STORAGE_KEYS.favorites,
      JSON.stringify([{ id: 'a', text: 'あめがふっています', speechText: '雨が降っています。' }]),
    );
    render(<App />);
    openSettings();
    openDetails('読み上げの比較（試験的）');
    fireEvent.change(settingsDialog().getByRole('combobox', { name: '比べる文章' }), { target: { value: 'fav-a' } });
    expect(screen.getByTestId('compare-speech-text')).toHaveTextContent('雨が降っています。');
    fireEvent.click(settingsDialog().getByRole('button', { name: '読み上げ用テキストで試聴' }));
    expect(synth.spoken.at(-1)?.text).toBe('雨が降っています。');
    fireEvent.click(settingsDialog().getByRole('button', { name: '従来で試聴' }));
    expect(synth.spoken.at(-1)?.text).toBe('あめがふっています');
  });

  it('速さをこまかく調整して保存でき、比較用の試聴では設定を変えず、プリセットに戻せる', () => {
    const { unmount } = render(<App />);
    openSettings();
    fireEvent.click(settingsDialog().getByRole('button', { name: 'はやさ 0.85 で試聴' }));
    expect(synth.spoken.at(-1)?.rate).toBe(0.85);
    expect(saved(STORAGE_KEYS.settings).rateValue).toBeNull();

    fireEvent.change(settingsDialog().getByRole('slider', { name: 'はやさをこまかく調整' }), { target: { value: '0.9' } });
    expect(saved(STORAGE_KEYS.settings).rateValue).toBe(0.9);
    expect(settingsDialog().getByRole('radio', { name: 'ふつう' })).not.toBeChecked();
    fireEvent.click(settingsDialog().getByRole('button', { name: 'とじる' }));
    unmount();
    render(<App />);
    typeSeion('はい');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)?.rate).toBe(0.9);

    openSettings();
    fireEvent.click(settingsDialog().getByRole('button', { name: 'ゆっくり／ふつう／はやめ に戻す' }));
    expect(saved(STORAGE_KEYS.settings).rateValue).toBeNull();
    expect(settingsDialog().getByRole('radio', { name: 'ふつう' })).toBeChecked();
    fireEvent.click(settingsDialog().getByRole('radio', { name: 'ゆっくり' }));
    fireEvent.click(settingsDialog().getByRole('button', { name: 'ためしにきく' }));
    expect(synth.spoken.at(-1)?.rate).toBe(0.6);
  });
});

describe('はやさの設定', () => {
  it('ゆっくりは 0.6、ふつう・はやめは従来どおり。端末の標準音声でも反映され、保存される', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ voiceMode: 'system' }));
    const { unmount } = render(<App />);
    typeSeion('はい');
    const dialog = () => within(screen.getByRole('dialog', { name: 'せってい' }));
    const expected: [string, number][] = [
      ['ゆっくり', 0.6],
      ['ふつう', 0.95],
      ['はやめ', 1.15],
    ];
    for (const [label, rate] of expected) {
      fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
      fireEvent.click(dialog().getByRole('radio', { name: label }));
      // 「ためしにきく」の横に「とめる」はない
      expect(dialog().queryByRole('button', { name: 'とめる' })).not.toBeInTheDocument();
      fireEvent.click(dialog().getByRole('button', { name: 'ためしにきく' }));
      expect(synth.spoken.at(-1)).toMatchObject({ text: 'こんにちは。こえのわです。', rate, voice: null, lang: 'ja-JP' });
      fireEvent.click(dialog().getByRole('button', { name: 'とじる' }));
      fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
      expect(synth.spoken.at(-1)).toMatchObject({ text: 'はい', rate, voice: null });
      expect(synth.active).toHaveLength(1);
    }
    fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
    fireEvent.click(dialog().getByRole('radio', { name: 'ゆっくり' }));
    unmount();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)).toMatchObject({ rate: 0.6, voice: null });
  });

  it('よくつかう言葉の「とめる」と発声は、これまでどおり使える', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'よくつかう' }));
    const fav = within(screen.getByRole('dialog', { name: 'よくつかう言葉' }));
    fireEvent.click(fav.getByRole('button', { name: 'はい' }));
    fireEvent.click(fav.getByRole('button', { name: 'いいえ' }));
    expect(synth.active).toHaveLength(1);
    expect(synth.active[0].text).toBe('いいえ');
    fireEvent.click(fav.getByRole('button', { name: 'とめる' }));
    expect(synth.active).toHaveLength(0);
  });
});

describe('よく使う言葉の自動登録', () => {
  const learn = () => JSON.parse(localStorage.getItem(LEARNING_KEY) ?? '{"counts":{}}');
  const count = (t: string) => learn().counts[t]?.count ?? 0;
  const favs = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites)!) as { text: string; auto?: boolean; speechText?: string }[];
  const speakBtn = () => screen.getByRole('button', { name: 'はっせい' });
  const clearAll = () => {
    const btn = screen.getByRole('button', { name: 'ぜんぶけす' });
    if ((btn as HTMLButtonElement).disabled) return;
    fireEvent.click(btn);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'ぜんぶけす' }));
  };
  /** 文章を消して、入力し直して、発声する（1回分） */
  const freshSpeak = (t = 'ねむい') => {
    clearAll();
    typeSeion(t);
    fireEvent.click(speakBtn());
  };

  it('入力して発声すると1回。同じ入力のまま何度発声しても1回のまま', () => {
    render(<App />);
    freshSpeak();
    expect(count('ねむい')).toBe(1);
    for (let i = 0; i < 9; i++) fireEvent.click(speakBtn());
    expect(count('ねむい')).toBe(1);
    expect(synth.spoken).toHaveLength(10);
  });

  it('消して入力し直して発声すると増え、10回目で「よくつかう」に登録してお知らせを出す。二重登録はしない', () => {
    render(<App />);
    for (let i = 1; i <= 9; i++) {
      freshSpeak();
      expect(count('ねむい')).toBe(i);
    }
    expect(favs().some((f) => f.text === 'ねむい')).toBe(false);
    freshSpeak();
    expect(favs().filter((f) => f.text === 'ねむい')).toEqual([expect.objectContaining({ text: 'ねむい', auto: true })]);
    expect(screen.getByText('『ねむい』を よくつかう に とうろくしました')).toBeInTheDocument();
    expect(count('ねむい')).toBe(0);
    for (let i = 0; i < 12; i++) freshSpeak();
    expect(favs().filter((f) => f.text === 'ねむい')).toHaveLength(1);
    // 既存の「よくつかう」も残っている
    expect(favs()[0].text).toBe('はい');
  });

  it('入力しただけ・カーソル移動・元に戻す／やり直す・同じ文字の付け足しと削除では数えない', () => {
    render(<App />);
    typeSeion('ねむい');
    expect(count('ねむい')).toBe(0);
    fireEvent.click(speakBtn());
    expect(count('ねむい')).toBe(1);
    fireEvent.keyDown(screen.getByTestId('text-display'), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByTestId('text-display'), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    fireEvent.click(screen.getByRole('button', { name: 'やりなおす' }));
    fireEvent.click(speakBtn());
    tap(key('あ'));
    fireEvent.click(screen.getByRole('button', { name: '1文字けす' }));
    fireEvent.click(speakBtn());
    expect(count('ねむい')).toBe(1);
    // 別の文章に編集して入力すれば、その文章として数える
    tap(key('な'));
    fireEvent.click(speakBtn());
    expect(count('ねむいな')).toBe(1);
  });

  it('よくつかう・試聴・比較・速さの変更からの発声は数えない', () => {
    localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([{ id: 'a', text: 'ねむい' }, { id: 'b', text: 'おなか' }]));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'よくつかう' }));
    const fav = within(screen.getByRole('dialog', { name: 'よくつかう言葉' }));
    for (let i = 0; i < 12; i++) fireEvent.click(fav.getByRole('button', { name: 'おなか' }));
    fireEvent.click(fav.getByRole('button', { name: 'とじる' }));
    typeSeion('おなか');
    fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
    const set = within(screen.getByRole('dialog', { name: 'せってい' }));
    fireEvent.click(set.getByRole('radio', { name: 'はやめ' }));
    fireEvent.click(set.getByRole('button', { name: 'ためしにきく' }));
    const details = set.getByText('読み上げの比較（試験的）').closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    fireEvent.click(set.getByRole('button', { name: '従来で試聴' }));
    fireEvent.click(set.getByRole('button', { name: 'つかわない（とてもゆっくり）で試聴' }));
    fireEvent.click(set.getByRole('button', { name: 'とじる' }));
    expect(learn().counts).toEqual({});
  });

  it('手動で登録ずみの言葉は数えず、読み上げ用テキストも上書きしない', () => {
    localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([{ id: 'a', text: 'ねむい', speechText: '眠い。' }]));
    render(<App />);
    for (let i = 0; i < 12; i++) freshSpeak();
    expect(favs()).toEqual([{ id: 'a', text: 'ねむい', speechText: '眠い。' }]);
    expect(count('ねむい')).toBe(0);
  });

  it('再起動しても回数を引き継ぐ。保存から戻した文章をそのまま発声しても数えない', () => {
    const { unmount } = render(<App />);
    for (let i = 0; i < 3; i++) freshSpeak();
    expect(count('ねむい')).toBe(3);
    unmount();
    render(<App />);
    expect(shown()).toBe('ねむい');
    fireEvent.click(speakBtn());
    fireEvent.click(speakBtn());
    expect(count('ねむい')).toBe(3);
    freshSpeak();
    expect(count('ねむい')).toBe(4);
  });

  it('自動登録をオフにすると数えない。オンに戻すと続きから数える', () => {
    render(<App />);
    freshSpeak();
    fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
    const set = within(screen.getByRole('dialog', { name: 'せってい' }));
    const toggle = set.getByRole('checkbox', { name: /よく使う言葉を自動登録/ });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!).autoFavorite).toBe(false);
    fireEvent.click(set.getByRole('button', { name: 'とじる' }));
    for (let i = 0; i < 12; i++) freshSpeak();
    expect(count('ねむい')).toBe(1);
    expect(favs().some((f) => f.text === 'ねむい')).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'せってい' })).getByRole('checkbox', { name: /よく使う言葉を自動登録/ }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'せってい' })).getByRole('button', { name: 'とじる' }));
    freshSpeak();
    expect(count('ねむい')).toBe(2);
  });

  it('自動登録した言葉を消すと、勝手に登録しなおさない。手動で登録すれば元に戻る', () => {
    render(<App />);
    for (let i = 0; i < 10; i++) freshSpeak();
    expect(favs().some((f) => f.text === 'ねむい' && f.auto)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'よくつかう' }));
    const fav = () => within(screen.getByRole('dialog', { name: 'よくつかう言葉' }));
    fireEvent.click(fav().getByRole('button', { name: 'へんしゅう' }));
    expect(fav().getByText('自動で登録した言葉')).toBeInTheDocument();
    fireEvent.click(fav().getByRole('button', { name: '「ねむい」をけす' }));
    expect(screen.getByText('けした言葉は、自動では登録しなおしません。')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'けす' }));
    fireEvent.click(fav().getByRole('button', { name: 'とじる' }));
    expect(learn().dismissed).toEqual(['ねむい']);
    for (let i = 0; i < 15; i++) freshSpeak();
    expect(favs().some((f) => f.text === 'ねむい')).toBe(false);
    expect(count('ねむい')).toBe(0);
    // 手動で登録し直すと、記録から外れる
    fireEvent.click(screen.getByRole('button', { name: 'よくつかう' }));
    fireEvent.click(fav().getByRole('button', { name: 'いまの文章を登録' }));
    expect(learn().dismissed).toEqual([]);
    expect(favs().filter((f) => f.text === 'ねむい')).toEqual([expect.not.objectContaining({ auto: true })]);
  });

  it('学習記録の消去は確認してから行い、「よくつかう」は消さない', () => {
    render(<App />);
    for (let i = 0; i < 10; i++) freshSpeak();
    for (let i = 0; i < 3; i++) freshSpeak('おなか');
    const before = favs();
    fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
    const set = within(screen.getByRole('dialog', { name: 'せってい' }));
    expect(set.getByText('回数を記録している言葉：1件（この端末の中だけに保存しています）')).toBeInTheDocument();
    fireEvent.click(set.getByRole('button', { name: '自動登録の学習記録を消去' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'やめる' }));
    expect(count('おなか')).toBe(3);
    fireEvent.click(set.getByRole('button', { name: '自動登録の学習記録を消去' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '消去する' }));
    expect(learn().counts).toEqual({});
    expect(set.getByText('学習記録を消去しました')).toBeInTheDocument();
    expect(favs()).toEqual(before);
  });
});

describe('とてもゆっくり', () => {
  const openSettings = () => fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
  const set = () => within(screen.getByRole('dialog', { name: 'せってい' }));

  it('4段階の順番。とてもゆっくりは 0.35 で、ほかの速さは変わらず、保存され、標準音声のまま話す', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ voiceMode: 'system' }));
    const { unmount } = render(<App />);
    openSettings();
    const radios = set()
      .getAllByRole('radio')
      .filter((r) => (r as HTMLInputElement).name === 'rate')
      .map((r) => r.parentElement!.textContent);
    expect(radios).toEqual(['とてもゆっくり', 'ゆっくり', 'ふつう', 'はやめ']);
    fireEvent.click(set().getByRole('radio', { name: 'とてもゆっくり' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!)).toMatchObject({ rate: 'veryslow', syllableSep: 'off' });
    fireEvent.click(set().getByRole('button', { name: 'とじる' }));
    typeSeion('ねむい');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    // 初期は区切らない（文章全体を1回で、速さだけ遅く）
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'ねむい', rate: 0.35, voice: null, lang: 'ja-JP', pitch: 1 });
    unmount();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)).toMatchObject({ rate: 0.35, voice: null });
  });

  it('「一音ずつはっきり」を選ぶと読み上げ用の文字列だけ区切り、区切れない文は通常どおり。ほかの速さでは使わない', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ voiceMode: 'system', rate: 'veryslow' }));
    render(<App />);
    openSettings();
    const details = set().getByText('一音ずつはっきり（試験的）').closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(screen.getByTestId('syllable-off')).toHaveTextContent('ありがとう');
    expect(screen.getByTestId('syllable-comma')).toHaveTextContent('あ、り、が、と、う');
    expect(screen.getByTestId('syllable-space')).toHaveTextContent('あ り が と う');
    fireEvent.click(set().getByRole('button', { name: '「、」で区切る（とてもゆっくり）で試聴' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'あ、り、が、と、う', rate: 0.35, voice: null });
    fireEvent.click(set().getByRole('button', { name: 'つかわない（とてもゆっくり）で試聴' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'ありがとう', rate: 0.35 });
    expect(synth.active).toHaveLength(1);
    fireEvent.change(set().getByRole('combobox', { name: '比べる言葉' }), { target: { value: 'しゃしんをみせて' } });
    expect(screen.getByTestId('syllable-comma')).toHaveTextContent('しゃ、しん、を、み、せ、て');
    fireEvent.change(set().getByRole('combobox', { name: '比べる言葉' }), { target: { value: 'こんにちは' } });
    expect(screen.getByTestId('syllable-comma')).toHaveTextContent(/^こんにちは$/);

    fireEvent.click(set().getByRole('radio', { name: '「、」で区切る' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!).syllableSep).toBe('comma');
    fireEvent.click(set().getByRole('button', { name: 'とじる' }));
    typeSeion('ねむい');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'ね、む、い', rate: 0.35, voice: null });
    expect(shown()).toBe('ねむい');
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶけす' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'ぜんぶけす' }));
    typeSeion('こんにちは');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)?.text).toBe('こんにちは');

    // ほかの速さでは区切らない
    openSettings();
    fireEvent.click(set().getByRole('radio', { name: 'ゆっくり' }));
    fireEvent.click(set().getByRole('button', { name: 'とじる' }));
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶけす' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'ぜんぶけす' }));
    typeSeion('ねむい');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'ねむい', rate: 0.6 });
  });
});

describe('文字を押したときに声を出す', () => {
  const enable = () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
    const set = within(screen.getByRole('dialog', { name: 'せってい' }));
    const box = set.getByRole('checkbox', { name: /文字を押したときに声を出す/ });
    fireEvent.click(box);
    fireEvent.click(set.getByRole('button', { name: 'とじる' }));
  };
  const spokenTexts = () => synth.spoken.map((u) => u.text);
  const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!);

  it('初期はオフで、文字を押しても音は出ない（入力はできる）', () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole('button', { name: 'せってい' })[0]);
    const box = within(screen.getByRole('dialog', { name: 'せってい' })).getByRole('checkbox', {
      name: /文字を押したときに声を出す/,
    });
    expect(box).not.toBeChecked();
    expect(screen.getByText('文字盤の文字を押すたびに、その文字を読み上げます。')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'せってい' })).getByRole('button', { name: 'とじる' }));
    typeSeion('あいす');
    expect(shown()).toBe('あいす');
    expect(synth.spoken).toHaveLength(0);
  });

  it('オンにすると押した文字だけを読み、「はっせい」で文章全体を読む。設定は再起動後も残る', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ voiceMode: 'system', rate: 'veryslow' }));
    const { unmount } = render(<App />);
    enable();
    expect(saved().keyEcho).toBe(true);
    for (const ch of ['あ', 'い', 'す']) {
      tap(key(ch));
      synth.finish();
    }
    expect(shown()).toBe('あいす');
    expect(spokenTexts()).toEqual(['あ', 'い', 'す']);
    // 文字は「ふつう」の速さ・端末の標準音声。文章の速さ（とてもゆっくり）は変わらない
    expect(synth.spoken.every((u) => u.rate === 0.95 && u.voice === null && u.lang === 'ja-JP')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'あいす', rate: 0.35, voice: null });
    unmount();
    render(<App />);
    tap(key('か'));
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'か', rate: 0.95 });
  });

  it('続けて押しても文字は欠けず、声は重ならない。「はっせい」は文字の読み上げより優先する', () => {
    render(<App />);
    enable();
    for (const ch of ['あ', 'い', 'す', 'か', 'き', 'く']) tap(key(ch));
    expect(shown()).toBe('あいすかきく');
    expect(synth.active.length).toBeLessThanOrEqual(2);
    expect(synth.active.at(-1)?.text).toBe('く');
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(synth.active.map((u) => u.text)).toEqual(['あいすかきく']);
  });

  it('濁音・半濁音・小文字は読み、記号・空白・改行は読まない', () => {
    render(<App />);
    enable();
    pageTo(2);
    tap(key('が'));
    tap(key('ぱ'));
    pageTo(3);
    for (const name of ['ちいさい よ', 'ちいさい つ', 'まる（句点）', 'てん（読点）', 'はてな', 'びっくり', 'のばす（長音）', '空白', '改行']) {
      tap(key(name));
      synth.finish();
    }
    expect(spokenTexts()).toEqual(['が', 'ぱ', 'ょ', 'っ']);
    expect(textOf()).toBe('がぱょっ。、？！ー \n');
  });

  it('なぞり・ページ切り替え・削除・全文削除・もどす・やりなおすでは声を出さない', () => {
    render(<App />);
    enable();
    tap(key('あ'));
    synth.finish();
    const before = synth.spoken.length;
    swipe(key('な'), -120);
    swipe(key('だ'), 120);
    fireEvent.click(screen.getByRole('button', { name: 'つぎの文字盤' }));
    fireEvent.click(screen.getByRole('button', { name: 'まえの文字盤' }));
    pageTo(1);
    fireEvent.click(screen.getByRole('button', { name: 'もどす' }));
    fireEvent.click(screen.getByRole('button', { name: 'やりなおす' }));
    fireEvent.click(screen.getByRole('button', { name: '1文字けす' }));
    tap(key('い'));
    synth.finish();
    fireEvent.click(screen.getByRole('button', { name: 'ぜんぶけす' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'ぜんぶけす' }));
    expect(synth.spoken.slice(before).map((u) => u.text)).toEqual(['い']);
    expect(shown()).toBe('');
  });

  it('連続入力防止で受け付けなかったタップでは声を出さない', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ repeatGuardMs: 600, keyEcho: true }));
    render(<App />);
    tap(key('あ'));
    tap(key('あ'));
    tap(key('い'));
    expect(shown()).toBe('あい');
    expect(spokenTexts()).toEqual(['あ', 'い']);
  });

  it('オフにすると残っている文字の読み上げを止め、以後は音を出さない', () => {
    render(<App />);
    enable();
    tap(key('あ'));
    tap(key('い'));
    expect(synth.active).toHaveLength(2);
    enable(); // もう一度押してオフ
    expect(saved().keyEcho).toBe(false);
    expect(synth.active).toHaveLength(0);
    const before = synth.spoken.length;
    tap(key('う'));
    expect(synth.spoken).toHaveLength(before);
  });

  it('文字ごとの読み上げは自動登録の回数に数えない。「はっせい」は従来どおり数える', () => {
    render(<App />);
    enable();
    for (const ch of ['ね', 'む', 'い']) {
      tap(key(ch));
      synth.finish();
    }
    expect(spokenTexts()).toEqual(['ね', 'む', 'い']);
    expect(JSON.parse(localStorage.getItem(LEARNING_KEY) ?? '{"counts":{}}').counts).toEqual({});
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(JSON.parse(localStorage.getItem(LEARNING_KEY)!).counts['ねむい'].count).toBe(1);
    // 同じ入力のまま、文字を押さずに「はっせい」を押しても増えない
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
    expect(JSON.parse(localStorage.getItem(LEARNING_KEY)!).counts['ねむい'].count).toBe(1);
  });
});

describe('文字の読み上げに失敗しても入力できる', () => {
  it('音声エンジンが例外を出しても文字は入り、お知らせも出さない', () => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ keyEcho: true }));
    synth.speak = () => {
      throw new Error('boom');
    };
    render(<App />);
    typeSeion('あいす');
    expect(shown()).toBe('あいす');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('バージョン番号の表示', () => {
  it('ヘッダーの「こえのわ」の右に、package.json の version を「v」付きで表示する', () => {
    render(<App />);
    const title = screen.getByRole('heading', { level: 1, name: 'こえのわ' });
    const version = screen.getByLabelText(`バージョン ${pkg.version}`);
    expect(version).toHaveTextContent(`v${pkg.version}`);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    // タイトルのすぐ後ろ（同じヘッダーの中）にある
    expect(title.nextElementSibling).toBe(version);
    expect(version.closest('header')).toBe(title.closest('header'));
  });
});
