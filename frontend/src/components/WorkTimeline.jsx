import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const EXPERIENCES = [
  {
    period: '2018/08 - 2023/06',
    role: '摩斯漢堡 MOS Burger',
    title: '訓練員',
    duration: '5年',
    desc: '在裡面學習了當收銀員，準備區人員以及其他位置，這當中我除了認識了公司基本的職場文化之外，更重要的是學會了掌控自己的時間，如何在有限的時間內規劃工作內容，排列工作的優先順序，並在自己所排定的時間內將工作完成，當然也學會如何跟同事分工合作，積極和他人共同執行主管交代的工作，這樣的工作經驗使我獲益良多。',
    side: 'left',
  },
  {
    period: '2024/06 - 2025/06',
    role: '華碩電腦 ASUS',
    title: '系統品質軟體工程師 (實習生)',
    duration: '1年',
    desc: '在為期一年的實習中，我是負責把關產品品質，這段經歷培養了我對於軟體邊角案例（Edge Cases）的高敏銳度，以及與 RD 團隊高效溝通的能力：系統品質軟體工程師 (實習生) 內側負責的功能包含:1. 軟體品質保證 (QA) 與除錯 2. 系統效能分析 3. 跨系統整合。',
    side: 'right',
  },
  {
    period: '2026/04 - 現職',
    role: '源智匯股份有限公司',
    title: 'AI 工程師（現職）',
    duration: '現職',
    desc: '在職期間，我主要負責多項指標性企業與政府機關的核心系統開發，從前端用戶體驗到後端架構整合皆能獨立高效完成：主導中央部會級評測系統的 AI 整合專案，串接第三方智能 Agent 平台，將生成式 AI（GenAI）能力安全導入大型公共業務流程，大幅提升審查效率；獨立設計並開發國立大學專屬的 LINE Bot 智能問答系統，運用 Langflow 建構視覺化 AI 工作流，導入 Elasticsearch 分散式搜尋引擎實現高效精準檢索，並搭配自動化排程爬蟲達成低維護成本的零延遲問答；同時負責指標性上市工業大廠的公文生成系統，設計直覺化操作介面，並架構 RAG 知識庫選用策略，讓系統精準識別專業領域並自動生成符合企業規範的正式文件。',
    side: 'left',
  },
]

export default function WorkTimeline() {
  const sectionRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // 修復：全部改用 sectionRef.current 作 scoped DOM query
      const headingEl = sectionRef.current.querySelector('.wt-heading')
      if (headingEl) {
        gsap.from(headingEl, {
          x: -60,
          opacity: 0,
          duration: 1,
          ease: 'power4.out',
          force3D: true,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 70%',
            once: true,   // 修復：加 once:true
          },
        })
      }

      // 修復：用 sectionRef.current.querySelectorAll 取代全域 gsap.utils.toArray('.wt-row')
      const wtRows = Array.from(sectionRef.current.querySelectorAll('.wt-row'))
      if (wtRows.length > 0) {
        wtRows.forEach((el) => {
          const isLeft = el.querySelector('.wt-entry--left')
          gsap.from(el, {
            x: isLeft ? -60 : 60,
            opacity: 0,
            duration: 0.9,
            ease: 'power3.out',
            force3D: true,
            scrollTrigger: {
              trigger: el,
              start: 'top 82%',
              once: true,   // 修復：加 once:true
            },
          })
        })
      }

      // 修復：用 sectionRef.current.querySelectorAll 取代全域 gsap.utils.toArray('.wt-dot')
      const wtDots = Array.from(sectionRef.current.querySelectorAll('.wt-dot'))
      if (wtDots.length > 0) {
        wtDots.forEach((dot) => {
          gsap.from(dot, {
            scale: 0,
            opacity: 0,
            duration: 0.5,
            ease: 'back.out(2)',
            force3D: true,
            scrollTrigger: {
              trigger: dot,
              start: 'top 85%',
              once: true,   // 修復：加 once:true
            },
          })
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <>
      <style>{`
        #work-timeline {
          padding: 120px 6vw;
          background: var(--bg);
          border-top: 1px solid var(--border);
        }

        .wt-header {
          margin-bottom: 80px;
          will-change: transform, opacity;
        }

        .wt-body {
          position: relative;
          max-width: 900px;
          margin: 0 auto;
        }

        .wt-line {
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 1px;
          background: var(--border);
          transform: translateX(-50%);
        }

        .wt-row {
          position: relative;
          display: flex;
          align-items: flex-start;
          margin-bottom: 64px;
          will-change: transform, opacity;
        }
        .wt-row:last-child {
          margin-bottom: 0;
        }

        .wt-dot {
          position: absolute;
          left: 50%;
          top: 24px;
          transform: translateX(-50%);
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--accent);
          z-index: 1;
          flex-shrink: 0;
          will-change: transform, opacity;
        }

        .work-box {
          width: calc(50% - 32px);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 24px;
          transition: transform 0.3s, border-color 0.3s;
        }
        .work-box:hover {
          transform: translateY(-4px);
          border-color: var(--accent);
        }
        .wt-entry--left { margin-right: auto; }
        .wt-entry--right { margin-left: auto; }

        .work-period { font-size: 11px; letter-spacing: 0.2em; color: var(--accent); margin-bottom: 8px; font-weight: 700; text-transform: uppercase; }
        .work-role { font-family: var(--font-display); font-size: 20px; font-weight: 800; color: var(--fg); margin-bottom: 4px; }
        .work-title { font-size: 13px; color: var(--muted); margin-bottom: 16px; }
        .work-desc { font-size: 14.5px; color: var(--muted); line-height: 1.8; margin-top: 16px; border-top: 1px solid var(--border); padding-top: 16px; letter-spacing: 0.02em; }
        .work-duration {
          display: inline-block; padding: 4px 12px; border: 1px solid var(--border);
          border-radius: 20px; font-size: 11px; color: var(--muted);
        }

        @media (max-width: 640px) {
          .wt-line { left: 16px; }
          .wt-dot { left: 16px; }
          .work-box {
            width: calc(100% - 48px);
            margin-left: 48px !important;
            margin-right: 0 !important;
          }
        }
        @media (max-width: 480px) {
          #work-timeline {
            padding: 80px 4vw;
          }
          .wt-line { left: 12px; }
          .wt-dot { left: 12px; width: 10px; height: 10px; }
          .work-box {
            width: calc(100% - 36px);
            margin-left: 36px !important;
            padding: 16px;
          }
        }
      `}</style>

      <section id="work-timeline" ref={sectionRef}>
        <div className="wt-header section-header">
          <span className="section-tag">EXPERIENCE</span>
          <h2 className="section-title wt-heading">工作經歷</h2>
        </div>

        <div className="wt-body">
          <div className="wt-line" />

          {EXPERIENCES.map((exp, i) => (
            <div className="wt-row" key={i}>
              <div className={`work-box wt-entry--${exp.side}`}>
                <div className="work-period">{exp.period}</div>
                <div className="work-role">{exp.role}</div>
                <div className="work-title">{exp.title}</div>
                <div className="work-duration">{exp.duration}</div>
                <div className="work-desc">{exp.desc}</div>
              </div>
              <div className="wt-dot" />
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
