import { create } from 'zustand';

// A store holds state that many screens share. Components read it with a selector,
// and re-render only when the value they selected changes.
type CounterState = { <!-- ts -->
  count: number; <!-- ts -->
  increase: () => void; <!-- ts -->
  reset: () => void; <!-- ts -->
}; <!-- ts -->
<!-- ts -->
export const useCounterStore = create<CounterState>()((set) => ({ <!-- ts -->
export const useCounterStore = create((set) => ({ <!-- js -->
  count: 0,
  increase: () => set((state) => ({ count: state.count + 1 })),
  reset: () => set({ count: 0 }),
}));
