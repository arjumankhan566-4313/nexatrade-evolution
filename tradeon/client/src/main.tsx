import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';
// Apex Blueprint tokens + Tailwind utilities (imported WITHOUT preflight so the
// existing terminal / chart / admin styling is never reset).
import './apex/styles/apex.css';
// Mobile-first responsive layer — loaded LAST so it only tightens what is
// above it (tap targets, safe areas, phone form fields). See the file header.
import './styles/responsive.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
