import Image from "next/image";
import Link from "next/link";
import { MusicTrack, SettingsButton } from "@/components/AudioControls";
import { HomeClient } from "@/components/HomeClient";
import { Rules } from "@/components/Rules";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <main className="landing-page min-h-screen">
      <MusicTrack track="menu" />
      <section className="landing-hero relative isolate">
        <div className="pointer-events-none absolute right-[-7rem] top-20 -z-10 h-64 w-64 rounded-full border-[32px] border-accent/10 sm:right-[-4rem] sm:h-80 sm:w-80" aria-hidden="true" />
        <div className="pointer-events-none absolute left-[-5rem] top-[32rem] -z-10 h-44 w-44 rounded-full bg-accent/10 blur-2xl" aria-hidden="true" />

        <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 py-4 sm:gap-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="Взрывные котята — главная">
            <Image
              src="/images/kittens-logo.png"
              alt=""
              width={96}
              height={96}
              priority
              className="h-10 w-10 shrink-0 rounded-2xl object-cover"
            />
            <span className="font-display truncate text-lg leading-none sm:text-xl">Взрывные котята</span>
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-xs font-semibold text-muted lg:flex">
            <span className="h-2 w-2 rounded-full bg-mint" />
            Дуэль для двоих · 32 карты
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <a href="#rules" className="rounded-full px-3 py-2 text-sm font-semibold text-muted transition hover:bg-ink/10 hover:text-ink sm:px-4">
              Правила
            </a>
            <SettingsButton />
            <ThemeToggle />
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] lg:gap-12 lg:px-8 lg:pb-24 lg:pt-14">
          <div className="min-w-0">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent sm:text-sm">
              <span aria-hidden="true">🐾</span>
              <span>ДУЭЛЬ · 2 ИГРОКА · МОЖНО С БОТОМ</span>
            </div>
            <h1 className="font-display mt-5 text-[clamp(3rem,13.5vw,6.75rem)] leading-[0.86] tracking-[-0.035em] text-ink">
              Взрывные
              <br />
              <span className="text-accent">котята.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:mt-6 sm:text-lg">
              Вытяни карту, но не котёнка. Зови друга за стол или проверь удачу в партии с ботом — правила уже внутри.
            </p>

            <div className="landing-art relative mt-8 hidden h-48 max-w-lg overflow-hidden rounded-[2rem] border border-line shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:block sm:h-56" aria-hidden="true">
              <div className="absolute -right-8 -top-12 h-40 w-40 rounded-full bg-[#f7c469]/40 blur-2xl" />
              <div className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-[#6fa887]/25 blur-2xl" />
              <div className="absolute left-[16%] top-8 h-36 w-24 rotate-[-13deg] rounded-2xl border-[5px] border-white bg-[#e9624b] p-2 shadow-xl sm:h-40 sm:w-28">
                <div className="flex h-full flex-col items-center justify-between rounded-xl border border-white/35 p-2 text-white">
                  <span className="font-display self-start text-xs">Сюрприз</span>
                  <span className="text-5xl">💣</span>
                  <span className="font-display text-[10px]">НЕ КОТЁНОК?</span>
                </div>
              </div>
              <div className="absolute left-[39%] top-5 h-36 w-24 rotate-[10deg] rounded-2xl border-[5px] border-white bg-[#f1c968] p-2 shadow-xl sm:h-40 sm:w-28">
                <div className="flex h-full flex-col items-center justify-between rounded-xl border border-white/55 p-2 text-[#302b3f]">
                  <span className="font-display self-start text-xs">Удача</span>
                  <span className="text-5xl">😼</span>
                  <span className="font-display text-[10px]">ТЯНИ СМЕЛЕЕ</span>
                </div>
              </div>
              <div className="absolute right-[7%] top-1/2 -translate-y-1/2 rounded-[1.5rem] border border-line bg-surface/85 px-4 py-3 shadow-lg backdrop-blur-sm">
                <div className="text-2xl">🧯</div>
                <div className="font-display mt-1 text-sm text-mint">Спокойствие!</div>
              </div>
              <span className="absolute bottom-4 left-[42%] text-2xl">🔥</span>
              <span className="absolute right-[34%] top-5 text-lg">🐾</span>
            </div>
          </div>

          <div className="min-w-0">
            <HomeClient />
          </div>
        </div>


      </section>

      <section id="rules" className="border-t border-line bg-surface2">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mb-7 flex flex-col gap-2 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Перед первой партией</p>
              <h2 className="font-display mt-2 text-4xl leading-none text-ink sm:text-5xl">
                Правила <span className="text-accent">коротко</span>
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-muted">Главное правило простое: играй карты, планируй ходы и не тяни котёнка.</p>
          </div>
          <Rules />
        </div>
      </section>
      <footer className="border-t border-line bg-panel px-4 py-5 text-center text-xs leading-relaxed text-muted sm:px-6">
        Фанатская онлайн-реализация по правилам дуэльной версии. Все права на игру принадлежат правообладателю.
      </footer>
    </main>
  );
}
