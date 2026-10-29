import { useEffect, useRef, useState } from 'react';
import { ChangelogView, FeedbackSection, UpdatesSection } from './AppInfo';
import { RATE_MAX, RATE_MIN, RATE_OPTIONS, type Favorite, type Settings, type SyllableSep } from '../state/storage';
import {
  buildSpeechText,
  toSpeechText,
  type SyllableSeparator,
  type SpeakResult,
  type SpeechStyle,
  type VoiceDiagnostics,
  type VoiceGender,
  type VoiceInfo,
  type VoiceQuality,
} from '../speech/speech';
import { Icon } from './Icon';
import { ConfirmDialog, Modal } from './Modal';
import { AUTO_REGISTER_COUNT, LEARN_MAX_LENGTH } from '../state/learning';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  voices: VoiceInfo[];
  activeVoice: VoiceInfo | null | undefined;
  /** 端末の標準音声（自動）を使ってよい環境か */
  systemVoiceOk: boolean;
  speechSupported: boolean;
  /**
   * 試聴する。voice：'system' は端末の標準音声、文字列はその voiceURI の声、undefined はいま選んでいる声。
   * rate：指定したときだけ、その速さで読む（設定は変えない）
   */
  onTest: (voice?: 'system' | string, rate?: number) => SpeakResult;
  /** 比較用：いま選んでいる声と速さで、指定した読み上げ方式で読む */
  onSpeakSample: (text: string, style: SpeechStyle) => SpeakResult;
  /** 「一音ずつはっきり」の比較用：区切り方と速さを指定して読む */
  onSpeakSyllable: (text: string, syllable: SyllableSeparator | null, rate: number) => SpeakResult;
  currentText: string;
  favorites: Favorite[];
  /** 自動登録のために回数を記録している言葉の数 */
  learnedCount: number;
  onClearLearning: () => void;
  onRefreshVoices: () => void;
  getDiagnostics: () => VoiceDiagnostics;
  storageOk: boolean;
  onClose: () => void;
}

const TEST_TEXT = 'こんにちは。こえのわです。';

const GUARD_OPTIONS = [
  { ms: 0, label: 'つかわない' },
  { ms: 300, label: '0.3びょう' },
  { ms: 600, label: '0.6びょう' },
  { ms: 1000, label: '1びょう' },
];

const GENDER_GROUPS: { gender: VoiceGender; title: string }[] = [
  { gender: 'male', title: '男性の声' },
  { gender: 'female', title: '女性の声' },
  { gender: 'unknown', title: '性別を判断できない声（名前で表示）' },
];

const GENDER_LABEL: Record<VoiceGender, string> = { male: '男性', female: '女性', unknown: '' };

const QUALITY_LABEL: Record<VoiceQuality, string> = {
  premium: 'プレミアム',
  enhanced: '拡張（高品質）',
  standard: '標準',
  retro: '旧式の合成音',
};

const DOWNLOAD_GUIDE =
  'iPhoneの「設定」→「アクセシビリティ」→「読み上げコンテンツ」→「声」→「日本語」で声をダウンロードし、こえのわを開き直してください。';

function voiceSummary(v: VoiceInfo): string {
  return [GENDER_LABEL[v.gender], QUALITY_LABEL[v.quality], v.local ? '端末内' : 'オンライン']
    .filter(Boolean)
    .join('・');
}

