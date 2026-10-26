/** テスト用の SpeechSynthesis の代わり */
export class FakeUtterance {
  text: string;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

export function fakeVoice(name: string, lang: string, localService: boolean, voiceURI = `uri:${name}`): SpeechSynthesisVoice {
  return { name, lang, localService, voiceURI, default: false } as SpeechSynthesisVoice;
}

/** iOS で getVoices() が返す形に近い日本語の声（名前と voiceURI は Apple の命名規則にならう） */
export const IOS_JA_VOICES = [
  fakeVoice('Kyoko', 'ja-JP', true, 'com.apple.voice.compact.ja-JP.Kyoko'),
  fakeVoice('Kyoko（拡張）', 'ja-JP', true, 'com.apple.voice.enhanced.ja-JP.Kyoko'),
  fakeVoice('Otoya', 'ja-JP', true, 'com.apple.voice.compact.ja-JP.Otoya'),
  fakeVoice('Otoya（拡張）', 'ja-JP', true, 'com.apple.voice.enhanced.ja-JP.Otoya'),
  fakeVoice('O-ren', 'ja-JP', true, 'com.apple.voice.compact.ja-JP.O-ren'),
  fakeVoice('Hattori', 'ja-JP', true, 'com.apple.voice.compact.ja-JP.Hattori'),
  fakeVoice('Reed', 'ja-JP', true, 'com.apple.eloquence.ja-JP.Reed'),
  fakeVoice('Samantha', 'en-US', true, 'com.apple.voice.compact.en-US.Samantha'),
];

export class FakeSynth {
  spoken: FakeUtterance[] = [];
  cancelCount = 0;
  speaking = false;
  pending = false;
  paused = false;
  voiceList: SpeechSynthesisVoice[];
  /** 同時に鳴っている（キャンセルされていない）発声 */
  active: FakeUtterance[] = [];

  constructor(voices: SpeechSynthesisVoice[] = [fakeVoice('Kyoko', 'ja-JP', true)]) {
    this.voiceList = voices;
  }
  getVoices() {
    return this.voiceList;
  }
  speak(u: FakeUtterance) {
    this.spoken.push(u);
    this.active.push(u);
    this.speaking = true;
    u.onstart?.();
  }
  cancel() {
    this.cancelCount++;
    const was = this.active;
    this.active = [];
    this.speaking = false;
    was.forEach((u) => u.onerror?.());
  }
  resume() {
    this.paused = false;
  }
  /** 今の発声が最後まで終わったことにする */
  finish() {
    const was = this.active;
    this.active = [];
    this.speaking = false;
    was.forEach((u) => u.onend?.());
  }
}
