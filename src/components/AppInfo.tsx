import { useEffect, useRef, useState, type Ref } from 'react';
import { CHANGELOG } from '../data/changelog';
import { FEEDBACK_FORM_URL } from '../data/links';
import { Icon } from './Icon';

/**
 * ご意見・ご要望（Google フォームへのリンク）。
 * URL には何も付け足さず、そのまま新しいタブ（PWA では Safari など）で開く。
 * こえのわの文章や保存データは送らない。入力中の文章は端末内に保存されているので、戻っても消えない。
 */
export function FeedbackSection() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <section className="settings-section info-section" aria-labelledby="set-feedback">
      <h3 id="set-feedback">ご意見・ご要望</h3>
      <p className="settings-note">こえのわについて、感想や改善してほしいことを教えてください。</p>
      <a className="btn btn-coral info-link" href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">
        <span>ご意見・ご要望を送る</span>
        <Icon name="external" />
      </a>
      <p className="settings-hint">Googleフォームが開きます。送信にはインターネット接続が必要です。</p>
      {!online && (
        <p className="settings-hint is-warning" role="status">
          いまはインターネットにつながっていないため、フォームを開けません。
        </p>
      )}
    </section>
  );
}

/** アップデート情報（設定画面の項目） */
export function UpdatesSection({ onOpen, buttonRef }: { onOpen: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <section className="settings-section info-section" aria-labelledby="set-updates">
      <h3 id="set-updates">アップデート情報</h3>
      <p className="settings-note">新しくなった機能や改善内容を確認できます。</p>
      <button ref={buttonRef} type="button" className="btn btn-secondary info-link" onClick={onOpen}>
        <Icon name="info" />
        <span>アップデート情報を見る</span>
      </button>
    </section>
  );
}

/**
 * アップデート情報の一覧（設定画面の中で表示する。新しいモーダルは重ねない）。
 * データは src/data/changelog.ts にあり、アプリに含まれているのでオフラインでも見られる。
 */
export function ChangelogView({ onBack }: { onBack: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section className="changelog" aria-labelledby="changelog-title">
      {/* パネルの上に同じ見出しがあるので、画面では隠し、読み上げとフォーカスの移動先にだけ使う */}
      <h3 id="changelog-title" ref={headingRef} tabIndex={-1} className="changelog-title visually-hidden">
        アップデート情報
      </h3>
      <p className="settings-hint">新しいバージョンから順に表示しています。</p>
      <ol className="changelog-list">
        {CHANGELOG.map((entry, i) => (
          <li key={entry.version} className="changelog-entry" data-testid={`changelog-${entry.version}`}>
            <div className="changelog-head">
              <span className="changelog-version">v{entry.version}</span>
              {i === 0 && <span className="changelog-latest">最新</span>}
              {entry.date && <time dateTime={entry.date}>{entry.date}</time>}
            </div>
            <h4>{entry.title}</h4>
            <ul>
              {entry.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <div className="settings-buttons">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <Icon name="left" />
          <span>せっていにもどる</span>
        </button>
      </div>
    </section>
  );
}
