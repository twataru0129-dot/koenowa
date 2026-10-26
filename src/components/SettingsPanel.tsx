import { RATE_OPTIONS, type Settings } from '../state/storage';
import type { SpeakResult, VoiceInfo } from '../speech/speech';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  voices: VoiceInfo[];
  activeVoice: VoiceInfo | null | undefined;
  speechSupported: boolean;
  onTest: (rate?: number) => SpeakResult;
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

  let voiceStatus: string;
  if (!speechSupported) voiceStatus = 'このブラウザーは音声の読み上げに対応していません。';
  else if (activeVoice === undefined)
    voiceStatus = '声の一覧をまだ取得できていません。端末の標準の日本語音声で読み上げます。';
  else if (activeVoice === null)
    voiceStatus =
      '端末内の日本語音声が見つかりません。iPhoneの「設定」→「アクセシビリティ」→「読み上げコンテンツ」→「声」→「日本語」から声をダウンロードしてください。';
  else voiceStatus = `いまの声：${activeVoice.name}（${activeVoice.local ? '端末内' : 'オンライン'}）`;

  return (
    <Modal title="せってい" onClose={onClose} className="settings">
      <section className="settings-section" aria-labelledby="set-voice">
        <h3 id="set-voice">声</h3>
        <p className={`settings-note ${activeVoice ? '' : 'is-warning'}`} role="status">
          {voiceStatus}
        </p>
        {selectable.length > 0 && (
          <label className="field">
            <span>声をえらぶ</span>
            <select
              value={activeVoice?.uri ?? ''}
              onChange={(e) => onChange({ ...settings, voiceURI: e.target.value || null })}
            >
              {selectable.map((v) => (
                <option key={v.uri} value={v.uri}>
                  {v.name}（{v.local ? '端末内' : 'オンライン'}・{v.lang}）
                </option>
              ))}
            </select>
          </label>
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
            onClick={() => onTest(RATE_OPTIONS.find((r) => r.id === settings.rate)?.rate)}
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
        <p className="settings-hint">ためしにきく：「{TEST_TEXT}」</p>

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
