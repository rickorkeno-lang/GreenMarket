import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app/App';
import '@/shared/global.css';
import { Diagnostics } from '@/platform-core/diagnostics/Diagnostics';
import { createLocalFileSink } from '@/platform-core/diagnostics/LocalFileSink';

Diagnostics.addSink(createLocalFileSink().sink);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
