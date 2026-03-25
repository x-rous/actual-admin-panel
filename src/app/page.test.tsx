import { redirect } from "next/navigation";
import Home from "./page";

// next/navigation is mocked by jest config; capture calls
jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

describe("Root page", () => {
  it("redirects to /connect", () => {
    Home();
    expect(redirect).toHaveBeenCalledWith("/connect");
  });
});
