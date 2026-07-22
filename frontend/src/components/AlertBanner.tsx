import { CircleAlertIcon, XIcon } from "./icons/QuizIcons";

type AlertBannerProps = {
  message: string;
  onDismiss?: () => void;
};

// A prominent, top-of-page banner for errors that would otherwise render as a
// small <p class="form-error"> below a long list (e.g. Uploaded Files) where
// the user has to scroll to notice it.
function AlertBanner({ message, onDismiss }: AlertBannerProps) {
  return (
    <div className="alert-banner alert-banner-error" role="alert">
      <CircleAlertIcon className="alert-banner-icon" aria-hidden />
      <p className="alert-banner-message">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          className="alert-banner-dismiss"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <XIcon aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export default AlertBanner;
