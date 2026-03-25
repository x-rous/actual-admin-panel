import { redirect } from "next/navigation";

// Root URL redirects to the connection screen.
// Once connected, the (connect) page will redirect into the app.
export default function RootPage() {
  redirect("/connect");
}
