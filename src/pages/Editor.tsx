import { useEffect, useRef } from 'react';
import { mountScene, type SceneHandle } from '../scene';
import { moveItem } from '../edit';
import { useStore } from '../store';

export function Editor() {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle | null>(null);
  const house = useStore((s) => s.house);
  const selectedId = useStore((s) => s.selectedId);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const st = useStore.getState();
    const h = mountScene(el, st.house, {
      onSelect: (id) => useStore.getState().select(id),
      onMove: (id, pos) => {
        const s = useStore.getState();
        s.commit(moveItem(s.house, id, pos));
      },
    });
    handle.current = h;
    h.setHouse(st.house, st.selectedId);
    return () => {
      h.dispose();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    handle.current?.setHouse(house, selectedId);
  }, [house, selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (!mod && key === 'r') s.rotateSelected();
      else if (key === 'delete' || key === 'backspace') s.deleteSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onReset = () => {
    if (window.confirm('לאפס את הבית למצב ההתחלתי?')) useStore.getState().reset();
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 8 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>הבית העתידי שלי</h1>
        <button onClick={() => handle.current?.setView('top')}>מבט מלמעלה</button>
        <button onClick={() => handle.current?.setView('orbit')}>מבט תלת־ממדי</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div ref={ref} style={{ flex: 1, minWidth: 0 }} />
        <aside style={{ width: 160, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => useStore.getState().undo()} disabled={!canUndo}>ביטול (Ctrl+Z)</button>
          <button onClick={() => useStore.getState().redo()} disabled={!canRedo}>שחזור (Ctrl+Shift+Z)</button>
          <button onClick={onReset}>איפוס</button>
          <button onClick={() => useStore.getState().rotateSelected()} disabled={!selectedId}>סיבוב (R)</button>
          <button onClick={() => useStore.getState().deleteSelected()} disabled={!selectedId}>מחיקה (Del)</button>
        </aside>
      </div>
    </div>
  );
}
