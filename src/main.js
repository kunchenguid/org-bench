import './styles.css'

import { renderApp } from './app'

const root = document.querySelector('#app')

if (!root) {
  throw new Error('Expected #app root element')
}

root.replaceChildren(renderApp())
