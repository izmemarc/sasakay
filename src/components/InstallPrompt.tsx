import { useEffect, useState } from "react";
import { Download, CheckCircle2 } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    if (isStandalone) setInstalled(true);

    const onBip = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div className="absolute bottom-16 right-3 md:bottom-auto md:top-4 md:right-4 z-[1000] bg-white rounded-full shadow px-3 py-1 text-xs flex items-center gap-1 text-emerald-700">
        <CheckCircle2 size={14} />
        Installed
      </div>
    );
  }

  if (!evt) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await evt.prompt();
        const result = await evt.userChoice;
        if (result.outcome === "accepted") setInstalled(true);
        setEvt(null);
      }}
      className="absolute bottom-16 right-3 md:bottom-auto md:top-4 md:right-4 z-[1000] bg-emerald-600 text-white rounded-full shadow-lg px-3 py-2 text-sm flex items-center gap-1.5 hover:bg-emerald-700"
    >
      <Download size={14} />
      Install app
    </button>
  );
}
