import { create } from 'zustand';
import { validateHouse, type House } from './house';
import { sampleHouse } from './sample';
import * as H from './history';
import { loadSaved, parseImport, save } from './persist';
import { deleteItem, rotateItem } from './edit';
import { acceptProposal } from './proposal';
import type { Item } from './house';
import type { Preview } from './pages/SentenceBox';

type State = H.History & {
  page: 'entry' | 'editor';
  confirmHouse: (house: House) => void;
  selectedId: string | null;
  commit: (house: House) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  select: (id: string | null) => void;
  notice: string | null;
  importText: (text: string) => void;
  dismissNotice: () => void;
  proposal: Item | null;
  propose: (item: Item | null) => void;
  acceptProposal: () => void;
  renovation: Preview | null;
  previewRenovation: (p: Preview | null) => void;
  acceptRenovation: () => void;
  rotateSelected: () => void;
  deleteSelected: () => void;
};

const parsed = validateHouse(sampleHouse);
if (!parsed.ok) throw new Error(parsed.error);

const pick = (s: State): H.History => ({
  house: s.house,
  baseline: s.baseline,
  past: s.past,
  future: s.future,
});

const saved = loadSaved();
const initial: H.History = saved
  ? { ...H.createHistory(saved.baseline), house: saved.house }
  : H.createHistory(parsed.house);

export const useStore = create<State>((set, get) => ({
  ...initial,
  // No saved house yet: the app opens on the documents page.
  page: saved ? 'editor' : 'entry',
  confirmHouse: (house) => set({ ...H.createHistory(house), selectedId: null, proposal: null, renovation: null, page: 'editor' }),
  selectedId: null,
  notice: saved && saved.repairs.length > 0 ? `הבית השמור תוקן: ${saved.repairs.join('; ')}` : null,
  dismissNotice: () => set({ notice: null }),
  importText: (text) => {
    const r = parseImport(text);
    if (!r.ok) {
      set({ notice: r.error });
      return;
    }
    set((s) => ({
      ...H.commit(pick(s), r.house),
      selectedId: null,
      notice: r.repairs.length > 0 ? `הקובץ תוקן: ${r.repairs.join('; ')}` : null,
    }));
  },
  commit: (house) => set((s) => H.commit(pick(s), house)),
  undo: () => set((s) => H.undo(pick(s))),
  redo: () => set((s) => H.redo(pick(s))),
  reset: () => set((s) => H.reset(pick(s))),
  select: (selectedId) => set({ selectedId }),
  proposal: null,
  propose: (proposal) => set({ proposal }),
  acceptProposal: () => {
    const { proposal } = get();
    if (proposal) set((s) => ({ ...H.commit(pick(s), acceptProposal(s.house, proposal)), proposal: null }));
  },
  renovation: null,
  previewRenovation: (renovation) => set({ renovation }),
  acceptRenovation: () => {
    const { renovation } = get();
    if (renovation) set((s) => ({ ...H.commit(pick(s), renovation.house), renovation: null, selectedId: null }));
  },
  rotateSelected: () => {
    const { selectedId, house } = get();
    if (selectedId) set((s) => H.commit(pick(s), rotateItem(house, selectedId)));
  },
  deleteSelected: () => {
    const { selectedId, house } = get();
    if (selectedId) set((s) => ({ ...H.commit(pick(s), deleteItem(house, selectedId)), selectedId: null }));
  },
}));

// Autosave on every house/baseline change.
let lastSaved: { house: House; baseline: House } | null = null;
useStore.subscribe((s) => {
  if (lastSaved && lastSaved.house === s.house && lastSaved.baseline === s.baseline) return;
  lastSaved = { house: s.house, baseline: s.baseline };
  const err = save(s.house, s.baseline);
  if (err !== null && s.notice !== err) useStore.setState({ notice: err });
});
