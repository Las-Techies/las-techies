import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import ConfigureQuizPage from "../pages/ConfigureQuizPage";
import InviteSignupPage from "../pages/InviteSignupPage";
import LoginPage from "../pages/LoginPage";
import NewHireHomePage from "../pages/NewHireHomePage";
import LearnerModulePage from "../pages/LearnerModulePage";
import QuizTakingPage from "../pages/QuizTakingPage";
import QuizResultsPage from "../pages/QuizResultsPage";
import ReviewPublishPage from "../pages/ReviewPublishPage";
import UploadContentPage from "../pages/UploadContentPage";
import RequireRole from "../components/RequireRole";
import MeetOurTeamPage from "../pages/MeetOurTeamPage";
import ManagerDashboardPage from "../pages/ManagerDashboardPage";
import AboutPage from "../pages/AboutPage";
import CursorGlow from "../components/CursorGlow";

function App() {
  const location = useLocation();
  const reduce = useReducedMotion();

  // A gentle opacity cross-fade between routes so navigating (e.g. "Get
  // Started" -> login, or switching nav tabs) eases in instead of cutting
  // hard. Opacity-only on purpose: a transform here would create a containing
  // block that could break the sticky nav / fixed aurora background, so we
  // keep the page's own layout untouched and just fade it over the persistent
  // backdrop. `mode="wait"` lets the old page finish fading out before the new
  // one fades in, which reads as a clean shift rather than a blended overlap.
  const transition = reduce
    ? { duration: 0.12 }
    : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <>
      <CursorGlow />
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition }}
          exit={{ opacity: 0, transition: reduce ? { duration: 0.1 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
        >
          <Routes location={location}>
      <Route path="/" element={<AboutPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<InviteSignupPage />} />
      <Route
        path="/home"
        element={
          <RequireRole role="new_hire">
            <NewHireHomePage />
          </RequireRole>
        }
      />
      <Route
        path="/learner-module"
        element={<LearnerModulePage />}
      />
      <Route
        path="/quiz-taking"
        element={
          <RequireRole role="new_hire">
            <QuizTakingPage />
          </RequireRole>
        }
      />
      <Route
        path="/upload-content"
        element={
          <RequireRole role="manager">
            <UploadContentPage />
          </RequireRole>
        }
      />
      <Route
        path="/configure-quiz"
        element={
          <RequireRole role="manager">
            <ConfigureQuizPage />
          </RequireRole>
        }
      />
      <Route
        path="/review-publish"
        element={
          <RequireRole role="manager">
            <ReviewPublishPage />
          </RequireRole>
        }
      />
      <Route
        path="/quiz-results"
        element={
          <RequireRole role="new_hire">
            <QuizResultsPage />
          </RequireRole>
        }
      />
      <Route
        path="/manager-dashboard"
        element={
          <RequireRole role="manager">
            <ManagerDashboardPage />
          </RequireRole>
        }
      />
      <Route path="/meet-our-team" element={<MeetOurTeamPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export default App;
