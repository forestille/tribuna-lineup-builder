import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import './index.css';
import { AppMode } from './types.ts';

const pathname = window.location.pathname || '';
const isWorldCup = pathname.startsWith('/world-cup');
const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/world-cup/admin' || pathname.startsWith('/world-cup/admin/');
const mode: AppMode = isWorldCup ? 'world-cup' : 'uefa';
const Root = isAdmin ? AdminPanel : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root mode={mode} />
  </StrictMode>,
);
