import { Link } from "react-router-dom";
import AppNav from "../components/AppNav";
import StepTabs from "../components/StepTabs";

const steps = ["Upload Content", "Configure Quiz", "Review & Publish"];
const stepRoutes = ["/upload-content", "/configure-quiz", "/review-publish"];

function ReviewPublishPage() {
  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        <h1>Upload + Generate</h1>
        <StepTabs steps={steps} activeIndex={2} stepRoutes={stepRoutes} />

        <section className="card review-placeholder">
          <h2>Review &amp; Publish</h2>
          <p>
            This page is the next step after configuring quiz settings. For now, continue to Quiz
            Results while Review &amp; Publish is being finalized.
          </p>
          <div className="review-actions">
            <Link className="secondary-btn btn-link" to="/configure-quiz">
              Back to Configure Quiz
            </Link>
            <Link className="primary-btn btn-link" to="/quiz-results">
              Continue to Quiz Results
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

export default ReviewPublishPage;
