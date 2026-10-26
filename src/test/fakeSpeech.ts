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

export function fakeVoice(name: string, lang: string, localService: boolean): SpeechSynthesisVoice {
  return { name, lang, localService, voiceURI: `uri:${name}`, default: false } as SpeechSynthesisVoice;
}

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
