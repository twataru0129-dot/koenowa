import { FakeSynth, FakeUtterance, fakeVoice, IOS_JA_VOICES } from '../test/fakeSpeech';
import {
  buildSpeechText,
  CHAR_QUEUE_MAX,
  listJapaneseVoices,
  pickVoice,
  Speaker,
  SYLLABLE_MAX_UNITS,
  systemVoiceAllowed,
  toSpeechText,
  toSyllableText,
  voiceGender,
  voiceQuality,
} from './speech';

const opts = { rate: 0.95, voiceURI: null, allowOnlineVoices: false };

function make(voices?: SpeechSynthesisVoice[]) {
  const synth = new FakeSynth(voices);
  const speaker = new Speaker(
    synth as unknown as SpeechSynthesis,
    FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
  );
  return { synth, speaker };
}

describe('読み上げ', () => {
  it('文章全体を1回の発声として渡す（1文字ずつにしない）', () => {
    const { synth, speaker } = make();
    expect(speaker.speak('はなしたい', opts)).toEqual({ ok: true });
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].text).toBe('はなしたい');
    expect(synth.spoken[0].lang).toBe('ja-JP');
  });

  it('連続で押しても前の発声を止めてから話すので重ならない', () => {
    const { synth, speaker } = make();
    speaker.speak('はなしたい', opts);
    speaker.speak('はなしたい', opts);
    speaker.speak('はなしたい', opts);
    expect(synth.spoken).toHaveLength(3);
    expect(synth.active).toHaveLength(1);
    expect(synth.cancelCount).toBeGreaterThanOrEqual(2);
  });

  it('空文字・空白だけなら話さない', () => {
    const { synth, speaker } = make();
    expect(speaker.speak('', opts)).toEqual({ ok: false, reason: 'empty' });
    expect(speaker.speak('  \n ', opts)).toEqual({ ok: false, reason: 'empty' });
    expect(synth.spoken).toHaveLength(0);
  });

  it('停止すると読み上げを止める', () => {
    const states: boolean[] = [];
    const { synth, speaker } = make();
    speaker.setEvents({ onStateChange: (s) => states.push(s) });
    speaker.speak('ありがとう', opts);
    speaker.stop();
    expect(synth.active).toHaveLength(0);
    expect(states.at(-1)).toBe(false);
  });

  it('端末内の声を優先し、オンラインの声は許可がなければ使わない', () => {
    const online = fakeVoice('Google 日本語', 'ja-JP', false);
    const local = fakeVoice('Kyoko', 'ja-JP', true);
    const { synth, speaker } = make([online, local, fakeVoice('Samantha', 'en-US', true)]);
    speaker.speak('はい', opts);
    expect(synth.spoken[0].voice?.name).toBe('Kyoko');

    const onlyOnline = make([online]);
    expect(onlyOnline.speaker.speak('はい', opts)).toEqual({ ok: false, reason: 'no-local-voice' });
    expect(onlyOnline.synth.spoken).toHaveLength(0);
    expect(onlyOnline.speaker.speak('はい', { ...opts, allowOnlineVoices: true })).toEqual({ ok: true });
  });

  it('選んだ声と速さを使う', () => {
    const a = fakeVoice('Kyoko', 'ja-JP', true);
    const b = fakeVoice('Otoya', 'ja-JP', true);
    const { synth, speaker } = make([a, b]);
    speaker.speak('はい', { ...opts, voiceURI: 'uri:Otoya', rate: 0.75 });
    expect(synth.spoken[0].voice?.name).toBe('Otoya');
    expect(synth.spoken[0].rate).toBe(0.75);
  });

  it('日本語の声だけを、端末内・高品質の順に並べる', () => {
    const list = listJapaneseVoices([
      fakeVoice('Google 日本語', 'ja-JP', false),
      fakeVoice('Kyoko', 'ja-JP', true),
      fakeVoice('Kyoko (Enhanced)', 'ja_JP', true),
      fakeVoice('Alex', 'en-US', true),
    ]);
    expect(list.map((v) => v.name)).toEqual(['Kyoko (Enhanced)', 'Kyoko', 'Google 日本語']);
    expect(pickVoice([], null, false)).toBeUndefined();
  });

  it('改行は読み上げ用にだけ区切りへ置きかえ、文面は変えない', () => {
    expect(toSpeechText('おはよう\nげんき？')).toBe('おはよう。げんき？');
    expect(toSpeechText('はい。\n\nいいえ')).toBe('はい。いいえ');
    expect(toSpeechText('きょうは たのしかった')).toBe('きょうは たのしかった');
  });

  it('音声に対応していない環境ではエラーを返す', () => {
    const speaker = new Speaker(null, null);
    expect(speaker.speak('はい', opts)).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('声の性別と品質', () => {
  it('名前が既知の声だけ男女に分け、知らない名前は分類しない', () => {
    expect(voiceGender('Otoya')).toBe('male');
    expect(voiceGender('Otoya（拡張）')).toBe('male');
    expect(voiceGender('Hattori (Enhanced)')).toBe('male');
    expect(voiceGender('Kyoko')).toBe('female');
    expect(voiceGender('O-ren')).toBe('female');
    expect(voiceGender('Microsoft Ichiro - Japanese (Japan)')).toBe('male');
    expect(voiceGender('Microsoft Haruka - Japanese (Japan)')).toBe('female');
    expect(voiceGender('Google 日本語')).toBe('unknown');
    expect(voiceGender('ja-jp-x-htm-local')).toBe('unknown');
    // 名前の一部に含まれているだけでは判断しない
    expect(voiceGender('Kyokoko')).toBe('unknown');
  });

  it('プレミアム・拡張・標準・旧式の合成音を区別する', () => {
    expect(voiceQuality({ name: 'Kyoko', voiceURI: 'com.apple.voice.premium.ja-JP.Kyoko' })).toBe('premium');
    expect(voiceQuality({ name: 'Kyoko（拡張）', voiceURI: 'x' })).toBe('enhanced');
    expect(voiceQuality({ name: 'Otoya', voiceURI: 'com.apple.voice.enhanced.ja-JP.Otoya' })).toBe('enhanced');
    expect(voiceQuality({ name: 'Otoya', voiceURI: 'com.apple.voice.compact.ja-JP.Otoya' })).toBe('standard');
    expect(voiceQuality({ name: 'Reed', voiceURI: 'com.apple.eloquence.ja-JP.Reed' })).toBe('retro');
  });

  it('取得できた日本語の声をすべて並べ、高品質な声を上にする（重複は1つにまとめる）', () => {
    const list = listJapaneseVoices([...IOS_JA_VOICES, IOS_JA_VOICES[2]]);
    expect(list.map((v) => v.name)).toEqual([
      'Kyoko（拡張）',
      'Otoya（拡張）',
      'Hattori',
      'Kyoko',
      'O-ren',
      'Otoya',
      'Reed',
    ]);
    expect(list.find((v) => v.name === 'Otoya')).toMatchObject({ gender: 'male', quality: 'standard', local: true });
  });

  it('男性の声を選ぶと、その声で話す（声の高さは変えない）', () => {
    const { synth, speaker } = make(IOS_JA_VOICES);
    speaker.speak('はい', { ...opts, voiceURI: 'com.apple.voice.compact.ja-JP.Otoya' });
    expect(synth.spoken[0].voice?.name).toBe('Otoya');
    expect(synth.spoken[0].pitch).toBe(1);
    speaker.speak('はい', { ...opts, voiceURI: 'com.apple.voice.compact.ja-JP.Kyoko' });
    expect(synth.spoken[1].voice?.name).toBe('Kyoko');
    expect(synth.spoken[1].pitch).toBe(1);
  });
});

describe('読み上げ用の文字列', () => {
  it.each(['ねる', 'ありがとう', 'きょうはいいてんきです', 'といれにいきたい'])(
    '「%s」は文面を変えずに、1回の発声で読み上げる',
    (text) => {
      const { synth, speaker } = make();
      expect(toSpeechText(text)).toBe(text);
      speaker.speak(text, opts);
      expect(synth.spoken.map((u) => u.text)).toEqual([text]);
    },
  );

  it('は→わ などの自動の読みかえはしない', () => {
    expect(toSpeechText('こんにちは')).toBe('こんにちは');
    expect(toSpeechText('がっこうへいく')).toBe('がっこうへいく');
  });

  it('空白は1つにまとめ、全角空白も半角にそろえる', () => {
    expect(toSpeechText('きょうは　 いい  てんき')).toBe('きょうは いい てんき');
  });

  it('記号だけの文章は話さない', () => {
    const { synth, speaker } = make();
    expect(speaker.speak('。', opts)).toEqual({ ok: false, reason: 'empty' });
    expect(speaker.speak('、、\n・', opts)).toEqual({ ok: false, reason: 'empty' });
    expect(synth.spoken).toHaveLength(0);
  });
});

describe('端末の標準音声（自動）', () => {
  it('声を指定せず、lang = ja-JP だけで話す', () => {
    const { synth, speaker } = make(IOS_JA_VOICES);
    expect(speaker.speak('ありがとう', { ...opts, useSystemVoice: true })).toEqual({ ok: true });
    expect(synth.spoken[0]).toMatchObject({ text: 'ありがとう', lang: 'ja-JP', voice: null, pitch: 1 });
  });

  it('前の読み上げを止めてから話す（標準音声と指定した声を切り替えても重ならない）', () => {
    const { synth, speaker } = make(IOS_JA_VOICES);
    speaker.speak('はい', { ...opts, useSystemVoice: true });
    speaker.speak('はい', { ...opts, voiceURI: 'com.apple.voice.compact.ja-JP.Kyoko' });
    expect(synth.active).toHaveLength(1);
    expect(synth.active[0].voice?.name).toBe('Kyoko');
  });

  it('日本語のオンラインの声が一覧にあるときは、許可がなければ使わない', () => {
    const online = fakeVoice('Google 日本語', 'ja-JP', false);
    const { synth, speaker } = make([fakeVoice('Kyoko', 'ja-JP', true), online]);
    expect(speaker.speak('はい', { ...opts, useSystemVoice: true })).toEqual({
      ok: false,
      reason: 'system-voice-may-be-online',
    });
    expect(synth.spoken).toHaveLength(0);
    expect(speaker.speak('はい', { ...opts, useSystemVoice: true, allowOnlineVoices: true })).toEqual({ ok: true });
    // 英語のオンラインの声は日本語の発声に関係しないので、制限しない
    expect(systemVoiceAllowed(listJapaneseVoices([fakeVoice('Kyoko', 'ja-JP', true), fakeVoice('Google US', 'en-US', false)]), false)).toBe(true);
  });

  it('声の一覧が空でも、言語だけを指定して話せる', () => {
    const { synth, speaker } = make([]);
    expect(speaker.speak('はい', { ...opts, useSystemVoice: true })).toEqual({ ok: true });
    expect(synth.spoken[0]).toMatchObject({ lang: 'ja-JP', voice: null });
  });
});

describe('音声の診断', () => {
  it('getVoices() の内容を加工せず、総数と日本語の件数を返す（日本語を先に並べる）', () => {
    const dup = fakeVoice('Kyoko', 'ja-JP', true, 'same');
    const { speaker } = make([
      fakeVoice('Samantha', 'en-US', true),
      dup,
      dup,
      fakeVoice('Otoya', 'ja-JP', true, 'same'),
    ]);
    const d = speaker.diagnostics();
    expect(d).toMatchObject({ supported: true, total: 4, japanese: 3 });
    expect(d.voices.map((v) => v.name)).toEqual(['Kyoko', 'Kyoko', 'Otoya', 'Samantha']);
    expect(Object.keys(d.voices[0]).sort()).toEqual(['default', 'lang', 'localService', 'name', 'voiceURI']);
  });

  it('一覧ではまったく同じ声だけをまとめ、voiceURI が同じでも名前が違う声は残す', () => {
    const dup = fakeVoice('Kyoko', 'ja-JP', true, 'same');
    const list = listJapaneseVoices([dup, dup, fakeVoice('Otoya', 'ja-JP', true, 'same')]);
    expect(list.map((v) => v.name).sort()).toEqual(['Kyoko', 'Otoya']);
  });

  it('音声に対応していない環境でも診断できる', () => {
    expect(new Speaker(null, null).diagnostics()).toEqual({ supported: false, total: 0, japanese: 0, voices: [] });
  });
});

describe('読み上げ方式：従来と調整あり', () => {
  const PHRASES = [
    'こんにちは',
    'ありがとうございます',
    'きょうはいいてんきです',
    'といれにいきたい',
    'もういちどおねがいします',
    'だいじょうぶ？',
    'だいじょうぶ。',
    'あめがふっています',
  ];
  const kanaOnly = (t: string) => t.replace(/[\s、。？！「」（）・]/g, '');

  it.each(PHRASES)('「%s」：従来は文面のまま、調整ありは文末の記号だけを補い、かなは変えない', (text) => {
    expect(toSpeechText(text, 'plain')).toBe(text);
    const adjusted = toSpeechText(text, 'adjusted');
    expect(kanaOnly(adjusted)).toBe(kanaOnly(text));
    expect(adjusted).toBe(/[。？]$/.test(text) ? text : `${text}。`);
  });

  it('「だいじょうぶ？」と「だいじょうぶ。」の違い（問いかけと言い切り）を残す', () => {
    expect(toSpeechText('だいじょうぶ？', 'adjusted')).toBe('だいじょうぶ？');
    expect(toSpeechText('だいじょうぶ。', 'adjusted')).toBe('だいじょうぶ。');
  });

  it('句読点のない文・ある文・改行のある文を調整する', () => {
    expect(toSpeechText('きょうは いい てんき です', 'adjusted')).toBe('きょうは、いい、てんき、です。');
    expect(toSpeechText('はい、いいえ', 'adjusted')).toBe('はい、いいえ。');
    expect(toSpeechText('はい。。', 'adjusted')).toBe('はい。');
    expect(toSpeechText('すこし まって 、 ください', 'adjusted')).toBe('すこし、まって、ください。');
    expect(toSpeechText('おはよう\ngakkou\n\nまたね', 'adjusted')).toBe('おはよう。gakkou。またね。');
    expect(toSpeechText('はい、\nいいえ', 'adjusted')).toBe('はい。いいえ。');
    expect(toSpeechText('「はい」', 'adjusted')).toBe('「はい」');
    expect(toSpeechText('まって（ください）', 'adjusted')).toBe('まって（ください）');
  });

  it('従来の方式の結果は今までと同じ', () => {
    expect(toSpeechText('おはよう\nげんき？\n\nまたね')).toBe('おはよう。げんき？またね');
    expect(toSpeechText('きょうは いい てんき')).toBe('きょうは いい てんき');
  });

  it('調整ありでも1回の発声で読み、端末の標準音声（声の指定なし）を保つ', () => {
    const { synth, speaker } = make(IOS_JA_VOICES);
    speaker.speak('おはよう\nきょうは いい てんき', { ...opts, useSystemVoice: true, style: 'adjusted' });
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0]).toMatchObject({
      text: 'おはよう。きょうは、いい、てんき。',
      lang: 'ja-JP',
      voice: null,
      pitch: 1,
    });
    // 連続で押しても重ならない
    speaker.speak('はい', { ...opts, useSystemVoice: true, style: 'adjusted' });
    expect(synth.active).toHaveLength(1);
    expect(synth.active[0].text).toBe('はい。');
  });
});

