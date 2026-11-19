import { useEffect, useRef, useState } from 'react';
import { mountScene } from '../scene';
import { Plan2D } from '../plan2d';
import { parseDocuments, type ParseOutcome } from '../api';
import { useStore } from '../store';
import { SentenceBox, type Preview } from './SentenceBox';
import type { House } from '../house';

const accepted = (f: File) => f.type === 'application/pdf' || f.type.startsWith('image/');

function Preview3D({ house }: { house: House }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = mountScene(el, house, { onSelect: () => {}, onMove: () => {} });
    h.setHouse(house, null);
    return () => h.dispose();
  }, [house]);
  return <div ref={ref} className="h-full w-full" />;
}

type Phase = { t: 'pick' } | { t: 'busy' } | { t: 'review'; r: Extract<ParseOutcome, { ok: true }> } | { t: 'error'; error: string; skipped: string[] };

export function Entry() {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>({ t: 'pick' });
  const [rejected, setRejected] = useState<string[]>([]);
  const [fixed, setFixed] = useState<House | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [over, setOver] = useState(false);

  const add = (list: FileList | null) => {
    if (!list) return;
    const all = Array.from(list);
    setOver(false);
    setRejected(all.filter((f) => !accepted(f)).map((f) => f.name));
    setFiles((cur) => [...cur, ...all.filter(accepted)]);
  };

  const build = async () => {
    setPhase({ t: 'busy' });
    setFixed(null);
    setPreview(null);
    const r = await parseDocuments(files);
    setPhase(r.ok ? { t: 'review', r } : { t: 'error', error: r.error, skipped: r.skipped });
  };

  if (phase.t === 'review') {
    const { repairs, skipped } = phase.r;
    const house = fixed ?? phase.r.house;
    const shown = preview?.house ?? house;
    return (
      <div className="flex min-h-full flex-col gap-4 p-4 lg:h-full">
        <header className="flex items-center gap-2">
          <h1 className="m-0 me-auto text-xl font-bold">סקירת הבית</h1>
          <button className="btn btn-primary" onClick={() => useStore.getState().confirmHouse(house)}>אישור</button>
          <button className="btn btn-ghost" onClick={() => setPhase({ t: 'pick' })}>חזרה</button>
        </header>
        {skipped.length > 0 && (
          <div role="status" className="rounded-md bg-warn-bg p-3">
            לא הצלחנו לקרוא: {skipped.join(', ')} — השאר נקראו
          </div>
        )}
        {repairs.length > 0 && (
          <div role="status" className="rounded-md bg-warn-bg p-3">
            תיקונים אוטומטיים:
            <ul className="m-0 ps-6">{repairs.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <div className="card h-80 min-w-0 flex-1 overflow-hidden lg:h-auto"><Plan2D house={shown} /></div>
          <div className="card h-80 min-w-0 flex-1 overflow-hidden lg:h-auto"><Preview3D house={shown} /></div>
        </div>
        <div>
          <SentenceBox
            house={house}
            preview={preview}
            onPreview={setPreview}
            onAccept={(p) => { setFixed(p.house); setPreview(null); }}
            title="תיקון במשפט"
            placeholder="למשל: המרפסת עמוקה 2 מטר ולא 1.6"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div className="py-6 text-center">
        <h1 className="m-0 text-3xl font-bold">הבית העתידי שלי</h1>
        <p className="mt-2 text-muted-fg">העלו את מסמכי הדירה ונבנה לכם בית שאפשר לתכנן ולשפץ</p>
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
        className={`card flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed p-10 text-center transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${over ? 'border-accent bg-warn-bg' : 'border-border hover:border-muted-fg'}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-10 text-muted-fg" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
        גררו לכאן: תוכנית מכר, נספחים, מפרט טכני (PDF / תמונות)
        <input
          type="file"
          multiple
          accept="application/pdf,image/*"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
          className="sr-only"
        />
      </label>
      {rejected.length > 0 && <p role="alert" className="m-0 rounded-md bg-warn-bg p-3">סוג קובץ לא נתמך: {rejected.join(', ')}</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="card flex items-center gap-2 py-1 ps-3 pe-1 shadow-none">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
            <span className="me-auto min-w-0 truncate">{f.name}</span>
            <button className="btn btn-ghost size-10 p-0" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`הסרת ${f.name}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </li>
        ))}
      </ul>
      {phase.t === 'busy' && <p role="status" className="m-0 text-center text-muted-fg">קורא את התוכניות…</p>}
      {phase.t === 'error' && (
        <div role="alert" className="rounded-md border border-danger bg-red-50 p-3 text-danger">
          {phase.error}
          {phase.skipped.length > 0 && <div>קבצים שלא נקראו: {phase.skipped.join(', ')}</div>}
        </div>
      )}
      <button className="btn btn-primary w-full" onClick={build} disabled={files.length === 0 || phase.t === 'busy'}>
        {phase.t === 'busy' && <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="9" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" /></svg>}
        {phase.t === 'error' ? 'נסו שוב' : 'בנה את הבית'}
      </button>
    </div>
  );
}
