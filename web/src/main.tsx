import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTheme } from './stores/theme';
import { documentTitle } from './lib/branding';
import './index.css';

// Bootstrap theme BEFORE first paint so the user doesn't see a flash.
initTheme();
document.title = documentTitle();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
