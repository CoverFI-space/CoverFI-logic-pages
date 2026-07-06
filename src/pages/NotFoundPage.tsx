import { ArrowLeft, Home } from "lucide-react";
import { motion } from "framer-motion";

export default function NotFoundPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black p-4 text-[#E1E0CC] md:p-6">
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.65] mix-blend-overlay" />
      <div className="absolute inset-0 bg-linear-to-b from-black/35 via-black/45 to-black/80" />

      <a
        href="/"
        className="coverfi-nav-link absolute left-6 top-6 z-20 inline-flex items-center gap-2 text-sm text-[#E1E0CC]/75 transition-colors hover:text-[#E1E0CC]">
        <ArrowLeft className="h-4 w-4" />
        Back home
      </a>

      <section className="relative z-10 flex min-h-[calc(100vh-2rem)] items-center justify-center md:min-h-[calc(100vh-3rem)]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="liquid-glass w-full max-w-lg rounded-3xl p-8 text-center md:p-10">
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#E1E0CC]/45">
            404
          </p>
          <h1 className="font-serif text-5xl italic leading-none text-[#E1E0CC] md:text-7xl">
            Page not found.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-[#E1E0CC]/60">
            The page you tried to reach is unavailable or has moved. Head back
            to CoverFi and continue from the home experience.
          </p>

          <a
            href="/"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-[#E1E0CC] px-6 py-4 text-sm uppercase tracking-widest text-black transition-transform hover:scale-[1.02]">
            <Home className="h-4 w-4" />
            Go to home
          </a>
        </motion.div>
      </section>
    </main>
  );
}
