import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { graphemes } from '../state/editor';

interface Props {
  text: string;
  cursor: number;
  onSetCursor: (cursor: number) => void;
  onMoveCursor: (delta: -1 | 1) => void;
  onBackspace: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * 入力した文章の表示。
 * contentEditable や input を使わないので、タップしても端末のキーボードは開かない。
 * タップした位置に近い文字の前後へカーソルを移す。
 */
export function TextDisplay({ text, cursor, onSetCursor, onMoveCursor, onBackspace, onUndo, onRedo }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const parts = useMemo(() => graphemes(text), [text]);

  // カーソルが見える位置まで文章エリアの中だけをスクロールする
  useEffect(() => {
    const box = boxRef.current;
    const caret = caretRef.current;
    if (!box || !caret) return;
    const top = caret.offsetTop;
    const bottom = top + caret.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top - 4;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 4;
  }, [text, cursor]);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!box) return;
    const spans = Array.from(box.querySelectorAll<HTMLElement>('[data-start]'));
    if (spans.length === 0) {
      onSetCursor(0);
      return;
    }
    const x = e.clientX;
    const y = e.clientY;
    const items = spans.map((el) => ({ el, rect: el.getBoundingClientRect() }));
    // 同じ行（縦方向に重なる）の文字を優先し、なければ縦方向に一番近い行
    let line = items.filter((i) => y >= i.rect.top && y <= i.rect.bottom);
    if (line.length === 0) {
      const dist = (r: DOMRect) => Math.abs((r.top + r.bottom) / 2 - y);
      const best = Math.min(...items.map((i) => dist(i.rect)));
      line = items.filter((i) => Math.abs(dist(i.rect) - best) < 2);
    }
    let target = line[0];
    let bestDx = Infinity;
    for (const item of line) {
      const dx = x < item.rect.left ? item.rect.left - x : x > item.rect.right ? x - item.rect.right : 0;
      if (dx < bestDx) {
        bestDx = dx;
        target = item;
      }
    }
    const start = Number(target.el.dataset.start);
    const end = Number(target.el.dataset.end);
    if (target.el.dataset.newline === 'true') {
      onSetCursor(start); // 改行の印の上では、その行の終わりに置く
      return;
    }
    const mid = (target.rect.left + target.rect.right) / 2;
    onSetCursor(x < mid ? start : end);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'ArrowLeft') onMoveCursor(-1);
    else if (e.key === 'ArrowRight') onMoveCursor(1);
    else if (e.key === 'Home') onSetCursor(0);
    else if (e.key === 'End') onSetCursor(text.length);
    else if (e.key === 'Backspace') onBackspace();
    else if (mod && e.key.toLowerCase() === 'z' && e.shiftKey) onRedo();
    else if (mod && e.key.toLowerCase() === 'z') onUndo();
    else if (mod && e.key.toLowerCase() === 'y') onRedo();
    else return;
    e.preventDefault();
  };

  const caret = <span ref={caretRef} className="caret" aria-hidden="true" />;
  const children: ReactNode[] = [];
  for (const g of parts) {
    if (cursor === g.start) children.push(<span key="caret">{caret}</span>);
    if (g.text === '\n') {
      children.push(
        <span key={g.start} className="ch newline-mark" data-start={g.start} data-end={g.end} data-newline="true">
          ↵
        </span>,
        <br key={`br${g.start}`} />,
      );
    } else if (g.text === ' ' || g.text === '　') {
      children.push(
        <span key={g.start} className="ch space" data-start={g.start} data-end={g.end}>
          {' '}
        </span>,
      );
    } else {
      children.push(
        <span key={g.start} className="ch" data-start={g.start} data-end={g.end}>
          {g.text}
        </span>,
      );
    }
  }
  if (cursor >= text.length) children.push(<span key="caret">{caret}</span>);

  return (
    <div className="text-panel">
      <div
        ref={boxRef}
        className="text-display"
        role="textbox"
        aria-multiline="true"
        aria-readonly="true"
        aria-label="つたえたい文章"
        aria-description="文字をタップするとカーソルが移動します"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        data-testid="text-display"
      >
        {text === '' && (
          <span className="placeholder" aria-hidden="true">
            文字盤の文字をタップして文章をつくります
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
