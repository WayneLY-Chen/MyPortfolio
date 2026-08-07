// 測「檢查器本身是對的」。
//
// 這一層存在的理由:evals.test.js 的每一條斷言都建立在 checks.mjs 的量尺上。
// 量尺歪掉的話,離線層會是一整套看起來很綠、實際上沒在量任何東西的斷言。
// 所以這裡全部用手寫的已知輸入對已知輸出,不碰任何 fixture、不碰網路。
import { describe, it, expect } from 'vitest';

import {
  bigramJaccard,
  tokenJaccard,
  textSimilarity,
  cjkRatio,
  cjkCharCount,
  countByType,
  fresherAssumptionHits,
  sitePropNounHits,
  genericSuggestionHits,
  suggestionReusesAnswerTerms,
  maxPairwiseSimilarity,
  maxCrossSimilarity,
  duplicateCommentPairs,
  checkQuestionSet,
  checkScoringShape,
  checkSuggestionSpecificity,
} from './checks.mjs';

describe('bigramJaccard', () => {
  it('只差一個字的兩句中文,相似度明顯高於兩句無關中文', () => {
    const near = bigramJaccard('資料庫索引怎麼選', '資料庫索引怎麼建');
    const far = bigramJaccard('資料庫索引怎麼選', '請說說你怎麼跟同事處理意見不合');
    expect(near).toBeGreaterThan(0.6);
    expect(far).toBeLessThan(0.1);
    expect(near).toBeGreaterThan(far);
  });

  it('同一段文字對自己為 1,兩邊皆空為 0', () => {
    expect(bigramJaccard('渲染流程', '渲染流程')).toBe(1);
    expect(bigramJaccard('', '')).toBe(0);
    expect(bigramJaccard('渲染流程', '')).toBe(0);
  });

  it('忽略標點與空白 —— 只有標點不同不該被算成不同題', () => {
    expect(bigramJaccard('畫面掉幀,你會怎麼查?', '畫面掉幀 你會怎麼查')).toBe(1);
  });
});

describe('tokenJaccard', () => {
  it('剔除停用詞後,只差一個內容詞的兩句英文偏高', () => {
    const near = tokenJaccard(
      'How would you debug a slow database query',
      'How would you debug a slow database index'
    );
    // 內容詞:debug/slow/database + query|index → 交集 3、聯集 5
    expect(near).toBeCloseTo(0.6, 5);
    expect(near).toBeGreaterThan(0.5);
  });

  it('停用詞不得自己撐出相似度', () => {
    // 兩句只共用停用詞(how/would/you/your/is/are/to/of/in/and/for/the/a)
    expect(tokenJaccard('How would you handle caching', 'How would you handle accessibility'))
      .toBeLessThan(0.6);
    expect(tokenJaccard('what is the a of in and for', 'how would you are to of in')).toBe(0);
  });
});

describe('textSimilarity', () => {
  it('依語言分派:zh 走 bigram、en 走 token', () => {
    expect(textSimilarity('資料庫索引怎麼選', '資料庫索引怎麼建', 'zh'))
      .toBe(bigramJaccard('資料庫索引怎麼選', '資料庫索引怎麼建'));
    expect(textSimilarity('debug a slow query', 'debug a slow index', 'en'))
      .toBe(tokenJaccard('debug a slow query', 'debug a slow index'));
  });

  it('沒給語言時依有無 CJK 自動判斷', () => {
    expect(textSimilarity('資料庫索引怎麼選', '資料庫索引怎麼建'))
      .toBe(bigramJaccard('資料庫索引怎麼選', '資料庫索引怎麼建'));
    expect(textSimilarity('debug a slow query', 'debug a slow index'))
      .toBe(tokenJaccard('debug a slow query', 'debug a slow index'));
  });
});

