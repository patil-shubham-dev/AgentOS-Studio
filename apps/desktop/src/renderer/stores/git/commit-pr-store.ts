import { create } from "zustand"

export type CommitStep = "idle" | "form" | "committing" | "pushing" | "creating_pr" | "done" | "error"

export interface CommitPRState {
  open: boolean
  step: CommitStep
  commitMessage: string
  branchName: string
  prTitle: string
  prBody: string
  isDraft: boolean
  error: string | null
  prUrl: string | null
  prNumber: number | null
  filesChanged: { path: string; additions: number; deletions: number }[]
  owner: string
  repo: string
  setOpen: (open: boolean) => void
  setStep: (step: CommitStep) => void
  setCommitMessage: (msg: string) => void
  setBranchName: (name: string) => void
  setPrTitle: (title: string) => void
  setPrBody: (body: string) => void
  setIsDraft: (draft: boolean) => void
  setError: (err: string | null) => void
  setResult: (url: string, number: number) => void
  setFilesChanged: (files: { path: string; additions: number; deletions: number }[]) => void
  setRepoInfo: (owner: string, repo: string) => void
  reset: () => void
}

export const useCommitPRStore = create<CommitPRState>((set) => ({
  open: false,
  step: "idle",
  commitMessage: "",
  branchName: "",
  prTitle: "",
  prBody: "",
  isDraft: false,
  error: null,
  prUrl: null,
  prNumber: null,
  filesChanged: [],
  owner: "",
  repo: "",

  setOpen: (open) => set({ open, step: open ? "form" : "idle", error: null, prUrl: null, prNumber: null }),
  setStep: (step) => set({ step }),
  setCommitMessage: (commitMessage) => set({ commitMessage }),
  setBranchName: (branchName) => set({ branchName }),
  setPrTitle: (prTitle) => set({ prTitle }),
  setPrBody: (prBody) => set({ prBody }),
  setIsDraft: (isDraft) => set({ isDraft }),
  setError: (error) => set({ error, step: "error" }),
  setResult: (prUrl, prNumber) => set({ prUrl, prNumber, step: "done" }),
  setFilesChanged: (filesChanged) => set({ filesChanged }),
  setRepoInfo: (owner, repo) => set({ owner, repo }),
  reset: () => set({
    open: false, step: "idle", commitMessage: "", branchName: "", prTitle: "", prBody: "",
    isDraft: false, error: null, prUrl: null, prNumber: null, filesChanged: [],
  }),
}))
