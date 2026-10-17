import { AssessmentWorkspace } from "@/features/assessment/components/AssessmentWorkspace";

export const metadata = {
  title: "Git practical skills capstone",
  description: "A server-graded Git assessment covering branching, merging and recovery.",
};

export default function AssessmentPage() {
  return <AssessmentWorkspace />;
}
