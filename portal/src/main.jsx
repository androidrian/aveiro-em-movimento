import React from 'react';
import { createRoot } from 'react-dom/client';
// Tipos de letra embutidos no pacote: a página não depende da internet.
import '@fontsource/overpass/latin-400.css';
import '@fontsource/overpass/latin-600.css';
import '@fontsource/overpass/latin-800.css';
import '@fontsource/overpass-mono/latin-400.css';
import '@fontsource/overpass-mono/latin-600.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
