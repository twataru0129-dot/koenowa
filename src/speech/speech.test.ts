import { FakeSynth, FakeUtterance, fakeVoice } from '../test/fakeSpeech';
import { pickVoice, listJapaneseVoices, Speaker, toSpeechText } from './speech';

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
