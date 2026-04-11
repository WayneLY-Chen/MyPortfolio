import { useState, useEffect } from 'react'
import fetchProjectsCached from '../utils/fetchProjects'

const DEFAULT_TECHS = [
  { name: 'React', icon: 'react' },
  { name: 'TypeScript', icon: 'typescript' },
  { name: 'JavaScript', icon: 'javascript' },
  { name: 'Python', icon: 'python' },
  { name: 'Node.js', icon: 'nodejs' },
  { name: 'PostgreSQL', icon: 'postgresql' },
  { name: 'CSS3', icon: 'css3' },
  { name: 'HTML5', icon: 'html5' },
  { name: 'Git', icon: 'git' },
  { name: 'Figma', icon: 'figma' },
]

const LANG_TO_ICON = {
  JavaScript: 'javascript', TypeScript: 'typescript', Python: 'python',
  CSS: 'css3', HTML: 'html5', 'C++': 'cplusplus', Java: 'java',
  Go: 'go', Rust: 'rust', Vue: 'vuejs', Swift: 'swift',
  Kotlin: 'kotlin', PHP: 'php', Ruby: 'ruby', Dart: 'dart', 'C#': 'csharp',
}

function TechItem({ name, icon }) {
  const iconUrl = `https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${icon}/${icon}-original.svg`
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
  const items = [...techs, ...techs, ...techs]
  return (
    <div className={`marquee-track ${reverse ? 'reverse' : ''}`}>
      <div className="marquee-inner">
        {items.map((tech, i) => <TechItem key={i} name={tech.name} icon={tech.icon} />)}
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

  return (
    <>
      <style>{`
        .marquee-item { display: inline-flex; align-items: center; gap: 10px; }
        .marquee-tech-icon { width: 28px; height: 28px; object-fit: contain; vertical-align: middle; }
        .marquee-tech-name {
          font-family: var(--font-sans); font-weight: 700;
          font-size: clamp(14px, 2vw, 22px); text-transform: uppercase; letter-spacing: 0.05em;
        }
      `}</style>
      <section id="marquee">
        <MarqueeTrack techs={techs} />
        <MarqueeTrack techs={techs} reverse />
      </section>
    </>
  )
}
