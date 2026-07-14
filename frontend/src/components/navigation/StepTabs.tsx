import { Link } from "react-router-dom";

type StepTabsProps = {
  steps: readonly string[];
  activeIndex: number;
  stepRoutes?: readonly string[];
};

function StepTabs({ steps, activeIndex, stepRoutes }: StepTabsProps) {
  return (
    <div className="step-tabs">
      {steps.map((step, index) => {
        const route = stepRoutes?.[index];
        const className = `step-tab ${index === activeIndex ? "active" : ""}`;

        if (!route) {
          return (
            <div key={step} className={className}>
              {step}
            </div>
          );
        }

        return (
          <Link key={step} to={route} className={className}>
            {step}
          </Link>
        );
      })}
    </div>
  );
}

export default StepTabs;