export function SettingsPanel({
  settings,
  onChange,
  voices,
  activeVoice,
  systemVoiceOk,
  speechSupported,
  onTest,
  onSpeakSample,
  onSpeakSyllable,
  currentText,
  favorites,
  learnedCount,
  onClearLearning,
  onRefreshVoices,
  getDiagnostics,
  storageOk,
  onClose,
}: Props) {
  const systemMode = settings.voiceMode === 'system';
  const localVoices = voices.filter((v) => v.local);
  const onlineVoices = voices.filter((v) => !v.local);
  const selectable = settings.allowOnlineVoices ? voices : localVoices;
  const hasMale = selectable.some((v) => v.gender === 'male');
  const hasUnknown = selectable.some((v) => v.gender === 'unknown');
  const savedMissing =
    !systemMode &&
    settings.voiceURI !== null &&
    voices.length > 0 &&
    !selectable.some((v) => v.uri === settings.voiceURI);

  let voiceStatus: string;
  if (!speechSupported) voiceStatus = 'このブラウザーは音声の読み上げに対応していません。';
  else if (systemMode)
    voiceStatus = systemVoiceOk
      ? 'いまの声：端末の標準音声（自動）。どの声で話すかは端末が決めます。'
      : 'いまの声：端末の標準音声（自動）。ただし、この端末ではオンラインの声が選ばれるおそれがあるため使えません。下の一覧から声を選んでください。';
  else if (activeVoice === undefined)
    voiceStatus = '声の一覧をまだ取得できていません。端末の標準の日本語音声で読み上げます。';
  else if (activeVoice === null) voiceStatus = `端末内の日本語音声が見つかりません。${DOWNLOAD_GUIDE}`;
  else voiceStatus = `いまの声：${activeVoice.name}（${voiceSummary(activeVoice)}）`;

  // アップデート情報は、同じパネルの中で切り替えて表示する（モーダルを重ねない）。
  // 設定の内容は隠すだけで残すので、開いていた項目やスクロール位置はそのまま戻る
  const [view, setView] = useState<'settings' | 'changelog'>('settings');
  const settingsRef = useRef<HTMLDivElement>(null);
  const updatesButtonRef = useRef<HTMLButtonElement>(null);
  const savedScroll = useRef(0);
  const scroller = () => settingsRef.current?.closest('.modal-body') as HTMLElement | null;
  const openChangelog = () => {
    savedScroll.current = scroller()?.scrollTop ?? 0;
    setView('changelog');
  };
  const backToSettings = () => setView('settings');
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = scroller();
    if (view === 'changelog') {
      if (el) el.scrollTop = 0;
    } else {
      if (el) el.scrollTop = savedScroll.current;
      updatesButtonRef.current?.focus({ preventScroll: true });
    }
  }, [view]);

  return (
    <Modal
      title={view === 'changelog' ? 'アップデート情報' : 'せってい'}
      onClose={view === 'changelog' ? backToSettings : onClose}
      className="settings"
    >
      {view === 'changelog' && <ChangelogView onBack={backToSettings} />}
      <div ref={settingsRef} hidden={view === 'changelog'}>
        <FeedbackSection />
        <UpdatesSection onOpen={openChangelog} buttonRef={updatesButtonRef} />

        <section className="settings-section" aria-labelledby="set-voice">
          <h3 id="set-voice">声</h3>
          <p
            className={`settings-note ${(systemMode ? systemVoiceOk : activeVoice) ? '' : 'is-warning'}`}
            role="status"
          >
            {voiceStatus}
          </p>
          {savedMissing && activeVoice && (
            <p className="settings-note is-warning">
              前に選んだ声がこの端末で見つからないため、「{activeVoice.name}」を使っています。
            </p>
          )}

          {speechSupported && (
            <fieldset className="field voice-field">
              <legend>
                声をえらぶ（この端末で使える日本語の声：{selectable.length}件）
              </legend>
              <div className="voice-group">
                <h4>端末にまかせる</h4>
                <ul className="voice-list">
                  <li className={`voice-item ${systemMode ? 'is-on' : ''}`}>
                    <label className="voice-choice">
                      <input
                        type="radio"
                        name="voice"
                        value="system"
                        checked={systemMode}
                        disabled={!systemVoiceOk}
                        onChange={() => onChange({ ...settings, voiceMode: 'system' })}
                      />
                      <span className="voice-name">端末の標準音声（自動）</span>
                      <span className="voice-meta">
                        日本語（ja-JP）だけを指定し、声は端末が選びます。男性の声になるとは限りません。
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary voice-test"
                      aria-label="端末の標準音声（自動）を試聴"
                      disabled={!systemVoiceOk}
                      onClick={() => onTest('system')}
                    >
                      <Icon name="speak" />
                      <span>試聴</span>
                    </button>
                  </li>
                </ul>
                {!systemVoiceOk && (
                  <p className="settings-hint is-warning">
                    この端末では、声を指定しないとオンラインの声が選ばれるおそれがあるため、選べません。
                  </p>
                )}
              </div>
              {GENDER_GROUPS.map(({ gender, title }) => {
                const group = selectable.filter((v) => v.gender === gender);
                if (group.length === 0) return null;
                return (
                  <div key={gender} className="voice-group">
                    <h4>{title}</h4>
                    <ul className="voice-list">
                      {group.map((v) => {
                        const selected = !systemMode && activeVoice?.uri === v.uri;
                        return (
                          <li key={v.uri} className={`voice-item ${selected ? 'is-on' : ''}`}>
                            <label className="voice-choice">
                              <input
                                type="radio"
                                name="voice"
                                value={v.uri}
                                checked={selected}
                                onChange={() => onChange({ ...settings, voiceMode: 'specific', voiceURI: v.uri })}
                              />
                              <span className="voice-name">{v.name}</span>
                              <span className="voice-meta">{voiceSummary(v)}</span>
                            </label>
                            <button
                              type="button"
                              className="btn btn-secondary voice-test"
                              aria-label={`${v.name}を試聴`}
                              onClick={() => onTest(v.uri)}
                            >
                              <Icon name="speak" />
                              <span>試聴</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </fieldset>
          )}

          {speechSupported && voices.length > 0 && !hasMale && (
            <div className="settings-note voice-guide" role="note">
              <strong>男性の日本語の声が見つかりません。</strong>
              <p>
                この端末のブラウザーから使える日本語の声に、男性の声として確認できるもの（Otoya・Hattori など）がありません。{DOWNLOAD_GUIDE}
              </p>
              {hasUnknown && <p>「性別を判断できない声」の中に男性の声がふくまれている場合があります。試聴して確かめてください。</p>}
              {systemVoiceOk && (
                <p>
                  「端末の標準音声（自動）」を選ぶと、iPhoneの「読み上げコンテンツ」で選んでいる日本語の声で話す場合があります（必ずそうなるとは限りません）。試聴して確かめてください。
                </p>
              )}
              <p>※ Siri の声は、Safari やホーム画面のアプリからは使えません。ダウンロード後も一覧に出ない声は、この端末のブラウザーからは指定できない声です。</p>
            </div>
          )}

          <fieldset className="field">
            <legend>はやさ</legend>
            <div className="segmented rate-grid">
              {RATE_OPTIONS.map((r) => {
                const on = settings.rateValue === null && settings.rate === r.id;
                return (
                  <label key={r.id} className={on ? 'is-on' : ''}>
                    <input
                      type="radio"
                      name="rate"
                      value={r.id}
                      checked={on}
                      onChange={() => onChange({ ...settings, rate: r.id, rateValue: null })}
                    />
                    {r.label}
                  </label>
                );
              })}
            </div>
            <SyllableSection settings={settings} onChange={onChange} onSpeakSyllable={onSpeakSyllable} />
            <FineRate settings={settings} onChange={onChange} onTest={(rate) => onTest(undefined, rate)} />
          </fieldset>

          <div className="settings-buttons">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onTest()}
              disabled={!speechSupported}
            >
              <Icon name="speak" />
              <span>ためしにきく</span>
            </button>
          </div>
          <p className="settings-hint">ためしにきく・試聴：「{TEST_TEXT}」（いま選んでいるはやさで読みます）</p>

          {onlineVoices.length > 0 && (
            <label className="check">
              <input
                type="checkbox"
                checked={settings.allowOnlineVoices}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    allowOnlineVoices: e.target.checked,
                    voiceURI: e.target.checked ? settings.voiceURI : null,
                  })
                }
              />
              <span>
                オンラインの声も使う（{onlineVoices.length}件）
                <small>
                  オンラインの声は、文章がブラウザーの提供元のサーバーへ送られる場合があり、通信がないと使えません。ふだんはオフのままにしてください。
                </small>
              </span>
            </label>
          )}
        </section>

        <section className="settings-section" aria-labelledby="set-input">
          <h3 id="set-input">入力</h3>
          <label className="check check-key-echo">
            <input
              type="checkbox"
              checked={settings.keyEcho}
              onChange={(e) => onChange({ ...settings, keyEcho: e.target.checked })}
            />
            <span>
              文字を押したときに声を出す
              <small>文字盤の文字を押すたびに、その文字を読み上げます。</small>
            </span>
          </label>
          <fieldset className="field">
            <legend>同じ文字の連続入力をふせぐ</legend>
            <div className="segmented">
              {GUARD_OPTIONS.map((g) => (
                <label key={g.ms} className={settings.repeatGuardMs === g.ms ? 'is-on' : ''}>
                  <input
                    type="radio"
                    name="guard"
                    checked={settings.repeatGuardMs === g.ms}
                    onChange={() => onChange({ ...settings, repeatGuardMs: g.ms })}
                  />
                  {g.label}
                </label>
              ))}
            </div>
            <small className="settings-hint">
              手がふるえて同じキーが2回入ってしまうときに使います。指定した時間内の同じキーは無視します。
            </small>
          </fieldset>
        </section>

        <AutoFavoriteSection
          settings={settings}
          onChange={onChange}
          learnedCount={learnedCount}
          onClearLearning={onClearLearning}
        />

        <section className="settings-section" aria-labelledby="set-data">
          <h3 id="set-data">データとプライバシー</h3>
          <ul className="settings-list">
            <li>入力中の文章・よくつかう言葉・設定は、この端末の中だけに保存します。</li>
            <li>話した文章の履歴は保存しません。</li>
            <li>文章をインターネットへ送ることはありません（オンラインの声を許可した場合を除く）。</li>
            {!storageOk && (
              <li className="is-warning">
                端末に保存できない状態です（プライベートブラウズ等）。アプリを閉じると文章が消えます。
              </li>
            )}
          </ul>
        </section>

        <SpeechCompareSection
          settings={settings}
          onChange={onChange}
          currentText={currentText}
          favorites={favorites}
          onSpeakSample={onSpeakSample}
        />

        <VoiceDiagnosticsSection
          allowOnline={settings.allowOnlineVoices}
          getDiagnostics={getDiagnostics}
          onRefresh={onRefreshVoices}
        />
      </div>
    </Modal>
  );
}

/** よく使う言葉の自動登録（オン／オフと学習記録の消去） */
function AutoFavoriteSection({
  settings,
  onChange,
  learnedCount,
  onClearLearning,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  learnedCount: number;
  onClearLearning: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <section className="settings-section" aria-labelledby="set-auto-fav">
      <h3 id="set-auto-fav">よく使う言葉の自動登録</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.autoFavorite}
          onChange={(e) => onChange({ ...settings, autoFavorite: e.target.checked })}
        />
        <span>
          よく使う言葉を自動登録
          <small>
            文字盤で入力して「はっせい」した言葉が{AUTO_REGISTER_COUNT}回になると、「よくつかう」に追加します。
            同じ入力のまま何度「はっせい」しても1回です。{LEARN_MAX_LENGTH}文字までの言葉が対象です。
            「よくつかう」から消した言葉は、自動では登録しなおしません（手動で登録するか、下の学習記録を消去すると、また対象になります）。
          </small>
        </span>
      </label>
      <p className="settings-hint">回数を記録している言葉：{learnedCount}件（この端末の中だけに保存しています）</p>
      <div className="settings-buttons">
        <button type="button" className="btn btn-danger-outline" onClick={() => setConfirm(true)}>
          自動登録の学習記録を消去
        </button>
        <span role="status" className="settings-hint">
          {message}
        </span>
      </div>
      {confirm && (
        <ConfirmDialog
          message="自動登録の学習記録を消去しますか？"
          detail="言葉ごとの回数と、自動で登録しなおさない言葉の記録を消します。「よくつかう」に登録ずみの言葉は消えません。"
          confirmLabel="消去する"
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            onClearLearning();
            setConfirm(false);
            setMessage('学習記録を消去しました');
          }}
        />
      )}
    </section>
  );
}

