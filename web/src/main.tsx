import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import TvApp from "./tv/TvApp";
import PlayApp from "./play/PlayApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/tv" element={<TvApp />} />
        <Route path="/play/:code" element={<PlayApp />} />
        <Route path="*" element={<Navigate to="/tv" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
