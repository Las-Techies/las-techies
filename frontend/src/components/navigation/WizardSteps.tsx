import { CheckPlain } from "../icons";

type WizardStepsProps = {
  steps: readonly string[];
  activeIndex: number;
};

function WizardSteps({ steps, activeIndex }: WizardStepsProps) {
  return (
    <div className="wizard">
      {steps.map((step, index) => {
        const isDone = index < activeIndex;
        const isActive = index === activeIndex;
        return (
          <div key={step} style={{ display: "contents" }}>
            <div className={`wizard-step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}>
              <span className="wizard-num">{isDone ? <CheckPlain /> : index + 1}</span>
              <span className="wizard-label">{step}</span>
            </div>
            {index < steps.length - 1 ? (
              <span className={`wizard-connector ${index < activeIndex ? "done" : ""}`} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default WizardSteps;
