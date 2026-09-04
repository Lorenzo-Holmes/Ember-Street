import React from 'react';
import ReactDOM from 'react-dom/client';
import V1Entry from './V1Entry';
import './v060.css';
import './v060.integration.css';
import './v060.main-compat.css';
import './typography.css';
import './dusk-notebook.css';
import './notebook-theme.css';
import './ui/v1/social-notebook.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <V1Entry />
  </React.StrictMode>,
);
