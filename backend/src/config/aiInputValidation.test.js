import { describe, it, expect, vi } from 'vitest';

vi.mock('../db');

import {
  IMAGE_PROMPT_MAX_CHARS,
  isValidImagePrompt,
  SUMMARY_CONTENT_MAX_CHARS,
  SUMMARY_TITLE_MAX_CHARS,
  normalizeSummaryType,
  normalizeSummaryTitle,
  isValidSummaryContent,
} from './aiInputValidation.js';

describe('isValidImagePrompt', () => {
  it('一般 prompt 通過', () => {
    expect(isValidImagePrompt('a cat sitting on a keyboard')).toBe(true);
    expect(isValidImagePrompt('一隻貓坐在鍵盤上')).toBe(true);
  });

  it('前端加上 QUALITY_SUFFIX 之後仍通過', () => {
    // FunPage.jsx: prompt + ', cinematic lighting, masterpiece, 8k, ...'
    const suffix = ', cinematic lighting, masterpiece, 8k, highly detailed, Unreal Engine 5, photorealistic';
    expect(isValidImagePrompt('a cat' + suffix)).toBe(true);
  });

  // 這四個值實測會讓行程中止：prompt.split 不存在 → TypeError → 沒有 try/catch
  // → Express 4 不接 async rejection → unhandledRejection → Node 24 中止行程。
  it('非字串被拒 —— 這幾個值原本會讓整個行程中止', () => {
    expect(isValidImagePrompt(12345)).toBe(false);
    expect(isValidImagePrompt({ a: 1 })).toBe(false);
    expect(isValidImagePrompt([1, 2])).toBe(false);
    expect(isValidImagePrompt(true)).toBe(false);
  });

  it('缺少或空白被拒', () => {
    expect(isValidImagePrompt(undefined)).toBe(false);
    expect(isValidImagePrompt(null)).toBe(false);
    expect(isValidImagePrompt('')).toBe(false);
    expect(isValidImagePrompt('   ')).toBe(false);
  });

  it('邊界值：剛好上限通過，超過一個字元被拒', () => {
    expect(isValidImagePrompt('x'.repeat(IMAGE_PROMPT_MAX_CHARS))).toBe(true);
    expect(isValidImagePrompt('x'.repeat(IMAGE_PROMPT_MAX_CHARS + 1))).toBe(false);
  });

  it('上限與 Stability SDXL 的 2000 字元一致', () => {
    expect(IMAGE_PROMPT_MAX_CHARS).toBe(2000);
  });
});

describe('normalizeSummaryType', () => {
  it('前端實際送出的兩種值原樣保留', () => {
    // Projects.jsx 送 'project'、Blog.jsx 送 'blog'
    expect(normalizeSummaryType('project')).toBe('project');
    expect(normalizeSummaryType('blog')).toBe('blog');
  });

  it('其他值退回 project，與修補前的三元式行為一致', () => {
    expect(normalizeSummaryType('anything-else')).toBe('project');
    expect(normalizeSummaryType(undefined)).toBe('project');
    expect(normalizeSummaryType(null)).toBe('project');
    expect(normalizeSummaryType(123)).toBe('project');
  });

  it('原型鍵不會命中白名單', () => {
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(normalizeSummaryType(key), `${key} 應退回 project`).toBe('project');
    }
  });
});

describe('normalizeSummaryTitle', () => {
  it('一般標題原樣保留（去除前後空白）', () => {
    expect(normalizeSummaryTitle('  MyPortfolio  ')).toBe('MyPortfolio');
  });

  // 修補前 title 是唯一一個原樣、無界進入 prompt 的欄位：content 至少有
  // slice(0, 2000)，title 完全沒有。body 上限 100kb 內的任何長度都會送進 Gemini。
  it('超長標題被截斷 —— 這是唯一無界進入 prompt 的欄位', () => {
    expect(normalizeSummaryTitle('T'.repeat(100000)).length).toBe(SUMMARY_TITLE_MAX_CHARS);
  });

  it('非字串回空字串，由呼叫端補「無標題」', () => {
    expect(normalizeSummaryTitle(undefined)).toBe('');
    expect(normalizeSummaryTitle(null)).toBe('');
    expect(normalizeSummaryTitle(123)).toBe('');
    expect(normalizeSummaryTitle({})).toBe('');
  });
});

describe('isValidSummaryContent', () => {
  it('一般內容通過', () => {
    expect(isValidSummaryContent('這是一篇文章的內容')).toBe(true);
  });

  it('非字串被拒 —— 修補前會走到 content.slice() 上', () => {
    expect(isValidSummaryContent(123)).toBe(false);
    expect(isValidSummaryContent({})).toBe(false);
    expect(isValidSummaryContent([])).toBe(false);
  });

  it('缺少或空白被拒', () => {
    expect(isValidSummaryContent(undefined)).toBe(false);
    expect(isValidSummaryContent('')).toBe(false);
    expect(isValidSummaryContent('   ')).toBe(false);
  });

  it('邊界值：剛好上限通過，超過一個字元被拒', () => {
    expect(isValidSummaryContent('x'.repeat(SUMMARY_CONTENT_MAX_CHARS))).toBe(true);
    expect(isValidSummaryContent('x'.repeat(SUMMARY_CONTENT_MAX_CHARS + 1))).toBe(false);
  });
});
