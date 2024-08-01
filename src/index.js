import React from 'react';
import DemoVTO from './js/demos/VTO.js';
import { render } from 'react-dom';
import { AppContainer } from 'react-hot-loader';
import { Switch, Route, BrowserRouter as Router } from 'react-router-dom';

import './styles/index.scss';

render(
  <AppContainer>
    <Router>
      <Switch>
        <Route path="/:modelName?" component={DemoVTO} />
      </Switch>
    </Router>
  </AppContainer>,
  document.querySelector('#root')
);
