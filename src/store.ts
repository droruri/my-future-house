import { create } from 'zustand';
import { validateHouse, type House } from './house';
import { sampleHouse } from './sample';
import * as H from './history';
import { deleteItem, rotateItem } from './edit';

type State = H.History & {
  selectedId: string | null;
  commit: (house: House) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  select: (id: string | null) => void;
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

export const useStore = create<State>((set, get) => ({
  ...H.createHistory(parsed.house),
  selectedId: null,
  commit: (house) => set((s) => H.commit(pick(s), house)),
  undo: () => set((s) => H.undo(pick(s))),
  redo: () => set((s) => H.redo(pick(s))),
  reset: () => set((s) => H.reset(pick(s))),
  select: (selectedId) => set({ selectedId }),
  rotateSelected: () => {
    const { selectedId, house } = get();
    if (selectedId) set((s) => H.commit(pick(s), rotateItem(house, selectedId)));
  },
  deleteSelected: () => {
    const { selectedId, house } = get();
    if (selectedId) set((s) => ({ ...H.commit(pick(s), deleteItem(house, selectedId)), selectedId: null }));
  },
}));
