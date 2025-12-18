import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Shim process for browser environments to prevent 'process is not defined' errors
// when using process.env.API_KEY as required by the Gemini SDK guidelines.
(window as any).process = {
  env: {
    API_KEY: (window as any).process?.env?.API_KEY || ''
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);