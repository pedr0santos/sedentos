import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { demo } from './lib/supabase';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import './styles/index.css';
import { registrarServiceWorker } from './lib/push';

registrarServiceWorker();

// Na demonstração as rotas ficam depois do # (a página é servida como arquivo único).
const Router = demo ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </React.StrictMode>,
);