describe('cjkRatio', () => {
  it('中文夾雜技術名詞仍算高純度,純英文為 0', () => {
    const zh = cjkRatio('React 的渲染流程');
    expect(zh).toBeGreaterThan(0.5);
    expect(zh).toBeLessThan(1);
    expect(cjkRatio('How would you debug this')).toBe(0);
    expect(cjkRatio('渲染流程')).toBe(1);
  });

  it('英文詞以「一個詞算一份」計,不是一個字母算一份', () => {
    // 一個 5 字母技術名詞若逐字母計,'React 的渲染流程' 會掉到 0.5;
    // 逐詞計才是 QG-5「技術名詞夾雜是正常的」要的量尺。
    expect(cjkRatio('React 的渲染流程')).toBeCloseTo(5 / 6, 5);
    expect(cjkRatio('re-render 的成本')).toBeCloseTo(3 / 4, 5);
  });

  it('沒有任何文字時回 0,不回 NaN', () => {
    expect(cjkRatio('')).toBe(0);
    expect(cjkRatio('   ,。!')).toBe(0);
    expect(cjkRatio(null)).toBe(0);
  });
});

describe('cjkCharCount', () => {
  it('數的是漢字數量,en 模式的題目必須為 0', () => {
    expect(cjkCharCount('How would you debug this')).toBe(0);
    expect(cjkCharCount('React 的渲染流程')).toBe(5);
  });
});

describe('countByType', () => {
  it('正確回 technical / behavioral 兩個計數', () => {
    const qs = [
      { type: 'technical', text: 'a' },
      { type: 'technical', text: 'b' },
      { type: 'technical', text: 'c' },
      { type: 'technical', text: 'd' },
      { type: 'behavioral', text: 'e' },
    ];
    expect(countByType(qs)).toEqual({ technical: 4, behavioral: 1 });
    expect(countByType([])).toEqual({ technical: 0, behavioral: 0 });
    // 不認得的 type 不計入任何一邊 —— 靜默歸類會讓 QG-3 的配比檢查失去意義
    expect(countByType([{ type: 'weird', text: 'x' }])).toEqual({ technical: 0, behavioral: 0 });
  });
});

describe('fresherAssumptionHits', () => {
  it('命中預設正式生產經驗的用語', () => {
    expect(fresherAssumptionHits('請描述一次線上事故的處理過程').length).toBeGreaterThan(0);
    expect(fresherAssumptionHits('Describe your on-call rotation').length).toBeGreaterThan(0);
    expect(fresherAssumptionHits('你們團隊在生產環境怎麼部署?').length).toBeGreaterThan(0);
    expect(fresherAssumptionHits('Tell me about a production outage you handled').length)
      .toBeGreaterThan(0);
  });

  it('乾淨的新鮮人題回空陣列', () => {
    expect(fresherAssumptionHits('你在課堂專案裡遇過哪一次行為跟預期不符?你怎麼一步步縮小範圍?'))
      .toEqual([]);
    expect(fresherAssumptionHits('If you redid your last course assignment, what would you change?'))
      .toEqual([]);
  });

  it('回傳的是命中的字串本身,讓記分卡印得出來給人複判', () => {
    expect(fresherAssumptionHits('請描述一次線上事故')).toContain('線上事故');
  });
});

describe('sitePropNounHits', () => {
  it('命中站內專有名詞,一般技術題不命中', () => {
    expect(sitePropNounHits('請說明 Wobot 的對話流程')).toContain('Wobot');
    expect(sitePropNounHits('談談 yorkiedog 這個專案').length).toBeGreaterThan(0);
    expect(sitePropNounHits('MyPortfolio 的部署方式?').length).toBeGreaterThan(0);
    expect(sitePropNounHits('一個列表在捲動時掉幀,你會怎麼找出原因?')).toEqual([]);
    // 「你的作品集」是通用說法,不是站內專有名詞 —— 不得誤殺
    expect(sitePropNounHits('Walk me through a project in your portfolio')).toEqual([]);
  });
});

