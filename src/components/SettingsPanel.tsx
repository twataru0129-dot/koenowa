import { useState } from 'react';
import { RATE_OPTIONS, type Settings } from '../state/storage';
import type { SpeakResult, VoiceDiagnostics, VoiceGender, VoiceInfo, VoiceQuality } from '../speech/speech';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  voices: VoiceInfo[];
  activeVoice: VoiceInfo | null | undefined;
  /** 端末の標準音声（自動）を使ってよい環境か */
  systemVoiceOk: boolean;
  speechSupported: boolean;
  /** 試聴する。'system' は端末の標準音声、文字列はその voiceURI の声、undefined はいま選んでいる声 */
  onTest: (voice?: 'system' | string) => SpeakResult;
  onRefreshVoices: () => void;
  getDiagnostics: () => VoiceDiagnostics;
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
  systemVoiceOk,
  speechSupported,
  onTest,
  onStop,
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

  return (
    <Modal title="せってい" onClose={onClose} className="settings">
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
            onClick={() => onTest()}
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

      <VoiceDiagnosticsSection
        allowOnline={settings.allowOnlineVoices}
        getDiagnostics={getDiagnostics}
        onRefresh={onRefreshVoices}
      />
    </Modal>
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
