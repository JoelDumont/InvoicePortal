window.global = window;
import { Buffer } from 'buffer';
window.Buffer = Buffer;
import process from 'process';
window.process = process;

import App from './App.jsx'
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