describe('genericSuggestionHits', () => {
  it('命中放諸四海皆準的場面話', () => {
    expect(genericSuggestionHits('請多加練習').length).toBeGreaterThan(0);
    expect(genericSuggestionHits('可以再多說明一點').length).toBeGreaterThan(0);
    expect(genericSuggestionHits('Practice more and be more detailed').length).toBeGreaterThan(0);
  });

  it('引用了答案具體用詞的長建議不命中', () => {
    expect(
      genericSuggestionHits('你提到用虛擬列表解決長清單,下一步可以估一下 item 高度不固定時要怎麼量測,並說明你會怎麼驗證捲動位置沒有跳動。')
    ).toEqual([]);
    expect(
      genericSuggestionHits('You mentioned an LRU cache — name the eviction metric you would watch and what value would make you resize it.')
    ).toEqual([]);
  });
});

describe('suggestionReusesAnswerTerms', () => {
  const question = '一個長清單在捲動時掉幀,你會怎麼找出原因並改善?';

  it('建議引用了「只出現在答案、沒出現在題目」的內容詞時為 true', () => {
    const answer = '我會先用 profiler 量測,再導入虛擬列表只渲染可視區域的項目。';
    const suggestion = '你提到虛擬列表,可以再說明 item 高度不固定時要怎麼量測。';
    expect(suggestionReusesAnswerTerms(suggestion, answer, question)).toBe(true);
  });

  it('建議只重複題目裡就有的詞時為 false', () => {
    const answer = '我會先用 profiler 量測,再導入虛擬列表只渲染可視區域的項目。';
    const suggestion = '請再多談談長清單捲動時掉幀的原因。';
    expect(suggestionReusesAnswerTerms(suggestion, answer, question)).toBe(false);
  });

  it('英文以長度 ≥ 4 的非停用詞為內容詞', () => {
    const q = 'How would you make a slow page feel faster to the user';
    const a = 'I would ship a skeleton screen first and defer the analytics bundle';
    expect(suggestionReusesAnswerTerms('Name the metric you would watch after deferring the analytics bundle', a, q)).toBe(true);
    expect(suggestionReusesAnswerTerms('Try to make the page feel faster for the user', a, q)).toBe(false);
  });
});

describe('maxPairwiseSimilarity / maxCrossSimilarity', () => {
  it('組內最相似的一對被找出來,並回報是哪兩題', () => {
    const texts = ['資料庫索引怎麼選', '請談談你跟同事意見不合的一次', '資料庫索引怎麼建'];
    const r = maxPairwiseSimilarity(texts, 'zh');
    expect(r.value).toBeCloseTo(bigramJaccard(texts[0], texts[2]), 5);
    expect(r.pair).toEqual([0, 2]);
  });

  it('少於兩則時回 0', () => {
    expect(maxPairwiseSimilarity([], 'zh').value).toBe(0);
    expect(maxPairwiseSimilarity(['只有一題'], 'zh').value).toBe(0);
  });

  it('跨兩組時只比對跨組的對,不比組內', () => {
    const a = ['資料庫索引怎麼選', '資料庫索引怎麼建'];
    const b = ['請談談你跟同事意見不合的一次'];
    const r = maxCrossSimilarity(a, b, 'zh');
    // 組內那對 0.75 不得被算進來
    expect(r.value).toBeLessThan(0.2);
  });
});

