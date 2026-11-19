import { useEffect, useRef } from 'react';
import { mountScene } from '../scene';
import { sampleHouse } from '../sample';
import { validateHouse } from '../house';

export function Editor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const result = validateHouse(sampleHouse);
    if (!el || !result.ok) return;
    return mountScene(el, result.house);
  }, []);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ margin: 8, fontSize: 20 }}>הבית העתידי שלי</h1>
      <div ref={ref} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
