import { useEffect, useRef, useState } from 'react';
import { mountScene, type SceneHandle } from '../scene';
import { moveItem } from '../edit';
import { useStore } from '../store';
import { serializeHouse } from '../persist';
import { AgentPanel } from './AgentPanel';
import { SentenceBox } from './SentenceBox';

export function Editor() {
  const ref = useRef<HTMLDivElement>(null);
  const [walking, setWalking] = useState(false);
  const handle = useRef<SceneHandle | null>(null);
  const house = useStore((s) => s.house);
  const selectedId = useStore((s) => s.selectedId);
  const proposal = useStore((s) => s.proposal);
  const renovation = useStore((s) => s.renovation);
  const shown = renovation?.house ?? house;
  const notice = useStore((s) => s.notice);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const st = useStore.getState();
    const h = mountScene(el, st.house, {
      onSelect: (id) => useStore.getState().select(id),
      onWalk: setWalking,
      onMove: (id, pos) => {
        const s = useStore.getState();
        s.commit(moveItem(s.house, id, pos));
      },
    });
    handle.current = h;
    h.setHouse(st.renovation?.house ?? st.house, st.selectedId, st.proposal);
    return () => {
      h.dispose();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    handle.current?.setHouse(shown, selectedId, proposal);
  }, [shown, selectedId, proposal]);

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

  const onExport = () => {
    const url = URL.createObjectURL(new Blob([serializeHouse(useStore.getState().house)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'house.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    useStore.getState().importText(await file.text());
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3">
        <h1 className="m-0 me-auto text-xl font-bold">הבית העתידי שלי</h1>
        <div className="inline-flex gap-1 rounded-md bg-info-bg p-1">
          <button className="btn btn-ghost" onClick={() => handle.current?.setView('orbit')}>מבט תלת־ממדי</button>
          <button className="btn btn-ghost" onClick={() => handle.current?.setView('top')}>מבט מלמעלה</button>
        </div>
        {walking ? (
          <button className="btn btn-primary" onClick={() => handle.current?.exitWalk()}>יציאה</button>
        ) : (
          <button className="btn btn-primary" onClick={() => handle.current?.enterWalk()}>כניסה לדירה</button>
        )}
      </header>
      {notice && (
        <div role="status" className="fixed start-4 bottom-4 z-10 flex items-center gap-2 rounded-md bg-warn-bg py-2 ps-4 pe-2 shadow-card">
          {notice}
          <button
            className="btn btn-ghost size-10 p-0"
            aria-label="סגירה"
            onClick={() => useStore.getState().dismissNotice()}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 lg:flex-row">
        <div
          key={renovation ? 'preview' : 'house'}
          className={`card min-h-80 min-w-0 flex-1 overflow-hidden ${renovation ? 'animate-fadein' : ''}`}
          data-preview={renovation ? 'true' : undefined}
        >
          <div ref={ref} className="h-full w-full" />
        </div>
        <aside className="flex shrink-0 flex-col gap-4 overflow-y-auto lg:w-80">
          <section aria-label="עריכה" className="card flex flex-col gap-2 p-4">
            <h2 className="m-0 text-base font-bold">עריכה</h2>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn" onClick={() => useStore.getState().undo()} disabled={!canUndo}>ביטול (Ctrl+Z)</button>
              <button className="btn" onClick={() => useStore.getState().redo()} disabled={!canRedo}>שחזור (Ctrl+Shift+Z)</button>
              <button className="btn" onClick={() => useStore.getState().rotateSelected()} disabled={!selectedId}>סיבוב (R)</button>
              <button className="btn" onClick={() => useStore.getState().deleteSelected()} disabled={!selectedId}>מחיקה (Del)</button>
            </div>
            <button className="btn btn-danger" onClick={onReset}>איפוס</button>
          </section>
          <section aria-label="קובץ" className="card flex flex-col gap-2 p-4">
            <h2 className="m-0 text-base font-bold">קובץ</h2>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn" onClick={onExport}>ייצוא JSON</button>
              <label className="btn has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
                ייבוא JSON
                <input type="file" accept="application/json,.json" onChange={onImport} className="sr-only" />
              </label>
            </div>
          </section>
          <SentenceBox
            house={house}
            preview={renovation}
            onPreview={(p) => useStore.getState().previewRenovation(p)}
            onAccept={() => useStore.getState().acceptRenovation()}
          />
          <AgentPanel />
        </aside>
      </div>
    </div>
  );
}
