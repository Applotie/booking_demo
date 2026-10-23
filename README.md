# SwiftLine Travels – Bus Booking & Fleet Management (local demo)

A working Next.js (App Router, JavaScript only) app for a single bus operator:

- **Public site** – trip search, interactive seat maps, 5-minute seat holds, passenger details, instant booking confirmation, and a demo WhatsApp message.
- **Admin** (`/admin`, no login) – routes, buses with a visual seat-layout editor, trip scheduling, bookings, expenses and salaries, maintenance with reminders, and bus-wise financial reports.

All data is stored in the browser's `localStorage`. The app never creates sample data: everything you see is something you entered.

## Run it

```bash
npm install
npm run dev
```

- Public site: http://localhost:3000 (also http://localhost:3000/home)
- Admin dashboard: http://localhost:3000/admin

Other scripts: `npm run build && npm start` (production), `npm test` (service unit tests, Node ≥ 20).

## Quick start

### 1. First route, bus and trip

1. **Routes → New route.** Enter a name, source, destination, optional stops (add, remove or reorder them), the default fare and the journey duration.
2. **Buses → Add bus.** Enter a name, an Indian registration number (e.g. `MH 12 AB 1234`) and a bus type. In **Seating layout**, set the capacity and pick an arrangement (`2+1`, `2+2`, `1+1`, `3+2`, or a custom left/right split). Click seats in the preview to block them. Optionally add staff and document expiry dates.
3. **Trips → Schedule trip.** Choose a **frequency**, an active route and an active bus:
   - **Daily** – set the departure and arrival times and a start date. Passengers can book the trip for any date from the start date on.
   - **Custom date** – set the departure date and time. The trip runs on that date only.

   The arrival is estimated from the route duration and the fare defaults to the route fare; you can change both. The trip saves a copy of the fare and the seat layout.

### 2. Test a booking

1. Open http://localhost:3000, search or browse, and click **Select seats**.
2. Pick seats. The total updates as you select them. Click **Continue**. The seats are held for 5 minutes, and a countdown shows the time left.
3. Enter a name and age for each seat, plus one Indian mobile number. Then **Review booking → Confirm Booking**.
4. The confirmation page shows the booking ID, the journey, passengers, fare, "Pay the operator later", and the generated WhatsApp message. You can **Copy message** or **Open WhatsApp**. The page can be reopened at `/booking/<id or booking ID>`.
5. In **Admin → Bookings**, search by booking ID or phone number. Open the booking to view passengers and the message history, **Mark paid**, or **Cancel booking**. Cancelling releases the seats.

### 3. Expenses and maintenance

- **Expenses → Record expense:** choose a bus, a category (14 categories), the amount, date, paid/pending status, payment method, vendor and receipt number. Salary categories also ask for the staff member and the salary month. A second record for the same person and month is blocked unless you tick *correction/adjustment*.
- **Expenses → Monthly salaries:** enter a whole month's salaries for a bus's assigned staff at once.
- **Maintenance → Record maintenance:** enter the service date, odometer, type, work done, provider, cost, and the next service date or odometer reading. A cost creates **one linked expense**. Editing the cost updates that expense, and deleting the record removes it, so the cost is never counted twice. A higher odometer reading also updates the bus.
- Reminders cover insurance, permit, fitness and PUC expiry (within 30 days) and servicing (within 14 days or 1,000 km). They are calculated from the dates you enter and are shown in the app only. No external alerts are sent.

## How things work

| Concern | Where |
| --- | --- |
| Storage, IDs, schema version, malformed-data handling, cross-tab sync | `lib/storage.js`, `lib/storage-keys.js` |
| Seat layout generation and compatibility checks | `lib/seat-service.js` |
| Holds, availability, booking, cancellation, payment | `lib/booking-service.js` |
| Trip scheduling, snapshots, overlap checks, safe cancellation | `lib/trip-service.js` |
| Daily trips: per-date trip ids, saving a date on first hold, daily overlap checks | `lib/schedule-service.js` |
| Expenses and salaries | `lib/expense-service.js` |
| Maintenance, linked expenses, reminders | `lib/maintenance-service.js` |
| Every financial and operational figure | `lib/reporting-service.js` |
| WhatsApp notifications (demo provider plus placeholder for a real one) | `lib/notifications/` |

