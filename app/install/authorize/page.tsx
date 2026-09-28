import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { userFromSessionToken } from "@/lib/authCore";
import { installRequestForBrowser, isInstallerHost } from "@/lib/ssgcsInstaller";

export const dynamic = "force-dynamic";

export default async function InstallAuthorizePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const query = await searchParams;
    const requestHeaders = await headers();
    if (!isInstallerHost(requestHeaders.get("host"))) notFound();
    const requestId = typeof query.request === "string" ? query.request : "";
    const approved = query.approved === "1";
    const error = typeof query.error === "string" ? query.error : "";
    const jar = await cookies();
    const user = userFromSessionToken(jar.get("suas_session")?.value);
    const request = installRequestForBrowser(requestId);

    return (
        <main className="min-h-screen bg-[#090b0c] px-6 py-20 text-white">
            <section className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/[0.035] p-8 shadow-2xl">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-teal-300/80">
                    SSGCS Installer
                </p>
                <h1 className="text-3xl font-semibold tracking-tight">
                    Authorize this installation
                </h1>
                {approved ? (
                    <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-emerald-100">
                        Approved. Return to the SSGCS installer; it will continue automatically.
                    </div>
                ) : !request ? (
                    <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-amber-100">
                        This install request is invalid or expired. Start the installer again.
                    </div>
                ) : (
                    <>
                        <p className="mt-5 text-white/65">
                            Signed in as{" "}
                            <strong className="text-white">
                                {user?.displayName || "approved user"}
                            </strong>
                            . Only approve a computer where you personally started the SSGCS
                            installer.
                        </p>
                        <dl className="mt-6 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                            <div>
                                <dt className="text-white/45">Computer</dt>
                                <dd className="mt-1 font-medium">{request.machineName}</dd>
                            </div>
                            <div>
                                <dt className="text-white/45">Device fingerprint</dt>
                                <dd className="mt-1 break-all font-mono text-xs text-white/70">
                                    {request.deviceId}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-white/45">Request expires</dt>
                                <dd className="mt-1 text-white/70">
                                    {new Date(request.expiresAt).toLocaleString()}
                                </dd>
                            </div>
                        </dl>
                        {error ? (
                            <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">
                                {error}
                            </p>
                        ) : null}
                        <form action="/api/ssgcs/install/authorize" method="post" className="mt-6">
                            <input type="hidden" name="request" value={request.id} />
                            <button
                                type="submit"
                                className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-white/90"
                            >
                                Approve this computer
                            </button>
                        </form>
                    </>
                )}
            </section>
        </main>
    );
}