describe('とてもゆっくり：一音ずつはっきり（試験的）', () => {
  it.each([
    ['ありがとう', 'あ、り、が、と、う'],
    ['がっこう', 'がっ、こ、う'],
    ['おみずをください', 'お、み、ず、を、く、だ、さ、い'],
    ['しゃしんをみせて', 'しゃ、しん、を、み、せ、て'],
    ['もういちどおねがいします', 'も、う、い、ち、ど、お、ね、が、い、し、ま、す'],
    ['きょう', 'きょ、う'],
    ['すーぱー', 'すー、ぱー'],
    ['だいじょうぶ？', 'だ、い、じょ、う、ぶ？'],
  ])('「%s」→「%s」（拗音・促音・長音・ん は前の音とまとめる）', (text, expected) => {
    expect(toSyllableText(text, 'comma')).toBe(expected);
    expect(toSyllableText(text, 'space')).toBe(expected.replace(/、/g, ' '));
  });

  it.each(['こんにちは', 'おはよう', 'きょうはいいてんきです', 'がっこうへいく', '雨がふる', 'コップ', 'ょう', 'ーあ'])(
    '「%s」は安全に区切れないので、区切らずに読む',
    (text) => {
      expect(toSyllableText(text, 'comma')).toBeNull();
      expect(buildSpeechText(text, 'plain', 'comma')).toBe(toSpeechText(text));
    },
  );

  it('長すぎる文は区切らない', () => {
    expect(toSyllableText('あ'.repeat(SYLLABLE_MAX_UNITS), 'comma')).not.toBeNull();
    expect(toSyllableText('あ'.repeat(SYLLABLE_MAX_UNITS + 1), 'comma')).toBeNull();
  });

  it('利用者の空白は区切りに、句読点はそのまま残す', () => {
    expect(toSyllableText('きょう いく。またね', 'comma')).toBe('きょ、う、い、く。ま、た、ね');
  });

  it('区切った文章も1回の発声で読み、端末の標準音声を保ち、文字は増やさない', () => {
    const { synth, speaker } = make(IOS_JA_VOICES);
    speaker.speak('ありがとう', { ...opts, rate: 0.35, useSystemVoice: true, syllable: 'comma' });
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0]).toMatchObject({ text: 'あ、り、が、と、う', rate: 0.35, voice: null, lang: 'ja-JP', pitch: 1 });
    expect(synth.spoken[0].text.replace(/、/g, '')).toBe('ありがとう');
    speaker.speak('こんにちは', { ...opts, rate: 0.35, useSystemVoice: true, syllable: 'comma' });
    expect(synth.active).toHaveLength(1);
    expect(synth.active[0].text).toBe('こんにちは');
  });
});

