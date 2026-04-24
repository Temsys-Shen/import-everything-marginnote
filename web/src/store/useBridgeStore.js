import { create } from "zustand";

const useBridgeStore = create((set) => ({
  logs: [],
  appendLog(entry) {
    set((state) => ({
      logs: [entry, ...state.logs].slice(0, 50),
    }));
  },
}));

export default useBridgeStore;
