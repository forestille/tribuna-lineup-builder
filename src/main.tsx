import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import WorldCupBracketPage from './components/WorldCupBracketPage.tsx';
import './index.css';
import { AppMode } from './types.ts';

const pathname = window.location.pathname || '';
const isWorldCup = pathname.startsWith('/world-cup');
const isBracket = pathname === '/world-cup/bracket' || pathname.startsWith('/world-cup/bracket/');
const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/world-cup/admin' || pathname.startsWith('/world-cup/admin/');
const mode: AppMode = isWorldCup ? 'world-cup' : 'uefa';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isBracket ? <WorldCupBracketPage /> : (isAdmin ? <AdminPanel mode={mode} /> : <App mode={mode} />)}
  </StrictMode>,
);
