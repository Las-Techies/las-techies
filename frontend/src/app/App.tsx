import { Navigate, Route, Routes } from "react-router-dom";
import ConfigureQuizPage from "../pages/ConfigureQuizPage";
import LoginPage from "../pages/LoginPage";
import QuizResultsPage from "../pages/QuizResultsPage";
import ReviewPublishPage from "../pages/ReviewPublishPage";
import UploadContentPage from "../pages/UploadContentPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/upload-content" element={<UploadContentPage />} />
      <Route path="/configure-quiz" element={<ConfigureQuizPage />} />
      <Route path="/review-publish" element={<ReviewPublishPage />} />
      <Route path="/quiz-results" element={<QuizResultsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
