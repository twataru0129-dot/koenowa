import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';
import { Speaker } from './speech/speech';
import { setSpeakerForTesting } from './speech/useSpeech';
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
    fireEvent.click(screen.getByRole('button', { name: 'とめる' }));
    expect(synth.active).toHaveLength(0);
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
    expect(keys).toEqual([STORAGE_KEYS.draft, STORAGE_KEYS.favorites, STORAGE_KEYS.settings].sort());
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
    expect(synth.spoken.at(-1)?.rate).toBe(0.75);
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
    fireEvent.click(screen.getByRole('button', { name: 'とめる' }));
    expect(synth.active).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'はっせい' }));
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
    expect(synth.spoken.at(-1)?.rate).toBe(0.75);
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
