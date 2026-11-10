# Kalika Travels – Bus Booking & Fleet Management

A working Next.js (App Router, JavaScript only) app for a single bus operator:

- **Public site** – trip search, interactive seat maps, 5-minute seat holds, passenger details, instant booking confirmation, and a demo WhatsApp message.
- **Admin** (`/admin`, protected by an admin login) – routes, buses with a visual seat-layout editor, trip scheduling, bookings, expenses and salaries, maintenance with reminders, and bus-wise financial reports.

All data is stored in **MongoDB Atlas** and shared by every device that opens the app. The browser never talks to the database: pages call the app's own API routes, which run the business rules on the server. The app never creates sample data: everything you see is something you entered.

## Run it

```bash
npm install
cp .env.example .env   # then fill in MONGO_URI (and the admin login)
npm run dev
```

The database, its collections, validators and indexes are created automatically on the first request; no setup command is needed. Without `ADMIN_USERNAME`/`ADMIN_PASSWORD` the admin area is open in development and locked in production. With them, open http://localhost:3000/admin and sign in.

> On Windows inside a OneDrive folder, if `npm run dev` fails with `EINVAL: invalid argument, readlink ….next…`, delete the `.next` folder and start again.

- Public site: http://localhost:3000 (also http://localhost:3000/home)
- Admin dashboard: http://localhost:3000/admin

Other scripts: `npm run build && npm start` (production), `npm test` (service unit tests), `npm run test:db` (MongoDB integration tests in a throwaway database), `npm run test:e2e` (API tests against a running server). Node ≥ 20.

## Quick start

### 1. First route, bus and trip

1. **Routes → New route.** Enter a name, source, destination, optional stops (add, remove or reorder them), the default fare and the journey duration.
2. **Buses → Add bus.** Enter a name, an Indian registration number (e.g. `MH 12 AB 1234`) and a bus type. In **Seating layout**, set the capacity and pick an arrangement (`2+1`, `2+2`, `1+1`, `3+2`, or a custom left/right split). Click seats in the preview to block them. Optionally add staff and document expiry dates.
3. **Trips → Schedule trip.** Choose a **frequency**, an active route and an active bus:
   - **Daily** – set the departure and arrival times and a start date. Passengers can book the trip for any date from the start date on.
   - **Days of week** – pick the days (e.g. Mon, Wed, Fri), the departure and arrival times and a start date. Passengers can book any of those days from the start date on.
   - **Specific dates** – add one or more dates and set the departure and arrival times. One ordinary trip is saved for each date. If any date clashes with another trip on the bus, nothing is saved and the clashing dates are listed.

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
| Storage interface used by the services, IDs | `lib/storage.js`, `lib/storage-keys.js` |
| MongoDB connection (cached), collections, validators, indexes | `lib/server/mongodb.js`, `lib/server/schemas.js` |
| Transactions: runs a service, commits only changed records, serializes writes | `lib/server/store.js` |
| API: allowed actions, input checks, read models, admin login, browser-data import | `lib/server/`, `app/api/`, `middleware.js` |
| Browser side: API calls and page data loading | `lib/api-client.js`, `lib/hooks/use-app-data.js` |
| Seat layout generation and compatibility checks | `lib/seat-service.js` |
| Holds, availability, booking, cancellation, payment | `lib/booking-service.js` |
| Trip scheduling, snapshots, overlap checks, safe cancellation | `lib/trip-service.js` |
| Repeating trips (daily or days of week): per-date trip ids, saving a date on first hold, overlap checks | `lib/schedule-service.js` |
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

**Repeating trips** (Daily and Days of week) are stored once (in `schedules`, with the days they run in `weekdays`), not as one record per day. Each date has a fixed trip id (`<repeating trip id>-YYYY-MM-DD`). The first seat hold on a date saves that date as an ordinary trip, so bookings, cancellation, completion and reports work the same as for one-off trips. In **Admin → Trips**:

- Repeating trips are listed in their own card.
- A date appears in the trips list, marked **Daily** or **Weekly**, once someone books it.
- To skip one date, cancel it there. To stop new dates being offered, pause the repeating trip.
- Editing a repeating trip (including switching between Daily and Days of week) changes every date that has no bookings yet. Dates that already have bookings keep their details.
- A bus can't be given a trip that overlaps a repeating run, and the reverse is also blocked.

