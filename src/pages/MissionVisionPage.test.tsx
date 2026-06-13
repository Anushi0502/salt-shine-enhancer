import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import MissionVisionPage from "@/pages/MissionVisionPage";

describe("MissionVisionPage", () => {
  it("renders the mission and vision page route", () => {
    render(
      <MemoryRouter initialEntries={["/pages/our-mission-vision"]}>
        <Routes>
          <Route path="/pages/our-mission-vision" element={<MissionVisionPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /our mission & vision/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /compassion/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /about salt/i })).toBeInTheDocument();
  });
});