/** 「とてもゆっくり」で比べる例文 */
const SYLLABLE_SAMPLES = [
  'ありがとう',
  'こんにちは',
  'おはよう',
  'がっこう',
  'きょうはいいてんきです',
  'おみずをください',
  'しゃしんをみせて',
  'もういちどおねがいします',
];

const VERY_SLOW_RATE = RATE_OPTIONS.find((r) => r.id === 'veryslow')!.rate;

/**
 * 「一音ずつはっきり」（試験的）。「とてもゆっくり」のときだけ使う。初期値は「つかわない」。
 * 区切った文字列はその場で表示し、それぞれ試聴して比べられる。
 */
function SyllableSection({
  settings,
  onChange,
  onSpeakSyllable,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onSpeakSyllable: (text: string, syllable: SyllableSeparator | null, rate: number) => SpeakResult;
}) {
  const [sample, setSample] = useState(SYLLABLE_SAMPLES[0]);
  const active = settings.rate === 'veryslow' && settings.rateValue === null;
  const options: { id: SyllableSep; label: string; sep: SyllableSeparator | null }[] = [
    { id: 'off', label: 'つかわない', sep: null },
    { id: 'comma', label: '「、」で区切る', sep: 'comma' },
    { id: 'space', label: '空白で区切る', sep: 'space' },
  ];
  return (
    <details className="fine-rate" open={active && settings.syllableSep !== 'off'}>
      <summary>一音ずつはっきり（試験的）</summary>
      <p className="settings-hint">
        「とてもゆっくり」のときに、「あ、り、が、と、う」のように音のまとまりごとに区切って読みます。「きょ」「しゃ」や小さい「っ」、のばす音「ー」、「ん」は前の音とまとめます。
        漢字・カタカナをふくむ文や、「は」「へ」が言葉の途中にある文（例：こんにちは、きょうは）は、読み方が変わるおそれがあるため区切らずに読みます。画面の文章は変わりません。
      </p>
      {!active && <p className="settings-hint is-warning">いまは「とてもゆっくり」ではないため、この設定は使われません。</p>}
      <div className="segmented">
        {options.map((o) => (
          <label key={o.id} className={settings.syllableSep === o.id ? 'is-on' : ''}>
            <input
              type="radio"
              name="syllable"
              checked={settings.syllableSep === o.id}
              onChange={() => onChange({ ...settings, syllableSep: o.id })}
            />
            {o.label}
          </label>
        ))}
      </div>
      <label className="field">
        <span>比べる言葉</span>
        <select value={sample} onChange={(e) => setSample(e.target.value)}>
          {SYLLABLE_SAMPLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <ul className="compare-list">
        {options.map((o) => (
          <li key={o.id}>
            <span className="compare-label">{o.label}</span>
            <code data-testid={`syllable-${o.id}`}>{buildSpeechText(sample, settings.speechStyle, o.sep)}</code>
            <button
              type="button"
              className="btn btn-secondary"
              aria-label={`${o.label}（とてもゆっくり）で試聴`}
              onClick={() => onSpeakSyllable(sample, o.sep, VERY_SLOW_RATE)}
            >
              <Icon name="speak" />
              <span>試聴</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="settings-hint">試聴は「とてもゆっくり」の速さ（{VERY_SLOW_RATE}）で読みます。区切れない言葉は、どれも同じ文字列になります。</p>
    </details>
  );
}

const RATE_PRESET_STEPS = [0.85, 0.9, 0.95, 1.0, 1.05];

/** 速さのこまかい調整（試験的）。ゆっくり／ふつう／はやめは、そのまま使える */
function FineRate({
  settings,
  onChange,
  onTest,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onTest: (rate: number) => void;
}) {
  const preset = RATE_OPTIONS.find((r) => r.id === settings.rate)?.rate ?? 0.95;
  const value = settings.rateValue ?? preset;
  const set = (v: number) => onChange({ ...settings, rateValue: Math.round(v * 100) / 100 });
  return (
    <details className="fine-rate" open={settings.rateValue !== null}>
      <summary>こまかく調整（試験的）</summary>
      <p className="settings-hint">
        自然に聞こえる速さは声によってちがいます。下のボタンで聞き比べて、聞き取りやすい速さを選んでください（ボタンは試聴だけで、設定は変わりません）。
      </p>
      <div className="rate-steps">
        {RATE_PRESET_STEPS.map((r) => (
          <button
            key={r}
            type="button"
            className="btn btn-secondary"
            aria-label={`はやさ ${r.toFixed(2)} で試聴`}
            onClick={() => onTest(r)}
          >
            {r.toFixed(2)}
          </button>
        ))}
      </div>
      <label className="rate-slider">
        <span>はやさ（{RATE_MIN}〜{RATE_MAX}）</span>
        <input
          type="range"
          min={RATE_MIN}
          max={RATE_MAX}
          step={0.05}
          value={value}
          aria-label="はやさをこまかく調整"
          aria-valuetext={value.toFixed(2)}
          onChange={(e) => set(Number(e.target.value))}
        />
        <output>{value.toFixed(2)}</output>
      </label>
      <div className="settings-buttons">
        <button type="button" className="btn btn-secondary" onClick={() => onTest(value)}>
          <Icon name="speak" />
          <span>このはやさで試聴</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={settings.rateValue === null}
          onClick={() => onChange({ ...settings, rateValue: null })}
        >
          ゆっくり／ふつう／はやめ に戻す
        </button>
      </div>
      {settings.rateValue !== null && (
        <p className="settings-hint">いまは、こまかく調整した速さ（{settings.rateValue.toFixed(2)}）で読みます。</p>
      )}
    </details>
  );
}

/** 比較用の文（ひらがなだけ・句読点あり／なし・改行あり） */
const SAMPLE_TEXTS = [
  'こんにちは',
  'ありがとうございます',
  'きょうはいいてんきです',
  'といれにいきたい',
  'もういちどおねがいします',
  'だいじょうぶ？',
  'だいじょうぶ。',
  'あめがふっています',
  'きょうは いい てんき です',
  'おはよう\nきょうは がっこうに いきます\nまたね',
  'すこしまってください、いま かんがえています',
];

const oneLine = (t: string) => t.replace(/\n/g, '／');

/**
 * 読み上げの比較（試験的）。従来の方式・調整あり・読み上げ用テキストを聞き比べ、
 * よいと感じたほうを「読み上げ方式」として選べる。いつでも従来の方式に戻せる。
 */
function SpeechCompareSection({
  settings,
  onChange,
  currentText,
  favorites,
  onSpeakSample,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  currentText: string;
  favorites: Favorite[];
  onSpeakSample: (text: string, style: SpeechStyle) => SpeakResult;
}) {
  const options: { key: string; label: string; text: string; speechText?: string }[] = [
    ...(currentText.trim() ? [{ key: 'current', label: `いま入力中の文章：${oneLine(currentText)}`, text: currentText }] : []),
    ...SAMPLE_TEXTS.map((t, i) => ({ key: `sample-${i}`, label: `例文：${oneLine(t)}`, text: t })),
    ...favorites.map((f) => ({
      key: `fav-${f.id}`,
      label: `よくつかう言葉：${oneLine(f.text)}${f.speechText ? '（読み上げ用テキストあり）' : ''}`,
      text: f.text,
      speechText: f.speechText,
    })),
  ];
  const [key, setKey] = useState(options[0]?.key ?? '');
  const selected = options.find((o) => o.key === key) ?? options[0];
  const speechText = selected?.speechText;

  return (
    <section className="settings-section" aria-labelledby="set-compare">
      <details className="diag">
        <summary id="set-compare">読み上げの比較（試験的）</summary>

        <fieldset className="field">
          <legend>読み上げ方式</legend>
          <div className="segmented">
            {(
              [
                ['plain', '従来（標準）'],
                ['adjusted', '調整あり（試験的）'],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className={settings.speechStyle === id ? 'is-on' : ''}>
                <input
                  type="radio"
                  name="speech-style"
                  checked={settings.speechStyle === id}
                  onChange={() => onChange({ ...settings, speechStyle: id })}
                />
                {label}
              </label>
            ))}
          </div>
          <small className="settings-hint">
            「調整あり」は、読み上げ用の文字列の中だけで、①空白を「、」に、②句読点のない文の終わりに「。」を足し、③同じ句読点の連続を1つにまとめます。画面の文章は変わりません。かなを漢字にしたり、読みを変えたりはしません。聞き比べてよくなかったら「従来（標準）」に戻してください。
          </small>
        </fieldset>

        {selected && (
          <>
            <label className="field">
              <span>比べる文章</span>
              <select value={selected.key} onChange={(e) => setKey(e.target.value)}>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <ul className="compare-list">
              <li>
                <span className="compare-label">従来</span>
                <code data-testid="compare-plain">{toSpeechText(selected.text, 'plain')}</code>
                <button type="button" className="btn btn-secondary" onClick={() => onSpeakSample(selected.text, 'plain')}>
                  <Icon name="speak" />
                  <span>従来で試聴</span>
                </button>
              </li>
              <li>
                <span className="compare-label">調整あり</span>
                <code data-testid="compare-adjusted">{toSpeechText(selected.text, 'adjusted')}</code>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onSpeakSample(selected.text, 'adjusted')}
                >
                  <Icon name="speak" />
                  <span>調整ありで試聴</span>
                </button>
              </li>
              {speechText && (
                <li>
                  <span className="compare-label">読み上げ用テキスト</span>
                  <code data-testid="compare-speech-text">{toSpeechText(speechText, settings.speechStyle)}</code>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onSpeakSample(speechText, settings.speechStyle)}
                  >
                    <Icon name="speak" />
                    <span>読み上げ用テキストで試聴</span>
                  </button>
                </li>
              )}
            </ul>
            <p className="settings-hint">
              いま選んでいる声と速さで読みます。別の試聴ボタンを押すと、前の読み上げを止めてから読みます。読み上げ用テキストは「よくつかう言葉」の「へんしゅう」→「読み方」で設定できます。
            </p>
          </>
        )}
      </details>
    </section>
  );
}

/** 診断用のテキストを作る。入力した文章・よくつかう言葉・設定値は含めない */
export function formatDiagnostics(
  d: VoiceDiagnostics,
  env: { userAgent: string; standalone: boolean; allowOnline: boolean },
): string {
  const lines = [
    'こえのわ 音声の診断',
    `ブラウザー: ${env.userAgent}`,
    `起動のしかた: ${env.standalone ? 'ホーム画面から（スタンドアロン）' : 'ブラウザー'}`,
    `speechSynthesis: ${d.supported ? 'あり' : 'なし'}`,
    `取得した音声の総数: ${d.total}`,
    `日本語音声の件数: ${d.japanese}`,
    '',
    '--- 日本語の声 ---',
  ];
  const ja = d.voices.slice(0, d.japanese);
  if (ja.length === 0) lines.push('（なし）');
  ja.forEach((v, i) => {
    const shown = v.localService || env.allowOnline ? '一覧に表示' : '一覧に表示しない（端末内の声ではないため）';
    lines.push(
      `${i + 1}. name=${v.name} | lang=${v.lang} | voiceURI=${v.voiceURI} | localService=${v.localService} | default=${v.default} | ${shown}`,
    );
  });
  lines.push('', '--- その他の言語の声 ---');
  const others = d.voices.slice(d.japanese);
  if (others.length === 0) lines.push('（なし）');
  others.forEach((v, i) => {
    lines.push(
      `${i + 1}. name=${v.name} | lang=${v.lang} | voiceURI=${v.voiceURI} | localService=${v.localService} | default=${v.default}`,
    );
  });
  return lines.join('\n');
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 下の方法を試す
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function VoiceDiagnosticsSection({
  allowOnline,
  getDiagnostics,
  onRefresh,
}: {
  allowOnline: boolean;
  getDiagnostics: () => VoiceDiagnostics;
  onRefresh: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');

  const update = () => {
    onRefresh();
    setText(
      formatDiagnostics(getDiagnostics(), {
        userAgent: navigator.userAgent,
        standalone: isStandalone(),
        allowOnline,
      }),
    );
    setCopyStatus('');
  };

  return (
    <section className="settings-section" aria-labelledby="set-diag">
      <details
        className="diag"
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open && text === null) update();
        }}
      >
        <summary id="set-diag">音声の診断（確認用）</summary>
        <p className="settings-hint">
          このブラウザーの Web Speech API が返した声の一覧です。入力した文章や登録した言葉は含みません。
        </p>
        <div className="settings-buttons">
          <button type="button" className="btn btn-secondary" onClick={update}>
            もう一度しらべる
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!text}
            onClick={async () => setCopyStatus((await copyText(text ?? '')) ? 'コピーしました' : 'コピーできませんでした')}
          >
            コピー
          </button>
          <span role="status" className="settings-hint">
            {copyStatus}
          </span>
        </div>
        {text && (
          <pre className="diag-output" data-testid="voice-diagnostics">
            {text}
          </pre>
        )}
      </details>
    </section>
  );
}

export { TEST_TEXT };
