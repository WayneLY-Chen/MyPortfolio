// LocalStrategy 的驗證邏輯，從 backend/src/config/passport.js 搬出。
//
// 為什麼要搬：backend/src/test/setup.js 的 Module._load 橋接把整個
// backend/src/config/passport.js 換成測試替身（見該檔 __mocks__/passport.js），
// 任何測試都拿不到真正的驗證邏輯。搬到一個沒有被橋接的新檔案，測試就能
// 直接呼叫真的函式。這與 Phase 1 把四家 OAuth callback 共用邏輯抽成
// completeOAuthLogin（backend/src/routes/auth.js）是同一種做法。
const bcrypt = require('bcrypt');
const { query } = require('../db');

// D-15/SEC-06: 統一後的登入失敗訊息。
//
// 查無此 email、帳號存在但沒有 password_hash（以第三方登入建立）、密碼錯誤
// 三種情況一律回傳這同一個字串——不確認該 email 是否存在，也不確認帳號
// 型態，同時給出一條可行動的出路：「忘記密碼」流程（POST /auth/forgot-password
// → POST /auth/reset-password，見 backend/src/routes/auth.js:185,223）本來
// 就不要求帳號原本有密碼，可直接為 OAuth 建立的帳號寫入新密碼。
//
// 三個分支必須全部引用這個常數，不得各寫一份字面字串——複製字串等於把
// 「三者必須相同」這個安全性質交給人的記性維護，未來只要有人手滑改動其中
// 一句，就會重新打開帳號枚舉的破口。localVerify.test.js 的核心斷言正是
// 逐字比對這三個分支的輸出彼此相等。
const LOGIN_FAILED_MESSAGE =
  'Email 或密碼錯誤。若您的帳號是以第三方登入建立的，可使用「忘記密碼」設定一組密碼後再以 Email 登入。';

// 時間側通道堵漏用的固定假雜湊。
//
// 「查無使用者」與「沒有 password_hash」這兩支原本會完全不執行 bcrypt 就
// 立即返回，而「密碼錯誤」那一支要跑一次真正的 bcrypt.compare（數十到上百
// 毫秒）。訊息統一之後，回應時間本身就會成為新的枚舉訊號，等於白做。
//
// 這裡對一個任意字串跑一次 bcrypt.hash（10 個 round，與 auth.js 的
// reset-password 相同成本）產生的雜湊值，寫死成常數。它的唯一用途是在
// 上述兩支快速返回前「陪跑」一次 bcrypt.compare 以拉平耗時；其比對結果
// 永遠被捨棄，不參與任何判定，也不對應任何真實使用者或密碼。
const DUMMY_HASH_FOR_TIMING_EQUALIZATION =
  '$2b$10$.BS56T9lTnrlH4PkrYsgDe9AdE/0lI9.t5FNXJpz1TpUCrYVTmmHy';

const verifyLocalCredentials = async (email, password, done) => {
  try {
    const result = await query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    if (result.rows.length === 0) {
      // 查無使用者——陪跑一次 bcrypt.compare 拉平耗時，結果捨棄不用。
      await bcrypt.compare(password, DUMMY_HASH_FOR_TIMING_EQUALIZATION);
      return done(null, false, { message: LOGIN_FAILED_MESSAGE });
    }
    const user = result.rows[0];
    if (!user.password_hash) {
      // 帳號存在但沒有密碼（以第三方登入建立）——同樣陪跑一次
      // bcrypt.compare，否則「立即返回」這件事本身就會洩漏「此帳號沒有
      // 密碼」的事實，結果同樣捨棄不用。
      await bcrypt.compare(password, DUMMY_HASH_FOR_TIMING_EQUALIZATION);
      return done(null, false, { message: LOGIN_FAILED_MESSAGE });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return done(null, false, { message: LOGIN_FAILED_MESSAGE });
    // D-15 明確記錄的取捨：走到這裡代表 bcrypt 已比對成功，呼叫者本來就
    // 握有正確密碼，「帳號尚未驗證」這句話不會再多洩漏任何資訊——把它一起
    // 模糊化只會讓剛註冊完的真實使用者失去唯一有用的提示。因此本分支刻意
    // 維持原訊息，不套用上面的 LOGIN_FAILED_MESSAGE。
    if (!user.is_verified) return done(null, false, { message: '請先至 Email 收取驗證信以啟用帳號' });
    return done(null, user);
  } catch (err) {
    return done(err);
  }
};

module.exports = { verifyLocalCredentials, LOGIN_FAILED_MESSAGE };