describe('duplicateCommentPairs', () => {
  it('抓到兩題拿到逐字相同評語的情形(逐題回饋錯位的典型症狀)', () => {
    const per = [
      { index: 0, comment: '你指出了索引選擇的取捨,但沒談寫入成本。' },
      { index: 1, comment: '你指出了索引選擇的取捨,但沒談寫入成本。' },
      { index: 2, comment: '這題沒有作答。' },
    ];
    const dups = duplicateCommentPairs(per);
    expect(dups.length).toBe(1);
    expect(dups[0].pair).toEqual([0, 1]);
    expect(dups[0].similarity).toBe(1);
  });

  it('內容真的不同的評語不算重複', () => {
    const per = [
      { index: 0, comment: '你指出了索引選擇的取捨,但沒談寫入成本。' },
      { index: 1, comment: '快取失效的部分只講了 TTL,沒提寫入時的處理。' },
    ];
    expect(duplicateCommentPairs(per)).toEqual([]);
  });

  it('空評語不算重複 —— 那是另一個問題,不該混進來', () => {
    expect(duplicateCommentPairs([{ comment: '' }, { comment: '' }])).toEqual([]);
  });

  it('ignoreIndices 指定的題號被排除 —— 跳過的題共用「未作答。」是正常的', () => {
    const per = [
      { comment: '你指出了索引選擇的取捨,但沒談寫入成本。' },
      { comment: '未作答。' },
      { comment: '未作答。' },
    ];
    expect(duplicateCommentPairs(per)).toHaveLength(1);
    expect(duplicateCommentPairs(per, { ignoreIndices: [1, 2] })).toEqual([]);
  });
});

describe('checkQuestionSet', () => {
  const zhCapture = {
    track: 'frontend',
    language: 'zh',
    questions: [
      { type: 'technical', text: '一個長清單在捲動時掉幀,你會怎麼一步步找出原因?' },
      { type: 'technical', text: '什麼情況下你會把狀態往上提到共同父層?請說明取捨。' },
      { type: 'technical', text: '首屏速度與互動就緒之間要取捨時,你怎麼決定先救哪一個?' },
      { type: 'technical', text: '鍵盤使用者打不開你的彈窗,你會從哪裡開始查?' },
      { type: 'behavioral', text: '請談談一次你跟設計師對某個互動有不同意見的經驗。' },
    ],
  };

  it('回報題數、題型配比、最長題目、組內最高相似度與語言純度', () => {
    const r = checkQuestionSet(zhCapture);
    expect(r.count).toBe(5);
    expect(r.tech).toBe(4);
    expect(r.beh).toBe(1);
    expect(r.maxLen).toBeLessThanOrEqual(200);
    expect(r.maxLen).toBeGreaterThan(10);
    expect(r.maxPairJaccard).toBeLessThan(0.6);
    expect(r.cjkRatioMin).toBeGreaterThanOrEqual(0.6);
    expect(r.siteHits).toEqual([]);
    expect(r.fresherHits).toEqual([]);
  });

  it('英文擷取的 cjkCharCountMax 為 0', () => {
    const r = checkQuestionSet({
      track: 'fresher',
      language: 'en',
      questions: [
        { type: 'technical', text: 'A script works on your machine but not a classmate\'s. How do you narrow it down?' },
        { type: 'behavioral', text: 'What would you change if you redid your last course project?' },
      ],
    });
    expect(r.cjkCharCountMax).toBe(0);
    expect(r.count).toBe(2);
  });

  it('黑名單命中會被回報,並帶著是第幾題', () => {
    const r = checkQuestionSet({
      track: 'fresher',
      language: 'zh',
      questions: [
        { type: 'technical', text: '請描述你在線上事故時的第一步。' },
        { type: 'technical', text: '請說明 Wobot 的對話流程。' },
      ],
    });
    expect(r.fresherHits).toEqual([{ index: 0, hit: '線上事故' }]);
    expect(r.siteHits).toEqual([{ index: 1, hit: 'Wobot' }]);
  });

  it('用字元碼點數量算長度,不是 UTF-16 單位', () => {
    const r = checkQuestionSet({ language: 'zh', questions: [{ type: 'technical', text: '一二三四五' }] });
    expect(r.maxLen).toBe(5);
  });
});

