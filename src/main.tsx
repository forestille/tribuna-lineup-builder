import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import './index.css';

const pathname = window.location.pathname || '';
const Root = pathname.startsWith('/admin') ? AdminPanel : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
