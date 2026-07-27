import { useState } from "react";
import { useNavigate } from "react-router-dom";
import mascot from "../assets/panda-home.png";
import fridaPhoto from "../assets/team-frida.png";
import esmePhoto from "../assets/team-esme.png";
import reynaPhoto from "../assets/team-reyna.png";
import melaniePhoto from "../assets/team-melanie.png";
import { ArrowLeft, GithubIcon, LinkedInIcon } from "../components/icons";
import { useAvatarGroupHover } from "../hooks/useAvatarGroupHover";

type Member = {
  id: string;
  name: string;
  role: string;
  photo: string;
  bio: string;
  linkedin?: string;
  github?: string;
};

const TEAM: Member[] = [
  {
    id: "frida",
    name: "Frida",
    role: "Frontend Engineer",
    photo: fridaPhoto,
    bio: "Frida shapes the SageForce experience end to end. She loves clean interfaces, delightful micro-interactions, and making complex flows feel effortless.",
    // TODO: add Frida's LinkedIn/GitHub URLs once she shares them.
  },
  {
    id: "esme",
    name: "Esme",
    role: "Backend Engineer",
    photo: esmePhoto,
    bio: "Esme builds the robust backend systems that power SageForce. She loves distributed systems, clean APIs, and turning complex problems into elegant solutions.",
    linkedin: "https://www.linkedin.com/in/esmebenitez/",
    github: "https://github.com/EsmeBenitez",
  },
  {
    id: "reyna",
    name: "Reyna",
    role: "AI Engineer",
    photo: reynaPhoto,
    bio: "Reyna designs the AI that turns raw documents into sharp quiz questions. She's fascinated by LLMs, evaluation, and shipping models that actually help people.",
    linkedin: "https://www.linkedin.com/in/reyna-obreg%C3%B3n-8779322a8/",
    github: "https://github.com/reyna1008",
  },
  {
    id: "melanie",
    name: "Melanie",
    role: "Product Designer",
    photo: melaniePhoto,
    bio: "Melanie makes sure every screen feels intuitive and on-brand. She champions the user, sweats the details, and keeps the whole product feeling cohesive.",
    linkedin: "https://www.linkedin.com/in/m3lanieperez/",
    github: "https://github.com/melanienperez",
  },
];

function MeetOurTeamPage() {
  const navigate = useNavigate();
  // Which teammate's bio panel is expanded — driven by hover (and by
  // keyboard focus / click as fallbacks for people who can't hover).
  const [openId, setOpenId] = useState<string | null>(null);
  const avatarGroup = useAvatarGroupHover<HTMLDivElement>();

  const openAt = (id: string) => setOpenId(id);
  const closeAt = (id: string) => setOpenId((current) => (current === id ? null : current));
  const toggleAt = (id: string) => setOpenId((current) => (current === id ? null : id));

  return (
    <div className="app-shell">
      <div className="team-topbar">
        <button type="button" className="back-btn" onClick={() => navigate("/")}>
          <ArrowLeft /> Back to login
        </button>
      </div>

      <main className="team-stage">
        <div className="team-hero">
          <div>
            <h1>Meet Our Team</h1>
            <p>The four of us who built SageForce</p>
          </div>
          <img className="team-hero-mascot" src={mascot} alt="Waving panda" />
        </div>

        <div className="team-row" ref={avatarGroup.rootRef} {...avatarGroup.rootProps}>
          {TEAM.map((member, index) => {
            const isOpen = openId === member.id;
            return (
              <div
                key={member.id}
                className={`team-member t-avatar ${isOpen ? "open" : ""}`}
                onMouseEnter={() => {
                  avatarGroup.getItemProps(index).onMouseEnter();
                  openAt(member.id);
                }}
                onMouseLeave={() => closeAt(member.id)}
              >
                <button
                  type="button"
                  className="team-avatar-trigger"
                  aria-expanded={isOpen}
                  onClick={() => toggleAt(member.id)}
                  onFocus={() => openAt(member.id)}
                  onBlur={() => closeAt(member.id)}
                >
                  <img className="team-avatar" src={member.photo} alt={member.name} />
                  <span className="team-name">{member.name}</span>
                </button>

                {/* transitions.dev "accordion" — grid-template-rows 0fr -> 1fr
                    grows the bio panel vertically out of the photo on hover,
                    instead of popping a modal over the whole page. */}
                <div className="team-bio-acc" data-open={isOpen}>
                  <div className="team-bio-acc-inner">
                    <p className="team-bio-role">{member.role}</p>
                    <p className="team-bio-text">{member.bio}</p>
                    <div className="team-bio-links">
                      {member.linkedin ? (
                        <a
                          href={member.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="team-social"
                          tabIndex={isOpen ? 0 : -1}
                        >
                          <LinkedInIcon /> LinkedIn
                        </a>
                      ) : null}
                      {member.github ? (
                        <a
                          href={member.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="team-social"
                          tabIndex={isOpen ? 0 : -1}
                        >
                          <GithubIcon /> GitHub
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default MeetOurTeamPage;
