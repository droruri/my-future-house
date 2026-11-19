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
  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}

type Phase = { t: 'pick' } | { t: 'busy' } | { t: 'review'; r: Extract<ParseOutcome, { ok: true }> } | { t: 'error'; error: string; skipped: string[] };

export function Entry() {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>({ t: 'pick' });
  const [rejected, setRejected] = useState<string[]>([]);
  const [fixed, setFixed] = useState<House | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const all = Array.from(list);
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
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ margin: 8, fontSize: 20 }}>סקירת הבית</h1>
        {skipped.length > 0 && (
          <div role="status" style={{ margin: '0 8px', padding: 8, background: '#fff3cd' }}>
            לא הצלחנו לקרוא: {skipped.join(', ')} — השאר נקראו
          </div>
        )}
        {repairs.length > 0 && (
          <div role="status" style={{ margin: 8, padding: 8, background: '#fff3cd' }}>
            תיקונים אוטומטיים:
            <ul style={{ margin: 0 }}>{repairs.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0 }}><Plan2D house={shown} /></div>
          <div style={{ flex: 1, minWidth: 0 }}><Preview3D house={shown} /></div>
        </div>
        <div style={{ margin: '0 8px' }}>
          <SentenceBox
            house={house}
            preview={preview}
            onPreview={setPreview}
            onAccept={(p) => { setFixed(p.house); setPreview(null); }}
            title="תיקון במשפט"
            placeholder="למשל: המרפסת עמוקה 2 מטר ולא 1.6"
          />
        </div>
        <div style={{ margin: 8, display: 'flex', gap: 8 }}>
          <button onClick={() => useStore.getState().confirmHouse(house)}>אישור</button>
          <button onClick={() => setPhase({ t: 'pick' })}>חזרה</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
      <h1>הבית העתידי שלי</h1>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
        style={{ display: 'block', border: '2px dashed #888', padding: 32, textAlign: 'center', cursor: 'pointer' }}
      >
        גררו לכאן: תוכנית מכר, נספחים, מפרט טכני (PDF / תמונות)
        <input
          type="file"
          multiple
          accept="application/pdf,image/*"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />
      </label>
      {rejected.length > 0 && <p role="alert">סוג קובץ לא נתמך: {rejected.join(', ')}</p>}
      <ul>
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`}>
            ✓ {f.name}{' '}
            <button onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`הסרת ${f.name}`}>×</button>
          </li>
        ))}
      </ul>
      {phase.t === 'busy' && <p role="status">קורא את התוכניות…</p>}
      {phase.t === 'error' && (
        <div role="alert" style={{ padding: 8, background: '#f8d7da' }}>
          {phase.error}
          {phase.skipped.length > 0 && <div>קבצים שלא נקראו: {phase.skipped.join(', ')}</div>}
        </div>
      )}
      <button onClick={build} disabled={files.length === 0 || phase.t === 'busy'}>
        {phase.t === 'error' ? 'נסו שוב' : 'בנה את הבית'}
      </button>
    </div>
  );
}
