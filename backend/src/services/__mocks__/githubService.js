import { vi } from 'vitest';

// Manual mock for backend/src/services/githubService.js — Vitest picks this
// up automatically whenever a test calls vi.mock('../services/githubService')
// (resolved relative to the test file). Mirrors the real module's three
// exports so every consumer — including CommonJS `require('../services/githubService')`
// callers such as projectsController.js — destructures successfully.
//
// This module must never make a real network call to the GitHub API.

export const fetchUserRepos = vi.fn();
export const fetchRepoLanguages = vi.fn();
export const fetchRepoReadme = vi.fn();
