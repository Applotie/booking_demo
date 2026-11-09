// Server runtime settings shared by every API route.
//
// Trip times are stored as local wall-clock times ("2026-11-09T21:30") and the
// business rules compare them with the current time (e.g. "has this trip
// departed?"). They used to run in the operator's browser; now they run on the
// server, whose clock is usually UTC. Pin the process time zone to the
// operator's so those rules keep giving the same answers.
process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';
