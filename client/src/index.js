import React from 'react';
import ReactDOM from 'react-dom';
import WebFont from 'webfontloader';
import './index.css';
import App from './App';

WebFont.load({
  google: {
    families: ['Titillium Web:300,400,700', 'sans-serif', 'Roboto Mono'],
  },
});

ReactDOM.render(<App />, document.getElementById('root'));
