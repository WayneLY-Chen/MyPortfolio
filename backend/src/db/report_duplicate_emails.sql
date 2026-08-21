-- 唯讀診斷：找出「只差大小寫」的重複 email 帳號
--
-- 背景：修補前 users.email 的比對全部是逐字比對，因此 a@example.com 與
-- A@example.com 會是兩個不同的帳號。本次修補把所有查詢改為
-- LOWER(email) = LOWER($1)，寫入時一律轉小寫。
--
-- 那次修補刻意「不」動任何既有資料：合併或刪除帳號是不可逆的，必須由人先看過
-- 再決定。這支查詢就是給人看的，它只做 SELECT，不修改任何東西。
--
--   psql "$DATABASE_URL" -f backend/src/db/report_duplicate_emails.sql
--
-- 回傳空結果 = 沒有這種情況，什麼都不用做。
--
-- 若有結果：那些帳號目前的行為是「登入時一律沿用 created_at 最早的那一筆」
-- （config/localVerify.js 會同時在 log 留下警告）。要怎麼處理由你決定 ——
-- 密碼比對照常執行，所以不會有人登入自己不知道密碼的帳號。

SELECT
  LOWER(email)                      AS email_lower,
  COUNT(*)                          AS 帳號數,
  ARRAY_AGG(email ORDER BY created_at)      AS 各筆原始寫法,
  ARRAY_AGG(id ORDER BY created_at)         AS 各筆_id,
  ARRAY_AGG(role ORDER BY created_at)       AS 各筆角色,
  ARRAY_AGG(is_active ORDER BY created_at)  AS 各筆是否啟用,
  ARRAY_AGG(created_at ORDER BY created_at) AS 各筆建立時間
FROM users
GROUP BY LOWER(email)
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;
