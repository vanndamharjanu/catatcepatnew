import React from "react";
import { AppClient } from "@/components/AppClient";
import { readDb, toPublicState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const db = toPublicState(readDb());
  return <AppClient initialDb={db} />;
}
