import { RATE_OPTIONS, type Settings } from '../state/storage';
import type { SpeakResult, VoiceGender, VoiceInfo, VoiceQuality } from '../speech/speech';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  voices: VoiceInfo[];
  activeVoice: VoiceInfo | null | undefined;
  speechSupported: boolean;
  /** 声を指定して試聴する（null はいま選んでいる声） */
  onTest: (voiceURI: string | null) => SpeakResult;
  onStop: () => void;
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
  speechSupported,
  onTest,
  onStop,
  storageOk,
  onClose,
}: Props) {
  const localVoices = voices.filter((v) => v.local);
  const onlineVoices = voices.filter((v) => !v.local);
  const selectable = settings.allowOnlineVoices ? voices : localVoices;
  const hasMale = selectable.some((v) => v.gender === 'male');
  const hasUnknown = selectable.some((v) => v.gender === 'unknown');
  const savedMissing =
    settings.voiceURI !== null && voices.length > 0 && !selectable.some((v) => v.uri === settings.voiceURI);

  let voiceStatus: string;
  if (!speechSupported) voiceStatus = 'このブラウザーは音声の読み上げに対応していません。';
  else if (activeVoice === undefined)
    voiceStatus = '声の一覧をまだ取得できていません。端末の標準の日本語音声で読み上げます。';
  else if (activeVoice === null) voiceStatus = `端末内の日本語音声が見つかりません。${DOWNLOAD_GUIDE}`;
  else voiceStatus = `いまの声：${activeVoice.name}（${voiceSummary(activeVoice)}）`;

  return (
    <Modal title="せってい" onClose={onClose} className="settings">
      <section className="settings-section" aria-labelledby="set-voice">
        <h3 id="set-voice">声</h3>
        <p className={`settings-note ${activeVoice ? '' : 'is-warning'}`} role="status">
          {voiceStatus}
        </p>
        {savedMissing && activeVoice && (
          <p className="settings-note is-warning">
            前に選んだ声がこの端末で見つからないため、「{activeVoice.name}」を使っています。
          </p>
        )}

        {selectable.length > 0 && (
          <fieldset className="field voice-field">
            <legend>
              声をえらぶ（この端末で使える日本語の声：{selectable.length}件）
            </legend>
            {GENDER_GROUPS.map(({ gender, title }) => {
              const group = selectable.filter((v) => v.gender === gender);
              if (group.length === 0) return null;
              return (
                <div key={gender} className="voice-group">
                  <h4>{title}</h4>
                  <ul className="voice-list">
                    {group.map((v) => {
                      const selected = activeVoice?.uri === v.uri;
                      return (
                        <li key={v.uri} className={`voice-item ${selected ? 'is-on' : ''}`}>
                          <label className="voice-choice">
                            <input
                              type="radio"
                              name="voice"
                              value={v.uri}
                              checked={selected}
                              onChange={() => onChange({ ...settings, voiceURI: v.uri })}
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
            <p>※ Siri の声は、Safari やホーム画面のアプリからは使えません。ダウンロード後も一覧に出ない声は、この端末のブラウザーでは使えない声です。</p>
          </div>
        )}

        <fieldset className="field">
          <legend>はやさ</legend>
          <div className="segmented">
            {RATE_OPTIONS.map((r) => (
              <label key={r.id} className={settings.rate === r.id ? 'is-on' : ''}>
                <input
                  type="radio"
                  name="rate"
                  value={r.id}
                  checked={settings.rate === r.id}
                  onChange={() => onChange({ ...settings, rate: r.id })}
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="settings-buttons">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onTest(null)}
            disabled={!speechSupported}
          >
            <Icon name="speak" />
            <span>ためしにきく</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={onStop}>
            <Icon name="stop" />
            <span>とめる</span>
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
    </Modal>
  );
}

export { TEST_TEXT };
