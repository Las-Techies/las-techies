import { Navigate, Route, Routes } from "react-router-dom";
import ConfigureQuizPage from "../pages/ConfigureQuizPage";
import InviteSignupPage from "../pages/InviteSignupPage";
import LoginPage from "../pages/LoginPage";
import NewHireHomePage from "../pages/NewHireHomePage";
import LearnerModulePage from "../pages/LearnerModulePage";
import QuizTakingPage from "../pages/QuizTakingPage";
import QuizResultsPage from "../pages/QuizResultsPage";
import ReviewPublishPage from "../pages/ReviewPublishPage";
import UploadContentPage from "../pages/UploadContentPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/signup" element={<InviteSignupPage />} />
      <Route path="/home" element={<NewHireHomePage />} />
      <Route path="/learner-module" element={<LearnerModulePage />} />
      <Route path="/quiz-taking" element={<QuizTakingPage />} />
      <Route path="/upload-content" element={<UploadContentPage />} />
      <Route path="/configure-quiz" element={<ConfigureQuizPage />} />
      <Route path="/review-publish" element={<ReviewPublishPage />} />
      <Route path="/quiz-results" element={<QuizResultsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
