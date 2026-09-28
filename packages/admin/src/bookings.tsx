import { BOOKING_RETENTION_MONTHS, formatTime } from "@openflow/core";
import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "./context.js";
import { type BookingEntry, cancelBooking, deleteBooking, subscribeBookings } from "./data.js";
import { errorMessage } from "./firebase.js";
import { Icon } from "./icons.js";
import { PageHead } from "./shell.js";
import { Button, Dialog, EmptyState, Menu, StatusChip, timeAgo } from "./ui.js";

type Filter = "upcoming" | "past" | "cancelled";

/** « Mardi 6 octobre », « Aujourd'hui », « Demain », in the business's time zone. */
function dayTitle(booking: BookingEntry): string {
  const local = (offset: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: booking.timeZone }).format(
      new Date(Date.now() + offset * 86400000),
    );
  if (booking.date === local(0)) return "Aujourd'hui";
  if (booking.date === local(1)) return "Demain";
  const [y, m, d] = booking.date.split("-").map(Number) as [number, number, number];
  const text = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function endTime(booking: BookingEntry): string {
  const [h, m] = booking.time.split(":").map(Number) as [number, number];
  const end = h * 60 + m + booking.duration;
  return `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

/**
 * « Rendez-vous »: the appointments visitors booked on the site (`cmsBooking`), by day. The owner
 * cancels one (its time becomes free again on the site) or erases it.
 */
export function BookingsView() {
  const { services, notify, navigate } = useAdmin();
  const [bookings, setBookings] = useState<BookingEntry[]>();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [cancelling, setCancelling] = useState<BookingEntry>();
  const [erasing, setErasing] = useState<BookingEntry>();
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      subscribeBookings(services.db, setBookings, (error) => notify("error", errorMessage(error))),
    [services.db, notify],
  );

  const groups = useMemo(() => {
    const now = new Date().toISOString();
    const all = bookings ?? [];
    const lists: Record<Filter, BookingEntry[]> = {
      upcoming: all.filter((b) => b.status === "confirmed" && b.end >= now),
      past: all.filter((b) => b.status === "confirmed" && b.end < now).reverse(),
      cancelled: all.filter((b) => b.status === "cancelled").reverse(),
    };
    return lists;
  }, [bookings]);
  const shown = groups[filter];
  const byDay: Array<{ date: string; title: string; items: BookingEntry[] }> = [];
  for (const booking of shown) {
    const last = byDay.at(-1);
    if (last?.date === booking.date) last.items.push(booking);
    else byDay.push({ date: booking.date, title: dayTitle(booking), items: [booking] });
  }

  const cancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      await cancelBooking(services.db, cancelling);
      notify("success", "Rendez-vous annulé : le créneau est de nouveau libre sur le site.");
      setCancelling(undefined);
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const erase = async () => {
    if (!erasing) return;
    setBusy(true);
    try {
      await deleteBooking(services.db, erasing);
      notify("success", "Rendez-vous effacé.");
      setErasing(undefined);
    } catch (error) {
      notify("error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<[Filter, string]> = [
    ["upcoming", `À venir (${groups.upcoming.length})`],
    ["past", "Passés"],
    ["cancelled", "Annulés"],
  ];
  return (
    <>
      <PageHead
        title="Rendez-vous"
        description={`Les rendez-vous pris sur votre site. Les créneaux suivent vos horaires d'ouverture ; les prestations et leurs durées se règlent dans la section « Prise de rendez-vous ». Chaque rendez-vous est effacé ${BOOKING_RETENTION_MONTHS} mois après sa date.`}
        actions={
          <Button
            icon="clock"
            onClick={() => navigate({ view: "settings", tab: "business" })}
            title="Réglages > Établissement"
          >
            Horaires d'ouverture
          </Button>
        }
      />
      <section className="of-view">
        <fieldset className="of-segmented of-messages__boxes">
          <legend className="of-sr-only">Rendez-vous affichés</legend>
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              className={filter === value ? "is-active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </fieldset>
        {!bookings ? (
          <p className="of-subtle">Chargement…</p>
        ) : byDay.length === 0 ? (
          <EmptyState
            icon="calendarCheck"
            title={
              filter === "upcoming"
                ? "Aucun rendez-vous à venir"
                : filter === "past"
                  ? "Aucun rendez-vous passé"
                  : "Aucun rendez-vous annulé"
            }
          >
            <p>
              {filter === "upcoming"
                ? "Ajoutez la section « Prise de rendez-vous » à une page et publiez : les réservations des visiteurs arriveront ici, et par e-mail."
                : "Ils apparaîtront ici."}
            </p>
          </EmptyState>
        ) : (
          byDay.map((day) => (
            <section key={day.date} className="of-bookings__day" aria-label={day.title}>
              <h2 className="of-bookings__title">{day.title}</h2>
              <ul className="of-list">
                {day.items.map((booking) => (
                  <li key={booking.id} className="of-list__item of-booking">
                    <span className="of-booking__time">
                      {formatTime(booking.time)}
                      <span className="of-subtle"> – {formatTime(endTime(booking))}</span>
                    </span>
                    <div className="of-list__main">
                      <span className="of-list__title">
                        {booking.name}
                        <span className="of-subtle"> · {booking.service}</span>
                      </span>
                      <span className="of-list__meta">
                        <a className="of-link" href={`mailto:${booking.email}`}>
                          {booking.email}
                        </a>
                        {booking.phone && (
                          <a className="of-link" href={`tel:${booking.phone.replace(/\s+/g, "")}`}>
                            {booking.phone}
                          </a>
                        )}
                        {booking.price && <span>{booking.price}</span>}
                        <span>réservé {timeAgo(booking.createdAt)}</span>
                        {booking.agent && <span>par l'assistant IA du visiteur</span>}
                      </span>
                      {booking.message && (
                        <span className="of-booking__message">« {booking.message} »</span>
                      )}
                    </div>
                    {booking.status === "cancelled" && <StatusChip tone="grey">Annulé</StatusChip>}
                    <Menu
                      label={`Actions : rendez-vous de ${booking.name}`}
                      items={[
                        {
                          label: `Écrire à ${booking.name}`,
                          icon: "mail",
                          onSelect: () => {
                            window.location.href = `mailto:${booking.email}?subject=${encodeURIComponent(`Votre rendez-vous : ${booking.service}`)}`;
                          },
                        },
                        "separator",
                        booking.status === "confirmed" && filter === "upcoming"
                          ? {
                              label: "Annuler le rendez-vous",
                              icon: "x",
                              danger: true,
                              onSelect: () => setCancelling(booking),
                            }
                          : {
                              label: "Effacer",
                              icon: "trash",
                              danger: true,
                              onSelect: () => setErasing(booking),
                            },
                      ]}
                      trigger={(props) => (
                        <button
                          type="button"
                          className="of-icon-btn"
                          aria-label={`Plus d'actions : rendez-vous de ${booking.name}`}
                          title="Plus d'actions"
                          {...props}
                        >
                          <Icon name="more" />
                        </button>
                      )}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </section>
      <Dialog
        open={Boolean(cancelling)}
        title="Annuler ce rendez-vous ?"
        onClose={() => setCancelling(undefined)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(undefined)}>
              Garder le rendez-vous
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void cancel()}>
              Annuler le rendez-vous
            </Button>
          </>
        }
      >
        {cancelling && (
          <p>
            Le créneau de {formatTime(cancelling.time)} ({dayTitle(cancelling).toLowerCase()})
            redevient libre sur le site. Prévenez {cancelling.name} : {cancelling.email}
            {cancelling.phone ? ` ou ${cancelling.phone}` : ""}.
          </p>
        )}
      </Dialog>
      <Dialog
        open={Boolean(erasing)}
        title="Effacer ce rendez-vous ?"
        onClose={() => setErasing(undefined)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setErasing(undefined)}>
              Garder
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void erase()}>
              Effacer
            </Button>
          </>
        }
      >
        {erasing && (
          <p>
            Le rendez-vous de {erasing.name} et ses coordonnées seront effacés définitivement (par
            exemple à sa demande).
          </p>
        )}
      </Dialog>
    </>
  );
}
