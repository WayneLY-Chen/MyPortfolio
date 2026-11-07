import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// githubService.js 是 CommonJS，內部的 require('axios') 走 Node 原生的模組快取。
// 用 createRequire 拿到同一個 axios 實例再 spyOn，才會攔到 service 實際發出的請求
// （同樣的 interop 原因見 routes/projects.test.js 開頭的說明）。
const nodeRequire = createRequire(import.meta.url);
const axios = nodeRequire('axios');

// test/setup.js 在 Module._load 把所有 require('…/githubService.js') 導向替身，
// 這裡要測的正是真實模組，所以直接用 Module#load 編譯它，繞過那層 redirect。
// 它內部的 require('axios') 仍經過 Module._load，不在 redirect 清單內，拿到的是真的 axios。
const loadRealGithubService = () => {
  const realPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'githubService.js');
  const mod = new Module(realPath, null);
  mod.filename = realPath;
  mod.paths = Module._nodeModulePaths(path.dirname(realPath));
  mod.load(realPath);
  return mod.exports;
};
const { fetchUserRepos } = loadRealGithubService();

const makeRepos = (count, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({
    id: offset + i + 1,
    name: `repo-${offset + i + 1}`,
    html_url: `https://github.com/x/repo-${offset + i + 1}`,
    owner: { login: 'WayneLY-Chen' },
  }));

const isListRequest = (url) => url.endsWith('/repos');

let getSpy;
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// 模擬 GitHub：repo 清單依 page 參數分頁回傳；languages / readme 一律回空
const mockGitHub = (pages) => {
  getSpy = vi.spyOn(axios, 'get').mockImplementation(async (url, config) => {
    if (isListRequest(url)) {
      const page = config.params.page;
      const result = pages[page - 1];
      if (result instanceof Error) throw result;
      return { data: result ?? [] };
    }
    if (url.endsWith('/languages')) return { data: {} };
    return { data: null }; // readme
  });
};

const listCalls = () => getSpy.mock.calls.filter(([url]) => isListRequest(url));

describe('fetchUserRepos 分頁', () => {
  it('超過 100 個公開 repo 時會繼續抓下一頁，全部回傳', async () => {
    mockGitHub([makeRepos(100), makeRepos(100, 100), makeRepos(5, 200)]);

    const repos = await fetchUserRepos();

    expect(repos).toHaveLength(205);
    expect(listCalls().map(([, c]) => c.params.page)).toEqual([1, 2, 3]);
    expect(new Set(repos.map((r) => r.github_id)).size).toBe(205);
  });

  it('剛好 100 個時多問一頁，拿到空頁就停', async () => {
    mockGitHub([makeRepos(100), []]);

    const repos = await fetchUserRepos();

    expect(repos).toHaveLength(100);
    expect(listCalls()).toHaveLength(2);
  });

  it('不滿一頁時只發一次清單請求（現況：16 個 repo）', async () => {
    mockGitHub([makeRepos(16)]);

    const repos = await fetchUserRepos();

    expect(repos).toHaveLength(16);
    expect(listCalls()).toHaveLength(1);
  });

  it('中間某一頁失敗時整次失敗，絕不回傳只抓到一半的清單', async () => {
    // 回傳一半會讓呼叫端把第 2 頁以後的 repo 全部誤判成私人
    const err = Object.assign(new Error('rate limited'), {
      response: { status: 403, data: { message: 'API rate limit exceeded' } },
    });
    mockGitHub([makeRepos(100), err]);

    await expect(fetchUserRepos()).rejects.toThrow(/403/);
  });

  it('撞到分頁上限時整次失敗，而不是回傳被截斷的清單', async () => {
    mockGitHub(Array.from({ length: 11 }, (_, i) => makeRepos(100, i * 100)));

    await expect(fetchUserRepos()).rejects.toThrow(/分頁上限/);
    expect(listCalls()).toHaveLength(10);
  });
});
