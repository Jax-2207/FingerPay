import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function WorkspacePlaceholder() {
  return <main>FingerPay frontend workspace</main>;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Frontend root element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <WorkspacePlaceholder />
  </StrictMode>,
);
