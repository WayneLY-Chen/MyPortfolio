const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres.cewnazwknnnjxbdxwnot:REMOVED_PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres' });

const authorId = 'bd5dc3ec-1369-4b76-a89d-0dcbd4be7c24';

const posts = [
  {
    title: '【comfy-pilot：透過 AI 助理輕鬆建立與修改 ComfyUI 工作流程】',
    slug: 'comfy-pilot-ai-assistant',
    summary: 'ComfyUI 作為強大的 AI 影像生成工具，其工作流程的建立與調整往往需要一定的學習門檻。comfy-pilot 的出現旨在降低使用者進入的門檻。',
    cover_image: '/images/blog/comfy-pilot.png',
    content: `ComfyUI 作為強大的 AI 影像生成工具，其工作流程的建立與調整往往需要一定的學習門檻。comfy-pilot 的出現旨在降低使用者進入的門檻。

👉 **comfy-pilot 是什麼？**
*   一款 AI 助理，讓使用者能以自然語言與 ComfyUI 互動。
*   使用者無需具備程式撰寫能力，即可輕鬆創建與修改工作流程。
*   支援與 Claude 和 Gemini 等 AI 代理進行對話，協助手動建構工作流程。

🔥 **為什麼這很重要？**
*   大幅降低 ComfyUI 的使用難度，讓更多人能體驗 AI 影像生成的樂趣。

🆕 **新版亮點 / 如何安裝**
網址：https://github.com/victorcascales22/comfy-pilot
*   提供簡潔的下載連結，適用於 Windows、macOS 和 Linux。

⚠️ **注意什麼？**
*   首次執行時，您的作業系統可能會跳出安全警告，請確認信任來源後執行。

📌 **這件事的意義**
\`comfy-pilot\` 透過 AI 輔助，顯著提升了 ComfyUI 的易用性，這對於推廣 AI 創作工具，擴展其使用者群體具有重要意義。它代表了人機互動在專業領域應用上的新方向。

**主要連結 1**: https://github.com/victorcascales22/comfy-pilot`
  },
  {
    title: '【WooNow/Positron：使用 Python 與現代網頁框架打造高效能桌面應用程式】',
    slug: 'woonow-positron-desktop-apps',
    summary: 'Positron 旨在透過結合 Python 的強大功能與現代網頁框架的靈活性，提供一套高效能的桌面應用程式解決方案。其目標是為用戶帶來快速、極簡且直觀的使用體驗。',
    cover_image: '/images/blog/positron-framework.png',
    content: `Positron 旨在透過結合 Python 的強大功能與現代網頁框架的靈活性，提供一套高效能的桌面應用程式解決方案。其目標是為用戶帶來快速、極簡且直觀的使用體驗。

👉 **WooNow/Positron 是什麼？**
*   運用 Python 和現代網頁框架 (如 React、Vue、Svelte) 開發，以實現高效能與現代化的使用者介面。
*   提供跨平台支援 (Windows、macOS、Linux)，確保在不同作業系統上都能無縫運行。

🔥 **為什麼這很重要？**
*   能夠利用現有的網頁開發技術與人才，快速構建功能豐富且效能優異的桌面應用，降低開發門檻。

🆕 **新版亮點 / 如何安裝**
*請參考 GitHub Releases 頁面下載對應您作業系統的安裝檔*
*   提供適用於 Windows (.exe)、macOS (.dmg) 和 Linux (.deb 或 .AppImage) 的安裝套件，簡化部署流程。

⚠️ **注意什麼？**
*   運行 Positron 應用程式可能需要 Python 3.7 或更高版本，請確保您的環境符合要求。

📌 **這件事的意義**
\`Positron\` 展現了使用網頁技術開發桌面應用程式的潛力，為開發者提供了一個強大的框架，以更快的速度和更低的成本打造出兼具效能與現代感的桌面工具。這有助於推動跨平台應用程式開發的創新與普及。

**主要連結 1**: https://github.com/WooNow/Positron`
  },
  {
    title: '【ai-tank-battle：11歲兒童兩天打造的策略坦克對戰遊戲】',
    slug: 'ai-tank-battle-game',
    summary: '這是一款由一位 11 歲的兒童在短短兩天內，利用 AI 智能代理所開發的策略坦克對戰遊戲。遊戲結合了經典戰鬥、迷宮探索與智能 AI 對抗，展現了令人驚豔的開發潛力。',
    cover_image: '/images/blog/tank-battle.png',
    content: `這是一款由一位 11 歲的兒童在短短兩天內，利用 AI 智能代理所開發的策略坦克對戰遊戲。遊戲結合了經典戰鬥、迷宮探索與智能 AI 對抗，展現了令人驚豔的開發潛力。

👉 **ai-tank-battle 是什麼？**
*   透過創新的迷宮生成演算法，每次遊戲都能產生獨一無二的遊戲地圖。
*   內建具備多種性格 (攻擊、防禦、戰術等) 的智能 AI，為玩家帶來多樣化的對戰體驗。

🔥 **為什麼這很重要？**
*   證明了即使是年輕的開發者，也能透過 AI 工具和現代遊戲引擎，創作出具備深度與創意的遊戲作品。

🆕 **新版亮點 / 如何安裝**
\`\`\`bash
git clone https://github.com/yugeyin/ai-tank-battle.git
cd tank-battle-maze
pip install pygame
python tank_battle.py
\`\`\`
*   遊戲支援 WASD 或方向鍵移動，空格鍵發射砲彈，並提供 1-5 鍵選擇難度。

⚠️ **注意什麼？**
*   遊戲的「核心」是玩家的生命線，摧毀敵方核心才能獲得永久勝利。

📌 **這件事的意義**
這個專案不僅展現了年輕一代在軟體開發上的天賦與熱情，也突顯了 AI 在輔助創意與快速原型開發上的巨大潛力，為遊戲開發領域帶來了新的啟發。

**主要連結 1**: https://github.com/yugeyin/ai-tank-battle`
  }
];

async function insertPosts() {
  for (const post of posts) {
    try {
      await pool.query(
        'INSERT INTO blog_posts (title, slug, summary, content, cover_image, published, author_id) VALUES ($1, $2, $3, $4, $5, true, $6) ON CONFLICT (slug) DO UPDATE SET title = $1, summary = $3, content = $4, cover_image = $5',
        [post.title, post.slug, post.summary, post.content, post.cover_image, authorId]
      );
      console.log(`Inserted/Updated: ${post.title}`);
    } catch (err) {
      console.error(`Error inserting ${post.title}:`, err);
    }
  }
  process.exit(0);
}

insertPosts();
