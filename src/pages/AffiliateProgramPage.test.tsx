import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AffiliateProgramPage from "@/pages/AffiliateProgramPage";

describe("AffiliateProgramPage", () => {
  it("renders the affiliate program route", () => {
    render(
      <MemoryRouter initialEntries={["/pages/affiliate-program"]}>
        <Routes>
          <Route path="/pages/affiliate-program" element={<AffiliateProgramPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /affiliate program/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /how it works/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contact support/i })).toBeInTheDocument();
  });
});
