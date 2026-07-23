import { useState } from "react";
import { useNavigate } from "react-router-dom";
import mascot from "../assets/panda-home.png";
import fridaPhoto from "../assets/team-frida.png";
import esmePhoto from "../assets/team-esme.png";
import reynaPhoto from "../assets/team-reyna.png";
import melaniePhoto from "../assets/team-melanie.png";
import { ArrowLeft, GithubIcon, LinkedInIcon } from "../components/icons";

type Member = {
  id: string;
  name: string;
  role: string;
  photo: string;
  bio: string;
};

const TEAM: Member[] = [
  {
    id: "frida",
    name: "Frida",
    role: "Frontend Engineer",
    photo: fridaPhoto,
    bio: "Frida shapes the SageForce experience end to end. She loves clean interfaces, delightful micro-interactions, and making complex flows feel effortless.",
  },
  {
    id: "esme",
    name: "Esme",
    role: "Backend Engineer",
    photo: esmePhoto,
    bio: "Esme builds the robust backend systems that power SageForce. She loves distributed systems, clean APIs, and turning complex problems into elegant solutions.",
  },
  {
    id: "reyna",
    name: "Reyna",
    role: "AI Engineer",
    photo: reynaPhoto,
    bio: "Reyna designs the AI that turns raw documents into sharp quiz questions. She's fascinated by LLMs, evaluation, and shipping models that actually help people.",
  },
  {
    id: "melanie",
    name: "Melanie",
    role: "Product Designer",
    photo: melaniePhoto,
    bio: "Melanie makes sure every screen feels intuitive and on-brand. She champions the user, sweats the details, and keeps the whole product feeling cohesive.",
  },
];

function MeetOurTeamPage() {
  const navigate = useNavigate();
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const featured = TEAM.find((member) => member.id === featuredId) ?? null;

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

        <div className="team-row">
          {TEAM.map((member) => (
            <button
              key={member.id}
              type="button"
              className={`team-member ${featuredId === member.id ? "active" : ""}`}
              onClick={() => setFeaturedId(member.id)}
            >
              <img className="team-avatar" src={member.photo} alt={member.name} />
              <span className="team-name">{member.name}</span>
            </button>
          ))}
        </div>

        {featured ? (
          <div
            className="team-modal-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => setFeaturedId(null)}
          >
            <section
              className="glass team-feature"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="team-feature-close"
                aria-label="Close"
                onClick={() => setFeaturedId(null)}
              >
                ×
              </button>
              <img className="team-feature-photo" src={featured.photo} alt={featured.name} />
              <div className="team-feature-body">
                <h2>{featured.name}</h2>
                <p className="team-feature-bio">{featured.bio}</p>
                <div className="team-feature-links">
                  <button type="button" className="team-social">
                    <LinkedInIcon /> LinkedIn
                  </button>
                  <button type="button" className="team-social">
                    <GithubIcon /> GitHub
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default MeetOurTeamPage;
