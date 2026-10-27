import { useCallback, useEffect, useMemo, useState } from 'react';
import { RATE_OPTIONS, type Settings } from '../state/storage';
import { pickVoice, Speaker, systemVoiceAllowed, type SpeakResult, type VoiceInfo } from './speech';

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

  /**
   * overrides.voice：試聴などで一時的に声を変える。
   * 'system' は端末の標準音声、文字列はその voiceURI の声。省略時は設定どおり。
   */
  const speak = useCallback(
    (text: string, overrides?: { rate?: number; voice?: 'system' | string }): SpeakResult => {
      const voice = overrides?.voice;
      const useSystemVoice = voice === undefined ? settings.voiceMode === 'system' : voice === 'system';
      return speaker.speak(text, {
        rate: overrides?.rate ?? rate,
        voiceURI: voice !== undefined && voice !== 'system' ? voice : settings.voiceURI,
        allowOnlineVoices: settings.allowOnlineVoices,
        useSystemVoice,
      });
    },
    [speaker, rate, settings.voiceMode, settings.voiceURI, settings.allowOnlineVoices],
  );

  const stop = useCallback(() => speaker.stop(), [speaker]);
  const refreshVoices = useCallback(() => setVoices(speaker.voices()), [speaker]);
  const diagnostics = useCallback(() => speaker.diagnostics(), [speaker]);

  const activeVoice = pickVoice(voices, settings.voiceURI, settings.allowOnlineVoices);
  const systemVoiceOk = systemVoiceAllowed(voices, settings.allowOnlineVoices);

  return {
    supported: speaker.supported,
    speaking,
    voices,
    activeVoice,
    systemVoiceOk,
    speak,
    stop,
    refreshVoices,
    diagnostics,
  };
}
