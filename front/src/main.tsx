import './zod-sin-eval';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/bricolage-grotesque/400.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import App from './App';
import './styles.css';

const raiz = document.getElementById('root');
if (raiz === null) throw new Error('Falta el elemento #root en index.html');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
