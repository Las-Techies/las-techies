import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useNavigate } from "react-router-dom";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import Lenis from "lenis";

import logoBadge from "../assets/sageforce-logo-badge.png";
import pandaLogin from "../assets/panda-login.png";
import teamFrida from "../assets/team-frida.png";
import teamEsme from "../assets/team-esme.png";
import teamReyna from "../assets/team-reyna.png";
import teamMelanie from "../assets/team-melanie.png";

import {
  ArrowRight,
  CloudUploadIcon,
  SparkleIcon,
  TargetIcon,
  ShieldIcon,
  ChartBarIcon,
  ProgressIcon,
  CheckCircleIcon,
  ModulesIcon,
  XPlain,
  CheckPlain,
  GithubIcon,
  LinkedInIcon,
} from "../components/icons";
import "../styles/about.css";

/* ---------- entrance presets (now scale-in, not just fade) ---------- */
const revEase = [0.2, 0.7, 0.2, 1] as const;
const growIn: Variants = {
  hidden: { opacity: 0, y: 60, scale: 0.92, transition: { duration: 0.5, ease: revEase } },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: revEase } },
};
const fadeLeft: Variants = {
  hidden: { opacity: 0, x: -70, scale: 0.95, transition: { duration: 0.5, ease: revEase } },
  show: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.7, ease: revEase } },
};
const fadeRight: Variants = {
  hidden: { opacity: 0, x: 70, scale: 0.95, transition: { duration: 0.5, ease: revEase } },
  show: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.7, ease: revEase } },
};
const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.14 } },
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 50, scale: 0.9, transition: { duration: 0.5, ease: revEase } },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: revEase } },
};

// once:false => transitions play in BOTH directions (in on scroll-down, back out
// on scroll-up) so the whole page animates reversibly, like the hero panda
const viewport = { once: false, amount: 0.2 } as const;

/* ---------- flip → LOCK → flip demo showcase ----------
   As the card rises in from the bottom it does a quick vertical flip to reveal
   the demo. The instant it's centered we hard-lock page scrolling: the page
   literally can't move until the user makes 2 physical scroll gestures. That
   second gesture triggers a vertical flip the OTHER way, then scrolling resumes
   straight into the team section. */
