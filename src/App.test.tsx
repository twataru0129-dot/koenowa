import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';
import { Speaker } from './speech/speech';
import { setSpeakerForTesting } from './speech/useSpeech';
import { STORAGE_KEYS } from './state/storage';
import { FakeSynth, FakeUtterance } from './test/fakeSpeech';

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
    swipe(key('あ'), 120); // 最初のページでさらに右へ → そのまま
    expect(screen.getByRole('group', { name: /1ページ目/ })).toBeInTheDocument();
    expect(shown()).toBe('');
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
