import React from "react";
import { AppClient } from "@/components/AppClient";
import { readAsyncDb, toPublicState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = toPublicState(await readAsyncDb());
  return <AppClient initialDb={db} />;
}
