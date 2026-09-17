import type { ReactNode } from "react";

type DevPageShellProps = Readonly<{
  title: string;
  description: string;
  children: ReactNode;
}>;

export default function DevPageShell({ title, description, children }: DevPageShellProps) {
  return (
    <main className="text-white font-sans min-h-full flex-1 px-4 py-8 md:px-24 md:py-16">
      <section className="px-0 md:px-6 max-sm:mt-12">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-8 border-b border-gray-800 pb-4">
            <div>
              <div>
                <h1 className="!mb-2 !mt-0 !text-left">{title}</h1>
                <p className="!m-0 max-w-2xl text-white/55">{description}</p>
              </div>
            </div>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
