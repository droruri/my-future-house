import './styles.css';
import { createRoot } from 'react-dom/client';
import { Editor } from './pages/Editor';
import { Entry } from './pages/Entry';
import { useStore } from './store';

function App() {
  const page = useStore((s) => s.page);
  return page === 'entry' ? <Entry /> : <Editor />;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
