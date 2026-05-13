import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { lockMobilePwaOrientation, registerServiceWorker } from './pwa';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

registerServiceWorker();
lockMobilePwaOrientation();
