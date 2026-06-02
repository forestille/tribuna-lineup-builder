import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import './index.css';

const pathname = window.location.pathname || '';
const isAdminRoute =
  pathname === '/admin' ||
  pathname.startsWith('/admin/') ||
  pathname === '/world-cup/admin' ||
  pathname.startsWith('/world-cup/admin/');
const Root = isAdminRoute ? AdminPanel : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
