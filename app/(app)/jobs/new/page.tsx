import type { Metadata } from "next";
import NewJobFlow from "./new-job-flow";
import "./new-job.css";

export const metadata: Metadata = {
  title: "New job — ScopeLock",
  description: "Create a job, build the quote, and save it as a draft.",
};

export default function NewJobPage() {
  return <NewJobFlow />;
}
