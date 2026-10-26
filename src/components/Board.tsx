import { useRef, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { keyText, PAGES, SMALL_CHARS, type KeyDef } from '../data/boards';
import { Icon } from './Icon';

/** これ以上指が動いたら「タップ」ではなく「なぞり」とみなす */
export const TAP_SLOP_PX = 14;
/** ページを切り替える横方向の最小移動量 */
export const SWIPE_MIN_PX = 50;

interface Props {
  page: number;
  /** 1 で次のページ、-1 で前のページ（端では反対側へ循環する） */
  onStep: (delta: -1 | 1) => void;
  onInput: (text: string, keyId: string) => void;
  /** ページ切り替えの向き（アニメーション用） */
  direction: -1 | 0 | 1;
}

interface Gesture {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  startKey: Element | null;
}

interface FinishedGesture {
  moved: boolean;
  startKey: Element | null;
  at: number;
}

function keyLabel(key: KeyDef): string {
  if (key.kind === 'char') return key.value;
  if (key.kind === 'space' || key.kind === 'newline') return key.label;
  return '';
}

export function Board({ page, onStep, onInput, direction }: Props) {
  const current = PAGES[page];
  const gesture = useRef<Gesture | null>(null);
  const finished = useRef<FinishedGesture | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) {
      // 2本目の指が触れたら、そのなぞり／タップは無効にする
      if (gesture.current) gesture.current.moved = true;
      return;
    }
    finished.current = null;
    gesture.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      startKey: (e.target as Element).closest('[data-key]'),
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > TAP_SLOP_PX) g.moved = true;
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.hypot(dx, dy) > TAP_SLOP_PX) g.moved = true;
    gesture.current = null;
    finished.current = { moved: g.moved, startKey: g.startKey, at: e.timeStamp };
    if (g.moved && Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
      // 左へスワイプ → 次のページ、右へスワイプ → 前のページ
      onStep(dx < 0 ? 1 : -1);
    }
  };

  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (gesture.current) finished.current = { moved: true, startKey: null, at: e.timeStamp };
    gesture.current = null;
  };

  const onKeyClick = (e: MouseEvent<HTMLButtonElement>, key: KeyDef, keyId: string) => {
    // detail === 0 はキーボード（Enter/Space）や支援技術からの操作。そのまま入力する。
    if (e.detail !== 0) {
      const f = finished.current;
      finished.current = null;
      // なぞった後、または押し始めと別のキーで指を離した場合は入力しない
      if (f && e.timeStamp - f.at < 1000 && (f.moved || f.startKey !== e.currentTarget)) return;
    }
    const text = keyText(key);
    if (text === null) return;
    const el = e.currentTarget;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    window.setTimeout(() => el.classList.remove('flash'), 200);
    onInput(text, keyId);
  };

  const rowCount = current.rows.length;
  const style = { '--cols': current.columns, '--rows': rowCount } as CSSProperties;

  return (
    <section className={`board-area page-${current.id}`} aria-label="文字盤">
      <div
        className="board-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        data-testid="board"
      >
        <div
          key={current.id}
          className={`board-grid board-${current.id} ${direction > 0 ? 'enter-next' : direction < 0 ? 'enter-prev' : ''}`}
          style={style}
          role="group"
          aria-label={`${current.number}ページ目 ${current.title}`}
          data-page={current.id}
        >
          {current.rows.flatMap((row, r) =>
            row.map((key, col) => {
              const id = `${current.id}-${r}-${col}`;
              const span = key.span ?? 1;
              const cellStyle = span > 1 ? { gridColumn: `span ${span}` } : undefined;
              if (key.kind === 'empty') {
                return <div key={id} className="key key-empty" style={cellStyle} aria-hidden="true" data-empty="true" />;
              }
              const label = keyLabel(key);
              const aria =
                key.kind === 'char' ? key.ariaLabel ?? key.value : key.kind === 'space' ? '空白' : '改行';
              return (
                <button
                  key={id}
                  type="button"
                  className={`key ${key.kind === 'char' ? 'key-char' : 'key-op'}${
                    key.kind === 'char' && SMALL_CHARS.includes(key.value) ? ' key-smallkana' : ''
                  }`}
                  style={cellStyle}
                  data-key={label}
                  aria-label={aria}
                  onClick={(e) => onKeyClick(e, key, id)}
                >
                  {key.kind === 'newline' ? (
                    <>
                      <span className="key-op-mark" aria-hidden="true">↵</span>
                      {label}
                    </>
                  ) : key.kind === 'space' ? (
                    <>
                      <span className="key-op-mark" aria-hidden="true">␣</span>
                      {label}
                    </>
                  ) : (
                    label
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>
    </section>
  );
}

interface PagerProps {
  page: number;
  onStep: (delta: -1 | 1) => void;
  onPageChange: (page: number) => void;
}

export function Pager({ page, onStep, onPageChange }: PagerProps) {
  const current = PAGES[page];
  const prev = PAGES[(page - 1 + PAGES.length) % PAGES.length];
  const next = PAGES[(page + 1) % PAGES.length];
  return (
    <nav className="pager" aria-label="文字盤のページ">
      <button
        type="button"
        className="pager-btn"
        onClick={() => onStep(-1)}
        aria-label="まえの文字盤"
        title={`${prev.number} ${prev.shortTitle}へ`}
      >
        <Icon name="left" />
        <span className="pager-btn-label">まえ</span>
      </button>
      <div className="pager-center">
        <span className="pager-title" aria-live="polite">
          <span className="pager-num" aria-hidden="true">{['①', '②', '③'][page]}</span>
          <span className="visually-hidden">{current.number}ページ目 </span>
          {current.shortTitle}
        </span>
        <span className="pager-dots">
          {PAGES.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`dot ${i === page ? 'dot-active' : ''}`}
              aria-label={`${p.number}ページ目 ${p.shortTitle}`}
              aria-current={i === page ? 'page' : undefined}
              onClick={() => onPageChange(i)}
            >
              <span />
            </button>
          ))}
        </span>
      </div>
      <button
        type="button"
        className="pager-btn"
        onClick={() => onStep(1)}
        aria-label="つぎの文字盤"
        title={`${next.number} ${next.shortTitle}へ`}
      >
        <span className="pager-btn-label">つぎ</span>
        <Icon name="right" />
      </button>
    </nav>
  );
}
