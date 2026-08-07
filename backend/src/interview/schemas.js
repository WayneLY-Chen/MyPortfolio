// 模擬面試的 Gemini 結構化輸出 schema(D-10 評分、D-34 出題)。
//
// `SchemaType` 是 @google/generative-ai 自己 export 的 enum,不是 OpenAPI 的裸
// 字串 'string',也不是 JSON Schema 的 { "type": "object" }。寫錯不會在建立
// model 時報錯,而是在真的呼叫時才被服務端拒絕。
const { SchemaType } = require('@google/generative-ai')

// D-34:出題也走 responseSchema。
//
// `index` 刻意不進 schema —— 題號由路由依陣列位置產生。交給模型產生題號的話,
// 它有機會跳號或重號,而題號是前端逐題推進與逐題回饋對齊的唯一鍵。
const questionsResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    questions: {
      type: SchemaType.ARRAY,
      // D-03:一場面試固定 5 題。
      minItems: 5,
      maxItems: 5,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            // EnumStringSchema 必須帶 format: 'enum' —— SimpleStringSchema 明確
            // 標了 enum?: never,少了這個欄位的行為未在型別文件中承諾。
            format: 'enum',
            enum: ['technical', 'behavioral'],
          },
          text: { type: SchemaType.STRING, description: '題目全文,不超過 200 個字元' },
        },
        required: ['type', 'text'],
      },
    },
  },
  required: ['questions'],
}

// D-11 的評等文字。UI-SPEC 的評等徽章逐字採用這兩組值,不得改寫。
const RATING_ENUM_BY_LANG = {
  zh: ['優秀', '良好', '尚需加強'],
  en: ['Excellent', 'Good', 'Needs work'],
}

// D-10 鎖定的評分輸出形狀。`rating.enum` 由呼叫端依語言注入(見
// buildScoringResponseSchema),因為同一個 schema 物件會被兩種語言共用。
const scoringResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    overallScore: { type: SchemaType.INTEGER, description: '總分 0-100,僅計入已作答的題目' },
    rating: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: RATING_ENUM_BY_LANG.zh,
    },
    summary: { type: SchemaType.STRING, description: '總評,2-4 句' },
    perQuestion: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          questionIndex: { type: SchemaType.INTEGER },
          skipped: { type: SchemaType.BOOLEAN },
          score: { type: SchemaType.INTEGER },
          comment: { type: SchemaType.STRING },
          suggestion: { type: SchemaType.STRING },
        },
        // score 刻意不列 required —— 跳過的題沒有分數(D-11);硬性 required 會
        // 逼模型替跳過的題編一個假分數出來。
        required: ['questionIndex', 'skipped', 'comment', 'suggestion'],
      },
      minItems: 5,
      maxItems: 5,
    },
  },
  required: ['overallScore', 'rating', 'summary', 'perQuestion'],
}

// 依語言注入 rating enum,回傳一份新的 schema。
//
// 刻意回傳新物件而不是就地改 scoringResponseSchema.properties.rating.enum:
// 模組層的 schema 物件在整個 process 生命週期內共用,就地改寫會讓一個中文請求
// 與一個英文請求互相污染對方的 enum(單機測不出來,線上偶發)。
function buildScoringResponseSchema(language) {
  const ratingEnum = RATING_ENUM_BY_LANG[language] || RATING_ENUM_BY_LANG.zh
  return {
    ...scoringResponseSchema,
    properties: {
      ...scoringResponseSchema.properties,
      rating: { ...scoringResponseSchema.properties.rating, enum: ratingEnum },
    },
  }
}

module.exports = {
  questionsResponseSchema,
  scoringResponseSchema,
  buildScoringResponseSchema,
  RATING_ENUM_BY_LANG,
}