**History is kept:**

- A route used by a trip or repeating trip can't be deleted; deactivate it instead.
- A bus with history can't be deleted; set it to Inactive instead.
- Trips with bookings can't be deleted. Cancelling one requires explicit confirmation, which also cancels its bookings.
- A repeating trip with bookings on any date can't be deleted; pause it instead.
- Cancelled bookings stay in the records.

## Data and security

- **Collections:** `routes`, `buses`, `trips`, `schedules`, `bookings`, `holds`, `expenses`, `maintenance`, `notifications`, plus `locks` (write lock) and `meta` (schema version). Each record keeps its app id (e.g. `bkg_…`) as `_id`, so links between records and URLs are unchanged.
- **Concurrency:** every change runs in a MongoDB transaction that first takes a single write lock, so two passengers can never reserve the same seat. Unique indexes (booking reference, hold token, route name, registration number) back this up.
- **Admin sign-in:** `/admin/login` checks the username and password against `ADMIN_USERNAME` / `ADMIN_PASSWORD` and sets a signed, HttpOnly session cookie that lasts 8 hours. **Sign out** is at the bottom of the admin sidebar. After 5 wrong passwords from one IP address, sign-in is blocked for 15 minutes. Changing the password (or `ADMIN_SESSION_SECRET`) signs everyone out.
- **Passenger privacy:** public pages only receive which seats are taken. Names, phone numbers and booking ids of other passengers are never sent; a booking page is opened by its booking ID.
- **Input:** the API accepts only a fixed list of actions, checks argument shapes and sizes, rejects `$`-prefixed or dotted keys (NoSQL injection), refuses cross-site requests and never returns internal errors.

**Moving from the old browser-only version:** if a browser still holds data saved by the earlier localStorage version, the admin area shows *Data from the previous version found in this browser*. **Import into database** copies it to MongoDB. Records already in the database are skipped, never overwritten, so the import can be repeated safely. The browser copy is removed only after the server confirms every record was saved; anything that failed is listed and kept. Seat holds are not imported (they expire after five minutes).

## Deployment

1. In Atlas, allow your host's outbound IP addresses under **Network Access** (or `0.0.0.0/0` for hosts without fixed IPs) and use a database user with read/write access to the app's database.
2. Set the environment variables from `.env.example` on the host: `MONGO_URI` and `ADMIN_USERNAME`/`ADMIN_PASSWORD` are required; `MONGODB_DB` and `APP_TIMEZONE` are optional.
3. Deploy as usual (`npm run build`, `npm start`). `/api/health` returns 200 when the database is reachable and 503 when it is not.

## Testing

- `npm test` runs unit tests of the business rules with an in-memory store: seat generation, holds and bookings (including duplicate-submission idempotency and cancellation releasing seats), trip cancellation with bookings, history protection, maintenance costs counted exactly once, duplicate salaries, and zero denominators.
- `npm run test:db` runs integration tests against MongoDB in a throwaway database that is dropped afterwards: collection/index creation, schema validation, CRUD, concurrent holds and bookings for the same seat, transaction rollback, unique indexes, injection attempts, browser-data import and reconnection.
- `npm run test:e2e` (with `BASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`) runs HTTP tests against a running server that uses an empty database: admin login, passenger privacy, full booking flow, concurrent bookings, malformed and hostile requests, and reset.

## Known limitations

- **Admin reads load all records.** Dashboards and reports are still calculated in the browser from every record, as before. That is fine for a single operator's volumes; very large histories would need server-side reports and pagination.
- **Booking IDs are the key to a booking page.** Anyone who knows a booking ID (8 characters) can open that booking, as with most bus and airline confirmations.
- **WhatsApp is demo mode.** Messages are generated and saved, never sent automatically. "Open WhatsApp" opens a pre-filled `wa.me` chat; the message is only sent if the user presses Send, and delivery is not tracked. `lib/notifications/whatsapp-provider.js` describes how to connect the WhatsApp Business Platform server-side.
- **No passenger accounts, online payments or external reminders**, by design.
- Fares apply to the whole route. Fares for partial segments between stops are not modelled.
- Use **Admin → Data & storage** to see record counts and the database size, or to reset all demo data. Resetting requires typing `RESET` and affects every user.
