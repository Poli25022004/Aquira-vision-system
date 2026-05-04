import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { BusProvider } from './hooks/BusProvider.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <BusProvider>
        <App />
    </BusProvider>
);