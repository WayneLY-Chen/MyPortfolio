import { useState, useEffect } from 'react'
import fetchProjectsCached from '../utils/fetchProjects'

const DEFAULT_TECHS = [
  { name: 'React', icon: 'react' },
  { name: 'Next.js', src: 'https://cdn.simpleicons.org/nextdotjs/f5ede0' },
  { name: 'TypeScript', icon: 'typescript' },
  { name: 'JavaScript', icon: 'javascript' },
  { name: 'Python', icon: 'python' },
  { name: 'Node.js', icon: 'nodejs' },
  { name: 'PostgreSQL', icon: 'postgresql' },
  { name: 'CSS3', icon: 'css3' },
  { name: 'HTML5', icon: 'html5' },
  { name: 'Git', icon: 'git' },
  { name: 'Figma', icon: 'figma' },
  { name: 'VS Code', icon: 'vscode' },
  { name: 'Vue', icon: 'vuejs' },
  { name: 'Supabase', icon: 'supabase' },
  { name: 'Docker', icon: 'docker' },
  { name: 'RabbitMQ', icon: 'rabbitmq' },
  { name: 'Bootstrap', icon: 'bootstrap' },
  { name: 'Gemini', src: 'https://cdn.simpleicons.org/googlegemini' },
  { name: 'Claude Code', src: 'https://cdn.simpleicons.org/claude' },
  { name: 'Langflow', src: 'https://cdn.simpleicons.org/langflow' },
  { name: 'n8n', src: 'https://cdn.simpleicons.org/n8n' },
  { name: 'Celery', src: 'https://cdn.simpleicons.org/celery' },
]

const LANG_TO_ICON = {
  JavaScript: 'javascript', TypeScript: 'typescript', Python: 'python',
  CSS: 'css3', HTML: 'html5', 'C++': 'cplusplus', Java: 'java',
  Go: 'go', Rust: 'rust', Vue: 'vuejs', Swift: 'swift',
  Kotlin: 'kotlin', PHP: 'php', Ruby: 'ruby', Dart: 'dart', 'C#': 'csharp',
}

function TechItem({ name, icon, src }) {
  const iconUrl = src || `https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${icon}/${icon}-original.svg`
  return (
    <span className="marquee-item">
      <img
        src={iconUrl}
        alt={name}
        className="marquee-tech-icon"
        onError={e => { e.target.style.display = 'none' }}
      />
      <span className="marquee-tech-name">{name}</span>
      <span className="marquee-dot">·</span>
    </span>
  )
}

function MarqueeTrack({ techs, reverse = false }) {
  // 下排順序反轉：上排從右邊流出去的項目，會以相同順序從下排右邊流回來
  const base = reverse ? [...techs].reverse() : techs
  // 兩份複製 + CSS 位移 -50%：循環接縫像素完全對齊，不會有刷新感
  const items = [...base, ...base]
  return (
    <div className={`marquee-track ${reverse ? 'reverse' : ''}`}>
      <div className="marquee-inner">
        {items.map((tech, i) => <TechItem key={i} name={tech.name} icon={tech.icon} src={tech.src} />)}
      </div>
    </div>
  )
}

export default function Marquee() {
  const [techs, setTechs] = useState(DEFAULT_TECHS)

  useEffect(() => {
    fetchProjectsCached()
      .then(data => {
        const projects = data || []
        const extra = []
        const seen = new Set(DEFAULT_TECHS.map(t => t.icon))
        projects.forEach(p => {
          if (p.language && LANG_TO_ICON[p.language] && !seen.has(LANG_TO_ICON[p.language])) {
            seen.add(LANG_TO_ICON[p.language])
            extra.push({ name: p.language, icon: LANG_TO_ICON[p.language] })
          }
        })
        if (extra.length > 0) setTechs(prev => [...prev, ...extra])
      })
      .catch(() => {})
  }, [])

  // 上下兩排各顯示一半的技術，避免同時看到重複項目
  const half = Math.ceil(techs.length / 2)
  const topTechs = techs.slice(0, half)
  const bottomTechs = techs.slice(half)

  return (
    <>
      <style>{`
        .marquee-tech-icon { width: 20px; height: 20px; object-fit: contain; vertical-align: middle; }
        .marquee-tech-name {
          font-family: var(--font-sans); font-weight: 700;
          font-size: inherit; text-transform: uppercase; letter-spacing: inherit;
          line-height: 1;
          /* 光學置中：抵銷字距在最後一個字母後的殘留空白，並微降大寫字的視覺重心 */
          margin-right: -0.22em;
          transform: translateY(1px);
        }
      `}</style>
      <section id="marquee">
        <div className="marquee-heading" aria-hidden="true">
          <span className="mh-line" />
          <span className="mh-text">Tech Stack</span>
          <span className="mh-line" />
        </div>
        <MarqueeTrack techs={topTechs} />
        <MarqueeTrack techs={bottomTechs} reverse />
      </section>
    </>
  )
}
