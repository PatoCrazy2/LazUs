import { motion } from 'framer-motion'
import { Heart, Sparkles, Wifi } from 'lucide-react'
import { useState } from 'react'

export default function App() {
  const [hearts, setHearts] = useState(0)

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-between p-6 max-w-md mx-auto text-center">
      <header className="w-full flex justify-between items-center py-4 border-b border-slate-800 text-xs text-slate-400">
        <span className="font-semibold tracking-wider text-rose-400 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" /> LazUs
        </span>
        <span className="flex items-center gap-1 bg-slate-800/80 px-2.5 py-1 rounded-full text-emerald-400 border border-emerald-500/20">
          <Wifi className="w-3.5 h-3.5" /> PWA Ready
        </span>
      </header>

      <section className="flex flex-col items-center gap-6 my-auto">
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="relative"
        >
          <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-rose-500/30 to-purple-500/30 flex items-center justify-center border border-rose-500/30 shadow-lg shadow-rose-500/10">
            <Heart className="w-14 h-14 text-rose-500 fill-rose-500/80" />
          </div>
        </motion.div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Intimate PWA for Couples
          </h1>
          <p className="text-sm text-slate-400 max-w-xs">
            Offline-first architecture with Dexie, NFC interactions, and Blind Reveal mechanic.
          </p>
        </div>

        <button
          onClick={() => setHearts((h) => h + 1)}
          className="px-6 py-3 rounded-full bg-gradient-to-r from-rose-500 to-purple-600 hover:from-rose-600 hover:to-purple-700 text-white font-medium shadow-md shadow-rose-500/20 transition-all active:scale-95 flex items-center gap-2 text-sm cursor-pointer"
        >
          <Heart className="w-4 h-4 fill-white" />
          Toques de afecto: <span className="font-bold">{hearts}</span>
        </button>
      </section>

      <footer className="w-full text-xs text-slate-500 py-3 border-t border-slate-800/60">
        React 19 • Vite • TanStack • Dexie • Tailwind v4
      </footer>
    </main>
  )
}
