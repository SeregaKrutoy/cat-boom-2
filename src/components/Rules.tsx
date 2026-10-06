import { CARD_INFO } from "@/lib/game/cards";
import type { CardType } from "@/lib/game/types";
import { CardFace } from "./CardView";

const ORDER: CardType[] = ["kitten", "defuse", "attack", "skip", "favor", "future", "shuffle", "nope", "cat1", "cat2", "cat3"];

export function Rules() {
  return (
    <div className="w-full min-w-0 space-y-8 text-ink">
      <section className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3 sm:gap-4">
        <div className="min-w-0 rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <h3 className="font-display mb-2 text-xl leading-tight text-heading sm:text-2xl">Как выглядит партия</h3>
          <p className="break-words text-sm leading-relaxed text-muted">
            В центре стола — колода, в ней прячется <b>Взрывной котёнок</b>. В свой ход ты играешь карты с руки (по
            желанию), а затем <b>обязательно</b> берёшь верхнюю карту колоды. Вытянул котёнка без «Обезвредь» —
            взорвался и проиграл. Соперник становится победителем.
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <h3 className="font-display mb-2 text-xl leading-tight text-heading sm:text-2xl">Подготовка</h3>
          <ol className="list-decimal space-y-1 break-words pl-5 text-sm leading-relaxed text-muted">
            <li>32 карты. Убираем котёнка и 3 «Обезвредь».</li>
            <li>Каждому по 1 «Обезвредь», третья — обратно в колоду.</li>
            <li>Раздаём по 7 карт — на руке у каждого 8.</li>
            <li>Замешиваем котёнка в колоду. Первый игрок — случайный.</li>
          </ol>
        </div>
        <div className="min-w-0 rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <h3 className="font-display mb-2 text-xl leading-tight text-heading sm:text-2xl">Как ходить</h3>
          <p className="break-words text-sm leading-relaxed text-muted">
            <b>Сыграй-или-спасуй, затем бери.</b> Играй сколько угодно карт, потом возьми карту из колоды — ход
            переходит к сопернику. «Слиняй» и «Нападай» завершают ход без взятия карты.
          </p>
          <p className="mt-2 break-words text-sm leading-relaxed text-muted">
            Особые комбинации: <b>2 одинаковые</b> карты — укради случайную карту соперника. <b>3 одинаковые</b> —
            назови карту, и если она у соперника есть, он отдаёт её. Текст на картах в комбинации не действует.
          </p>
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <h3 className="font-display mb-2 text-xl leading-tight text-heading sm:text-2xl">🏆 Режим турнира</h3>
        <p className="break-words text-sm leading-relaxed text-muted">
          В турнире может участвовать сколько угодно игроков (от 2), а стартует он по кнопке создателя. Матчи идут
          <b> один на один</b>, а <b>каждый играет с каждым ровно один раз</b>. Игра делится на раунды: в каждом раунде
          все пары играют <b>одновременно на разных столах</b>. Если игроков нечётное число, кому-то не хватает пары — он
          отдыхает в этом раунде и может переключаться между столами, чтобы смотреть чужие партии (карты игроков при
          этом скрыты). Следующий раунд начинается сам, когда доиграют все столы. Если игрок долго не ходит, за него
          делается ход автоматически. Когда все раунды сыграны, побеждает тот, кто выиграл больше всего раз.
        </p>
      </section>

      <section className="min-w-0 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <h3 className="font-display mb-2 text-xl text-heading sm:text-2xl">Состав колоды</h3>
        <p className="text-sm leading-relaxed text-muted">
          Дуэль с другом, игра с ботом и каждый стол турнира используют <b>32 карты</b> из руководства:
          всего <b>3 «Обезвредь» и 1 котёнок</b>, включая карты на руках и в сбросе.
          По одной «Обезвредь» выдаётся игрокам, третья замешивается до раздачи оставшихся карт.
          Реванш заново собирает этот же набор, а не добавляет карты к старому.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Для общей партии на 3–6 человек колода растёт с числом игроков (за основу взят дуэльный набор).
          На 3 игроков добавляется: по 1 «Нападай» и «Затасуй», по 2 «Слиняй», «Подлижись», «Грядущее» и «Неть»,
          по 2 «Бородакота», «Котопингвина» и «Шляпокота». Каждый следующий игрок добавляет ещё:
          по 1 «Нападай» и «Затасуй», по 1 «Слиняй», «Подлижись», «Грядущее» и «Неть»,
          по 2 каждой кошкокарты.
          «Обезвредь» всегда на одну больше, чем игроков: у каждого на руках в начале ровно одна,
          ещё одна запасная лежит в колоде. <b>Взрывной котёнок всегда один</b>.
          Итого: 49 / 62 / 75 / 88 карт для 3 / 4 / 5 / 6 игроков. Когда игрок взрывается, он выбывает,
          а котёнок замешивается обратно в колоду — игра идёт, пока не останется один игрок.
          На турнирные дуэли это расширение не распространяется.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          <b>Цепочка «Неть».</b> Оспорить сыгранную карту может <b>только тот игрок, на которого сделан ход</b>
          (для «Подлижись», пары и тройки — выбранная цель, для остальных карт — следующий игрок).
          Ответные «Неть» тоже идут только между этими двоими: на «Неть» отвечает игрок, чей ход,
          затем снова цель, и так далее. Остальные игроки в цепочку не вмешиваются.
        </p>
      </section>

      <section className="min-w-0">
        <h3 className="font-display mb-4 text-2xl text-heading sm:text-3xl">Карты дуэльного набора</h3>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ORDER.map((t) => (
            <div key={t} className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-panel p-3">
              <CardFace type={t} size="sm" showText={false} />
              <div className="min-w-0 flex-1">
                <div className="font-display break-words text-base leading-tight text-ink sm:text-lg">
                  {CARD_INFO[t].name}{" "}
                  <span className="font-sans text-sm font-semibold text-accent">
                    {CARD_INFO[t].count} {CARD_INFO[t].count === 1 ? "карта" : "карты"}
                  </span>
                </div>
                <p className="mt-1 break-words text-xs leading-snug text-muted">{CARD_INFO[t].description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
