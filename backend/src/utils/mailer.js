/**
 * mailer.js — 寄送驗證信件
 *
 * 需要在 .env 中設定以下環境變數：
 *   SMTP_HOST=smtp.gmail.com          # SMTP 伺服器主機
 *   SMTP_PORT=587                     # SMTP 埠（587 = STARTTLS, 465 = SSL）
 *   SMTP_USER=your-email@gmail.com    # 寄件人 Email（Gmail 帳號）
 *   SMTP_PASS=your-app-password       # Gmail 應用程式密碼（非帳號密碼）
 *                                     # 在 Google 帳戶 -> 安全性 -> 應用程式密碼 產生
 *   SMTP_FROM="作品集網站 <your-email@gmail.com>"  # 顯示的寄件人名稱
 *
 * 若使用其他 SMTP 服務（如 Resend、SendGrid 等），請相應修改 host/port。
 */

const nodemailer = require('nodemailer');

const SMTP_CONFIGURED =
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS;

if (!SMTP_CONFIGURED) {
  console.warn(
    '[Mailer] 警告：未設定 SMTP 環境變數（SMTP_HOST, SMTP_USER, SMTP_PASS）。' +
    '驗證信件將無法寄送。請在 .env 中補充設定。'
  );
}

const transporter = SMTP_CONFIGURED
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false, // 本機開發或自簽憑證環境允許 TLS 握手
      },
    })
  : null;

/**
 * 寄送 Email 驗證信
 * @param {string} toEmail - 收件人 Email
 * @param {string} verifyUrl - 完整驗證連結（含 token）
 */
const sendVerificationEmail = async (toEmail, verifyUrl) => {
  if (!transporter) {
    console.error('[Mailer] SMTP 未設定，無法寄送驗證信至:', toEmail);
    throw new Error('郵件服務未設定，請聯繫管理員');
  }

  const fromAddress = process.env.SMTP_FROM || `作品集網站 <${process.env.SMTP_USER}>`;

  const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>驗證您的 Email</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a;">
          <tr>
            <td style="background:#C8942A;padding:24px 32px;">
              <h1 style="margin:0;color:#0f0f0f;font-size:20px;font-weight:700;letter-spacing:1px;">WayneLY-Chen 作品集</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px;">
              <h2 style="margin:0 0 16px;color:#ffffff;font-size:22px;">驗證您的 Email</h2>
              <p style="margin:0 0 24px;color:#aaaaaa;font-size:15px;line-height:1.6;">
                感謝您的註冊！請點擊下方按鈕以完成帳號驗證。此連結將在 24 小時後失效。
              </p>
              <a href="${verifyUrl}"
                 style="display:inline-block;background:#C8942A;color:#0f0f0f;text-decoration:none;
                        font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;
                        letter-spacing:0.5px;">
                驗證 Email
              </a>
              <p style="margin:32px 0 0;color:#555555;font-size:13px;line-height:1.6;">
                若您無法點擊按鈕，請複製以下網址貼至瀏覽器：<br>
                <span style="color:#C8942A;word-break:break-all;">${verifyUrl}</span>
              </p>
              <p style="margin:24px 0 0;color:#555555;font-size:12px;">
                若您沒有申請此帳號，請忽略此封信件。
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;color:#444444;font-size:12px;">WayneLY-Chen Portfolio &copy; ${new Date().getFullYear()}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject: '驗證您的 Email — WayneLY-Chen 作品集',
    html,
    text: `請複製以下連結至瀏覽器以完成 Email 驗證（24 小時內有效）：\n\n${verifyUrl}\n\n若您沒有申請此帳號，請忽略此信。`,
  });

  console.log('[Mailer] 驗證信已寄送至:', toEmail);
};

/**
 * 寄送忘記密碼重設信
 * @param {string} toEmail - 收件人 Email
 * @param {string} resetUrl - 完整重設密碼連結（含 token）
 */
const sendPasswordResetEmail = async (toEmail, resetUrl) => {
  if (!transporter) {
    console.error('[Mailer] SMTP 未設定，無法寄送重設密碼信至:', toEmail);
    throw new Error('郵件服務未設定，請聯繫管理員');
  }

  const fromAddress = process.env.SMTP_FROM || `作品集網站 <${process.env.SMTP_USER}>`;

  const html = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>重設密碼</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a;">
          <tr>
            <td style="background:#C8942A;padding:24px 32px;">
              <h1 style="margin:0;color:#0f0f0f;font-size:20px;font-weight:700;letter-spacing:1px;">WayneLY-Chen 作品集</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px;">
              <h2 style="margin:0 0 16px;color:#ffffff;font-size:22px;">重設您的密碼</h2>
              <p style="margin:0 0 24px;color:#aaaaaa;font-size:15px;line-height:1.6;">
                我們收到了您的密碼重設申請。請點擊下方按鈕以設定新密碼。此連結將在 <strong style="color:#ffffff;">1 小時</strong>後失效。
              </p>
              <a href="${resetUrl}"
                 style="display:inline-block;background:#C8942A;color:#0f0f0f;text-decoration:none;
                        font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;
                        letter-spacing:0.5px;">
                重設密碼
              </a>
              <p style="margin:32px 0 0;color:#555555;font-size:13px;line-height:1.6;">
                若您無法點擊按鈕，請複製以下網址貼至瀏覽器：<br>
                <span style="color:#C8942A;word-break:break-all;">${resetUrl}</span>
              </p>
              <p style="margin:24px 0 0;color:#555555;font-size:12px;">
                若您沒有申請重設密碼，請忽略此封信件，您的密碼將不會變更。
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;color:#444444;font-size:12px;">WayneLY-Chen Portfolio &copy; ${new Date().getFullYear()}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject: '重設密碼 - Wayne 的作品集',
    html,
    text: `請複製以下連結至瀏覽器以重設密碼（1 小時內有效）：\n\n${resetUrl}\n\n若您沒有申請重設密碼，請忽略此信，您的密碼將不會變更。`,
  });

  console.log('[Mailer] 重設密碼信已寄送至:', toEmail);
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
