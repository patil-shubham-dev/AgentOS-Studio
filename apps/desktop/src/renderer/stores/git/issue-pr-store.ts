import { create } from "zustand"

export type IssuePRStep = "idle" | "fetching" | "analyzing" | "creating_branch" | "implementing" | "committing" | "pushing" | "creating_pr" | "done" | "error"

export interface IssueInfo {
  number: number
  title: string
  body: string
  labels: string[]
  owner: string
  repo: string
  url: string
}

interface IssuePRState {
  open: boolean
  step: IssuePRStep
  error: string | null
  issueUrl: string
  issue: IssueInfo | null
  branchName: string
  commitMessage: string
  prTitle: string
  prBody: string
  prUrl: string | null
  isDraft: boolean

  setOpen: (open: boolean) => void
  setIssueUrl: (url: string) => void
  setBranchName: (name: string) => void
  setCommitMessage: (msg: string) => void
  setPrTitle: (title: string) => void
  setPrBody: (body: string) => void
  setDraft: (draft: boolean) => void
  setIssue: (issue: IssueInfo) => void
  setStep: (step: IssuePRStep) => void
  setError: (error: string | null) => void
  setPrUrl: (url: string) => void
  reset: () => void
}

export const useIssuePRStore = create<IssuePRState>()((set) => ({
  open: false,
  step: "idle",
  error: null,
  issueUrl: "",
  issue: null,
  branchName: "",
  commitMessage: "",
  prTitle: "",
  prBody: "",
  prUrl: null,
  isDraft: true,

  setOpen: (open) => set({ open, step: "idle", error: null, prUrl: null }),
  setIssueUrl: (url) => set({ issueUrl: url }),
  setBranchName: (name) => set({ branchName: name }),
  setCommitMessage: (msg) => set({ commitMessage: msg }),
  setPrTitle: (title) => set({ prTitle: title }),
  setPrBody: (body) => set({ prBody: body }),
  setDraft: (draft) => set({ isDraft: draft }),
  setIssue: (issue) => set({ issue }),
  setStep: (step) => set({ step }),
  setError: (error) => set({ error, step: error ? "error" : "idle" }),
  setPrUrl: (url) => set({ prUrl: url }),
  reset: () => set({
    open: false, step: "idle", error: null, issueUrl: "", issue: null,
    branchName: "", commitMessage: "", prTitle: "", prBody: "", prUrl: null, isDraft: true,
  }),
}))