describe('checkScoringShape', () => {
  const answers = ['很完整的答案', null, '中等的答案', null, null];
  const result = {
    overallScore: 62,
    perQuestion: [
      { index: 0, skipped: false, score: 78, comment: 'c0', suggestion: 's0' },
      { index: 1, skipped: true, score: null, comment: 'c1', suggestion: 's1' },
      { index: 2, skipped: false, score: 46, comment: 'c2', suggestion: 's2' },
      { index: 3, skipped: true, score: null, comment: 'c3', suggestion: 's3' },
      { index: 4, skipped: true, score: null, comment: 'c4', suggestion: '' },
    ],
  };

  it('回報逐題數量、跳題位置與已作答題的算術平均', () => {
    const r = checkScoringShape(result, answers);
    expect(r.perQuestionCount).toBe(5);
    expect(r.skippedIndices).toEqual([1, 3, 4]);
    expect(r.answeredIndices).toEqual([0, 2]);
    expect(r.scoredMean).toBe(62); // (78 + 46) / 2
    expect(r.overallScore).toBe(62);
  });

  it('任何一則跳題缺 comment 或 suggestion,skippedHaveGuidance 就是 false', () => {
    expect(checkScoringShape(result, answers).skippedHaveGuidance).toBe(false);
    const fixed = {
      ...result,
      perQuestion: result.perQuestion.map((p) => (p.index === 4 ? { ...p, suggestion: 's4' } : p)),
    };
    expect(checkScoringShape(fixed, answers).skippedHaveGuidance).toBe(true);
  });

  it('模型自己標的 skipped 與實際跳題位置分開回報 —— 兩者不一致就是錯位', () => {
    const misaligned = {
      ...result,
      perQuestion: result.perQuestion.map((p, i) => ({ ...p, skipped: i === 0 })),
    };
    const r = checkScoringShape(misaligned, answers);
    expect(r.skippedIndices).toEqual([1, 3, 4]);
    expect(r.modelSkippedIndices).toEqual([0]);
    expect(r.skippedAligned).toBe(false);
    expect(checkScoringShape(result, answers).skippedAligned).toBe(true);
  });

  it('全部跳過時 scoredMean 為 null,不是 0 也不是 NaN', () => {
    const allSkipped = {
      overallScore: 0,
      perQuestion: [0, 1, 2].map((i) => ({ index: i, skipped: true, comment: 'c', suggestion: 's' })),
    };
    const r = checkScoringShape(allSkipped, [null, null, null]);
    expect(r.scoredMean).toBe(null);
  });
});

describe('checkSuggestionSpecificity', () => {
  it('逐則回報三個訊號,而且只標記、不判定', () => {
    const questions = ['一個長清單在捲動時掉幀,你會怎麼找出原因並改善?'];
    const answers = ['我會先用 profiler 量測,再導入虛擬列表只渲染可視區域的項目。'];
    const per = [{ index: 0, suggestion: '你提到虛擬列表,可以再說明 item 高度不固定時要怎麼量測。' }];
    const flags = checkSuggestionSpecificity(per, answers, questions);
    expect(flags).toHaveLength(1);
    expect(flags[0].index).toBe(0);
    expect(flags[0].reusesAnswerTerm).toBe(true);
    expect(flags[0].genericHit).toEqual([]);
    expect(flags[0].length).toBeGreaterThan(20);
    expect(flags[0].suspicious).toBe(false);
  });

  it('空泛短建議會被標記為可疑', () => {
    const flags = checkSuggestionSpecificity(
      [{ index: 0, suggestion: '請多加練習。' }],
      ['我會先用 profiler 量測,再導入虛擬列表。'],
      ['一個長清單在捲動時掉幀,你會怎麼找出原因?']
    );
    expect(flags[0].reusesAnswerTerm).toBe(false);
    expect(flags[0].genericHit.length).toBeGreaterThan(0);
    expect(flags[0].suspicious).toBe(true);
  });

  it('跳過的題也照樣回報,不被靜默略過', () => {
    const flags = checkSuggestionSpecificity(
      [{ index: 0, skipped: true, suggestion: '這題可以先從瀏覽器的 performance 面板著手。' }],
      [null],
      ['一個長清單在捲動時掉幀,你會怎麼找出原因?']
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].skipped).toBe(true);
  });
});
