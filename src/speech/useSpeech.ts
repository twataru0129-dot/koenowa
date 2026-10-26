import { useCallback, useEffect, useMemo, useState } from 'react';
import { RATE_OPTIONS, type Settings } from '../state/storage';
import { pickVoice, Speaker, type SpeakResult, type VoiceInfo } from './speech';

let sharedSpeaker: Speaker | null = null;

/** テストで差し替えられるようにする */
export function setSpeakerForTesting(speaker: Speaker | null) {
  sharedSpeaker = speaker;
}

function getSpeaker(): Speaker {
  if (!sharedSpeaker) sharedSpeaker = new Speaker();
  return sharedSpeaker;
}

export function useSpeech(settings: Settings) {
  const speaker = useMemo(() => getSpeaker(), []);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<VoiceInfo[]>(() => speaker.voices());

  useEffect(() => {
    speaker.setEvents({ onStateChange: setSpeaking });
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    const refresh = () => setVoices(speaker.voices());
    refresh();
    synth?.addEventListener?.('voiceschanged', refresh);
    // 一部のブラウザーでは voiceschanged が来ないため、少し待って再取得する
    const timers = [300, 1000, 3000].map((ms) => window.setTimeout(refresh, ms));
    return () => {
      synth?.removeEventListener?.('voiceschanged', refresh);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [speaker]);

  const rate = RATE_OPTIONS.find((r) => r.id === settings.rate)?.rate ?? 0.95;

  const speak = useCallback(
    (text: string, overrides?: Partial<{ rate: number; voiceURI: string | null }>): SpeakResult =>
      speaker.speak(text, {
        rate: overrides?.rate ?? rate,
        voiceURI: overrides?.voiceURI !== undefined ? overrides.voiceURI : settings.voiceURI,
        allowOnlineVoices: settings.allowOnlineVoices,
      }),
    [speaker, rate, settings.voiceURI, settings.allowOnlineVoices],
  );

  const stop = useCallback(() => speaker.stop(), [speaker]);

  const activeVoice = pickVoice(voices, settings.voiceURI, settings.allowOnlineVoices);

  return { supported: speaker.supported, speaking, voices, activeVoice, speak, stop };
}
