import { useState } from 'react';
import { newId, type Favorite } from '../state/storage';
import { Icon } from './Icon';
import { ConfirmDialog, Modal } from './Modal';

interface Props {
  favorites: Favorite[];
  onChange: (list: Favorite[]) => void;
  currentText: string;
  onSpeak: (text: string) => void;
  onStop: () => void;
  speaking: boolean;
  onClose: () => void;
}

/**
 * よくつかう言葉。
 * ふだんは「タップで発声」だけ。編集・削除・並べかえは「へんしゅう」に切り替えたときだけ出す。
 * 発声しても、入力中の文章は変えない。
 */
export function FavoritesPanel({ favorites, onChange, currentText, onSpeak, onStop, speaking, onClose }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Favorite | null>(null);
  const [message, setMessage] = useState('');

  const add = (text: string) => {
    const t = text.trim();
    if (!t) return;
    onChange([...favorites, { id: newId(), text: t }]);
    setMessage(`「${t}」を登録しました`);
  };

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= favorites.length) return;
    const list = [...favorites];
    [list[index], list[to]] = [list[to], list[index]];
    onChange(list);
  };

  const saveEdit = () => {
    const t = editText.trim();
    if (editId && t) onChange(favorites.map((f) => (f.id === editId ? { ...f, text: t } : f)));
    setEditId(null);
  };

  const canAddCurrent = currentText.trim().length > 0;

  return (
    <Modal
      title="よくつかう言葉"
      onClose={onClose}
      className="favorites"
      headerExtra={
        <button
          type="button"
          className={`btn btn-toggle ${editing ? 'is-on' : ''}`}
          aria-pressed={editing}
          onClick={() => {
            setEditing((v) => !v);
            setEditId(null);
          }}
        >
          <Icon name="edit" />
          <span>{editing ? 'へんしゅう中' : 'へんしゅう'}</span>
        </button>
      }
    >
      <div className="fav-toolbar">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canAddCurrent}
          onClick={() => add(currentText)}
        >
          <Icon name="plus" />
          <span>いまの文章を登録</span>
        </button>
        <button type="button" className="btn btn-secondary" onClick={onStop} disabled={!speaking}>
          <Icon name="stop" />
          <span>とめる</span>
        </button>
      </div>
      <p className="fav-message" role="status">
        {message || (editing ? '並べかえ・なおす・けすができます。' : 'タップすると、すぐに声に出します。')}
      </p>

      {!editing && (
        <ul className="fav-list" aria-label="よくつかう言葉の一覧">
          {favorites.length === 0 && <li className="fav-empty">まだ登録がありません。</li>}
          {favorites.map((f) => (
            <li key={f.id}>
              <button type="button" className="fav-speak" onClick={() => onSpeak(f.text)}>
                <Icon name="speak" />
                <span className="fav-text">{f.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <>
          <ul className="fav-edit-list" aria-label="よくつかう言葉の編集">
            {favorites.map((f, i) => (
              <li key={f.id} className="fav-edit-row">
                {editId === f.id ? (
                  <form
                    className="fav-edit-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit();
                    }}
                  >
                    <input
                      aria-label="言葉をなおす"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="btn btn-primary" disabled={!editText.trim()}>
                      ほぞん
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditId(null)}>
                      やめる
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="fav-text">{f.text}</span>
                    <span className="fav-edit-actions">
                      <button
                        type="button"
                        className="btn btn-icon"
                        aria-label={`「${f.text}」を上へ`}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <Icon name="up" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-icon"
                        aria-label={`「${f.text}」を下へ`}
                        disabled={i === favorites.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <Icon name="down" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        aria-label={`「${f.text}」をなおす`}
                        onClick={() => {
                          setEditId(f.id);
                          setEditText(f.text);
                        }}
                      >
                        <Icon name="edit" />
                        <span>なおす</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger-outline"
                        aria-label={`「${f.text}」をけす`}
                        onClick={() => setDeleteTarget(f)}
                      >
                        <Icon name="trash" />
                        <span>けす</span>
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form
            className="fav-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              add(draft);
              setDraft('');
            }}
          >
            <label htmlFor="fav-new">新しい言葉（キーボードで入力・漢字も使えます）</label>
            <div className="fav-add-row">
              <input id="fav-new" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
                <Icon name="plus" />
                <span>ついか</span>
              </button>
            </div>
          </form>
        </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`「${deleteTarget.text}」をけしますか？`}
          confirmLabel="けす"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            onChange(favorites.filter((f) => f.id !== deleteTarget.id));
            setMessage(`「${deleteTarget.text}」をけしました`);
            setDeleteTarget(null);
          }}
        />
      )}
    </Modal>
  );
}
