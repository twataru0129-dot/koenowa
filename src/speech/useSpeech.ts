import { useCallback, useEffect, useMemo, useState } from 'react';
import { RATE_OPTIONS, type Settings } from '../state/storage';
import {
  pickVoice,
  Speaker,
  systemVoiceAllowed,
  type SpeakResult,
  type SpeechStyle,
  type SyllableSeparator,
  type VoiceInfo,
} from './speech';
import { AudioClipPlayer, isKyokoVoice } from './clips';

/** 文字ごとの読み上げの速さ */
export const KEY_ECHO_RATE = 0.95;
/**
 * 女性の声（Kyoko など）で文字ごとに読むときの速さ。
 * iPhone で「あ」が「あっ」と短く聞こえたため、少しゆっくりにしている。
 * 端末の標準音声（自動）・男性・性別不明の声は KEY_ECHO_RATE のまま
 */
export const KEY_ECHO_FEMALE_RATE = 0.8;

let sharedSpeaker: Speaker | null = null;

/** テストで差し替えられるようにする */
export function setSpeakerForTesting(speaker: Speaker | null) {
  sharedSpeaker = speaker;
}

function getSpeaker(): Speaker {
  if (!sharedSpeaker) sharedSpeaker = new Speaker(undefined, undefined, undefined, new AudioClipPlayer());
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

  const rate = settings.rateValue ?? RATE_OPTIONS.find((r) => r.id === settings.rate)?.rate ?? 0.95;
  /** 「一音ずつはっきり」は「とてもゆっくり」を選んでいるとき（こまかい調整をしていないとき）だけ使う */
  const syllable: SyllableSeparator | null =
    settings.rate === 'veryslow' && settings.rateValue === null && settings.syllableSep !== 'off'
      ? settings.syllableSep
      : null;

  /**
   * overrides.voice：試聴などで一時的に声を変える。
   * 'system' は端末の標準音声、文字列はその voiceURI の声。省略時は設定どおり。
   */
  const speak = useCallback(
    (
      text: string,
      overrides?: {
        rate?: number;
        voice?: 'system' | string;
        style?: SpeechStyle;
        /** 比較の試聴用。null は区切らない、undefined は設定どおり */
        syllable?: SyllableSeparator | null;
      },
    ): SpeakResult => {
      const voice = overrides?.voice;
      const useSystemVoice = voice === undefined ? settings.voiceMode === 'system' : voice === 'system';
      return speaker.speak(text, {
        rate: overrides?.rate ?? rate,
        voiceURI: voice !== undefined && voice !== 'system' ? voice : settings.voiceURI,
        allowOnlineVoices: settings.allowOnlineVoices,
        useSystemVoice,
        style: overrides?.style ?? settings.speechStyle,
        syllable: overrides?.syllable !== undefined ? overrides.syllable : syllable,
      });
    },
    [speaker, rate, syllable, settings.voiceMode, settings.voiceURI, settings.allowOnlineVoices, settings.speechStyle],
  );

  /**
   * 押した1文字を読む。速さは文章の設定と関係なく、聞き取りやすい「ふつう」（0.95）に固定する。
   * 女性の声と確認できる声のときだけ 0.80 にする（実際に使う声で判断する）
   */
  const speakChar = useCallback(
    (char: string): SpeakResult =>
      speaker.speakChar(char, {
        rate: KEY_ECHO_RATE,
        femaleRate: KEY_ECHO_FEMALE_RATE,
        voiceURI: settings.voiceURI,
        allowOnlineVoices: settings.allowOnlineVoices,
        useSystemVoice: settings.voiceMode === 'system',
      }),
    [speaker, settings.voiceMode, settings.voiceURI, settings.allowOnlineVoices],
  );
  const stopChars = useCallback(() => speaker.stopChars(), [speaker]);

  const stop = useCallback(() => speaker.stop(), [speaker]);
  const refreshVoices = useCallback(() => setVoices(speaker.voices()), [speaker]);
  const diagnostics = useCallback(() => speaker.diagnostics(), [speaker]);

  const activeVoice = pickVoice(voices, settings.voiceURI, settings.allowOnlineVoices);

  // Kyoko で「文字を押したときに声を出す」を使うときだけ、「あ・い・う・え・お」の録音を読み込んでおく
  const kyokoSelected = settings.voiceMode === 'specific' && !!activeVoice && isKyokoVoice(activeVoice.name);
  useEffect(() => {
    if (settings.keyEcho && kyokoSelected) speaker.preloadClips();
  }, [speaker, settings.keyEcho, kyokoSelected]);
  const systemVoiceOk = systemVoiceAllowed(voices, settings.allowOnlineVoices);

  return {
    rate,
    syllable,
    supported: speaker.supported,
    speaking,
    voices,
    activeVoice,
    systemVoiceOk,
    speak,
    speakChar,
    stopChars,
    stop,
    refreshVoices,
    diagnostics,
  };
}
