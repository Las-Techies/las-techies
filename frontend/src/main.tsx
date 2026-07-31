import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import { AuthProvider } from "./context/AuthContext";
import { QuizGuardProvider } from "./context/QuizGuardContext";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <QuizGuardProvider>
          <App />
        </QuizGuardProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
