import type { StateCreator } from "zustand";
import type { CronJob } from "../types";
import type { AppState } from "../useAppStore";

export interface CronsSlice {
  cronJobs: CronJob[];
  setCronJobs: (jobs: CronJob[]) => void;
  addCronJob: (job: CronJob) => void;
  updateCronJob: (id: string, patch: Partial<CronJob>) => void;
  removeCronJob: (id: string) => void;
}

export const createCronsSlice: StateCreator<AppState, [], [], CronsSlice> = (set) => ({
  cronJobs: [],
  setCronJobs: (cronJobs) => set({ cronJobs }),
  addCronJob: (job) => set((s) => ({ cronJobs: [job, ...s.cronJobs] })),
  updateCronJob: (id, patch) =>
    set((s) => ({ cronJobs: s.cronJobs.map((j) => (j._id === id ? { ...j, ...patch } : j)) })),
  removeCronJob: (id) =>
    set((s) => ({ cronJobs: s.cronJobs.filter((j) => j._id !== id) })),
});
