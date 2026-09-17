import DevPageShell from "./DevPageShell";
import AccessRequests from "./tabs/AccessRequests";
import LinksTab from "./tabs/LinksTab";
import ParamsTab from "./tabs/ParamsTab";
import SsgcsTab from "./tabs/SsgcsTab";
import UploadsTab from "./tabs/UploadsTab";

export default function DevPage() {
  return (
    <DevPageShell title="Workspace" description="Internal tools and file intake for the SUAS@STEM team.">
      <div className="space-y-12">
        <UploadsTab />
        <ParamsTab />
        <SsgcsTab />
        <LinksTab />
        <AccessRequests />
      </div>
    </DevPageShell>
  );
}
