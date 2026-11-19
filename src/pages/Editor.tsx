import { useEffect, useRef } from 'react';
import { mountScene, type SceneHandle } from '../scene';
import { sampleHouse } from '../sample';
import { validateHouse } from '../house';

export function Editor() {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle | null>(null);
  useEffect(() => {
    const el = ref.current;
    const result = validateHouse(sampleHouse);
    if (!el || !result.ok) return;
    const h = mountScene(el, result.house);
    handle.current = h;
    return () => {
      h.dispose();
      handle.current = null;
    };
  }, []);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 8 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>הבית העתידי שלי</h1>
        <button onClick={() => handle.current?.setView('top')}>מבט מלמעלה</button>
        <button onClick={() => handle.current?.setView('orbit')}>מבט תלת־ממדי</button>
      </div>
      <div ref={ref} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