describe('文字を押したときに声を出す（1文字の読み上げ）', () => {
  const charOpts = { rate: 0.95, voiceURI: null, allowOnlineVoices: false, useSystemVoice: true };

  it('ひらがな1文字だけを、加工せず、端末の標準音声・速さ 0.95 で読む', () => {
    const { synth, speaker } = make(IOS_JA_VOICES);
    for (const ch of ['あ', 'が', 'ぱ', 'ゃ', 'っ', 'ん']) {
      expect(speaker.speakChar(ch, charOpts)).toEqual({ ok: true });
      expect(synth.spoken.at(-1)).toMatchObject({ text: ch, rate: 0.95, voice: null, lang: 'ja-JP', pitch: 1 });
      synth.finish();
    }
  });

  it('記号・空白・改行・長音・複数文字は読まない', () => {
    const { synth, speaker } = make();
    for (const ch of ['、', '。', '！', '？', 'ー', '「', '・', ' ', '\n', 'あい', '', 'A', '雨']) {
      expect(speaker.speakChar(ch, charOpts)).toEqual({ ok: false, reason: 'empty' });
    }
    expect(synth.spoken).toHaveLength(0);
  });

  it('続けて押しても、話している1つ＋次の1つまでしか持たず、最新の文字を必ず読む', () => {
    const { synth, speaker } = make();
    speaker.speakChar('あ', charOpts);
    speaker.speakChar('い', charOpts);
    expect(synth.active.map((u) => u.text)).toEqual(['あ', 'い']);
    speaker.speakChar('す', charOpts);
    expect(synth.active.map((u) => u.text)).toEqual(['す']);
    for (const ch of ['か', 'き', 'く', 'け', 'こ']) speaker.speakChar(ch, charOpts);
    expect(synth.active.length).toBeLessThanOrEqual(CHAR_QUEUE_MAX);
    expect(synth.active.at(-1)?.text).toBe('こ');
  });

  it('読み終わった分は数えないので、ふつうの速さで押せば1文字ずつ全部読む', () => {
    const { synth, speaker } = make();
    for (const ch of ['あ', 'い', 'す']) {
      speaker.speakChar(ch, charOpts);
      synth.finish();
    }
    expect(synth.spoken.map((u) => u.text)).toEqual(['あ', 'い', 'す']);
    expect(synth.cancelCount).toBe(0);
  });

  it('文章の発声は文字の読み上げを止めてから話す。文字を押すと文章の読み上げは止まる', () => {
    const { synth, speaker } = make();
    speaker.speakChar('あ', charOpts);
    speaker.speakChar('い', charOpts);
    speaker.speak('あいす', opts);
    expect(synth.active.map((u) => u.text)).toEqual(['あいす']);
    speaker.speakChar('か', charOpts);
    expect(synth.active.map((u) => u.text)).toEqual(['か']);
  });

  it('stopChars は文字の読み上げだけを止め、文章の読み上げ中は何もしない', () => {
    const { synth, speaker } = make();
    speaker.speakChar('あ', charOpts);
    speaker.stopChars();
    expect(synth.active).toHaveLength(0);
    speaker.speak('あいす', opts);
    speaker.stopChars();
    expect(synth.active.map((u) => u.text)).toEqual(['あいす']);
  });

  it('日本語のオンラインの声がある環境では、標準音声で文字を読まない', () => {
    const { synth, speaker } = make([fakeVoice('Kyoko', 'ja-JP', true), fakeVoice('Google 日本語', 'ja-JP', false)]);
    expect(speaker.speakChar('あ', charOpts)).toEqual({ ok: false, reason: 'system-voice-may-be-online' });
    expect(synth.spoken).toHaveLength(0);
    expect(speaker.speakChar('あ', { ...charOpts, useSystemVoice: false })).toEqual({ ok: true });
    expect(synth.spoken[0].voice?.name).toBe('Kyoko');
  });
});

describe('文字の読み上げでエラーが起きたとき', () => {
  it('speak が例外を出しても、例外を外に出さず失敗として返す', () => {
    const { synth, speaker } = make();
    synth.speak = () => {
      throw new Error('boom');
    };
    expect(speaker.speakChar('あ', { rate: 0.95, voiceURI: null, allowOnlineVoices: false })).toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });
});
