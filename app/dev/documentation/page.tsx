import DevPageShell from "../DevPageShell";
import WikiTab from "../tabs/WikiTab";

export const metadata = { title: "Documentation · SUAS@STEM" };

export default function DevDocumentationPage() {
  return (
    <DevPageShell title="Documentation" description="Reference material, setup notes, and flight operations documentation.">
      <WikiTab />
    </DevPageShell>
  );
}
