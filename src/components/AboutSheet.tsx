import { X, Github, Facebook, Instagram, Globe, Mail } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

// Update these to your real handles/URLs when ready.
const CREATOR = {
  name: "bytebento.ph",
  tagline: "Local tools for local problems.",
  site: "https://bytebento.ph",
  github: "https://github.com/izmemarc",
  facebook: "https://facebook.com/bytebento.ph",
  instagram: "https://instagram.com/bytebento.ph",
  email: "mailto:hello@bytebento.ph",
};

export function AboutSheet({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Hero */}
        <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 px-6 pt-8 pb-10 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-emerald-100/80 mb-1">
            A project by
          </div>
          <div className="text-3xl font-black tracking-tight">
            {CREATOR.name}
          </div>
          <div className="mt-2 text-sm text-emerald-50/90">
            {CREATOR.tagline}
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              About Sasakay
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              A free, offline-first jeepney trip planner for Legazpi City.
              Pick a starting point and a destination — Sasakay finds the
              jeepney route, transfers, and walks for you.
            </p>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Connect with us
            </div>
            <div className="grid grid-cols-3 gap-2">
              <SocialTile
                href={CREATOR.site}
                icon={<Globe size={18} />}
                label="Website"
              />
              <SocialTile
                href={CREATOR.facebook}
                icon={<Facebook size={18} />}
                label="Facebook"
              />
              <SocialTile
                href={CREATOR.instagram}
                icon={<Instagram size={18} />}
                label="Instagram"
              />
              <SocialTile
                href={CREATOR.github}
                icon={<Github size={18} />}
                label="GitHub"
              />
              <SocialTile
                href={CREATOR.email}
                icon={<Mail size={18} />}
                label="Email"
              />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Credits
            </div>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>
                Map data © OpenStreetMap contributors,{" "}
                <a
                  href="https://openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-gray-300 hover:decoration-gray-500"
                >
                  ODbL
                </a>
              </li>
              <li>Place data © Google Places</li>
              <li>Map tiles © CARTO</li>
              <li>Jeepney routes curated from local knowledge</li>
            </ul>
          </div>

          <div className="pt-2 text-[11px] text-gray-400 text-center">
            Made with ❤ in Legazpi · Free and open to use
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialTile({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-gray-50 hover:bg-emerald-50 text-gray-600 hover:text-emerald-700 transition-colors"
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </a>
  );
}
