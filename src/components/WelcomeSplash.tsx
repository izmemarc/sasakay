import { useEffect, useState } from "react";
import { ArrowRight, Bus, MapPin, Sparkles } from "lucide-react";

const STORAGE_KEY = "sasakay.welcomeDismissed.v1";

export function WelcomeSplash() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      /* localStorage unavailable — just show it */
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[3000] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
      <div className="relative w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Hero */}
        <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white px-6 pt-8 pb-10">
          <div
            aria-hidden
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)",
              backgroundSize: "48px 48px, 64px 64px",
            }}
          />
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/20 backdrop-blur text-[10px] font-bold uppercase tracking-widest mb-3">
              <Sparkles size={11} />
              Free · Offline-ready
            </div>
            <h1 className="text-4xl font-black tracking-[-0.03em] leading-none">
              komyut<span className="text-emerald-200">.online</span>
            </h1>
            <p className="mt-2 text-sm text-emerald-50/95">
              Your free jeepney trip planner for Legazpi City.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Feature
            icon={<MapPin size={18} />}
            title="Plan any trip"
            desc="Pick a starting point and destination — komyut finds the jeepney route, walks, and transfers."
          />
          <Feature
            icon={<Bus size={18} />}
            title="Local routes, real data"
            desc="Routes curated from actual Legazpi jeepney drivers and daily riders."
          />
          <Feature
            icon={<Sparkles size={18} />}
            title="Works offline"
            desc="Install to your phone — the whole map and route data work without internet."
          />

          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
              Brought to you by
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-lg font-black text-gray-900 leading-tight">
                  bytebento.ph
                </div>
                <div className="text-[11px] text-gray-500">
                  Local tools for local problems.
                </div>
              </div>
              <a
                href="https://bytebento.ph"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Visit →
              </a>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 pt-2">
          <button
            type="button"
            onClick={dismiss}
            className="group w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all"
          >
            Get started
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-gray-900 leading-tight">
          {title}
        </div>
        <div className="text-xs text-gray-600 mt-0.5 leading-relaxed">
          {desc}
        </div>
      </div>
    </div>
  );
}
