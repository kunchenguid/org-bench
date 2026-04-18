import { render } from 'preact';
import { App } from './ui/App';
import './styles.css';

const runNamespace = document.documentElement.dataset.runNamespace ?? 'run:local';

render(<App runNamespace={runNamespace} />, document.getElementById('app')!);
