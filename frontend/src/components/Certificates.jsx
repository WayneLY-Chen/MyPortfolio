import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const CERT_CATEGORIES = [
  {
    title: '勞動部勞動力發展署技能檢定中心',
    certs: ['丙級電腦軟體應用技術士', '丙級電腦硬體裝修技術士']
  },
  {
    title: 'TQC / EEC',
    certs: [
      '物聯網智慧應用及技術',
      '人工智慧應用與技術 (實用級/進階級/專業級)',
      '資訊科技 Python'
    ]
  },
  {
    title: 'ITE',
    certs: [
      'ITE-數位內容遊戲企劃專業人員',
      'ITE-數位內容遊戲美術專業人員',
      'ITE-網路通訊專業人員'
    ]
  },
  {
    title: '電子類證照',
    certs: ['丙級工業電子技術士']
  },
  {
    title: '其他證照',
    certs: ['TQC APP INVENTOR程式設計核心能力']
  }
]

export default function Certificates() {
  const sectionRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // 全部改用 sectionRef.current 作 scoped DOM query，避免全域 querySelector
      const certTitleEl = sectionRef.current.querySelector('.cert-title')
      if (certTitleEl) {
        gsap.from(certTitleEl, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          ease: 'power3.out',
          force3D: true,
          scrollTrigger: {
            trigger: certTitleEl,
            start: 'top 80%',
            once: true,   // 修復：加 once:true，避免重複觸發
          }
        })
      }

      const certsGridEl = sectionRef.current.querySelector('.certs-grid')
      const certGroupEls = sectionRef.current.querySelectorAll('.cert-group')
      if (certGroupEls.length > 0) {
        gsap.from(certGroupEls, {   // 修復：直接傳 NodeList，不再傳 class 字串
          y: 30,
          opacity: 0,
          stagger: 0.1,
          duration: 0.8,
          ease: 'power3.out',
          force3D: true,
          scrollTrigger: {
            trigger: certsGridEl,
            start: 'top 85%',
            once: true,   // 修復：加 once:true
          }
        })
      }
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <>
      <style>{`
        #certificates {
          padding: 100px 6vw;
          border-bottom: 1px solid var(--muted, #333);
        }
        .cert-header {
          margin-bottom: 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .cert-tag {
          font-size: 11px;
          letter-spacing: 0.4em;
          text-transform: uppercase;
          color: var(--accent);
          display: block;
          margin-bottom: 16px;
        }
        .cert-title {
          font-family: var(--font-display);
          font-size: clamp(32px, 5vw, 64px);
          font-weight: 800;
          text-transform: uppercase;
          line-height: 1.1;
          color: var(--fg);
          will-change: transform, opacity;
        }
        .certs-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 48px 32px;
          max-width: 1200px;
          margin: 0 auto;
        }
        @media (max-width: 900px) {
          .certs-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .certs-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          #certificates {
            padding: 80px 4vw;
          }
          .certs-grid {
            gap: 32px 24px;
          }
        }
        .cert-group {
          display: flex;
          flex-direction: column;
          gap: 16px;
          will-change: transform, opacity;
        }
        .cert-group-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--fg);
          letter-spacing: 0.08em;
          border-bottom: 1px solid var(--muted);
          padding-bottom: 12px;
          margin-bottom: 4px;
        }
        .cert-item {
          font-size: 14px;
          color: #888;
          line-height: 1.6;
          position: relative;
        }
        .cert-item:hover {
          color: #ccc;
          transition: color 0.3s ease;
        }
      `}</style>
      <section id="certificates" ref={sectionRef}>
        <div className="cert-header">
          <span className="cert-tag">Licenses & Certifications</span>
          <h2 className="cert-title">持有證照</h2>
        </div>
        <div className="certs-grid">
          {CERT_CATEGORIES.map((cat, i) => (
            <div className="cert-group" key={i}>
              <h3 className="cert-group-title">{cat.title}</h3>
              {cat.certs.map((cert, j) => (
                <div className="cert-item" key={j}>{cert}</div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