**Calculation rules** (`lib/reporting-service.js`):

- Booking value counts confirmed bookings only. Cancelled bookings are never counted as revenue.
- Booking value is split into paid and unpaid amounts.
- Expenses are split into paid and pending.
- **Recorded operating result** = eligible revenue − recorded expenses.
- There are two revenue bases:
  - **Confirmed-booking basis:** confirmed bookings on trips that are not cancelled.
  - **Completed-trip basis:** confirmed bookings on trips marked Completed.
- Seat occupancy = booked seats ÷ bookable seats. Blocked seats are excluded.
- Per-trip figures show "—" when nothing has been recorded.
- Trips and bookings are dated by travel date. Expenses are dated by expense date.

The operating result is **not audited net profit**. It ignores depreciation, financing, tax and anything not recorded.

**Snapshots:** a trip stores the fare, route details and seat layout it had when it was created. A booking stores its fare and journey details. Changing a route's fare or a bus's layout later therefore never changes existing trips or bookings. **Trips → Apply current bus layout** copies a newer layout onto a trip, but it refuses if any booked seat would be moved, removed or blocked.

**Daily trips** are stored once (in `schedules`), not as one record per day. Each date has a fixed trip id (`<daily trip id>-YYYY-MM-DD`). The first seat hold on a date saves that date as an ordinary trip, so bookings, cancellation, completion and reports work the same as for one-off trips. In **Admin → Trips**:

- Daily trips are listed in their own card.
- A date appears in the trips list, marked **Daily**, once someone books it.
- To skip one date, cancel it there. To stop new dates being offered, pause the daily trip.
- Editing a daily trip changes every date that has no bookings yet. Dates that already have bookings keep their details.
- A bus can't be given a trip that overlaps a daily run, and the reverse is also blocked.

**History is kept:**

- A route used by a trip or daily trip can't be deleted; deactivate it instead.
- A bus with history can't be deleted; set it to Inactive instead.
- Trips with bookings can't be deleted. Cancelling one requires explicit confirmation, which also cancels its bookings.
- A daily trip with bookings on any date can't be deleted; pause it instead.
- Cancelled bookings stay in the records.

## Testing

- `npm test` runs 28 unit tests covering:
  - seat generation: a 20-seat 2+1 bus has exactly 20 seats with the aisle in the right place
  - holds and expiry, duplicate-submission idempotency, cancellation releasing seats
  - expense validation and duplicate salaries
  - maintenance costs counted exactly once
  - financial formulas, including zero denominators
  - malformed storage and the WhatsApp link format
- The workflows were also tested end to end in a real Chrome browser. These tests covered admin CRUD, booking, payment, cancellation, expenses, maintenance, reports, mobile layout, malformed storage and reset.

## Known limitations (local demo)

- **Single browser only.** Data lives in this browser profile's `localStorage`. It is not shared with other devices, browsers or passengers. Clearing site data deletes it, and storage is limited to roughly 5 MB.
- **No real concurrency safety.** `localStorage` has no atomic transactions. The app re-checks every seat at confirmation, respects other tabs' holds and guards against double-clicks. However, simultaneous bookings from different devices need a shared backend with transactional seat reservation. To add one, replace `lib/storage.js` and the service write paths with API calls.
- **WhatsApp is demo mode.** Messages are generated and saved, never sent automatically. "Open WhatsApp" opens a pre-filled `wa.me` chat; the message is only sent if the user presses Send, and delivery is not tracked. `lib/notifications/whatsapp-provider.js` describes how to connect the WhatsApp Business Platform server-side.
- **No authentication, online payments or external reminders**, by design.
- Fares apply to the whole route. Fares for partial segments between stops are not modelled.
- Use **Admin → Data & storage** to see record counts and storage problems, or to reset all demo data. Resetting requires typing `RESET`.
