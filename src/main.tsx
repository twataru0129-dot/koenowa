import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// iOS Safari のピンチ操作による拡大を抑える。ダブルタップ拡大は CSS の touch-action で抑える
// （touchend を preventDefault すると素早い連続タップの入力が消えるため使わない）
document.addEventListener('gesturestart', (e) => e.preventDefault());

// 端末内保存ができるだけ消されないよう依頼する（対応ブラウザーのみ）
navigator.storage?.persist?.().catch(() => undefined);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