function FlipShowcase({
  lenisRef,
  jumpingRef,
}: {
  lenisRef: MutableRefObject<Lenis | null>;
  jumpingRef: MutableRefObject<boolean>;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  // track from the moment the card enters the bottom of the viewport (start end)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // rotateX is driven by scroll for BOTH the entry and exit flips (lock sits between them)
  const rotateX = useMotionValue(180);
  // card fades out after it flips away, so it never peeks when you jump to the team section
  const cardOpacity = useMotionValue(1);

  useEffect(() => {
    if (reduce) return;

    // progress at which the card becomes centered/pinned (section 116vh / 216vh track)
    const CENTERED = 0.463;
    // how much the user must scroll (px) before the lock lets go — small = smooth
    const RELEASE_AT = 180;
    let locked = false;
    let released = false; // lock only fires once per fresh entry from the top
    let scrolled = 0;
    let lockY = 0;
    let lastP = scrollYProgress.get();

    // fully scroll-linked rotation so the flip is REVERSIBLE both ways:
    //   .03 -> .34  : entry vertical flip  180deg -> 0deg (flips in as it rises)
    //   .34 -> .47  : flat, demo facing us (centered / pause zone)
    //   .47 -> .77  : exit vertical flip   0deg -> -180deg (flips the other way)
    const rotateForP = (p: number) => {
      if (p <= 0.34) return 180 * (1 - Math.min(1, Math.max(0, (p - 0.03) / 0.31)));
      if (p < 0.47) return 0;
      return -180 * Math.min(1, Math.max(0, (p - 0.47) / 0.3));
    };
    // fade the card out as it finishes flipping so it's fully gone well before the
    // team section — otherwise it peeks at the top when you jump straight to Team
    const opacityForP = (p: number) =>
      p <= 0.7 ? 1 : Math.max(0, 1 - (p - 0.7) / 0.08);

    const addScroll = (amount: number) => {
      scrolled += Math.abs(amount);
      if (scrolled >= RELEASE_AT) unlock();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      window.scrollTo(0, lockY);
      addScroll(e.deltaY);
    };
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      window.scrollTo(0, lockY);
      addScroll(60);
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        ["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Spacebar"].includes(
          e.key
        )
      ) {
        e.preventDefault();
        addScroll(90);
      }
    };

    const removeLock = () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("keydown", onKey);
    };

    const lock = () => {
      locked = true;
      rotateX.set(0);
      scrolled = 0;
      lockY = window.scrollY;
      lenisRef.current?.stop();
      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("touchmove", onTouch, { passive: false });
      window.addEventListener("keydown", onKey);
    };

    // a bit of scrolling unlocks; the exit flip is then driven by scroll
    const unlock = () => {
      if (!locked) return;
      removeLock();
      lenisRef.current?.start();
      locked = false;
      released = true;
    };

    const onProgress = (p: number) => {
      if (locked) return; // frozen; scroll is prevented while paused
      rotateX.set(rotateForP(p));
      cardOpacity.set(opacityForP(p));
      const scrollingDown = p > lastP;
      lastP = p;
      // lock only when actively scrolling DOWN into the center window, and never
      // during a nav jump (which animates straight through the demo)
      if (
        !released &&
        !jumpingRef.current &&
        scrollingDown &&
        p >= CENTERED &&
        p <= 0.52
      ) {
        lock();
      }
      // re-arm the one-time pause once we've scrolled back up above the demo
      if (released && p < 0.15) released = false;
    };

    const unsub = scrollYProgress.on("change", onProgress);
    onProgress(scrollYProgress.get());

    return () => {
      unsub();
      removeLock();
      lenisRef.current?.start();
    };
  }, [reduce, scrollYProgress, rotateX, cardOpacity, lenisRef, jumpingRef]);

  const Demo = (
    <>
      <div className="lp-browser-bar"><i /><i /><i /></div>
      <div className="lp-flip-video">
        <iframe
          src="https://www.loom.com/embed/8667d545be994a8481839ae0d33c5208"
          title="Product demo"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: "none" }}
        />
        <span className="lp-flip-video-label">Product demo</span>
      </div>
    </>
  );

  if (reduce) {
    return (
      <section className="lp-flip-section lp-flip-static">
        <div className="lp-flip-sticky">
          <div className="lp-flip-card lp-flip-card-static">
            <div className="lp-flip-face lp-flip-demo">{Demo}</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="lp-flip-section">
      <div className="lp-flip-sticky">
        <motion.div className="lp-flip-card" style={{ rotateX, opacity: cardOpacity }}>
          <div className="lp-flip-face lp-flip-demo">{Demo}</div>
          <div className="lp-flip-face lp-flip-cover" />
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- data ---------- */
const STEPS = [
  {
    icon: <CloudUploadIcon />,
    title: "Upload your docs",
    body: "Drop in the onboarding docs, wikis, or links your team already uses — no rewriting required.",
  },
  {
    icon: <SparkleIcon />,
    title: "AI generates a quiz",
    body: "SageForce parses your material and writes tailored questions on your workflows, code, and processes.",
  },
  {
    icon: <TargetIcon />,
    title: "Assign & track",
    body: "Send quizzes to new hires and watch completion and scores roll into your manager dashboard.",
  },
];

const FEATURES = [
  { icon: <SparkleIcon />, title: "AI quiz generation", body: "Turn any document into sharp, relevant questions in seconds." },
  { icon: <ShieldIcon />, title: "Role-based access", body: "Managers build and assign; new hires learn and take quizzes." },
  { icon: <ChartBarIcon />, title: "Manager dashboard", body: "See who's onboarded, who's stuck, and where to help." },
  { icon: <ProgressIcon />, title: "Progress tracking", body: "Real-time completion and performance across your whole team." },
  { icon: <CheckCircleIcon />, title: "Instant grading", body: "Quizzes score themselves so feedback is immediate." },
  { icon: <ModulesIcon />, title: "Learner modules", body: "Study material and quizzes live together in one clean flow." },
];

const TEAM = [
  {
    id: "frida",
    name: "Frida",
    role: "University of California, Berkeley",
    photo: teamFrida,
    bio: "Frida is a junior at the University of California, Berkeley studying Computer Science and Data Science.",
    linkedin: "https://www.linkedin.com/in/frida-arriaga/",
    github: "https://github.com/fridaarriaga",
  },
  {
    id: "esme",
    name: "Esme",
    role: "University of California, Berkeley",
    photo: teamEsme,
    bio: "Esme is a junior at the University of California, Berkeley studying Electrical Engineering and Computer Science.",
    linkedin: "https://www.linkedin.com/in/esmebenitez/",
    github: "https://github.com/EsmeBenitez",
  },
  {
    id: "reyna",
    name: "Reyna",
    role: "University of Houston",
    photo: teamReyna,
    bio: "Reyna is a junior at the University of Houston studying Computer Science.",
    linkedin: "https://www.linkedin.com/in/reyna-obreg%C3%B3n-8779322a8/",
    github: "https://github.com/reyna1008",
  },
  {
    id: "melanie",
    name: "Melanie",
    role: "University of Southern California",
    photo: teamMelanie,
    bio: "Melanie is a junior at the University of Southern California studying Computer Science.",
    linkedin: "https://www.linkedin.com/in/m3lanieperez/",
    github: "https://github.com/melanienperez",
  },
];

function AboutPage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);
  const jumpingRef = useRef(false); // true while a nav jump is animating (suppresses the demo lock)
  const [scrolled, setScrolled] = useState(false);

  /* ---- hero scroll-linked parallax ---- */
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroCopyY = useTransform(heroProgress, [0, 1], [0, -120]);
  const heroCopyOpacity = useTransform(heroProgress, [0, 0.85], [1, 0]);
  const heroArtScale = useTransform(heroProgress, [0, 1], [1, 1.22]);
  const heroArtY = useTransform(heroProgress, [0, 1], [0, 70]);
  const heroArtRotate = useTransform(heroProgress, [0, 1], [0, 5]);

  useEffect(() => {
    if (reduce) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenisRef.current = lenis;
    lenis.on("scroll", ({ scroll }: { scroll: number }) => setScrolled(scroll > 40));

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reduce]);

  const scrollTo = (selector: string) => {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return;
    jumpingRef.current = true;
    // the team section is a full-height centered block, so land its top at the very
    // top of the viewport (offset 0) to keep its content centered in the frame
    const offset = selector === "#lp-team" ? 0 : -80;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(el, {
        offset,
        onComplete: () => {
          jumpingRef.current = false;
        },
      });
    } else {
      el.scrollIntoView({ behavior: "smooth" });
    }
    // safety: clear the flag even if onComplete doesn't fire
    window.setTimeout(() => {
      jumpingRef.current = false;
    }, 1500);
  };

  return (
    <div className="lp-page">
      {/* ===================== NAV ===================== */}
      <nav className={`lp-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="lp-brand">
          <img src={logoBadge} alt="SageForce" />
          SageForce
        </div>
        <div className="lp-nav-links">
          <button onClick={() => scrollTo("#lp-how")}>How it works</button>
          <button onClick={() => scrollTo("#lp-features")}>Features</button>
          <button onClick={() => scrollTo("#lp-team")}>Team</button>
        </div>
        <button className="lp-btn lp-btn-primary" onClick={() => navigate("/login")}>
          Get Started
        </button>
      </nav>

      {/* ===================== HERO ===================== */}
      <section className="lp-hero" ref={heroRef}>
        <motion.div
          className="lp-hero-copy"
          style={reduce ? undefined : { y: heroCopyY, opacity: heroCopyOpacity }}
        >
          <motion.div variants={growIn} initial="hidden" animate="show">
            <p className="lp-eyebrow">AI-powered onboarding</p>
            <h1>
              Turn your onboarding <span className="lp-accent">docs</span> into
              quizzes in minutes.
            </h1>
            <p className="lp-lead">
              SageForce transforms the docs your team already has into measurable
              learning — so new hires ramp faster and managers actually know
              they're ready.
            </p>
            <div className="lp-hero-cta">
              <button className="lp-btn lp-btn-primary" onClick={() => navigate("/login")}>
                Get Started <ArrowRight />
              </button>
              <button className="lp-btn lp-btn-ghost" onClick={() => scrollTo("#lp-how")}>
                See how it works
              </button>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          className="lp-hero-art"
          style={reduce ? undefined : { scale: heroArtScale, y: heroArtY, rotate: heroArtRotate }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.15 }}
        >
          <div className="lp-hero-blob" />
          <motion.img
            src={pandaLogin}
            alt="SageForce panda mascot"
            animate={reduce ? {} : { y: [0, -18, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </section>

      {/* ===================== PROBLEM / SOLUTION ===================== */}
      <section>
        <motion.div variants={growIn} initial="hidden" whileInView="show" viewport={viewport}>
          <p className="lp-eyebrow">Why SageForce</p>
          <h2 className="lp-h2">Onboarding docs go stale. Learning shouldn't.</h2>
          <p className="lp-lead">
            Every team has a folder of docs no one reads. SageForce turns that
            dead weight into something new hires actually learn from.
          </p>
        </motion.div>

        <div className="lp-two">
          <motion.div
            className="lp-glass lp-two-card is-problem"
            variants={fadeLeft}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
          >
            <h3>The old way</h3>
            <ul className="lp-list is-problem">
              <li><XPlain /> Docs get skimmed once, then forgotten</li>
              <li><XPlain /> No way to know if a new hire actually understood</li>
              <li><XPlain /> Managers rebuild training from scratch every time</li>
            </ul>
          </motion.div>

          <div className="lp-two-arrow"><ArrowRight /></div>

          <motion.div
            className="lp-glass lp-two-card is-solution"
            variants={fadeRight}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
          >
            <h3>The SageForce way</h3>
            <ul className="lp-list is-solution">
              <li><CheckPlain /> Existing docs become tailored quizzes automatically</li>
              <li><CheckPlain /> Scores prove understanding before sprint work</li>
              <li><CheckPlain /> Managers track the whole cohort from one dashboard</li>
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ===================== HOW IT WORKS ===================== */}
      <section id="lp-how">
        <motion.div variants={growIn} initial="hidden" whileInView="show" viewport={viewport}>
          <p className="lp-eyebrow">How it works</p>
          <h2 className="lp-h2">Three steps from doc to done.</h2>
        </motion.div>

        <motion.div
          className="lp-steps"
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
        >
          {STEPS.map((step, i) => (
            <motion.div key={step.title} className="lp-glass lp-step" variants={staggerChild}>
              <div className="lp-step-num">{step.icon}</div>
              <span className="lp-step-badge">STEP {i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ===================== FEATURES ===================== */}
      <section id="lp-features">
        <motion.div variants={growIn} initial="hidden" whileInView="show" viewport={viewport}>
          <p className="lp-eyebrow">Features</p>
          <h2 className="lp-h2">Everything a team lead needs.</h2>
        </motion.div>

        <motion.div
          className="lp-feat-grid"
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
        >
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              className="lp-glass lp-feat"
              variants={staggerChild}
              whileHover={reduce ? undefined : { y: -8, scale: 1.03 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <div className="lp-feat-ic">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ===================== FLIP DEMO SHOWCASE ===================== */}
      <FlipShowcase lenisRef={lenisRef} jumpingRef={jumpingRef} />

      {/* ===================== TEAM ===================== */}
      <section id="lp-team">
        <motion.div variants={growIn} initial="hidden" whileInView="show" viewport={viewport}>
          <p className="lp-eyebrow">The people</p>
          <h2 className="lp-h2">Meet the team behind SageForce.</h2>
        </motion.div>

        <motion.div
          className="lp-team-grid"
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
        >
          {TEAM.map((m) => (
            <motion.div
              key={m.id}
              className="lp-member open"
              variants={staggerChild}
            >
              <div className="lp-member-trigger">
                <img className="lp-avatar" src={m.photo} alt={m.name} />
                <h3>{m.name}</h3>
              </div>

              {/* bio card is always shown — role, bio, and socials live in a
                  white box beneath every member (no hover / no toggle). */}
              <div className="lp-member-bio" data-open="true">
                <div className="lp-member-bio-inner">
                  <p className="lp-member-role">{m.role}</p>
                  <p className="lp-member-text">{m.bio}</p>
                  <div className="lp-member-links">
                    <a
                      href={m.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="lp-member-social"
                    >
                      <LinkedInIcon /> LinkedIn
                    </a>
                    <a
                      href={m.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="lp-member-social"
                    >
                      <GithubIcon /> GitHub
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="lp-cta-wrap">
        <motion.div
          className="lp-cta"
          variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
          transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <img className="lp-cta-panda" src={pandaLogin} alt="" aria-hidden="true" />
          <h2>Ready to transform onboarding?</h2>
          <p>Turn your first doc into a quiz today — no setup, no rebuild.</p>
          <button className="lp-btn lp-btn-primary" onClick={() => navigate("/login")}>
            Get Started free <ArrowRight />
          </button>
        </motion.div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div>
            <div className="lp-footer-brand">
              <img src={logoBadge} alt="SageForce" />
              SageForce
            </div>
            <p>
              AI-powered onboarding that turns your team's docs into measurable
              learning. Built by Las Techies for SITE Capstone 2026.
            </p>
          </div>
          <div className="lp-footer-col">
            <h4>Product</h4>
            <a onClick={() => scrollTo("#lp-features")}>Features</a>
            <a onClick={() => scrollTo("#lp-how")}>How it works</a>
            <a onClick={() => navigate("/login")}>Log in</a>
          </div>
          <div className="lp-footer-col">
            <h4>Company</h4>
            <a onClick={() => scrollTo("#lp-team")}>Team</a>
          </div>
          <div className="lp-footer-col">
            <h4>Resources</h4>
            <a href="https://github.com/Las-Techies/las-techies" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AboutPage;
