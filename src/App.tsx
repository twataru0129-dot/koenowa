import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Board, Pager } from './components/Board';
import { FavoritesPanel } from './components/FavoritesPanel';
import { Icon } from './components/Icon';
import { ConfirmDialog } from './components/Modal';
import { SettingsPanel, TEST_TEXT } from './components/SettingsPanel';
import { TextDisplay } from './components/TextDisplay';
import { PAGES } from './data/boards';
import { useSpeech } from './speech/useSpeech';
import type { SpeakResult, SpeechStyle } from './speech/speech';
import { createEditorState, editorReducer } from './state/editor';
import {
  isStorageAvailable,
  loadDraft,
  loadFavorites,
  loadSettings,
  saveDraft,
  saveFavorites,
  saveSettings,
  type Favorite,
  type Settings,
} from './state/storage';

type Panel = 'none' | 'favorites' | 'settings';

const SPEAK_ERRORS: Record<Exclude<SpeakResult, { ok: true }>['reason'], string> = {
  empty: '',
  unsupported: 'このブラウザーでは音声の読み上げが使えません。',
  'no-local-voice': '端末内の日本語の声が見つかりません。「せってい」を確認してください。',
  'system-voice-may-be-online':
    'この端末では、標準音声がオンラインの声になるおそれがあるため使えません。「せってい」で声を選んでください。',
};

export default function App() {
  const [initial] = useState(loadDraft);
  const [editor, dispatch] = useReducer(editorReducer, initial, (d) => createEditorState(d.text, d.cursor));
  const [page, setPage] = useState(initial.page);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [favorites, setFavorites] = useState<Favorite[]>(loadFavorites);
  const [panel, setPanel] = useState<Panel>('none');
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState('');
  const [storageOk] = useState(isStorageAvailable);
  const lastKey = useRef<{ id: string; at: number } | null>(null);

  const { supported, speaking, voices, activeVoice, systemVoiceOk, speak, stop, refreshVoices, diagnostics } =
    useSpeech(settings);

  // 入力中の文章・カーソル・ページを自動保存（履歴は作らない）
  useEffect(() => {
    saveDraft({ text: editor.text, cursor: editor.cursor, page });
  }, [editor.text, editor.cursor, page]);
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // まえ／つぎ・スワイプは循環する（①→②→③→①、①→③→②→①）
  const stepPage = useCallback((delta: -1 | 1) => {
    setDirection(delta);
    setPage((p) => (p + delta + PAGES.length) % PAGES.length);
  }, []);

  // ページ番号の点から直接選ぶとき
  const changePage = useCallback(
    (next: number) => {
      if (next < 0 || next >= PAGES.length || next === page) return;
      setDirection(next > page ? 1 : -1);
      setPage(next);
    },
    [page],
  );

  const onInput = useCallback(
    (text: string, keyId: string) => {
      const now = Date.now();
      const guard = settings.repeatGuardMs;
      if (guard > 0 && lastKey.current && lastKey.current.id === keyId && now - lastKey.current.at < guard) return;
      lastKey.current = { id: keyId, at: now };
      dispatch({ type: 'insert', text });
    },
    [settings.repeatGuardMs],
  );

  /**
   * voice：'system' は端末の標準音声、文字列はその voiceURI の声。
   * style・rate：比較や試聴のときだけ一時的に変える。省略時はすべて設定どおり。
   */
  const doSpeak = (text: string, overrides?: { voice?: 'system' | string; style?: SpeechStyle; rate?: number }) => {
    const result = speak(text, overrides);
    if (!result.ok) setNotice(SPEAK_ERRORS[result.reason]);
    else setNotice('');
    return result;
  };

  const hasText = editor.text.trim().length > 0;

  return (
    <div className="app" data-panel={panel}>
      <header className="app-header">
        <div className="brand">
          <img src="./icons/icon-192.png" alt="" className="brand-icon" />
          <h1>こえのわ</h1>
        </div>
        <button type="button" className="btn btn-settings" onClick={() => setPanel('settings')}>
          <Icon name="gear" />
          <span>せってい</span>
        </button>
      </header>

      <main className="main">
        <div className="text-area">
          <TextDisplay
            text={editor.text}
            cursor={editor.cursor}
            onSetCursor={(cursor) => dispatch({ type: 'setCursor', cursor })}
            onMoveCursor={(delta) => dispatch({ type: 'moveCursor', delta })}
            onBackspace={() => dispatch({ type: 'backspace' })}
            onUndo={() => dispatch({ type: 'undo' })}
            onRedo={() => dispatch({ type: 'redo' })}
          />
          {notice && (
            <p className="notice" role="alert">
              {notice}
            </p>
          )}
        </div>

        <div className="actions" role="toolbar" aria-label="操作">
          <button
            type="button"
            className={`act act-speak ${speaking ? 'is-speaking' : ''}`}
            onClick={() => doSpeak(editor.text)}
            disabled={!hasText}
          >
            <Icon name="speak" />
            <span>はっせい</span>
          </button>
          <button
            type="button"
            className="act act-back"
            onClick={() => dispatch({ type: 'backspace' })}
            disabled={editor.cursor === 0}
          >
            <Icon name="backspace" />
            <span>1文字けす</span>
          </button>
          <button
            type="button"
            className="act act-undo"
            onClick={() => dispatch({ type: 'undo' })}
            disabled={editor.undo.length === 0}
          >
            <Icon name="undo" />
            <span>もどす</span>
          </button>
          <button
            type="button"
            className="act act-redo"
            onClick={() => dispatch({ type: 'redo' })}
            disabled={editor.redo.length === 0}
          >
            <Icon name="redo" />
            <span>やりなおす</span>
          </button>
          <button
            type="button"
            className="act act-clear"
            onClick={() => setConfirmClear(true)}
            disabled={editor.text === ''}
          >
            <Icon name="trash" />
            <span>ぜんぶけす</span>
          </button>
          <button type="button" className="act act-fav" onClick={() => setPanel('favorites')}>
            <Icon name="star" />
            <span>よくつかう</span>
          </button>
          <button type="button" className="act act-settings" onClick={() => setPanel('settings')}>
            <Icon name="gear" />
            <span>せってい</span>
          </button>
        </div>

        <Board page={page} onStep={stepPage} onInput={onInput} direction={direction} />
        <Pager page={page} onStep={stepPage} onPageChange={changePage} />
      </main>

      {confirmClear && (
        <ConfirmDialog
          message="文章をぜんぶけしますか？"
          detail="けしたあとでも「もどす」でもとにもどせます。"
          confirmLabel="ぜんぶけす"
          danger
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            dispatch({ type: 'clear' });
            setConfirmClear(false);
          }}
        />
      )}

      {panel === 'favorites' && (
        <FavoritesPanel
          favorites={favorites}
          onChange={setFavorites}
          currentText={editor.text}
          onSpeak={(text) => doSpeak(text)}
          onStop={stop}
          speaking={speaking}
          onClose={() => setPanel('none')}
        />
      )}

      {panel === 'settings' && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          voices={voices}
          activeVoice={activeVoice}
          systemVoiceOk={systemVoiceOk}
          onRefreshVoices={refreshVoices}
          getDiagnostics={diagnostics}
          speechSupported={supported}
          onTest={(voice, rate) => doSpeak(TEST_TEXT, { voice, rate })}
          onSpeakSample={(text, style) => doSpeak(text, { style })}
          currentText={editor.text}
          favorites={favorites}
          storageOk={storageOk}
          onClose={() => setPanel('none')}
        />
      )}
    </div>
  );
}
