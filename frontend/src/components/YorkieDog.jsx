// Inline Yorkshire Terrier SVG mascots — no external file loading needed
// variant: 'about' | 'projects' | 'blog' | 'fun'

export default function YorkieDog({ variant = 'about', size = 120 }) {
  // ViewBox: 0 0 100 130  (extra height at top for hats/accessories)
  // Yorkie anatomy: tan/gold face + legs, dark steel-blue back saddle, silky tan floor coat
  // Ears: small, V-shaped, slightly outward — NOT tall rabbit ears

  // ── Shared base body (no ears, no eyes — drawn per-variant for layering control) ──
  const body = (
    <>
      {/* Long silky floor coat */}
      <path d="M24 78 Q18 102 25 116 Q50 124 75 116 Q82 102 76 78 Z" fill="#B07518"/>
      {/* Dark steel-blue saddle/back */}
      <ellipse cx="50" cy="76" rx="22" ry="14" fill="#3C3A58"/>
      {/* Coat side highlight tan */}
      <path d="M29 81 Q23 103 31 113 Q50 119 69 113 Q77 103 71 81 Q62 87 50 87 Q38 87 29 81 Z" fill="#D09020" opacity="0.55"/>

      {/* Front paws */}
      <ellipse cx="36" cy="114" rx="10" ry="6" fill="#C8880A"/>
      <ellipse cx="64" cy="114" rx="10" ry="6" fill="#C8880A"/>
      <path d="M28 115 Q36 120 44 115" stroke="#9A6208" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M56 115 Q64 120 72 115" stroke="#9A6208" strokeWidth="1.2" fill="none" strokeLinecap="round"/>

      {/* Head — round, chibi proportions */}
      <ellipse cx="50" cy="52" rx="26" ry="24" fill="#C8880A"/>

      {/* Yorkie top-fur / forehead dark patch */}
      <ellipse cx="50" cy="36" rx="18" ry="11" fill="#B07518"/>
      {/* Center part line */}
      <line x1="50" y1="29" x2="50" y2="42" stroke="#906010" strokeWidth="1" opacity="0.45"/>

      {/* EARS — small Yorkie V-shape, pointing slightly outward, NOT tall */}
      {/* Left ear outer (dark steel-blue) */}
      <path d="M26 46 L22 28 L38 42 Z" fill="#3C3A58"/>
      {/* Left ear inner (tan) */}
      <path d="M27 45 L24 31 L37 42 Z" fill="#C8880A" opacity="0.8"/>
      {/* Right ear outer */}
      <path d="M74 46 L78 28 L62 42 Z" fill="#3C3A58"/>
      {/* Right ear inner */}
      <path d="M73 45 L76 31 L63 42 Z" fill="#C8880A" opacity="0.8"/>

      {/* Muzzle — lighter gold */}
      <ellipse cx="50" cy="60" rx="14" ry="11" fill="#E8B040"/>

      {/* Nose */}
      <ellipse cx="50" cy="62" rx="4.5" ry="3.2" fill="#140A02"/>
      <ellipse cx="48.8" cy="61" rx="1.4" ry="0.9" fill="rgba(255,255,255,0.35)"/>

      {/* Eyes — big dark shiny Yorkie eyes */}
      <circle cx="40" cy="49" r="7" fill="#140A02"/>
      <circle cx="60" cy="49" r="7" fill="#140A02"/>
      {/* Warm brown iris */}
      <circle cx="40" cy="49" r="4.5" fill="#4A2008" opacity="0.5"/>
      <circle cx="60" cy="49" r="4.5" fill="#4A2008" opacity="0.5"/>
      {/* Main shine */}
      <circle cx="42.5" cy="46" r="2.5" fill="white"/>
      <circle cx="62.5" cy="46" r="2.5" fill="white"/>
      {/* Small lower shine */}
      <circle cx="43" cy="52" r="1" fill="white" opacity="0.4"/>
      <circle cx="63" cy="52" r="1" fill="white" opacity="0.4"/>
    </>
  )

  // ─────────────────────────────────────────────────
  //  ABOUT variant — male Yorkie, teal neck bandana, confident smile
  // ─────────────────────────────────────────────────
  const aboutVariant = (
    <>
      {body}
      {/* Confident friendly smile — slightly asymmetric for head-tilt feel */}
      <path d="M44 66 Q50 73 56 67" stroke="#140A02" strokeWidth="1.6" fill="none" strokeLinecap="round"/>

      {/* ── TEAL BANDANA at the neck ── */}
      {/* Main bandana triangle draping down from neck */}
      <path d="M32 72 Q50 68 68 72 Q60 88 50 92 Q40 88 32 72 Z" fill="#1AA8A0"/>
      {/* Bandana shadow/fold crease for depth */}
      <path d="M40 74 Q50 80 60 74" stroke="#0E7A74" strokeWidth="1.2" fill="none" opacity="0.6"/>
      <path d="M43 78 Q50 84 57 78" stroke="#0E7A74" strokeWidth="1" fill="none" opacity="0.5"/>
      {/* Bandana knot — two small loops visible at collar sides */}
      <ellipse cx="34" cy="71" rx="5" ry="3.5" fill="#12C4BB" transform="rotate(-20,34,71)"/>
      <ellipse cx="66" cy="71" rx="5" ry="3.5" fill="#12C4BB" transform="rotate(20,66,71)"/>
      {/* Center knot bump */}
      <ellipse cx="50" cy="69" rx="5" ry="3" fill="#0E9E96"/>
      {/* Small white polka dots for personality */}
      <circle cx="44" cy="78" r="1.3" fill="white" opacity="0.55"/>
      <circle cx="50" cy="82" r="1.3" fill="white" opacity="0.55"/>
      <circle cx="56" cy="78" r="1.3" fill="white" opacity="0.55"/>
      <circle cx="47" cy="75" r="1" fill="white" opacity="0.45"/>
      <circle cx="53" cy="75" r="1" fill="white" opacity="0.45"/>

      {/* Subtle warm-toned cheeks */}
      <ellipse cx="34" cy="56" rx="6" ry="3.5" fill="#E07030" opacity="0.22"/>
      <ellipse cx="66" cy="56" rx="6" ry="3.5" fill="#E07030" opacity="0.22"/>
    </>
  )

  // ─────────────────────────────────────────────────
  //  PROJECTS variant — LARGE yellow hard hat sticking UP
  // ─────────────────────────────────────────────────
  const projectsVariant = (
    <>
      {body}
      {/* Determined eyebrows */}
      <path d="M34 41 Q40 37 46 41" stroke="#5A3010" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <path d="M54 41 Q60 37 66 41" stroke="#5A3010" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      {/* Focused straight-line mouth */}
      <path d="M45 66 Q50 69 55 66" stroke="#140A02" strokeWidth="1.5" fill="none" strokeLinecap="round"/>

      {/* ── LARGE yellow hard hat — dome sticks well ABOVE head ── */}
      {/* Hat dome — tall, clearly above the head */}
      <ellipse cx="50" cy="20" rx="24" ry="18" fill="#FFD000"/>
      {/* Dome top cap */}
      <ellipse cx="50" cy="10" rx="15" ry="8" fill="#FFC000"/>
      {/* Hat brim — wide, flat, clearly extends past head */}
      <rect x="20" y="30" width="60" height="7" rx="3.5" fill="#FFD000"/>
      <rect x="20" y="33" width="60" height="3" rx="1.5" fill="#C89000" opacity="0.4"/>
      {/* Construction stripe on dome */}
      <path d="M30 26 Q50 14 70 26" stroke="#C89000" strokeWidth="2.5" fill="none" opacity="0.5"/>
      {/* Ventilation bumps */}
      <rect x="44" y="12" width="12" height="4" rx="2" fill="#C89000" opacity="0.5"/>

      {/* Laptop in left paw area */}
      <path d="M28 84 Q22 96 22 104" stroke="#C8880A" strokeWidth="9" strokeLinecap="round" fill="none"/>
      <rect x="6" y="96" width="24" height="16" rx="2" fill="#2A2A3A"/>
      <rect x="8" y="98" width="20" height="11" rx="1" fill="#1A7FFF" opacity="0.9"/>
      <line x1="9" y1="100" x2="27" y2="100" stroke="white" strokeWidth="0.9" opacity="0.6"/>
      <line x1="9" y1="102.5" x2="25" y2="102.5" stroke="white" strokeWidth="0.9" opacity="0.6"/>
      <line x1="9" y1="105" x2="22" y2="105" stroke="white" strokeWidth="0.9" opacity="0.6"/>
      <rect x="6" y="112" width="24" height="3" rx="1.5" fill="#3A3A4A"/>
    </>
  )

  // ─────────────────────────────────────────────────
  //  BLOG variant — BRIGHT large glasses, book
  // ─────────────────────────────────────────────────
  const blogVariant = (
    <>
      {body}
      {/* Curious pleased smile */}
      <path d="M45 66 Q50 72 55 66" stroke="#140A02" strokeWidth="1.5" fill="none" strokeLinecap="round"/>

      {/* ── BRIGHT large round glasses — unmistakable ── */}
      {/* Lens tint fill so they read even on tan face */}
      <circle cx="39" cy="50" r="11" fill="#1E90FF" opacity="0.25"/>
      <circle cx="61" cy="50" r="11" fill="#1E90FF" opacity="0.25"/>
      {/* Thick bright frame */}
      <circle cx="39" cy="50" r="11" fill="none" stroke="#0060D0" strokeWidth="3.5"/>
      <circle cx="61" cy="50" r="11" fill="none" stroke="#0060D0" strokeWidth="3.5"/>
      {/* Bridge between lenses */}
      <line x1="50" y1="50" x2="50" y2="50" stroke="#0060D0" strokeWidth="3"/>
      <path d="M50 49 L50 51" stroke="#0060D0" strokeWidth="3" strokeLinecap="round"/>
      {/* Temples (arms going to ears) */}
      <line x1="28" y1="47" x2="22" y2="44" stroke="#0060D0" strokeWidth="3" strokeLinecap="round"/>
      <line x1="72" y1="47" x2="78" y2="44" stroke="#0060D0" strokeWidth="3" strokeLinecap="round"/>
      {/* Lens glare */}
      <path d="M32 44 Q35 41 38 43" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7"/>
      <path d="M54 44 Q57 41 60 43" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7"/>

      {/* Subtle furrowed brow for intellectual look */}
      <path d="M36 41 Q40 39 44 41" stroke="#5A3010" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.7"/>
      <path d="M56 41 Q60 39 64 41" stroke="#5A3010" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.7"/>

      {/* ── PENCIL tucked behind the left ear ── */}
      {/* Pencil shaft */}
      <rect x="17" y="24" width="4.5" height="18" rx="1.2" fill="#F5D000" transform="rotate(-30,17,24)"/>
      {/* Pencil ferrule (metal band) */}
      <rect x="17" y="24" width="4.5" height="3" rx="0.8" fill="#AAAAAA" transform="rotate(-30,17,24)"/>
      {/* Pencil eraser (pink nub at top) */}
      <rect x="17" y="21" width="4.5" height="3.5" rx="1" fill="#F08080" transform="rotate(-30,17,24)"/>
      {/* Pencil tip (sharpened wood) */}
      <path d="M11.5 39 L15.5 34 L17.5 39 Z" fill="#D4A870" transform="rotate(-30,14,37)"/>
      {/* Pencil graphite tip */}
      <circle cx="10.8" cy="42.5" r="1" fill="#333333" transform="rotate(-30,10.8,42.5)"/>

      {/* Open book held in both paws */}
      <path d="M28 84 Q22 96 22 104" stroke="#C8880A" strokeWidth="9" strokeLinecap="round" fill="none"/>
      <path d="M72 84 Q78 96 78 104" stroke="#C8880A" strokeWidth="9" strokeLinecap="round" fill="none"/>
      <path d="M16 100 Q33 95 50 100 L50 118 Q33 113 16 118 Z" fill="#F5EDD5" stroke="#C8A860" strokeWidth="1"/>
      <path d="M50 100 Q67 95 84 100 L84 118 Q67 113 50 118 Z" fill="#F5EDD5" stroke="#C8A860" strokeWidth="1"/>
      <rect x="48" y="98" width="4" height="22" rx="1.5" fill="#A07830"/>
      <line x1="19" y1="104" x2="47" y2="103" stroke="#C0A060" strokeWidth="1" opacity="0.7"/>
      <line x1="19" y1="107" x2="47" y2="106" stroke="#C0A060" strokeWidth="1" opacity="0.7"/>
      <line x1="19" y1="110" x2="47" y2="109" stroke="#C0A060" strokeWidth="1" opacity="0.7"/>
      <line x1="53" y1="104" x2="81" y2="103" stroke="#C0A060" strokeWidth="1" opacity="0.7"/>
      <line x1="53" y1="107" x2="81" y2="106" stroke="#C0A060" strokeWidth="1" opacity="0.7"/>
      <line x1="53" y1="110" x2="81" y2="109" stroke="#C0A060" strokeWidth="1" opacity="0.7"/>
    </>
  )

  // ─────────────────────────────────────────────────
  //  FUN variant — tongue out, ONE ear flopped, raised paw, sparkles
  // ─────────────────────────────────────────────────
  const funVariant = (
    <>
      {/* Floor coat */}
      <path d="M24 78 Q18 102 25 116 Q50 124 75 116 Q82 102 76 78 Z" fill="#B07518"/>
      {/* Saddle */}
      <ellipse cx="50" cy="76" rx="22" ry="14" fill="#3C3A58"/>
      {/* Coat highlight */}
      <path d="M29 81 Q23 103 31 113 Q50 119 69 113 Q77 103 71 81 Q62 87 50 87 Q38 87 29 81 Z" fill="#D09020" opacity="0.55"/>

      {/* Paws — left paw raised so only right on ground */}
      <ellipse cx="64" cy="114" rx="10" ry="6" fill="#C8880A"/>
      <path d="M56 115 Q64 120 72 115" stroke="#9A6208" strokeWidth="1.2" fill="none" strokeLinecap="round"/>

      {/* Head */}
      <ellipse cx="50" cy="52" rx="26" ry="24" fill="#C8880A"/>
      <ellipse cx="50" cy="36" rx="18" ry="11" fill="#B07518"/>
      <line x1="50" y1="29" x2="50" y2="42" stroke="#906010" strokeWidth="1" opacity="0.45"/>

      {/* LEFT ear — FLOPPED DOWN (drooping, different from right) */}
      <path d="M26 46 Q14 50 16 64 Q22 70 30 60 L33 44 Z" fill="#3C3A58"/>
      <path d="M27 47 Q16 51 18 63 Q23 68 30 59 L32 45 Z" fill="#C8880A" opacity="0.8"/>

      {/* RIGHT ear — normal upright */}
      <path d="M74 46 L78 28 L62 42 Z" fill="#3C3A58"/>
      <path d="M73 45 L76 31 L63 42 Z" fill="#C8880A" opacity="0.8"/>

      {/* Muzzle */}
      <ellipse cx="50" cy="60" rx="14" ry="11" fill="#E8B040"/>

      {/* SQUINTING happy eyes — curved arc lines, not circles */}
      <path d="M33 48 Q40 41 47 48" stroke="#140A02" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
      <path d="M53 48 Q60 41 67 48" stroke="#140A02" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
      {/* Squint eye shine */}
      <circle cx="40" cy="44" r="2" fill="white" opacity="0.65"/>
      <circle cx="60" cy="44" r="2" fill="white" opacity="0.65"/>

      {/* Rosy happy cheeks */}
      <ellipse cx="33" cy="56" rx="7" ry="4.5" fill="#FF8080" opacity="0.4"/>
      <ellipse cx="67" cy="56" rx="7" ry="4.5" fill="#FF8080" opacity="0.4"/>

      {/* Nose */}
      <ellipse cx="50" cy="62" rx="4.5" ry="3.2" fill="#140A02"/>
      <ellipse cx="48.8" cy="61" rx="1.4" ry="0.9" fill="rgba(255,255,255,0.35)"/>

      {/* Open mouth — wide happy grin */}
      <path d="M42 66 Q50 74 58 66" stroke="#140A02" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      {/* LARGE tongue sticking out — unmistakable */}
      <ellipse cx="50" cy="73" rx="8" ry="9" fill="#FF5080"/>
      {/* Tongue tip rounded crease */}
      <line x1="50" y1="66" x2="50" y2="80" stroke="#D03060" strokeWidth="1.8" opacity="0.6" strokeLinecap="round"/>
      {/* Tongue highlight */}
      <ellipse cx="47" cy="70" rx="2.5" ry="3.5" fill="#FF90B0" opacity="0.5"/>

      {/* RAISED LEFT PAW — arm up high */}
      <path d="M28 84 Q14 70 10 56" stroke="#C8880A" strokeWidth="9" strokeLinecap="round" fill="none"/>
      <ellipse cx="10" cy="53" rx="9" ry="7" fill="#C8880A"/>
      {/* Paw toe lines */}
      <path d="M4 53 Q10 58 16 53" stroke="#9A6208" strokeWidth="1.2" fill="none" strokeLinecap="round"/>

      {/* SPARKLES around raised paw */}
      {/* Large star top-right */}
      <path d="M82 12 L84 5 L86 12 L93 14 L86 16 L84 23 L82 16 L75 14 Z" fill="#FFD700"/>
      {/* Medium star top-left */}
      <path d="M10 18 L11.5 13 L13 18 L18 19.5 L13 21 L11.5 26 L10 21 L5 19.5 Z" fill="#FFD700" opacity="0.9"/>
      {/* Small star right */}
      <path d="M88 40 L89 37 L90 40 L93 41 L90 42 L89 45 L88 42 L85 41 Z" fill="#FF9900" opacity="0.85"/>
      {/* Tiny sparkle dot clusters */}
      <circle cx="78" cy="8" r="2.5" fill="#FFE040" opacity="0.8"/>
      <circle cx="90" cy="28" r="1.8" fill="#FFD700" opacity="0.7"/>
      <circle cx="18" cy="10" r="2" fill="#FFE040" opacity="0.75"/>
    </>
  )

  const variantMap = {
    about: aboutVariant,
    projects: projectsVariant,
    blog: blogVariant,
    fun: funVariant,
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 130"
      width={size}
      height={size * 1.3}
      style={{ display: 'block', pointerEvents: 'none', overflow: 'visible' }}
      aria-hidden="true"
    >
      {variantMap[variant] || variantMap.about}
    </svg>
  )
}
